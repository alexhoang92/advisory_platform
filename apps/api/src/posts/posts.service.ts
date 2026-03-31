import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InteractionsService } from '../interactions/interactions.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import {
  Post as DomainPost,
  ApiResponse,
  ApiMeta,
} from '@hamilton/shared';

const postWithRelationsInclude = {
  author: {
    select: {
      id: true,
      username: true,
      display_name: true,
      avatar_url: true,
    },
  },
  ticker_tags: {
    select: {
      id: true,
      ticker: true,
      name: true,
      market: true,
      asset_type: true,
    },
  },
  user_mentions: {
    select: {
      id: true,
      username: true,
      display_name: true,
      avatar_url: true,
    },
  },
} satisfies Prisma.PostInclude;

type PostWithRelations = Prisma.PostGetPayload<{ include: typeof postWithRelationsInclude }>;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interactions: InteractionsService,
  ) {}

  async create(userId: string, dto: CreatePostDto): Promise<DomainPost> {
    const slug = dto.slug ?? this.generateSlug(dto.title);

    const exists = await this.prisma.post.findUnique({ where: { slug } });
    const finalSlug = exists ? `${slug}-${Date.now()}` : slug;

    // Resolve ticker_tags → asset_tag IDs (upsert unknown tickers)
    const tickerSymbols = this.mergeTickerArrays(dto.tickers, dto.ticker_tags);
    const tickerTagIds = await this.resolveTickerTags(tickerSymbols);

    // Resolve user_mentions → user IDs
    const mentionedUserIds = await this.resolveUserMentions(dto.user_mentions ?? []);

    const post = await this.prisma.post.create({
      data: {
        author_id: userId,
        title: dto.title,
        slug: finalSlug,
        body_public: dto.body_public,
        body_locked: dto.body_locked ?? null,
        visibility: dto.visibility ?? 'public',
        unlock_price: dto.unlock_price != null ? dto.unlock_price : null,
        tickers: tickerSymbols,
        image_urls: dto.image_urls ?? [],
        post_type: dto.post_type ?? 'discussion',
        published_at: dto.published_at ? new Date(dto.published_at) : new Date(),
        ticker_tags: { connect: tickerTagIds.map((id) => ({ id })) },
        user_mentions: { connect: mentionedUserIds.map((id) => ({ id })) },
      },
      include: postWithRelationsInclude,
    });

    return this.serializePost(post, true, undefined);
  }

  async findAll(
    cursor?: string,
    limit = 20,
    requestingUserId?: string,
    ticker?: string,
    filter: 'latest' | 'followed' | 'trending' = 'latest',
    authorUsername?: string,
  ): Promise<ApiResponse<DomainPost[]>> {
    const take = Math.min(limit, 100);

    // Resolve author username to ID if provided
    let authorId: string | undefined;
    if (authorUsername) {
      const author = await this.prisma.user.findUnique({
        where: { username: authorUsername },
        select: { id: true },
      });
      if (!author) return { data: [], meta: { has_more: false, cursor: null }, error: null };
      authorId = author.id;
    }

    // For trending: compute top post IDs by engagement score in last 48h
    if (filter === 'trending' && !authorId) {
      return this.findTrending(take, requestingUserId, ticker);
    }

    // For followed filter: restrict to posts from followed users
    let followedAuthorIds: string[] | undefined;
    if (filter === 'followed' && requestingUserId && !authorId) {
      const follows = await this.prisma.follow.findMany({
        where: { follower_id: requestingUserId },
        select: { following_id: true },
      });
      followedAuthorIds = follows.map((f) => f.following_id);
    }

    const where: Prisma.PostWhereInput = {
      visibility: { not: 'subscribers_only' },
      ...(ticker && { ticker_tags: { some: { ticker: ticker.toUpperCase() } } }),
      ...(followedAuthorIds !== undefined && { author_id: { in: followedAuthorIds } }),
      ...(authorId && { author_id: authorId }),
    };

    const posts = await this.prisma.post.findMany({
      take: take + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { created_at: 'desc' },
      where,
      include: postWithRelationsInclude,
    });

    const hasMore = posts.length > take;
    const items = hasMore ? posts.slice(0, take) : posts;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    const [subscribedExpertIds, unlockedPostIds, interactionData] = await Promise.all([
      requestingUserId ? this.getSubscribedExpertIds(requestingUserId) : Promise.resolve([]),
      requestingUserId ? this.getUnlockedPostIds(requestingUserId) : Promise.resolve([]),
      this.interactions.getInteractionData(items.map((p) => p.id), requestingUserId),
    ]);

    const serialized = items.map((post) => {
      const isAuthor = post.author_id === requestingUserId;
      const isSubscribed = subscribedExpertIds.includes(post.author_id);
      const hasUnlocked = unlockedPostIds.includes(post.id);
      const hasAccess = isAuthor || isSubscribed || hasUnlocked;
      return this.serializePost(post, hasAccess, interactionData[post.id]);
    });

    const meta: ApiMeta = {
      cursor: nextCursor,
      has_more: hasMore,
      ...(filter === 'followed' && followedAuthorIds?.length === 0 && { empty_followed: true }),
    };
    return { data: serialized, meta, error: null };
  }

  private async findTrending(
    take: number,
    requestingUserId?: string,
    ticker?: string,
  ): Promise<ApiResponse<DomainPost[]>> {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Aggregate engagement (likes + saves + replies) per post in last 48h
    const [likes, saves, replies] = await Promise.all([
      this.prisma.postLike.groupBy({
        by: ['post_id'],
        where: { created_at: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.postSave.groupBy({
        by: ['post_id'],
        where: { created_at: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.postReply.groupBy({
        by: ['post_id'],
        where: { created_at: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const scoreMap = new Map<string, number>();
    for (const l of likes) scoreMap.set(l.post_id, (scoreMap.get(l.post_id) ?? 0) + l._count._all);
    for (const s of saves) scoreMap.set(s.post_id, (scoreMap.get(s.post_id) ?? 0) + s._count._all);
    for (const r of replies) scoreMap.set(r.post_id, (scoreMap.get(r.post_id) ?? 0) + r._count._all);

    // Fall back to latest posts if no engagement data
    const rankedIds = [...scoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, take)
      .map(([id]) => id);

    const where: Prisma.PostWhereInput = {
      visibility: { not: 'subscribers_only' },
      ...(ticker && { ticker_tags: { some: { ticker: ticker.toUpperCase() } } }),
      ...(rankedIds.length > 0 && { id: { in: rankedIds } }),
    };

    const posts = await this.prisma.post.findMany({
      where,
      orderBy: rankedIds.length > 0 ? undefined : { created_at: 'desc' },
      take: rankedIds.length > 0 ? undefined : take,
      include: postWithRelationsInclude,
    });

    // Re-sort by score if we have ranked IDs
    const sorted =
      rankedIds.length > 0
        ? rankedIds
            .map((id) => posts.find((p) => p.id === id))
            .filter((p): p is (typeof posts)[0] => p !== undefined)
        : posts;

    const [subscribedExpertIds, unlockedPostIds, interactionData] = await Promise.all([
      requestingUserId ? this.getSubscribedExpertIds(requestingUserId) : Promise.resolve([]),
      requestingUserId ? this.getUnlockedPostIds(requestingUserId) : Promise.resolve([]),
      this.interactions.getInteractionData(sorted.map((p) => p.id), requestingUserId),
    ]);

    const serialized = sorted.map((post) => {
      const isAuthor = post.author_id === requestingUserId;
      const isSubscribed = subscribedExpertIds.includes(post.author_id);
      const hasUnlocked = unlockedPostIds.includes(post.id);
      const hasAccess = isAuthor || isSubscribed || hasUnlocked;
      return this.serializePost(post, hasAccess, interactionData[post.id]);
    });

    return { data: serialized, meta: { has_more: false, cursor: null }, error: null };
  }

  async findOne(id: string, requestingUserId?: string): Promise<DomainPost> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: postWithRelationsInclude,
    });

    if (!post) throw new NotFoundException('Post not found');

    const isAuthor = post.author_id === requestingUserId;
    const interactionMap = await this.interactions.getInteractionData([post.id], requestingUserId);
    const interactionData = interactionMap[post.id];

    if (post.visibility === 'subscribers_only') {
      if (!requestingUserId) throw new ForbiddenException('This post requires a subscription');
      if (!isAuthor) {
        const isSubscribed = await this.isSubscribedTo(requestingUserId, post.author_id);
        if (!isSubscribed) throw new ForbiddenException('This post requires a subscription');
      }
      return this.serializePost(post, true, interactionData);
    }

    if (post.visibility === 'public') return this.serializePost(post, true, interactionData);

    // preview
    if (isAuthor) return this.serializePost(post, true, interactionData);

    if (requestingUserId) {
      const isSubscribed = await this.isSubscribedTo(requestingUserId, post.author_id);
      if (isSubscribed) return this.serializePost(post, true, interactionData);

      const hasUnlocked = await this.hasUnlockedPost(requestingUserId, post.id);
      if (hasUnlocked) return this.serializePost(post, true, interactionData);
    }

    return this.serializePost(post, false, interactionData);
  }

  async update(id: string, userId: string, dto: UpdatePostDto): Promise<DomainPost> {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.author_id !== userId) throw new ForbiddenException('You can only edit your own posts');

    const updateData: Prisma.PostUpdateInput = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.body_public !== undefined) updateData.body_public = dto.body_public;
    if (dto.body_locked !== undefined) updateData.body_locked = dto.body_locked;
    if (dto.visibility !== undefined) updateData.visibility = dto.visibility;
    if (dto.unlock_price !== undefined) updateData.unlock_price = dto.unlock_price;
    if (dto.post_type !== undefined) updateData.post_type = dto.post_type;
    if (dto.published_at !== undefined) {
      updateData.published_at = dto.published_at ? new Date(dto.published_at) : null;
    }

    // Update tickers / ticker_tags if either is provided
    if (dto.image_urls !== undefined) updateData.image_urls = dto.image_urls;
    if (dto.tickers !== undefined || dto.ticker_tags !== undefined) {
      const tickerSymbols = this.mergeTickerArrays(dto.tickers, dto.ticker_tags);
      updateData.tickers = tickerSymbols;
      const tickerTagIds = await this.resolveTickerTags(tickerSymbols);
      updateData.ticker_tags = { set: tickerTagIds.map((tid) => ({ id: tid })) };
    }

    // Update user_mentions if provided
    if (dto.user_mentions !== undefined) {
      const mentionedUserIds = await this.resolveUserMentions(dto.user_mentions);
      updateData.user_mentions = { set: mentionedUserIds.map((uid) => ({ id: uid })) };
    }

    const updated = await this.prisma.post.update({
      where: { id },
      data: updateData,
      include: postWithRelationsInclude,
    });

    return this.serializePost(updated, true, undefined);
  }

  async remove(id: string, userId: string): Promise<{ id: string }> {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.author_id !== userId) throw new ForbiddenException('You can only delete your own posts');

    await this.prisma.post.delete({ where: { id } });
    return { id };
  }

  // ─── Ticker / Mention resolution ────────────────────────────────────────────

  private mergeTickerArrays(tickers?: string[], tickerTags?: string[]): string[] {
    const combined = [
      ...(tickers ?? []).map((t) => t.toUpperCase()),
      ...(tickerTags ?? []).map((t) => t.toUpperCase()),
    ];
    return [...new Set(combined)];
  }

  private async resolveTickerTags(tickers: string[]): Promise<string[]> {
    if (tickers.length === 0) return [];

    const ids: string[] = [];
    for (const ticker of tickers) {
      const tag = await this.prisma.assetTag.upsert({
        where: { ticker },
        create: {
          ticker,
          name: ticker,
          market: 'us_stock',
          asset_type: 'stock',
        },
        update: {},
        select: { id: true },
      });
      ids.push(tag.id);
    }
    return ids;
  }

  private async resolveUserMentions(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  // ─── Access helpers ─────────────────────────────────────────────────────────

  private async isSubscribedTo(subscriberId: string, expertId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findFirst({
      where: { subscriber_id: subscriberId, expert_id: expertId, status: 'active' },
    });
    return sub !== null;
  }

  private async hasUnlockedPost(userId: string, postId: string): Promise<boolean> {
    const unlock = await this.prisma.postUnlock.findUnique({
      where: { user_id_post_id: { user_id: userId, post_id: postId } },
    });
    return unlock !== null;
  }

  private async getSubscribedExpertIds(userId: string): Promise<string[]> {
    const subs = await this.prisma.subscription.findMany({
      where: { subscriber_id: userId, status: 'active' },
      select: { expert_id: true },
    });
    return subs.map((s) => s.expert_id);
  }

  private async getUnlockedPostIds(userId: string): Promise<string[]> {
    const unlocks = await this.prisma.postUnlock.findMany({
      where: { user_id: userId },
      select: { post_id: true },
    });
    return unlocks.map((u) => u.post_id);
  }

  // ─── Serialization ──────────────────────────────────────────────────────────

  private serializePost(
    post: PostWithRelations,
    hasAccess: boolean,
    interactionData?: { counts: { likes: number; saves: number; replies: number }; userInteractions: { liked: boolean; saved: boolean } },
  ): DomainPost {
    const hasLockedContent = post.body_locked !== null && post.body_locked !== undefined;

    return {
      id: post.id,
      author_id: post.author_id,
      title: post.title,
      slug: post.slug,
      body_public: post.body_public,
      body_locked: hasAccess && hasLockedContent ? post.body_locked : null,
      locked: !hasAccess && hasLockedContent,
      visibility: post.visibility as DomainPost['visibility'],
      unlock_price: post.unlock_price != null ? post.unlock_price.toNumber() : null,
      tickers: post.tickers,
      image_urls: post.image_urls,
      ticker_tags: post.ticker_tags.map((t) => ({
        id: t.id,
        ticker: t.ticker,
        name: t.name,
        market: t.market,
        asset_type: t.asset_type,
      })),
      user_mentions: post.user_mentions.map((u) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
      })),
      post_type: post.post_type as DomainPost['post_type'],
      published_at: post.published_at?.toISOString() ?? null,
      created_at: post.created_at.toISOString(),
      updated_at: post.updated_at.toISOString(),
      author: {
        id: post.author.id,
        username: post.author.username,
        display_name: post.author.display_name,
        avatar_url: post.author.avatar_url,
      },
      likes_count: interactionData?.counts.likes ?? 0,
      saves_count: interactionData?.counts.saves ?? 0,
      replies_count: interactionData?.counts.replies ?? 0,
      user_liked: interactionData?.userInteractions.liked ?? false,
      user_saved: interactionData?.userInteractions.saved ?? false,
    };
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100);
  }
}
