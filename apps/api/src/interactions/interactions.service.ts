import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReplyDto {
  body: string;
}

export interface InteractionCounts {
  likes: number;
  saves: number;
  replies: number;
}

export interface UserInteractions {
  liked: boolean;
  saved: boolean;
}

@Injectable()
export class InteractionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Likes ──────────────────────────────────────────────────────────────────

  async likePost(userId: string, postId: string): Promise<{ liked: boolean; count: number }> {
    await this.assertPostExists(postId);
    const existing = await this.prisma.postLike.findUnique({
      where: { user_id_post_id: { user_id: userId, post_id: postId } },
    });

    if (existing) {
      await this.prisma.postLike.delete({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });
    } else {
      await this.prisma.postLike.create({ data: { user_id: userId, post_id: postId } });
    }

    const count = await this.prisma.postLike.count({ where: { post_id: postId } });
    return { liked: !existing, count };
  }

  // ─── Saves ──────────────────────────────────────────────────────────────────

  async savePost(userId: string, postId: string): Promise<{ saved: boolean; count: number }> {
    await this.assertPostExists(postId);
    const existing = await this.prisma.postSave.findUnique({
      where: { user_id_post_id: { user_id: userId, post_id: postId } },
    });

    if (existing) {
      await this.prisma.postSave.delete({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });
    } else {
      await this.prisma.postSave.create({ data: { user_id: userId, post_id: postId } });
    }

    const count = await this.prisma.postSave.count({ where: { post_id: postId } });
    return { saved: !existing, count };
  }

  // ─── Replies ─────────────────────────────────────────────────────────────────

  async createReply(userId: string, postId: string, dto: ReplyDto) {
    await this.assertPostExists(postId);
    if (!dto.body.trim()) throw new ConflictException('Reply body cannot be empty');

    const reply = await this.prisma.postReply.create({
      data: { user_id: userId, post_id: postId, body: dto.body.trim() },
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });

    return this.serializeReply(reply);
  }

  async getReplies(postId: string) {
    await this.assertPostExists(postId);
    const replies = await this.prisma.postReply.findMany({
      where: { post_id: postId },
      orderBy: { created_at: 'asc' },
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });
    return replies.map((r) => this.serializeReply(r));
  }

  async deleteReply(userId: string, replyId: string) {
    const reply = await this.prisma.postReply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('Reply not found');
    if (reply.user_id !== userId) throw new ForbiddenException('You can only delete your own replies');
    await this.prisma.postReply.delete({ where: { id: replyId } });
    return { id: replyId };
  }

  // ─── Aggregate counts for multiple posts ────────────────────────────────────

  async getInteractionData(
    postIds: string[],
    userId?: string,
  ): Promise<
    Record<string, { counts: InteractionCounts; userInteractions: UserInteractions }>
  > {
    if (postIds.length === 0) return {};

    const [likes, saves, replies, userLikes, userSaves] = await Promise.all([
      this.prisma.postLike.groupBy({
        by: ['post_id'],
        where: { post_id: { in: postIds } },
        _count: { _all: true },
      }),
      this.prisma.postSave.groupBy({
        by: ['post_id'],
        where: { post_id: { in: postIds } },
        _count: { _all: true },
      }),
      this.prisma.postReply.groupBy({
        by: ['post_id'],
        where: { post_id: { in: postIds } },
        _count: { _all: true },
      }),
      userId
        ? this.prisma.postLike.findMany({
            where: { post_id: { in: postIds }, user_id: userId },
            select: { post_id: true },
          })
        : Promise.resolve([]),
      userId
        ? this.prisma.postSave.findMany({
            where: { post_id: { in: postIds }, user_id: userId },
            select: { post_id: true },
          })
        : Promise.resolve([]),
    ]);

    const likesMap = new Map(likes.map((l) => [l.post_id, l._count._all]));
    const savesMap = new Map(saves.map((s) => [s.post_id, s._count._all]));
    const repliesMap = new Map(replies.map((r) => [r.post_id, r._count._all]));
    const userLikedSet = new Set(userLikes.map((l) => l.post_id));
    const userSavedSet = new Set(userSaves.map((s) => s.post_id));

    const result: Record<string, { counts: InteractionCounts; userInteractions: UserInteractions }> = {};
    for (const postId of postIds) {
      result[postId] = {
        counts: {
          likes: likesMap.get(postId) ?? 0,
          saves: savesMap.get(postId) ?? 0,
          replies: repliesMap.get(postId) ?? 0,
        },
        userInteractions: {
          liked: userLikedSet.has(postId),
          saved: userSavedSet.has(postId),
        },
      };
    }
    return result;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async assertPostExists(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('Post not found');
  }

  private serializeReply(reply: {
    id: string;
    post_id: string;
    body: string;
    created_at: Date;
    updated_at: Date;
    user: { id: string; username: string; display_name: string; avatar_url: string | null };
  }) {
    return {
      id: reply.id,
      post_id: reply.post_id,
      body: reply.body,
      created_at: reply.created_at.toISOString(),
      updated_at: reply.updated_at.toISOString(),
      user: reply.user,
    };
  }
}
