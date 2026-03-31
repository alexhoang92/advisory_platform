import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '../ui/Card';
import { api } from '../../lib/api';

interface KolEntry {
  id: number;
  handle: string;
  display_name: string;
  win_rate: number;
  avg_return: number;
  total_calls: number;
  correct_calls: number;
  qualified: boolean;
}

const PERIODS = ['T7D', 'T30D'] as const;
type Period = (typeof PERIODS)[number];

export function KolLeaderboard() {
  const [kols, setKols] = useState<KolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('T30D');

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await api.get<KolEntry[]>(`/kol/leaderboard?period=${period}`);
      setKols(res.data ?? []);
    } catch {
      // DB may not be populated yet — fail silently
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    void fetchLeaderboard();
    const interval = setInterval(() => void fetchLeaderboard(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
          KOL Leaderboard
        </h3>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors cursor-pointer ${
                period === p
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 rounded bg-[var(--color-bg-subtle)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && kols.length === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)] text-center py-4">
          No data yet — run the pipeline to populate.
        </p>
      )}

      {/* Leaderboard rows */}
      {!loading && kols.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {kols.map((kol, i) => (
            <div
              key={kol.id}
              className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-[var(--color-bg-subtle)] transition-colors"
            >
              {/* Rank */}
              <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] w-4 flex-shrink-0 text-right">
                {i + 1}
              </span>

              {/* Handle + call count */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate leading-tight">
                  @{kol.handle}
                </p>
                <p className="text-[10px] text-[var(--color-text-tertiary)] leading-tight">
                  {kol.total_calls} calls
                  {!kol.qualified && (
                    <span className="ml-1 text-[var(--color-text-tertiary)] opacity-60">
                      (unranked)
                    </span>
                  )}
                </p>
              </div>

              {/* Win rate + avg return */}
              <div className="text-right flex-shrink-0">
                {kol.total_calls === 0 ? (
                  <p className="text-xs font-mono text-[var(--color-text-tertiary)] leading-tight">
                    Tracking…
                  </p>
                ) : (
                  <>
                    <p
                      className={`text-xs font-mono font-bold leading-tight ${
                        kol.win_rate >= 60
                          ? 'text-green-400'
                          : kol.win_rate >= 50
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }`}
                    >
                      {kol.win_rate.toFixed(0)}%
                    </p>
                    <p
                      className={`text-[10px] font-mono leading-tight ${
                        kol.avg_return >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {kol.avg_return >= 0 ? '+' : ''}
                      {kol.avg_return.toFixed(1)}%
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-3 pt-2 border-t border-[var(--color-border)]">
        Win rate · Avg return · Updated daily
      </p>
    </Card>
  );
}
