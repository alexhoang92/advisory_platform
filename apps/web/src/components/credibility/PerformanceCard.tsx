import React, { useState } from 'react';
import type { CredibilityTrack } from '@hamilton/shared';
import { CredibilityScoreDial } from './CredibilityScoreDial';

interface Props {
  track: CredibilityTrack;
  label: string;
}

function fmt(val: number | null, suffix = '%'): string {
  if (val === null) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}${suffix}`;
}

export function PerformanceCard({ track, label }: Props) {
  const [window, setWindow] = useState<'30d' | '90d'>('30d');

  const score = window === '30d' ? track.score_30d : track.score_90d;
  const winRate = window === '30d' ? track.win_rate_30d : track.win_rate_90d;
  const avgReturn = window === '30d' ? track.avg_return_30d : track.avg_return_90d;

  const insufficient90 = window === '90d' && track.score_30d !== null && track.score_90d === null;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">{label}</span>
        {/* Window tabs */}
        <div className="flex items-center gap-0.5 bg-[var(--color-bg-elevated)] rounded-lg p-0.5">
          {(['30d', '90d'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-colors ${
                window === w
                  ? 'bg-[var(--color-accent)] text-black'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {w === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {insufficient90 ? (
        <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">
          Insufficient data for 90-day window — calls need 90+ days to mature.
        </p>
      ) : (
        <div className="flex items-start gap-6">
          {/* Score dial */}
          <CredibilityScoreDial score={score} label="Score" size="md" />

          {/* Stats */}
          <div className="flex-1 flex flex-col gap-3 pt-1">
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)] mb-0.5">Win Rate</p>
              <p
                className="font-mono text-2xl font-bold"
                style={{
                  color:
                    winRate === null
                      ? 'var(--color-text-tertiary)'
                      : winRate >= 50
                      ? 'var(--color-positive)'
                      : 'var(--color-negative)',
                }}
              >
                {winRate !== null ? `${winRate.toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                {track.call_count} total calls
              </p>
            </div>

            <div>
              <p className="text-xs text-[var(--color-text-tertiary)] mb-0.5">Avg Return</p>
              <p
                className="font-mono text-lg font-semibold"
                style={{
                  color:
                    avgReturn === null
                      ? 'var(--color-text-tertiary)'
                      : avgReturn >= 0
                      ? 'var(--color-positive)'
                      : 'var(--color-negative)',
                }}
              >
                {fmt(avgReturn)}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">per call</p>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip note */}
      <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)] flex items-start gap-1.5">
        <span className="text-xs text-[var(--color-text-tertiary)]">ⓘ</span>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          A call is successful if the asset moves more than 2% in the predicted direction within the
          measurement window. Score combines win rate, average return, call volume, and recency.
        </p>
      </div>
    </div>
  );
}
