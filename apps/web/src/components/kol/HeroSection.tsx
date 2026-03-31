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

// Shared dot indicator row
function DotRow({ count, active, onDotClick }: { count: number; active: number; onDotClick: (i: number) => void }) {
  const dots = Math.min(count, 8);
  return (
    <div className="flex items-center justify-center gap-1 mt-2">
      {Array.from({ length: dots }).map((_, i) => (
        <button
          key={i}
          onClick={() => onDotClick(i)}
          className={`h-1.5 rounded-full transition-all cursor-pointer ${
            i === active % dots
              ? 'bg-[var(--color-accent)] w-3'
              : 'bg-[var(--color-border)] w-1.5'
          }`}
        />
      ))}
    </div>
  );
}

// ── Box 1: Most Credible Experts ──────────────────────────────
function TopExpertsBox({ isLoggedIn }: { isLoggedIn?: boolean }) {
  const [experts, setExperts] = useState<KolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api
      .get<KolEntry[]>('/kol/leaderboard?period=T30D')
      .then((res) => setExperts((res.data ?? []).slice(0, 10)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startCycle = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % Math.max(experts.length, 1));
    }, 3500);
  }, [experts.length]);

  useEffect(() => {
    if (experts.length > 0) startCycle();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [experts.length, startCycle]);

  const expert = experts[activeIdx];
  const rank = activeIdx + 1;
  const rankColor = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-zinc-400' : rank === 3 ? 'text-amber-700' : 'text-[var(--color-text-tertiary)]';

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
            <Trophy size={13} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h3 className="font-display font-bold text-xs text-[var(--color-text-primary)]">
              Most Credible Experts
            </h3>
            <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-wide">
              Highest win rate · Last 30 days
            </p>
          </div>
        </div>
        {!loading && experts.length > 0 && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-[var(--color-accent)] bg-[var(--color-accent-muted)] px-1.5 py-0.5 rounded-full border border-[var(--color-border-accent)] flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-[var(--color-accent)] animate-pulse inline-block" />
            LIVE
          </span>
        )}
      </div>

      {/* Card */}
      {loading && <div className="h-16 rounded-lg bg-[var(--color-bg-subtle)] animate-pulse mb-2" />}

      {!loading && experts.length === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)] text-center py-3">No data yet — pipeline pending.</p>
      )}

      {!loading && expert && (
        <div className="px-3 py-3 rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] mb-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-sm font-mono font-bold flex-shrink-0 ${rankColor}`}>#{rank}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate leading-tight">
                  {expert.display_name}
                </p>
                <p className="text-[10px] text-[var(--color-text-tertiary)] font-mono leading-tight">
                  @{expert.handle} · {expert.total_calls} calls
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              {expert.total_calls === 0 ? (
                <p className="text-xs font-mono text-[var(--color-text-tertiary)]">Tracking…</p>
              ) : (
                <>
                  <p className={`text-base font-mono font-bold leading-tight ${
                    expert.win_rate >= 60 ? 'text-[var(--color-accent)]' : expert.win_rate >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {expert.win_rate.toFixed(0)}%
                  </p>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] font-mono">win rate</p>
                </>
              )}
            </div>
          </div>
          {expert.total_calls > 0 && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              <span className="text-[var(--color-text-tertiary)]">@{expert.handle}</span>{' '}
              has{' '}
              <span className={expert.avg_return >= 0 ? 'text-[var(--color-accent)] font-semibold' : 'text-red-400 font-semibold'}>
                {expert.avg_return >= 0 ? '+' : ''}{expert.avg_return.toFixed(1)}% avg return
              </span>
              {' '}across {expert.qualified ? 'qualified' : ''} calls
            </p>
          )}
        </div>
      )}

      {experts.length > 0 && (
        <DotRow count={experts.length} active={activeIdx} onDotClick={setActiveIdx} />
      )}

      {/* Ticker tape */}
      {experts.length > 0 && (
        <div className="overflow-hidden relative h-5 mt-2">
          <div className="flex gap-4 animate-marquee whitespace-nowrap">
            {[...experts, ...experts].map((e, i) => (
              <span key={i} className="text-[10px] font-mono text-[var(--color-text-tertiary)] flex-shrink-0">
                <span className={e.win_rate >= 60 ? 'text-[var(--color-accent)]' : 'text-yellow-400'}>
                  @{e.handle}
                </span>
                {' '}{e.win_rate.toFixed(0)}%
                <span className="mx-3 text-[var(--color-border)]">|</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
        <Link
          to={isLoggedIn ? '/feed' : '/register'}
          className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
        >
          {isLoggedIn ? 'View full leaderboard' : 'Join to follow experts'} <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

// ── Box 2: Top Buying Opportunities ───────────────────────────
function TopOpportunitiesBox({ isLoggedIn }: { isLoggedIn?: boolean }) {
  const [opps, setOpps] = useState<TopOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api
      .get<TopOpportunity[]>('/kol/top-opportunities')
      .then((res) => setOpps((res.data ?? []).slice(0, 10)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startCycle = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % Math.max(opps.length, 1));
    }, 3000);
  }, [opps.length]);

  useEffect(() => {
    if (opps.length > 0) startCycle();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [opps.length, startCycle]);

  const opp = opps[activeIdx];
  const maxBuys = opps[0]?.buy_count ?? 1;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
            <TrendingUp size={13} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h3 className="font-display font-bold text-xs text-[var(--color-text-primary)]">
              Top Buying Opportunities
            </h3>
            <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-wide">
              Most buy calls · Last 90 days
            </p>
          </div>
        </div>
        {!loading && opps.length > 0 && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-[var(--color-accent)] bg-[var(--color-accent-muted)] px-1.5 py-0.5 rounded-full border border-[var(--color-border-accent)] flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-[var(--color-accent)] animate-pulse inline-block" />
            LIVE
          </span>
        )}
      </div>

      {/* Card */}
      {loading && <div className="h-16 rounded-lg bg-[var(--color-bg-subtle)] animate-pulse mb-2" />}

      {!loading && opps.length === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)] text-center py-3">No recent buy signals yet.</p>
      )}

      {!loading && opp && (
        <div className="px-3 py-3 rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] mb-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-[var(--color-text-primary)] uppercase tracking-wide">
                {opp.ticker}
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--color-accent-muted)] text-[var(--color-accent)] border border-[var(--color-border-accent)] uppercase">
                BUY
              </span>
            </div>
            {opp.avg_change_7d !== null ? (
              <span className={`text-sm font-mono font-bold ${opp.avg_change_7d >= 0 ? 'text-[var(--color-accent)]' : 'text-red-400'}`}>
                {opp.avg_change_7d >= 0 ? '+' : ''}{opp.avg_change_7d.toFixed(1)}%
              </span>
            ) : (
              <span className="text-xs text-[var(--color-text-tertiary)] font-mono">—</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-base)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${Math.min(100, (opp.buy_count / maxBuys) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] flex-shrink-0">
              {opp.buy_count} buy calls
            </span>
          </div>
        </div>
      )}

      {opps.length > 0 && (
        <DotRow count={opps.length} active={activeIdx} onDotClick={setActiveIdx} />
      )}

      {/* Ticker tape */}
      {opps.length > 0 && (
        <div className="overflow-hidden relative h-5 mt-2">
          <div className="flex gap-4 animate-marquee whitespace-nowrap">
            {[...opps, ...opps].map((o, i) => (
              <span key={i} className="text-[10px] font-mono text-[var(--color-text-tertiary)] flex-shrink-0">
                <span className="text-[var(--color-accent)]">{o.ticker}</span>
                {' '}{o.buy_count} calls
                {o.avg_change_7d !== null && (
                  <span className={o.avg_change_7d >= 0 ? 'text-[var(--color-accent)]' : 'text-red-400'}>
                    {' '}{o.avg_change_7d >= 0 ? '+' : ''}{o.avg_change_7d.toFixed(1)}%
                  </span>
                )}
                <span className="mx-3 text-[var(--color-border)]">|</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
        <Link
          to={isLoggedIn ? '/feed' : '/register'}
          className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
        >
          {isLoggedIn ? 'Explore all signals' : 'Sign up to see full list'} <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

// ── Box 3: Live Recommendations ────────────────────────────────
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [calls.length, startCycle]);

  const call = calls[activeIdx];

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
            <Activity size={13} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <h3 className="font-display font-bold text-xs text-[var(--color-text-primary)]">
              Live Recommendations
            </h3>
            <p className="text-[9px] text-[var(--color-text-tertiary)] uppercase tracking-wide">
              {loading ? '—' : `${calls.length} recent buy calls`}
            </p>
          </div>
        </div>
        {!loading && calls.length > 0 && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-[var(--color-accent)] bg-[var(--color-accent-muted)] px-1.5 py-0.5 rounded-full border border-[var(--color-border-accent)] flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-[var(--color-accent)] animate-pulse inline-block" />
            LIVE
          </span>
        )}
      </div>

      {/* Card */}
      {loading && <div className="h-16 rounded-lg bg-[var(--color-bg-subtle)] animate-pulse mb-2" />}

      {!loading && calls.length === 0 && (
        <p className="text-xs text-[var(--color-text-tertiary)] text-center py-3">No recent calls — pipeline has not run yet.</p>
      )}

      {!loading && call && (
        <div className="px-3 py-3 rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] mb-2">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-[var(--color-text-primary)] uppercase tracking-wide">
                {call.ticker}
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--color-accent)] text-black uppercase">
                {call.direction}
              </span>
              {call.conviction && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                  call.conviction === 'HIGH'
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : call.conviction === 'MEDIUM'
                      ? 'border-yellow-500 text-yellow-500'
                      : 'border-[var(--color-border)] text-[var(--color-text-tertiary)]'
                }`}>
                  {call.conviction}
                </span>
              )}
            </div>
            <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono flex-shrink-0">
              {timeAgo(call.posted_at ?? '')}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            <span className="text-[var(--color-text-tertiary)]">@{call.kol_handle}</span>{' '}
            just called{' '}
            <span className="text-[var(--color-accent)] font-semibold">BUY {call.ticker}</span>
            {call.target_price && (
              <span> · target <span className="font-mono text-[var(--color-text-primary)]">${call.target_price.toFixed(2)}</span></span>
            )}
          </p>
        </div>
      )}

      {calls.length > 0 && (
        <DotRow count={calls.length} active={activeIdx} onDotClick={setActiveIdx} />
      )}

      {/* Ticker tape */}
      {calls.length > 0 && (
        <div className="overflow-hidden relative h-5 mt-2">
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
      )}

      {/* CTA */}
      <div className="mt-2 pt-2 border-t border-[var(--color-border)]">
        <Link
          to={isLoggedIn ? '/feed' : '/register'}
          className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors font-semibold"
        >
          {isLoggedIn ? 'See all calls in feed' : 'Sign up to see expert picks'} <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

// ── Main HeroSection ───────────────────────────────────────────
export function HeroSection({ isLoggedIn }: HeroSectionProps) {
  return (
    <section className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={13} className="text-[var(--color-accent)]" />
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-widest">
          Market Pulse
        </span>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-accent)] transition-colors duration-200">
          <TopExpertsBox isLoggedIn={isLoggedIn} />
        </div>
        <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-accent)] transition-colors duration-200">
          <TopOpportunitiesBox isLoggedIn={isLoggedIn} />
        </div>
        <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-accent)] transition-colors duration-200">
          <RecentCallsBox isLoggedIn={isLoggedIn} />
        </div>
      </div>
    </section>
  );
}
