import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Edit2, Trash2, Calendar, UserPlus, UserCheck } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { TickerChip } from '../components/posts/TickerChip';
import { usePost, useDeletePost } from '../hooks/usePosts';
import { useUser } from '../hooks/useUser';
import { useFollow } from '../hooks/useFollow';
import { useAuthStore } from '../stores/authStore';
import type { Post } from '@hamilton/shared';

const POST_TYPE_VARIANTS: Record<Post['post_type'], 'default' | 'accent' | 'info' | 'warning'> = {
  discussion: 'default',
  trade_call: 'accent',
  research: 'info',
  update: 'warning',
};

const POST_TYPE_LABELS: Record<Post['post_type'], string> = {
  discussion: 'Discussion',
  trade_call: 'Trade Call',
  research: 'Research',
  update: 'Update',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: post, isLoading, isError } = usePost(id ?? '');
  const deletePost = useDeletePost();

  const isAuthor = currentUser?.id === post?.author_id;
  const isLocked = post?.locked === true;

  // Follow state for the post author
  const authorUsername = post?.author?.username ?? '';
  const { data: authorProfile } = useUser(authorUsername);
  const { follow, unfollow } = useFollow(authorUsername);
  const isFollowingAuthor = authorProfile?.is_following ?? false;
  const showFollowButton = Boolean(currentUser) && !isAuthor && authorUsername;

  async function handleDelete() {
    if (!id || !confirm('Delete this post? This cannot be undone.')) return;
    await deletePost.mutateAsync(id);
    void navigate('/feed');
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-pulse flex flex-col gap-4">
          <div className="h-6 w-32 rounded bg-[var(--color-bg-surface)]" />
          <div className="h-64 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !post) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[var(--color-text-secondary)] mb-4">Post not found or access denied.</p>
          <Link to="/feed">
            <Button variant="secondary" size="sm">Back to Feed</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Back link */}
      <Link
        to="/feed"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors mb-5"
      >
        <ArrowLeft size={14} />
        Back to Feed
      </Link>

      <article>
        {/* Meta bar */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={POST_TYPE_VARIANTS[post.post_type]}>
              {POST_TYPE_LABELS[post.post_type]}
            </Badge>
            {isLocked && (
              <Badge variant="default">
                <Lock size={10} className="mr-1" />
                {post.unlock_price != null
                  ? `Unlock for $${(post.unlock_price / 100).toFixed(2)}`
                  : 'Subscribers only'}
              </Badge>
            )}
          </div>

          {isAuthor && (
            <div className="flex items-center gap-2">
              <Link to={`/posts/${post.id}/edit`}>
                <Button variant="secondary" size="sm">
                  <Edit2 size={13} />
                  Edit
                </Button>
              </Link>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                loading={deletePost.isPending}
              >
                <Trash2 size={13} />
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="font-display font-extrabold text-3xl text-[var(--color-text-primary)] leading-tight mb-4">
          {post.title}
        </h1>

        {/* Author + date */}
        {post.author && (
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <Link to={`/profile/${post.author.username}`}>
                <div className="w-9 h-9 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden">
                  {post.author.avatar_url ? (
                    <img
                      src={post.author.avatar_url}
                      alt={post.author.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                      {post.author.display_name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              </Link>
              <div>
                <Link
                  to={`/profile/${post.author.username}`}
                  className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
                >
                  {post.author.display_name}
                </Link>
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                  <span className="font-mono">@{post.author.username}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Calendar size={10} />
                    {post.published_at ? formatDate(post.published_at) : formatDate(post.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {showFollowButton && (
              <Button
                variant={isFollowingAuthor ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => isFollowingAuthor ? unfollow.mutate() : follow.mutate()}
                loading={follow.isPending || unfollow.isPending}
              >
                {isFollowingAuthor ? (
                  <><UserCheck size={13} /> Following</>
                ) : (
                  <><UserPlus size={13} /> Follow</>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Tickers */}
        {post.tickers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {post.tickers.map((ticker) => (
              <TickerChip key={ticker} symbol={ticker} />
            ))}
          </div>
        )}

        {/* Public body */}
        <Card className="mb-4">
          <div className="prose prose-invert max-w-none">
            <p className="text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
              {post.body_public}
            </p>
          </div>
        </Card>

        {/* Locked content */}
        {isLocked && (
          <Card className="relative overflow-hidden border-[var(--color-border-accent)]">
            {/* Blurred preview */}
            <div className="content-locked p-4">
              <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                This is premium content. Subscribe or unlock to read the full post including
                detailed analysis, trade setup, and risk management notes.
              </p>
            </div>

            {/* Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a99] backdrop-blur-sm p-6 text-center">
              <div className="p-3 rounded-full bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)] mb-3">
                <Lock size={20} className="text-[var(--color-accent)]" />
              </div>
              <h3 className="font-display font-bold text-base text-[var(--color-text-primary)] mb-1">
                Premium Content
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] mb-4 max-w-xs">
                {post.unlock_price != null
                  ? `Unlock this post for $${(post.unlock_price / 100).toFixed(2)}, or subscribe to get access to all posts.`
                  : 'Subscribe to access this exclusive content.'}
              </p>
              <div className="flex gap-2">
                {post.unlock_price != null && (
                  <Button variant="primary" size="sm">
                    Unlock for ${(post.unlock_price / 100).toFixed(2)}
                  </Button>
                )}
                <Button variant="secondary" size="sm">
                  Subscribe to author
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Unlocked locked content */}
        {!isLocked && post.body_locked && (
          <Card className="border-[var(--color-border-accent)]">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--color-border-subtle)]">
              <div className="p-1 rounded bg-[var(--color-accent-muted)]">
                <Lock size={12} className="text-[var(--color-accent)]" />
              </div>
              <span className="text-xs font-medium text-[var(--color-accent)]">Premium Content</span>
            </div>
            <div className="prose prose-invert max-w-none">
              <p className="text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
                {post.body_locked}
              </p>
            </div>
          </Card>
        )}
      </article>
    </AppLayout>
  );
}
