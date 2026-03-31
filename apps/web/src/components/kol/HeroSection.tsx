import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, ArrowRight, Trophy, Zap, Activity } from 'lucide-react';
import { api } from '../../lib/api';

interface KolEntry {
  id: number;
  handle: string;
  display_name: string;
  win_rate: number;
  avg_return: number;
  total_calls: number;
  qualified: boolean;
}

interface TopOpportunity {
  ticker: string;
  buy_count: number;
  avg_change_7d: number | null;
}

interface RecentCall {
  id: number;
  kol_handle: string;
  display_name: string;
  ticker: string;
  direction: string;
  conviction: string | null;
  target_price: number | null;
  posted_at: string | null;
}

interface HeroSectionProps {
  /** When true (feed page), show "View all" links instead of sign-up CTAs */
  isLoggedIn?: boolean;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'recently';
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return 'recently';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Box 1: Top Experts ─────────────────────────────────────────
function TopExpertsBox({ isLoggedIn }: { isLoggedIn?: boolean }) {
  const [experts, setExperts] = useState<KolEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<KolEntry[]>('/kol/leaderboard?period=T30D')
      .then((res) => setExperts((res.data ?? []).slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
          <Trophy size={14} className="text-[var(--color-accent)]" />
        </div>
        <div>
          <h3 className="font-display font-bold text-sm text-[var(--color-text-primary)]">
            Most Credible Experts
          </h3>
          <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">
            Highest win rate · Last 30 days
          </p>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 flex flex-col gap-1.5">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-[var(--color-bg-subtle)] animate-pulse" />
          ))}

        {!loading && experts.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)] text-center py-4">
            No data yet — pipeline pending.
          </p>
        )}

        {!loading &&
          experts.map((expert, i) => (
            <div
              key={expert.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--color-bg-subtle)] hover:bg-[#2a2a2a] transition-colors"
            >
              {/* Rank medal */}
              <span
                className={`text-xs font-mono font-bold w-5 text-center flex-shrink-0 ${
                  i === 0
                    ? 'text-yellow-400'
                    : i === 1
                      ? 'text-zinc-400'
                      : 'text-amber-700'
                }`}
              >
                #{i + 1}
              </span>
              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                  {expert.display_name}
                </p>
                <p className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
                  @{expert.handle} · {expert.total_calls} calls
                </p>
              </div>
              {/* Stats */}
              <div className="text-right flex-shrink-0">
                <p
                  className={`text-xs font-mono font-bold ${
                    expert.win_rate >= 60
                      ? 'text-[var(--color-accent)]'
                      : expert.win_rate >= 50
                        ? 'text-yellow-400'
                        : 'text-red-400'
                  }`}
                >
                  {expert.win_rate.toFixed(0)}%
                </p>
                <p className="text-[10px] text-[var(--color-text-tertiary)] font-mono">win rate</p>
              </div>
            </div>
          ))}
      </div>

      {/* CTA */}
      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        {isLoggedIn ? (
          <Link
            to="/feed"
            className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
          >
            View full leaderboard <ArrowRight size={12} />
          </Link>
        ) : (
          <Link
            to="/register"
            className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
          >
            Join to follow experts <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Box 2: Top Buying Opportunities ───────────────────────────
function TopOpportunitiesBox({ isLoggedIn }: { isLoggedIn?: boolean }) {
  const [opps, setOpps] = useState<TopOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<TopOpportunity[]>('/kol/top-opportunities')
      .then((res) => setOpps((res.data ?? []).slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
          <TrendingUp size={14} className="text-[var(--color-accent)]" />
        </div>
        <div>
          <h3 className="font-display font-bold text-sm text-[var(--color-text-primary)]">
            Top Buying Opportunities
          </h3>
          <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">
            Most buy calls · Last 7 days
          </p>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 flex flex-col gap-1.5">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-[var(--color-bg-subtle)] animate-pulse" />
          ))}

        {!loading && opps.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)] text-center py-4">
            No recent buy signals — check back after next pipeline run.
          </p>
        )}

        {!loading &&
          opps.map((opp) => (
            <div
              key={opp.ticker}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--color-bg-subtle)] hover:bg-[#2a2a2a] transition-colors"
            >
              {/* Ticker */}
              <span className="font-mono text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wide w-14 flex-shrink-0">
                {opp.ticker}
              </span>
              {/* Buy count bar */}
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-base)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)] opacity-70"
                    style={{ width: `${Math.min(100, opp.buy_count * 10)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] w-12 flex-shrink-0">
                  {opp.buy_count} calls
                </span>
              </div>
              {/* Price change */}
              {opp.avg_change_7d !== null ? (
                <span
                  className={`text-xs font-mono font-bold flex-shrink-0 w-14 text-right ${
                    opp.avg_change_7d >= 0 ? 'text-[var(--color-accent)]' : 'text-red-400'
                  }`}
                >
                  {opp.avg_change_7d >= 0 ? '+' : ''}
                  {opp.avg_change_7d.toFixed(1)}%
                </span>
              ) : (
                <span className="text-[10px] text-[var(--color-text-tertiary)] flex-shrink-0 w-14 text-right">
                  —
                </span>
              )}
            </div>
          ))}
      </div>

      {/* CTA */}
      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        {isLoggedIn ? (
          <Link
            to="/feed"
            className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
          >
            Explore all signals <ArrowRight size={12} />
          </Link>
        ) : (
          <Link
            to="/register"
            className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
          >
            Sign up to see full list <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Box 3: Recent Calls Carousel ───────────────────────────────
function RecentCallsBox({ isLoggedIn }: { isLoggedIn?: boolean }) {
  const [calls, setCalls] = useState<RecentCall[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api
      .get<RecentCall[]>('/kol/recent-calls?limit=20')
      .then((res) => setCalls(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startCycle = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % Math.max(calls.length, 1));
    }, 3000);
  }, [calls.length]);

  useEffect(() => {
    if (calls.length > 0) startCycle();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [calls.length, startCycle]);

  const totalNew = calls.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
          <Activity size={14} className="text-[var(--color-accent)]" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-sm text-[var(--color-text-primary)]">
            Live Recommendations
          </h3>
          <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">
            {loading ? '—' : `${totalNew} recent buy calls`}
          </p>
        </div>
        {!loading && calls.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-accent)] bg-[var(--color-accent-muted)] px-2 py-0.5 rounded-full border border-[var(--color-border-accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse inline-block" />
            LIVE
          </span>
        )}
      </div>

      {/* Carousel */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-[var(--color-bg-subtle)] animate-pulse" />
            ))}
          </div>
        )}

        {!loading && calls.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)] text-center py-4">
            No recent calls — pipeline has not run yet.
          </p>
        )}

        {!loading && calls.length > 0 && (
          <>
            {/* Active card */}
            <div className="px-3 py-3 rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] mb-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-[var(--color-text-primary)] uppercase tracking-wide">
                    {calls[activeIdx]?.ticker}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--color-accent)] text-black uppercase">
                    {calls[activeIdx]?.direction}
                  </span>
                  {calls[activeIdx]?.conviction && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                        calls[activeIdx].conviction === 'HIGH'
                          ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                          : calls[activeIdx].conviction === 'MEDIUM'
                            ? 'border-yellow-500 text-yellow-500'
                            : 'border-[var(--color-border)] text-[var(--color-text-tertiary)]'
                      }`}
                    >
                      {calls[activeIdx].conviction}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono flex-shrink-0">
                  {timeAgo(calls[activeIdx]?.posted_at ?? '')}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                <span className="text-[var(--color-text-tertiary)]">
                  @{calls[activeIdx]?.kol_handle}
                </span>{' '}
                just called{' '}
                <span className="text-[var(--color-accent)] font-semibold">
                  BUY {calls[activeIdx]?.ticker}
                </span>
                {calls[activeIdx]?.target_price && (
                  <span>
                    {' '}· target{' '}
                    <span className="font-mono text-[var(--color-text-primary)]">
                      ${calls[activeIdx].target_price?.toFixed(2)}
                    </span>
                  </span>
                )}
              </p>
            </div>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-1 mb-2">
              {calls.slice(0, Math.min(calls.length, 8)).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                    i === activeIdx % Math.min(calls.length, 8)
                      ? 'bg-[var(--color-accent)] w-3'
                      : 'bg-[var(--color-border)]'
                  }`}
                />
              ))}
            </div>

            {/* Ticker tape — bottom scrolling list */}
            <div className="overflow-hidden relative h-6">
              <div className="flex gap-4 animate-marquee whitespace-nowrap">
                {[...calls, ...calls].map((c, i) => (
                  <span key={i} className="text-[10px] font-mono text-[var(--color-text-tertiary)] flex-shrink-0">
                    <span className="text-[var(--color-accent)]">{c.ticker}</span>
                    {' '}BUY · @{c.kol_handle}
                    <span className="mx-3 text-[var(--color-border)]">|</span>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* CTA */}
      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        {isLoggedIn ? (
          <Link
            to="/feed"
            className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
          >
            See all calls in feed <ArrowRight size={12} />
          </Link>
        ) : (
          <Link
            to="/register"
            className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
          >
            Sign up to see expert picks <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Main HeroSection ───────────────────────────────────────────
export function HeroSection({ isLoggedIn }: HeroSectionProps) {
  return (
    <section className="w-full">
      {/* Section label */}
      <div className="flex items-center gap-2 mb-4">
        <Zap size={14} className="text-[var(--color-accent)]" />
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-widest">
          Market Pulse
        </span>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </div>

      {/* 3-column grid (stacked on mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-accent)] transition-colors duration-200">
          <TopExpertsBox isLoggedIn={isLoggedIn} />
        </div>
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-accent)] transition-colors duration-200">
          <TopOpportunitiesBox isLoggedIn={isLoggedIn} />
        </div>
        <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-accent)] transition-colors duration-200">
          <RecentCallsBox isLoggedIn={isLoggedIn} />
        </div>
      </div>
    </section>
  );
}
