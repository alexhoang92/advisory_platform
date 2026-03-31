import {
  Injectable,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { KolService, SocialCallForScoring } from '../kol/kol.service';
import {
  ExpertCredibility,
  CredibilityDisplayState,
  CredibilityTrack,
  RatingDistribution,
} from '@hamilton/shared';

const CACHE_TTL = 3600; // 1 hour

// ─── Scoring helpers ──────────────────────────────────────────────────────────

interface CallScore {
  direction: string;
  outcome_return: number | null;
  opened_at: Date;
  success30d: boolean | null;
  success90d: boolean | null;
}

function computeTrackScore(calls: CallScore[], nowMs: number): CredibilityTrack | null {
  const MS_30 = 30 * 24 * 60 * 60 * 1000;
  const MS_90 = 90 * 24 * 60 * 60 * 1000;

  // Calls opened >30 days ago are eligible for 30d window
  const eligible30 = calls.filter((c) => nowMs - c.opened_at.getTime() >= MS_30);
  // Calls opened >90 days ago are eligible for 90d window
  const eligible90 = calls.filter((c) => nowMs - c.opened_at.getTime() >= MS_90);
  // Calls opened in last 90 days (any age)
  const callsLast90d = calls.filter((c) => nowMs - c.opened_at.getTime() < MS_90).length;

  const call_count = calls.length;
  const rating_distribution = computeRatingDist(calls);

  // 30d scoring
  const scorable30 = eligible30.filter((c) => c.success30d !== null);
  let score_30d: number | null = null;
  let win_rate_30d: number | null = null;
  let avg_return_30d: number | null = null;

  if (scorable30.length > 0) {
    const wins = scorable30.filter((c) => c.success30d === true).length;
    win_rate_30d = (wins / scorable30.length) * 100;
    avg_return_30d =
      scorable30.reduce((sum, c) => sum + (c.outcome_return ?? 0), 0) / scorable30.length;
    score_30d = computeComposite(win_rate_30d, avg_return_30d, call_count, callsLast90d);
  }

  // 90d scoring
  const scorable90 = eligible90.filter((c) => c.success90d !== null);
  let score_90d: number | null = null;
  let win_rate_90d: number | null = null;
  let avg_return_90d: number | null = null;

  if (scorable90.length > 0) {
    const wins = scorable90.filter((c) => c.success90d === true).length;
    win_rate_90d = (wins / scorable90.length) * 100;
    avg_return_90d =
      scorable90.reduce((sum, c) => sum + (c.outcome_return ?? 0), 0) / scorable90.length;
    score_90d = computeComposite(win_rate_90d, avg_return_90d, call_count, callsLast90d);
  }

  return {
    score_30d,
    score_90d,
    win_rate_30d,
    win_rate_90d,
    avg_return_30d,
    avg_return_90d,
    call_count,
    calls_last_90d: callsLast90d,
    rating_distribution,
  };
}

function computeComposite(
  winRatePct: number,
  avgReturnPct: number,
  callCount: number,
  callsLast90d: number,
): number {
  const win_rate_score = winRatePct * 0.4;
  const return_score = Math.min(avgReturnPct / 50.0, 1.0) * 30;
  const volume_score =
    Math.min(Math.log10(Math.max(callCount, 1)) / Math.log10(100), 1.0) * 15;
  const recency_score = callCount > 0 ? (callsLast90d / callCount) * 15 : 0;
  return Math.round(win_rate_score + return_score + volume_score + recency_score);
}

function computeRatingDist(
  calls: Array<{ direction: string }>,
): RatingDistribution | null {
  if (calls.length === 0) return null;
  const total = calls.length;
  const buy = calls.filter((c) =>
    ['long', 'buy', 'LONG', 'BUY'].includes(c.direction),
  ).length;
  const sell = calls.filter((c) =>
    ['short', 'sell', 'SHORT', 'SELL'].includes(c.direction),
  ).length;
  const hold = total - buy - sell;
  return {
    buy_pct: Math.round((buy / total) * 100),
    hold_pct: Math.round((hold / total) * 100),
    sell_pct: Math.round((sell / total) * 100),
    total_count: total,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CredibilityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CredibilityService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kolService: KolService,
    private readonly config: ConfigService,
    @InjectQueue('credibility') private readonly credibilityQueue: Queue,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false });
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis unavailable — credibility cache disabled: ${err.message}`);
      });
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }

  // ── B3: Cached getter ────────────────────────────────────────────────────

  async getForExpert(expertUserId: string): Promise<ExpertCredibility> {
    const cacheKey = `credibility:${expertUserId}`;

    // Try Redis cache first
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as ExpertCredibility;
      } catch {
        // Cache unavailable — fall through to DB
      }
    }

    // Read from DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (this.prisma.credibilityScore.findUnique as (args: any) => Promise<any>)({
      where: { expertUserId },
    });

    if (!row) {
      return {
        display_state: 'NO_DATA',
        platform: null,
        public_statements: null,
        computed_at: new Date().toISOString(),
        public_note: null,
      };
    }

    const result = this.rowToCredibility(row);

    // Write back to cache
    if (this.redis) {
      try {
        await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
      } catch {
        // ignore
      }
    }

    return result;
  }

  // ── B2: Core compute ──────────────────────────────────────────────────────

  async computeForExpert(expertUserId: string): Promise<ExpertCredibility> {
    // 1. Verify user is an expert
    const user = await this.prisma.user.findUnique({
      where: { id: expertUserId },
      include: { claimed_kol_profile: true },
    });
    if (!user) throw new BadRequestException('User not found');
    if (user.role !== 'expert') throw new BadRequestException('User is not an expert');

    const nowMs = Date.now();
    const now = new Date(nowMs);
    const MS_30 = 30 * 24 * 60 * 60 * 1000;
    const MS_90 = 90 * 24 * 60 * 60 * 1000;

    // 2. Platform track
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawCalls = await (this.prisma.portfolioCall.findMany as (args: any) => Promise<any[]>)({
      where: { expert_id: expertUserId },
      orderBy: { opened_at: 'asc' },
    });

    // Compute success flags and write back to each call
    const platformCallScores: CallScore[] = [];
    const callUpdates: Array<{
      id: string;
      success30d: boolean | null;
      success90d: boolean | null;
    }> = [];

    for (const call of rawCalls) {
      const ageMs = nowMs - new Date(call.opened_at).getTime();
      const outcome = call.outcome_return !== null ? Number(call.outcome_return) : null;
      const isLong = ['long', 'LONG'].includes(call.direction);

      // Success: LONG needs >+2%, SHORT needs <-2% return
      const isSuccess = (ret: number) =>
        isLong ? ret > 2 : ret < -2;

      const success30d =
        ageMs >= MS_30 && outcome !== null ? isSuccess(outcome) : null;
      const success90d =
        ageMs >= MS_90 && outcome !== null ? isSuccess(outcome) : null;

      platformCallScores.push({
        direction: call.direction,
        outcome_return: outcome,
        opened_at: new Date(call.opened_at),
        success30d,
        success90d,
      });

      callUpdates.push({ id: call.id, success30d, success90d });
    }

    // Write outcome flags back to PortfolioCalls
    await Promise.all(
      callUpdates.map((u) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.prisma.portfolioCall.update as (args: any) => Promise<any>)({
          where: { id: u.id },
          data: { success30d: u.success30d, success90d: u.success90d, measuredAt: now },
        }),
      ),
    );

    const platformTrack =
      rawCalls.length >= 10
        ? computeTrackScore(platformCallScores, nowMs)
        : null;

    const platformCallCount = rawCalls.length;

    // 3. Social track (only if expert has a KOL handle)
    let socialTrack: CredibilityTrack | null = null;
    let socialCallCount = 0;

    const kolHandle =
      (user.claimed_kol_profile as { twitter_handle?: string } | null)?.twitter_handle ?? null;

    if (kolHandle) {
      const socialCalls = await this.kolService.getSocialCallsForScoring(kolHandle);
      socialCallCount = socialCalls.length;

      // Apply conflict resolution: flag social calls superseded by platform calls within ±7 days
      const MS_7 = 7 * 24 * 60 * 60 * 1000;
      for (const sc of socialCalls) {
        const scTime = sc.posted_at ? new Date(sc.posted_at).getTime() : null;
        if (!scTime) continue;

        const conflict = rawCalls.find((pc) => {
          const pcTime = new Date(pc.opened_at).getTime();
          return (
            pc.ticker.toUpperCase() === sc.ticker.toUpperCase() &&
            Math.abs(pcTime - scTime) <= MS_7
          );
        });

        if (conflict) {
          await this.kolService.markRecommendationSuperseded(sc.id, conflict.id);
          sc.excluded_reason = 'superseded';
        }
      }

      // Filter out low-confidence and superseded calls
      const scorableSocial = socialCalls.filter(
        (sc) =>
          sc.excluded_reason === null &&
          (sc.confidence_score === null || sc.confidence_score >= 0.7),
      );

      if (scorableSocial.length >= 20) {
        const socialCallScores: CallScore[] = scorableSocial.map((sc) => {
          const postedMs = sc.posted_at ? new Date(sc.posted_at).getTime() : nowMs;
          const ageMs = nowMs - postedMs;
          const isLong = ['buy', 'long', 'BUY', 'LONG'].includes(sc.direction);

          const ret30 =
            sc.price_t0 && sc.price_t30
              ? ((sc.price_t30 - sc.price_t0) / sc.price_t0) * 100
              : null;
          const ret90 =
            sc.price_t0 && sc.price_t90
              ? ((sc.price_t90 - sc.price_t0) / sc.price_t0) * 100
              : null;

          // Directional return: flip sign for shorts so positive = good
          const directedRet30 = ret30 !== null ? (isLong ? ret30 : -ret30) : null;
          const directedRet90 = ret90 !== null ? (isLong ? ret90 : -ret90) : null;

          const success30d =
            ageMs >= MS_30 && ret30 !== null ? (isLong ? ret30 > 2 : ret30 < -2) : null;
          const success90d =
            ageMs >= MS_90 && ret90 !== null ? (isLong ? ret90 > 2 : ret90 < -2) : null;

          return {
            direction: sc.direction,
            outcome_return: directedRet30 ?? directedRet90,
            opened_at: new Date(postedMs),
            success30d,
            success90d,
          };
        });

        socialTrack = computeTrackScore(socialCallScores, nowMs);
      }
    }

    // 4. Determine display state
    let displayState: CredibilityDisplayState;
    if (platformCallCount >= 10) {
      displayState = kolHandle ? 'PLATFORM_PRIMARY' : 'PLATFORM_ONLY';
    } else if (socialCallCount >= 20) {
      displayState = 'PUBLIC_ONLY';
    } else {
      displayState = 'NO_DATA';
    }

    // 5. Build public_note
    let publicNote: string | null = null;
    if (displayState === 'PUBLIC_ONLY') {
      publicNote = `Based on ${socialCallCount} public statements tracked. Platform Credibility score unlocks after 10 published calls on Hamilton.`;
    }

    // 6. Upsert credibility_scores
    const upsertData = {
      displayState,
      platformCallCount,
      platformWinRate30d: platformTrack?.win_rate_30d ?? null,
      platformAvgReturn30d: platformTrack?.avg_return_30d ?? null,
      platformScore30d: platformTrack?.score_30d ?? null,
      platformCallsLast90d: platformTrack?.calls_last_90d ?? 0,
      platformWinRate90d: platformTrack?.win_rate_90d ?? null,
      platformAvgReturn90d: platformTrack?.avg_return_90d ?? null,
      platformScore90d: platformTrack?.score_90d ?? null,
      platformRatingDist: platformTrack?.rating_distribution ?? null,
      socialCallCount,
      socialWinRate30d: socialTrack?.win_rate_30d ?? null,
      socialAvgReturn30d: socialTrack?.avg_return_30d ?? null,
      socialScore30d: socialTrack?.score_30d ?? null,
      socialCallsLast90d: socialTrack?.calls_last_90d ?? 0,
      socialWinRate90d: socialTrack?.win_rate_90d ?? null,
      socialAvgReturn90d: socialTrack?.avg_return_90d ?? null,
      socialScore90d: socialTrack?.score_90d ?? null,
      socialRatingDist: socialTrack?.rating_distribution ?? null,
      computedAt: now,
      windowNote: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.prisma.credibilityScore.upsert as (args: any) => Promise<any>)({
      where: { expertUserId },
      create: { expertUserId, ...upsertData },
      update: upsertData,
    });

    // 7. Invalidate Redis cache
    if (this.redis) {
      try {
        await this.redis.del(`credibility:${expertUserId}`);
      } catch {
        // ignore
      }
    }

    return {
      display_state: displayState,
      platform: platformTrack,
      public_statements: socialTrack,
      computed_at: now.toISOString(),
      public_note: publicNote,
    };
  }

  // ── Public trigger (used by PostsService and nightly batch) ──────────────

  async triggerRecompute(expertUserId: string): Promise<void> {
    try {
      await this.credibilityQueue.add(
        'credibility-recompute',
        { expertUserId },
        { removeOnComplete: true, removeOnFail: false, attempts: 3 },
      );
    } catch (err) {
      // Queue unavailable (no Redis) — run synchronously
      this.logger.warn(`Queue unavailable, running credibility compute inline: ${err}`);
      await this.computeForExpert(expertUserId).catch((e) =>
        this.logger.error(`Inline credibility compute failed: ${e}`),
      );
    }
  }

  // ── Nightly batch (02:00) ─────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async nightlyBatch(): Promise<void> {
    this.logger.log('Starting nightly credibility recompute batch');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const experts = await (this.prisma.user.findMany as (args: any) => Promise<any[]>)({
      where: {
        role: 'expert',
        claimed_kol_profile: { isNot: null },
      },
      select: { id: true },
    });
    this.logger.log(`Enqueuing recompute for ${experts.length} experts`);
    for (const expert of experts) {
      await this.triggerRecompute(expert.id);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rowToCredibility(row: any): ExpertCredibility {
    const toTrack = (prefix: 'platform' | 'social'): CredibilityTrack | null => {
      const count: number = row[`${prefix}CallCount`] ?? 0;
      if (count === 0) return null;
      return {
        score_30d: row[`${prefix}Score30d`] ?? null,
        score_90d: row[`${prefix}Score90d`] ?? null,
        win_rate_30d: row[`${prefix}WinRate30d`] ?? null,
        win_rate_90d: row[`${prefix}WinRate90d`] ?? null,
        avg_return_30d: row[`${prefix}AvgReturn30d`] ?? null,
        avg_return_90d: row[`${prefix}AvgReturn90d`] ?? null,
        call_count: count,
        calls_last_90d: row[`${prefix}CallsLast90d`] ?? 0,
        rating_distribution: (row[`${prefix}RatingDist`] as RatingDistribution | null) ?? null,
      };
    };

    const displayState = row.displayState as CredibilityDisplayState;
    const socialCount: number = row.socialCallCount ?? 0;

    // For PLATFORM_PRIMARY, only expose public track if ≥20 social calls
    const publicStatements =
      displayState === 'PLATFORM_PRIMARY' && socialCount < 20
        ? null
        : toTrack('social');

    let publicNote: string | null = null;
    if (displayState === 'PUBLIC_ONLY') {
      publicNote = `Based on ${socialCount} public statements tracked. Platform Credibility score unlocks after 10 published calls on Hamilton.`;
    }

    return {
      display_state: displayState,
      platform:
        displayState === 'PLATFORM_PRIMARY' || displayState === 'PLATFORM_ONLY'
          ? toTrack('platform')
          : null,
      public_statements: publicStatements,
      computed_at: row.computedAt instanceof Date
        ? row.computedAt.toISOString()
        : String(row.computedAt),
      public_note: publicNote,
    };
  }
}
