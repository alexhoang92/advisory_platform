import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import {
  Post as DomainPost,
  ApiResponse,
  ApiMeta,
} from '@hamilton/shared';

const postWithAuthorInclude = {
  author: {
    select: {
      id: true,
      username: true,
      display_name: true,
      avatar_url: true,
    },
  },
} satisfies Prisma.PostInclude;

type PostWithAuthor = Prisma.PostGetPayload<{ include: typeof postWithAuthorInclude }>;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreatePostDto): Promise<DomainPost> {
    const slug = dto.slug ?? this.generateSlug(dto.title);

    const exists = await this.prisma.post.findUnique({ where: { slug } });
    const finalSlug = exists ? `${slug}-${Date.now()}` : slug;

    const post = await this.prisma.post.create({
      data: {
        author_id: userId,
        title: dto.title,
        slug: finalSlug,
        body_public: dto.body_public,
        body_locked: dto.body_locked ?? null,
        visibility: dto.visibility ?? 'public',
        unlock_price: dto.unlock_price != null ? dto.unlock_price : null,
        tickers: dto.tickers?.map((t) => t.toUpperCase()) ?? [],
        post_type: dto.post_type ?? 'discussion',
        published_at: dto.published_at ? new Date(dto.published_at) : new Date(),
      },
      include: postWithAuthorInclude,
    });

    return this.serializePost(post, true);
  }

  async findAll(
    cursor?: string,
    limit = 20,
    requestingUserId?: string,
  ): Promise<ApiResponse<DomainPost[]>> {
    const take = Math.min(limit, 100);

    const posts = await this.prisma.post.findMany({
      take: take + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { created_at: 'desc' },
      where: { visibility: { not: 'subscribers_only' } },
      include: postWithAuthorInclude,
    });

    const hasMore = posts.length > take;
    const items = hasMore ? posts.slice(0, take) : posts;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    const subscribedExpertIds = requestingUserId
      ? await this.getSubscribedExpertIds(requestingUserId)
      : [];

    const unlockedPostIds = requestingUserId
      ? await this.getUnlockedPostIds(requestingUserId)
      : [];

    const serialized = items.map((post) => {
      const isAuthor = post.author_id === requestingUserId;
      const isSubscribed = subscribedExpertIds.includes(post.author_id);
      const hasUnlocked = unlockedPostIds.includes(post.id);
      const hasAccess = isAuthor || isSubscribed || hasUnlocked;
      return this.serializePost(post, hasAccess);
    });

    const meta: ApiMeta = { cursor: nextCursor, has_more: hasMore };
    return { data: serialized, meta, error: null };
  }

  async findOne(id: string, requestingUserId?: string): Promise<DomainPost> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: postWithAuthorInclude,
    });

    if (!post) throw new NotFoundException('Post not found');

    const isAuthor = post.author_id === requestingUserId;

    if (post.visibility === 'subscribers_only') {
      if (!requestingUserId) throw new ForbiddenException('This post requires a subscription');
      if (!isAuthor) {
        const isSubscribed = await this.isSubscribedTo(requestingUserId, post.author_id);
        if (!isSubscribed) throw new ForbiddenException('This post requires a subscription');
      }
      return this.serializePost(post, true);
    }

    if (post.visibility === 'public') return this.serializePost(post, true);

    // preview
    if (isAuthor) return this.serializePost(post, true);

    if (requestingUserId) {
      const isSubscribed = await this.isSubscribedTo(requestingUserId, post.author_id);
      if (isSubscribed) return this.serializePost(post, true);

      const hasUnlocked = await this.hasUnlockedPost(requestingUserId, post.id);
      if (hasUnlocked) return this.serializePost(post, true);
    }

    return this.serializePost(post, false);
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
    if (dto.tickers !== undefined) updateData.tickers = dto.tickers.map((t) => t.toUpperCase());
    if (dto.post_type !== undefined) updateData.post_type = dto.post_type;
    if (dto.published_at !== undefined) {
      updateData.published_at = dto.published_at ? new Date(dto.published_at) : null;
    }

    const updated = await this.prisma.post.update({
      where: { id },
      data: updateData,
      include: postWithAuthorInclude,
    });

    return this.serializePost(updated, true);
  }

  async remove(id: string, userId: string): Promise<{ id: string }> {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.author_id !== userId) throw new ForbiddenException('You can only delete your own posts');

    await this.prisma.post.delete({ where: { id } });
    return { id };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

  private serializePost(post: PostWithAuthor, hasAccess: boolean): DomainPost {
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
