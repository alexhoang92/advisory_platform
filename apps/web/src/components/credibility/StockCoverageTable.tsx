import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { PortfolioCall, ExpertCredibility } from '@hamilton/shared';

interface SocialCall {
  id: number;
  ticker: string;
  direction: string;
  target_price: number | null;
  posted_at: string | null;
  outcome_return?: number | null;
}

type SourceTab = 'platform' | 'public';

interface Props {
  username: string;
  displayState: ExpertCredibility['display_state'];
  showToggle: boolean; // true when PLATFORM_PRIMARY and public data exists
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

function DirectionPill({ dir }: { dir: string }) {
  const up = dir.toUpperCase();
  const isBuy = up === 'BUY' || up === 'LONG';
  const isSell = up === 'SELL' || up === 'SHORT';
  return (
    <span
      className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
        isBuy
          ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : isSell
          ? 'bg-[#ff500020] text-[var(--color-negative)]'
          : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'
      }`}
    >
      {isBuy ? 'BUY' : isSell ? 'SELL' : up}
    </span>
  );
}

function ReturnCell({ value }: { value: number | null | undefined }) {
  if (value === undefined || value === null)
    return <span className="text-xs text-[var(--color-text-tertiary)]">Pending</span>;
  const color = value >= 0 ? 'var(--color-positive)' : 'var(--color-negative)';
  return (
    <span className="font-mono text-xs font-semibold" style={{ color }}>
      {value >= 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

function usePlatformCalls(username: string, enabled: boolean) {
  return useQuery({
    queryKey: ['platform-calls', username],
    queryFn: async () => {
      const res = await api.get<PortfolioCall[]>(`/users/${username}/calls`);
      return res.data ?? [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

function usePublicCalls(username: string, enabled: boolean) {
  return useQuery({
    queryKey: ['kol-recommendations', username],
    queryFn: async () => {
      const res = await api.get<SocialCall[]>(
        `/kol-profiles/${username}/recommendations?limit=50`,
      );
      return res.data ?? [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function StockCoverageTable({ username, displayState, showToggle }: Props) {
  const [source, setSource] = useState<SourceTab>(
    displayState === 'PUBLIC_ONLY' ? 'public' : 'platform',
  );

  const showPlatform = displayState !== 'PUBLIC_ONLY';
  const showPublic = displayState === 'PUBLIC_ONLY' || showToggle;

  const { data: platformCalls, isLoading: platformLoading } = usePlatformCalls(
    username,
    showPlatform,
  );
  const { data: publicCalls, isLoading: publicLoading } = usePublicCalls(
    username,
    showPublic && source === 'public',
  );

  const rows =
    source === 'platform'
      ? (platformCalls ?? []).map((c) => ({
          id: c.id,
          ticker: c.ticker,
          direction: c.direction,
          target_price: c.target_price,
          date: c.opened_at,
          outcome_return: c.outcome_return,
        }))
      : (publicCalls ?? []).map((c) => ({
          id: String(c.id),
          ticker: c.ticker,
          direction: c.direction,
          target_price: c.target_price,
          date: c.posted_at,
          outcome_return: null,
        }));

  const isLoading = source === 'platform' ? platformLoading : publicLoading;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
          Stock Coverage
        </p>
        {showToggle && (
          <div className="flex items-center gap-0.5 bg-[var(--color-bg-elevated)] rounded-lg p-0.5">
            {(['platform', 'public'] as SourceTab[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  source === s
                    ? 'bg-[var(--color-accent)] text-black'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {s === 'platform' ? 'Platform Calls' : 'Public Statements'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col gap-px">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-[var(--color-bg-surface)] animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No calls recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {['Ticker', 'Direction', 'Target', 'Return', 'Date'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 font-medium text-[var(--color-text-tertiary)] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={`${
                    i < rows.length - 1 ? 'border-b border-[var(--color-border-subtle)]' : ''
                  } hover:bg-[var(--color-bg-elevated)] transition-colors`}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
                      {row.ticker}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <DirectionPill dir={row.direction} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[var(--color-text-secondary)]">
                    {row.target_price !== null && row.target_price !== undefined
                      ? `$${Number(row.target_price).toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <ReturnCell value={row.outcome_return} />
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-tertiary)] whitespace-nowrap">
                    {formatDate(row.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
