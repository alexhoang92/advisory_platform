import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface KolLeaderboardEntry {
  id: number;
  handle: string;
  display_name: string;
  profile_url: string | null;
  content_type: string | null;
  total_calls: number;
  correct_calls: number;
  win_rate: number;
  avg_return: number;
  qualified: boolean;
}

export interface TopOpportunity {
  ticker: string;
  buy_count: number;
  avg_change_7d: number | null;
}

export interface SocialCallForScoring {
  id: number;
  kol_id: number;
  ticker: string;
  direction: string;
  posted_at: string | null;
  price_t0: number | null;
  price_t30: number | null;
  price_t90: number | null;
  confidence_score: number | null;
  excluded_reason: string | null;
}

export interface RecentCall {
  id: number;
  kol_handle: string;
  display_name: string;
  ticker: string;
  direction: string;
  conviction: string | null;
  target_price: number | null;
  posted_at: string | null;
}

@Injectable()
export class KolService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;
  private readonly projectRoot: string;

  constructor(private readonly config: ConfigService) {
    this.projectRoot = path.resolve(__dirname, '../../../..');
  }

  onModuleInit() {
    const connStr =
      this.config.get<string>('KOL_DATABASE_URL') ??
      this.config.get<string>('DATABASE_URL');

    if (!connStr) return;

    this.pool = new Pool({
      connectionString: connStr,
      ssl: connStr.includes('neon.tech') ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async getLeaderboard(_period: string = 'T30D'): Promise<KolLeaderboardEntry[]> {
    if (!this.pool) return [];

    try {
      // Compute scores live from recommendations + price_snapshots so the
      // leaderboard always reflects current Neon data without needing a
      // pipeline re-run.
      const { rows } = await this.pool.query<{
        id: number;
        handle: string;
        display_name: string | null;
        profile_url: string | null;
        content_type: string | null;
        total_calls: number;
        correct_calls: number;
        win_rate: number;
        avg_return_pct: number;
      }>(
        `SELECT
           k.id,
           k.handle,
           k.display_name,
           k.profile_url,
           k.content_type,
           COUNT(r.id)::int AS total_calls,
           COUNT(CASE
             WHEN ps0.price > 0 AND ps7.price IS NOT NULL
               AND (
                 (r.direction IN ('BUY','LONG')   AND ps7.price > ps0.price)
                 OR (r.direction IN ('SELL','SHORT') AND ps7.price < ps0.price)
               )
             THEN 1
           END)::int AS correct_calls,
           COALESCE(
             CASE WHEN COUNT(CASE WHEN ps0.price > 0 AND ps7.price IS NOT NULL THEN 1 END) > 0
             THEN (
               COUNT(CASE
                 WHEN ps0.price > 0 AND ps7.price IS NOT NULL
                   AND (
                     (r.direction IN ('BUY','LONG')   AND ps7.price > ps0.price)
                     OR (r.direction IN ('SELL','SHORT') AND ps7.price < ps0.price)
                   )
                 THEN 1
               END)::float
               / COUNT(CASE WHEN ps0.price > 0 AND ps7.price IS NOT NULL THEN 1 END) * 100
             )
             ELSE 0 END, 0
           )::float AS win_rate,
           COALESCE(AVG(
             CASE WHEN ps0.price > 0 AND ps7.price IS NOT NULL
             THEN ((ps7.price - ps0.price) / ps0.price * 100)
                  * CASE WHEN r.direction IN ('SELL','SHORT') THEN -1 ELSE 1 END
             END
           ), 0)::float AS avg_return_pct
         FROM kols k
         LEFT JOIN recommendations r
           ON r.kol_id = k.id
           AND r.direction IN ('BUY', 'SELL', 'LONG', 'SHORT')
         LEFT JOIN price_snapshots ps0
           ON ps0.recommendation_id = r.id AND ps0.snapshot_type = 'T0'
         LEFT JOIN price_snapshots ps7
           ON ps7.recommendation_id = r.id AND ps7.snapshot_type = 'T7D'
         WHERE k.is_active = true
         GROUP BY k.id, k.handle, k.display_name, k.profile_url, k.content_type
         HAVING COUNT(r.id) >= 20
         ORDER BY win_rate DESC NULLS LAST, correct_calls DESC
         LIMIT 10`,
      );

      return rows.map((r) => ({
        id: r.id,
        handle: r.handle,
        display_name: r.display_name ?? r.handle,
        profile_url: r.profile_url,
        content_type: r.content_type,
        total_calls: r.total_calls,
        correct_calls: r.correct_calls,
        win_rate: Math.round(r.win_rate * 10) / 10,
        avg_return: Math.round(r.avg_return_pct * 100) / 100,
        qualified: true, // all returned entries meet the 20-call minimum
      }));
    } catch (err) {
      console.error('[KolService] leaderboard query failed:', err);
      return [];
    }
  }

  async getTopOpportunities(): Promise<TopOpportunity[]> {
    if (!this.pool) return [];
    try {
      const { rows } = await this.pool.query<{
        ticker: string;
        buy_count: number;
        avg_change_7d: number | null;
      }>(
        `SELECT
           r.ticker,
           COUNT(*)::int AS buy_count,
           AVG(
             CASE
               WHEN ps0.price > 0 AND ps7.price IS NOT NULL
               THEN ((ps7.price - ps0.price) / ps0.price) * 100
               ELSE NULL
             END
           )::float AS avg_change_7d
         FROM recommendations r
         LEFT JOIN price_snapshots ps0
           ON ps0.recommendation_id = r.id AND ps0.snapshot_type = 'T0'
         LEFT JOIN price_snapshots ps7
           ON ps7.recommendation_id = r.id AND ps7.snapshot_type = 'T7D'
         WHERE r.direction = 'BUY'
           AND (r.posted_at IS NULL OR r.posted_at >= NOW() - INTERVAL '90 days')
         GROUP BY r.ticker
         ORDER BY buy_count DESC
         LIMIT 10`,
      );
      return rows.map((r) => ({
        ticker: r.ticker,
        buy_count: r.buy_count,
        avg_change_7d: r.avg_change_7d !== null ? Math.round(r.avg_change_7d * 100) / 100 : null,
      }));
    } catch (err) {
      console.error('[KolService] top-opportunities query failed:', err);
      return [];
    }
  }

  async getRecentCalls(limit: number = 20): Promise<RecentCall[]> {
    if (!this.pool) return [];
    try {
      const { rows } = await this.pool.query<{
        id: number;
        kol_handle: string;
        display_name: string | null;
        ticker: string;
        direction: string;
        conviction: string | null;
        target_price: number | null;
        posted_at: Date;
      }>(
        `SELECT
           r.id,
           k.handle AS kol_handle,
           k.display_name,
           r.ticker,
           r.direction,
           r.conviction,
           r.target_price,
           r.posted_at
         FROM recommendations r
         JOIN kols k ON k.id = r.kol_id
         WHERE r.direction IN ('BUY', 'LONG')
           AND k.is_active = true
         ORDER BY r.posted_at DESC
         LIMIT $1`,
        [limit],
      );
      return rows.map((r) => ({
        id: r.id,
        kol_handle: r.kol_handle,
        display_name: r.display_name ?? r.kol_handle,
        ticker: r.ticker,
        direction: r.direction,
        conviction: r.conviction,
        target_price: r.target_price,
        posted_at:
          r.posted_at instanceof Date
            ? r.posted_at.toISOString()
            : r.posted_at
              ? String(r.posted_at)
              : null,
      }));
    } catch (err) {
      console.error('[KolService] recent-calls query failed:', err);
      return [];
    }
  }

  /** Returns recent recommendations for a specific KOL by Twitter handle. */
  async getRecommendationsByHandle(handle: string, limit = 20): Promise<RecentCall[]> {
    if (!this.pool) return [];
    try {
      const { rows } = await this.pool.query<{
        id: number;
        kol_handle: string;
        display_name: string | null;
        ticker: string;
        direction: string;
        conviction: string | null;
        target_price: number | null;
        posted_at: Date;
      }>(
        `SELECT
           r.id,
           k.handle AS kol_handle,
           k.display_name,
           r.ticker,
           r.direction,
           r.conviction,
           r.target_price,
           r.posted_at
         FROM recommendations r
         JOIN kols k ON k.id = r.kol_id
         WHERE LOWER(k.handle) = LOWER($1)
           AND k.is_active = true
         ORDER BY r.posted_at DESC
         LIMIT $2`,
        [handle, limit],
      );
      return rows.map((r) => ({
        id: r.id,
        kol_handle: r.kol_handle,
        display_name: r.display_name ?? r.kol_handle,
        ticker: r.ticker,
        direction: r.direction,
        conviction: r.conviction,
        target_price: r.target_price,
        posted_at:
          r.posted_at instanceof Date
            ? r.posted_at.toISOString()
            : r.posted_at
              ? String(r.posted_at)
              : null,
      }));
    } catch (err) {
      console.error('[KolService] getRecommendationsByHandle failed:', err);
      return [];
    }
  }

  /** Returns distinct tickers referenced in recommendations (for ticker auto-sync). */
  async getDistinctRecommendationTickers(): Promise<string[]> {
    if (!this.pool) return [];
    try {
      const { rows } = await this.pool.query<{ ticker: string }>(
        `SELECT DISTINCT ticker FROM recommendations WHERE ticker IS NOT NULL AND ticker <> ''`,
      );
      return rows.map((r) => r.ticker.trim().toUpperCase()).filter(Boolean);
    } catch (err) {
      console.error('[KolService] getDistinctRecommendationTickers failed:', err);
      return [];
    }
  }

  /** Returns recent recommendations for multiple KOL handles (batch). */
  async getRecommendationsByHandles(handles: string[], limit = 5): Promise<RecentCall[]> {
    if (!this.pool || handles.length === 0) return [];
    try {
      const lowerHandles = handles.map((h) => h.toLowerCase());
      const { rows } = await this.pool.query<{
        id: number;
        kol_handle: string;
        display_name: string | null;
        ticker: string;
        direction: string;
        conviction: string | null;
        target_price: number | null;
        posted_at: Date;
      }>(
        `SELECT
           r.id,
           k.handle AS kol_handle,
           k.display_name,
           r.ticker,
           r.direction,
           r.conviction,
           r.target_price,
           r.posted_at
         FROM recommendations r
         JOIN kols k ON k.id = r.kol_id
         WHERE LOWER(k.handle) = ANY($1)
           AND k.is_active = true
         ORDER BY r.posted_at DESC
         LIMIT $2`,
        [lowerHandles, limit * handles.length],
      );
      return rows.map((r) => ({
        id: r.id,
        kol_handle: r.kol_handle,
        display_name: r.display_name ?? r.kol_handle,
        ticker: r.ticker,
        direction: r.direction,
        conviction: r.conviction,
        target_price: r.target_price,
        posted_at:
          r.posted_at instanceof Date
            ? r.posted_at.toISOString()
            : r.posted_at
              ? String(r.posted_at)
              : null,
      }));
    } catch (err) {
      console.error('[KolService] getRecommendationsByHandles failed:', err);
      return [];
    }
  }

  /** Returns all KOLs for syncing into unclaimed_kol_profiles. */
  async getAllKols(): Promise<
    {
      id: number;
      handle: string;
      display_name: string | null;
      profile_url: string | null;
      followers_approx: number | null;
      content_type: string | null;
    }[]
  > {
    if (!this.pool) return [];
    try {
      const { rows } = await this.pool.query(
        `SELECT id, handle, display_name, profile_url, followers_approx, content_type
         FROM kols
         WHERE is_active = true`,
      );
      return rows;
    } catch (err) {
      console.error('[KolService] getAllKols failed:', err);
      return [];
    }
  }

  /** Look up a single KOL by handle in the kol-tracker DB. Returns null if not found. */
  async getKolByHandle(handle: string): Promise<{
    id: number;
    handle: string;
    display_name: string | null;
    profile_url: string | null;
    followers_approx: number | null;
    content_type: string | null;
  } | null> {
    if (!this.pool) return null;
    try {
      const { rows } = await this.pool.query(
        `SELECT id, handle, display_name, profile_url, followers_approx, content_type
         FROM kols
         WHERE LOWER(handle) = LOWER($1) AND is_active = true
         LIMIT 1`,
        [handle],
      );
      return rows[0] ?? null;
    } catch (err) {
      console.error('[KolService] getKolByHandle failed:', err);
      return null;
    }
  }

  /**
   * Returns all non-excluded recommendations for a KOL handle with T0 / T30D / T90D
   * price snapshots. Used exclusively by CredibilityService for scoring.
   */
  async getSocialCallsForScoring(handle: string): Promise<SocialCallForScoring[]> {
    if (!this.pool) return [];
    try {
      const { rows } = await this.pool.query<{
        id: number;
        kol_id: number;
        ticker: string;
        direction: string;
        posted_at: Date | null;
        price_t0: number | null;
        price_t30: number | null;
        price_t90: number | null;
        confidence_score: number | null;
        excluded_reason: string | null;
      }>(
        `SELECT
           r.id,
           r.kol_id,
           r.ticker,
           r.direction,
           r.posted_at,
           ps0.price  AS price_t0,
           ps30.price AS price_t30,
           ps90.price AS price_t90,
           r.confidence_score,
           r.excluded_reason
         FROM recommendations r
         JOIN kols k ON k.id = r.kol_id
         LEFT JOIN price_snapshots ps0
           ON ps0.recommendation_id = r.id AND ps0.snapshot_type = 'T0'
         LEFT JOIN price_snapshots ps30
           ON ps30.recommendation_id = r.id AND ps30.snapshot_type = 'T30D'
         LEFT JOIN price_snapshots ps90
           ON ps90.recommendation_id = r.id AND ps90.snapshot_type = 'T90D'
         WHERE LOWER(k.handle) = LOWER($1)
           AND k.is_active = true
           AND r.excluded_reason IS NULL`,
        [handle],
      );

      return rows.map((r) => ({
        id: r.id,
        kol_id: r.kol_id,
        ticker: r.ticker,
        direction: r.direction,
        posted_at: r.posted_at instanceof Date ? r.posted_at.toISOString() : (r.posted_at ? String(r.posted_at) : null),
        price_t0: r.price_t0,
        price_t30: r.price_t30,
        price_t90: r.price_t90,
        confidence_score: r.confidence_score,
        excluded_reason: r.excluded_reason,
      }));
    } catch (err) {
      console.error('[KolService] getSocialCallsForScoring failed:', err);
      return [];
    }
  }

  /** Flags a social recommendation as superseded by a platform call. */
  async markRecommendationSuperseded(
    recommendationId: number,
    platformCallId: string,
  ): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `UPDATE recommendations
         SET superseded_by_platform_call_id = $1,
             excluded_reason = 'superseded'
         WHERE id = $2 AND excluded_reason IS NULL`,
        [platformCallId, recommendationId],
      );
    } catch (err) {
      console.error('[KolService] markRecommendationSuperseded failed:', err);
    }
  }

  runPipeline(): { started: boolean; message: string } {
    try {
      const venvPython = path.join(this.projectRoot, 'venv', 'bin', 'python3');
      const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';
      const child = spawn(pythonBin, ['main.py', '--now'], {
        cwd: this.projectRoot,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
      return { started: true, message: 'KOL pipeline started in background' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { started: false, message };
    }
  }
}
