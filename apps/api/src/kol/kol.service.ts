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

  async getLeaderboard(period: string = 'T30D'): Promise<KolLeaderboardEntry[]> {
    if (!this.pool) return [];

    try {
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
           COALESCE(s.total_calls,   0)::int   AS total_calls,
           COALESCE(s.correct_calls, 0)::int   AS correct_calls,
           COALESCE(s.win_rate,      0)::float AS win_rate,
           COALESCE(s.avg_return_pct,0)::float AS avg_return_pct
         FROM kols k
         LEFT JOIN kol_scores s
           ON s.kol_id = k.id AND s.period = $1
         WHERE k.is_active = true
           AND COALESCE(s.total_calls, 0) > 0
         ORDER BY s.win_rate DESC NULLS LAST`,
        [period],
      );

      const result: KolLeaderboardEntry[] = rows.map((r) => ({
        id: r.id,
        handle: r.handle,
        display_name: r.display_name ?? r.handle,
        profile_url: r.profile_url,
        content_type: r.content_type,
        total_calls: r.total_calls,
        correct_calls: r.correct_calls,
        win_rate: Math.round(r.win_rate * 10) / 10,
        avg_return: Math.round(r.avg_return_pct * 100) / 100,
        qualified: r.total_calls >= 10,
      }));

      const qualified = result.filter((k) => k.qualified);
      const unqualified = result.filter((k) => !k.qualified).sort((a, b) => b.avg_return - a.avg_return);

      return [...qualified, ...unqualified].slice(0, 10);
    } catch (err) {
      console.error('[KolService] leaderboard query failed:', err);
      return [];
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
