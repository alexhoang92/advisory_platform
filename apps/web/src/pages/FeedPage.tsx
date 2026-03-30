import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PenSquare, RefreshCw } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { PostCard } from '../components/posts/PostCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useInfinitePosts } from '../hooks/usePosts';
import { useAuthStore } from '../stores/authStore';
import { KolLeaderboard } from '../components/kol/KolLeaderboard';
import { HeroSection } from '../components/kol/HeroSection';

function RightPanel() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col gap-4">
      {/* Quick profile */}
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

      {/* Platform info */}
      <Card>
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
          About Hamilton
        </h3>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          Hamilton connects serious investors with independently verified expert traders. Track records
          are computed automatically from published trade calls.
        </p>
      </Card>

      {/* KOL Leaderboard */}
      <KolLeaderboard />
    </div>
  );
}

export function FeedPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
    useInfinitePosts();

  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
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

  return (
    <AppLayout rightPanel={<RightPanel />}>
      {/* Market Pulse Hero */}
      <div className="mb-8">
        <HeroSection isLoggedIn={true} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-[var(--color-text-primary)]">Feed</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Latest posts from the community
          </p>
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

      {/* Empty state */}
      {!isLoading && !isError && allPosts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-[var(--color-border)] rounded-lg">
          <p className="text-[var(--color-text-secondary)] mb-2">No posts yet.</p>
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
