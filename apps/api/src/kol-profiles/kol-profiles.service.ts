import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KolService, type RecentCall } from '../kol/kol.service';

export interface KolProfileResult {
  id: string;
  kol_id: number;
  twitter_handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  kol_followers_count: number;
  content_type: string | null;
  profile_url: string | null;
  status: string;
  claimed_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  is_following: boolean;
}

export interface SocialHearingItem extends RecentCall {
  kol_profile: {
    id: string;
    twitter_handle: string;
    display_name: string;
    avatar_url: string | null;
    status: string;
    kol_followers_count: number;
  };
}

@Injectable()
export class KolProfilesService {
  private readonly logger = new Logger(KolProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kolService: KolService,
  ) {}

  // ─── Daily cron at 02:15 UTC (after ticker sync) ──────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyProfileSync() {
    this.logger.log('Running daily KOL profile sync...');
    const result = await this.syncFromKolDb();
    this.logger.log(
      `Daily profile sync complete — ${result.created} created, ${result.updated} updated`,
    );
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  /**
   * Import all active KOLs from the kol-tracker database into
   * unclaimed_kol_profiles (upsert — safe to run repeatedly).
   */
  async syncFromKolDb(): Promise<{ created: number; updated: number }> {
    const kols = await this.kolService.getAllKols();
    let created = 0;
    let updated = 0;

    for (const kol of kols) {
      const existing = await this.prisma.unclaimedKolProfile.findUnique({
        where: { kol_id: kol.id },
      });

      const data = {
        twitter_handle: kol.handle,
        display_name: kol.display_name ?? kol.handle,
        followers_count: kol.followers_approx ?? 0,
        content_type: kol.content_type ?? null,
        profile_url: kol.profile_url ?? `https://x.com/${kol.handle}`,
      };

      if (existing) {
        // Only update mutable fields; don't touch status or claimed fields
        if (existing.status === 'unclaimed') {
          await this.prisma.unclaimedKolProfile.update({
            where: { kol_id: kol.id },
            data,
          });
          updated++;
        }
      } else {
        await this.prisma.unclaimedKolProfile.create({
          data: { ...data, kol_id: kol.id },
        });
        created++;
      }
    }

    return { created, updated };
  }

  async findAll(status?: string, requestingUserId?: string): Promise<KolProfileResult[]> {
    const profiles = await this.prisma.unclaimedKolProfile.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: [{ followers_count: 'desc' }, { created_at: 'desc' }],
      include: { _count: { select: { kol_followers: true } } },
    });

    const followedSet = new Set<string>();
    if (requestingUserId) {
      const follows = await this.prisma.kolFollow.findMany({
        where: {
          follower_id: requestingUserId,
          kol_profile_id: { in: profiles.map((p) => p.id) },
        },
        select: { kol_profile_id: true },
      });
      follows.forEach((f) => followedSet.add(f.kol_profile_id));
    }

    return profiles.map((p) => this.toResult(p, p._count.kol_followers, followedSet.has(p.id)));
  }

  async findByHandle(handle: string, requestingUserId?: string): Promise<KolProfileResult> {
    let profile = await this.prisma.unclaimedKolProfile.findUnique({
      where: { twitter_handle: handle.toLowerCase() },
      include: { _count: { select: { kol_followers: true } } },
    });

    // Lazy sync: if not in Hamilton's DB yet, pull directly from kol-tracker and create it
    if (!profile) {
      const kol = await this.kolService.getKolByHandle(handle);
      if (!kol) throw new NotFoundException(`KOL profile @${handle} not found`);

      const created = await this.prisma.unclaimedKolProfile.create({
        data: {
          kol_id: kol.id,
          twitter_handle: kol.handle.toLowerCase(),
          display_name: kol.display_name ?? kol.handle,
          followers_count: kol.followers_approx ?? 0,
          content_type: kol.content_type ?? null,
          profile_url: kol.profile_url ?? `https://x.com/${kol.handle}`,
        },
        include: { _count: { select: { kol_followers: true } } },
      });
      profile = created;
      this.logger.log(`Lazy-synced KOL profile @${handle} from kol-tracker`);
    }

    let is_following = false;
    if (requestingUserId) {
      const follow = await this.prisma.kolFollow.findUnique({
        where: { follower_id_kol_profile_id: { follower_id: requestingUserId, kol_profile_id: profile.id } },
      });
      is_following = Boolean(follow);
    }

    return this.toResult(profile, profile._count.kol_followers, is_following);
  }

  /** Follow a KOL profile (no-op if already following). */
  async follow(handle: string, userId: string): Promise<void> {
    const profile = await this.prisma.unclaimedKolProfile.findUnique({
      where: { twitter_handle: handle.toLowerCase() },
    });
    if (!profile) throw new NotFoundException(`KOL profile @${handle} not found`);

    await this.prisma.kolFollow.upsert({
      where: { follower_id_kol_profile_id: { follower_id: userId, kol_profile_id: profile.id } },
      create: { follower_id: userId, kol_profile_id: profile.id },
      update: {},
    });
  }

  /** Unfollow a KOL profile (no-op if not following). */
  async unfollow(handle: string, userId: string): Promise<void> {
    const profile = await this.prisma.unclaimedKolProfile.findUnique({
      where: { twitter_handle: handle.toLowerCase() },
    });
    if (!profile) throw new NotFoundException(`KOL profile @${handle} not found`);

    await this.prisma.kolFollow.deleteMany({
      where: { follower_id: userId, kol_profile_id: profile.id },
    });
  }

  /**
   * Get recent recommendations from all KOL profiles the user follows.
   * Returns SocialHearingItems enriched with kol_profile metadata.
   */
  async getFollowedRecommendations(userId: string, limit = 5): Promise<SocialHearingItem[]> {
    const follows = await this.prisma.kolFollow.findMany({
      where: { follower_id: userId },
      include: { kol_profile: true },
    });

    if (follows.length === 0) return [];

    const handles = follows.map((f) => f.kol_profile.twitter_handle);
    const profileMap = new Map(
      follows.map((f) => [f.kol_profile.twitter_handle.toLowerCase(), f.kol_profile]),
    );
    const kolFollowerCounts = await this.prisma.kolFollow.groupBy({
      by: ['kol_profile_id'],
      where: { kol_profile_id: { in: follows.map((f) => f.kol_profile_id) } },
      _count: { _all: true },
    });
    const followerCountMap = new Map(kolFollowerCounts.map((c) => [c.kol_profile_id, c._count._all]));

    const calls = await this.kolService.getRecommendationsByHandles(handles, limit);

    return calls.map((call) => {
      const kp = profileMap.get(call.kol_handle.toLowerCase());
      return {
        ...call,
        kol_profile: {
          id: kp?.id ?? '',
          twitter_handle: kp?.twitter_handle ?? call.kol_handle,
          display_name: kp?.display_name ?? call.display_name,
          avatar_url: kp?.avatar_url ?? null,
          status: kp?.status ?? 'unclaimed',
          kol_followers_count: kp ? (followerCountMap.get(kp.id) ?? 0) : 0,
        },
      };
    });
  }

  /**
   * Claim an unclaimed profile.  The authenticated user associates their
   * Hamilton account with the scraped KOL profile (TripAdvisor model).
   */
  async claimProfile(handle: string, userId: string): Promise<KolProfileResult> {
    const profile = await this.prisma.unclaimedKolProfile.findUnique({
      where: { twitter_handle: handle.toLowerCase() },
      include: { _count: { select: { kol_followers: true } } },
    });

    if (!profile) throw new NotFoundException(`KOL profile @${handle} not found`);
    if (profile.status === 'claimed') {
      throw new ConflictException(`@${handle} has already been claimed`);
    }

    // Ensure this user hasn't already claimed a different profile
    const alreadyClaimed = await this.prisma.unclaimedKolProfile.findFirst({
      where: { claimed_user_id: userId },
    });
    if (alreadyClaimed) {
      throw new ConflictException(
        `You have already claimed @${alreadyClaimed.twitter_handle}`,
      );
    }

    const updated = await this.prisma.unclaimedKolProfile.update({
      where: { twitter_handle: handle.toLowerCase() },
      data: {
        status: 'claimed',
        claimed_user_id: userId,
        claimed_at: new Date(),
      },
      include: { _count: { select: { kol_followers: true } } },
    });

    return this.toResult(updated, updated._count.kol_followers, false);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private toResult(
    p: {
      id: string;
      kol_id: number;
      twitter_handle: string;
      display_name: string;
      avatar_url: string | null;
      bio: string | null;
      followers_count: number;
      content_type: string | null;
      profile_url: string | null;
      status: string;
      claimed_user_id: string | null;
      claimed_at: Date | null;
      created_at: Date;
    },
    kolFollowersCount: number,
    is_following: boolean,
  ): KolProfileResult {
    return {
      id: p.id,
      kol_id: p.kol_id,
      twitter_handle: p.twitter_handle,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      bio: p.bio,
      followers_count: p.followers_count,
      kol_followers_count: kolFollowersCount,
      content_type: p.content_type,
      profile_url: p.profile_url,
      status: p.status,
      claimed_user_id: p.claimed_user_id,
      claimed_at: p.claimed_at?.toISOString() ?? null,
      created_at: p.created_at.toISOString(),
      is_following,
    };
  }
}
