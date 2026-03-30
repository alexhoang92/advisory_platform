import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Globe, BarChart2 } from 'lucide-react';
import { useTag } from '../hooks/useTags';
import { useInfinitePostsByTicker } from '../hooks/usePosts';
import { AppLayout } from '../components/layout/AppLayout';
import { PostCard } from '../components/posts/PostCard';
import type { Post } from '@hamilton/shared';

const MARKET_LABELS: Record<string, string> = {
  us_stock: 'US Stock',
  crypto: 'Crypto',
  id_stock: 'Indonesia (IDX)',
  vn_stock: 'Vietnam (HOSE/HNX)',
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  stock: 'Stock',
  etf: 'ETF',
  crypto: 'Cryptocurrency',
  index: 'Index',
};

const MARKET_COLORS: Record<string, string> = {
  us_stock: 'text-[var(--color-info)] bg-[#4a9eff15] border-[#4a9eff30]',
  crypto: 'text-[var(--color-warning)] bg-[#f5a62315] border-[#f5a62330]',
  id_stock: 'text-[var(--color-positive)] bg-[var(--color-accent-muted)] border-[var(--color-border-accent)]',
  vn_stock: 'text-[var(--color-accent)] bg-[var(--color-accent-muted)] border-[var(--color-border-accent)]',
};

export function TagExplorePage() {
  const { ticker } = useParams<{ ticker: string }>();
  const symbol = ticker?.toUpperCase() ?? '';

  const { data: tag, isLoading: tagLoading, isError: tagError } = useTag(symbol);
  const {
    data,
    isLoading: postsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfinitePostsByTicker(symbol);

  const posts: Post[] = data?.pages.flatMap((p) => p.data ?? []) ?? [];

  return (
    <AppLayout>
      {/* Back nav */}
      <div className="mb-5">
        <Link
          to="/feed"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Feed
        </Link>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 mb-6">
        {tagLoading && (
          <div className="h-14 animate-pulse bg-[var(--color-bg-elevated)] rounded" />
        )}

        {tagError && (
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center">
              <BarChart2 size={20} className="text-[var(--color-text-tertiary)]" />
            </div>
            <div>
              <h1 className="font-mono text-2xl font-bold text-[var(--color-text-primary)] uppercase tracking-widest">
                ${symbol}
              </h1>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
                Ticker not in our database yet — showing all posts mentioning it.
              </p>
            </div>
          </div>
        )}

        {tag && (
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="w-12 h-12 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
              {tag.asset_type === 'crypto' ? (
                <Globe size={20} className="text-[var(--color-warning)]" />
              ) : (
                <TrendingUp size={20} className="text-[var(--color-accent)]" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-mono text-2xl font-bold text-[var(--color-text-primary)] uppercase tracking-widest">
                  ${tag.ticker}
                </h1>
                {/* Market badge */}
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${MARKET_COLORS[tag.market] ?? 'text-[var(--color-text-tertiary)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]'}`}
                >
                  {MARKET_LABELS[tag.market] ?? tag.market}
                </span>
                {/* Asset type badge */}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[10px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide">
                  {ASSET_TYPE_LABELS[tag.asset_type] ?? tag.asset_type}
                </span>
              </div>

              <p className="text-base text-[var(--color-text-secondary)] mt-1 truncate">
                {tag.name}
              </p>

              {/* Meta row */}
              <div className="flex items-center gap-4 mt-2">
                {tag.exchange && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {tag.exchange}
                  </span>
                )}
                {tag.currency && (
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {tag.currency}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Posts feed */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
          Posts mentioning ${symbol}
        </h2>
      </div>

      {postsLoading && (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl animate-pulse bg-[var(--color-bg-surface)] border border-[var(--color-border)]"
            />
          ))}
        </div>
      )}

      {!postsLoading && posts.length === 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 text-center">
          <p className="text-[var(--color-text-secondary)] text-sm">
            No posts yet for ${symbol}.
          </p>
          <p className="text-[var(--color-text-tertiary)] text-xs mt-1">
            Be the first — create a post and mention ${symbol}.
          </p>
        </div>
      )}

      {posts.length > 0 && (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}

          {hasNextPage && (
            <button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full py-3 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-surface)] hover:border-[var(--color-border-subtle)] transition-colors disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </AppLayout>
  );
}
