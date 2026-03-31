import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PenSquare, RefreshCw, Users, TrendingUp, Clock } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { PostCard } from '../components/posts/PostCard';
import { Button } from '../components/ui/Button';
import { useInfinitePosts, type FeedFilter } from '../hooks/usePosts';
import { KolLeaderboard } from '../components/kol/KolLeaderboard';
import { HeroSection } from '../components/kol/HeroSection';

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
    <AppLayout
      topSlot={<HeroSection isLoggedIn={true} />}
      rightPanel={<KolLeaderboard />}
    >
      {/* Header + refresh */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display font-bold text-2xl text-[var(--color-text-primary)]">Feed</h1>
        <Button variant="ghost" size="sm" onClick={() => void refetch()} className="gap-1.5">
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

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[var(--color-text-secondary)] mb-4">Failed to load posts.</p>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}

      {/* Empty — followed but no follows */}
      {!isLoading && !isError && isEmptyFollowed && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-[var(--color-border)] rounded-lg gap-3">
          <Users size={32} className="text-[var(--color-text-tertiary)]" />
          <p className="text-[var(--color-text-secondary)] font-medium">Follow top experts to get inspired daily</p>
          <p className="text-sm text-[var(--color-text-tertiary)] max-w-xs">
            Discover and follow traders with verified track records to see their latest posts here.
          </p>
        </div>
      )}

      {/* Empty — no posts */}
      {!isLoading && !isError && !isEmptyFollowed && allPosts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-[var(--color-border)] rounded-lg">
          <p className="text-[var(--color-text-secondary)] mb-2">
            {filter === 'trending' ? 'No trending posts yet.' : 'No posts yet.'}
          </p>
          <Link to="/posts/new">
            <Button variant="primary" size="sm">Be the first to post</Button>
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

      {/* Floating new post button */}
      <Link
        to="/posts/new"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-accent)] text-[var(--color-text-inverse)] shadow-lg hover:bg-[var(--color-accent-hover)] transition-all duration-150 hover:scale-105 active:scale-95"
        title="New Post"
      >
        <PenSquare size={22} />
      </Link>
    </AppLayout>
  );
}
