import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PenSquare, RefreshCw, Users, TrendingUp, Clock } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { PostCard } from '../components/posts/PostCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useInfinitePosts, type FeedFilter } from '../hooks/usePosts';
import { useAuthStore } from '../stores/authStore';
import { KolLeaderboard } from '../components/kol/KolLeaderboard';
import { HeroSection } from '../components/kol/HeroSection';

function RightPanel() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col gap-4">
      {user && (
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="font-mono text-sm text-[var(--color-text-secondary)]">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{user.display_name}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] font-mono">@{user.username}</p>
            </div>
          </div>
          <Link to="/posts/new">
            <Button variant="primary" size="sm" fullWidth>
              <PenSquare size={14} />
              New Post
            </Button>
          </Link>
        </Card>
      )}

      <Card>
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
          About Hamilton
        </h3>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          Hamilton connects serious investors with independently verified expert traders. Track records
          are computed automatically from published trade calls.
        </p>
      </Card>

      <KolLeaderboard />
    </div>
  );
}

const FILTER_TABS: { key: FeedFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'latest', label: 'Latest', icon: <Clock size={13} /> },
  { key: 'followed', label: 'Followed', icon: <Users size={13} /> },
  { key: 'trending', label: 'Trending', icon: <TrendingUp size={13} /> },
];

export function FeedPage() {
  const [filter, setFilter] = useState<FeedFilter>('latest');
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
    useInfinitePosts(filter);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allPosts = data?.pages.flatMap((page) => page.data ?? []) ?? [];
  const isEmptyFollowed = filter === 'followed' && data?.pages[0]?.meta?.empty_followed === true;

  return (
    <AppLayout rightPanel={<RightPanel />}>
      {/* Market Pulse Hero */}
      <div className="mb-8">
        <HeroSection isLoggedIn={true} />
      </div>

      {/* Header + filter tabs */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-[var(--color-text-primary)]">Feed</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refetch()}
          className="gap-1.5"
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-[var(--color-border)]">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === tab.key
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[var(--color-text-secondary)] mb-4">Failed to load posts.</p>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {/* Empty: followed but no follows */}
      {!isLoading && !isError && isEmptyFollowed && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-[var(--color-border)] rounded-lg gap-3">
          <Users size={32} className="text-[var(--color-text-tertiary)]" />
          <p className="text-[var(--color-text-secondary)] font-medium">
            Follow top experts to get inspired daily
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)] max-w-xs">
            Discover and follow traders with verified track records to see their latest posts here.
          </p>
        </div>
      )}

      {/* Empty: no posts */}
      {!isLoading && !isError && !isEmptyFollowed && allPosts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-[var(--color-border)] rounded-lg">
          <p className="text-[var(--color-text-secondary)] mb-2">
            {filter === 'trending' ? 'No trending posts yet.' : 'No posts yet.'}
          </p>
          <Link to="/posts/new">
            <Button variant="primary" size="sm">
              Be the first to post
            </Button>
          </Link>
        </div>
      )}

      {/* Posts */}
      {allPosts.length > 0 && (
        <div className="flex flex-col gap-4">
          {allPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="mt-6 flex justify-center">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Loading more...
          </div>
        )}
        {!hasNextPage && allPosts.length > 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)]">You&apos;ve reached the end.</p>
        )}
      </div>
    </AppLayout>
  );
}
