import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, TrendingUp, FileText, MessageSquare, RefreshCw, Heart, Bookmark, Send, Trash2 } from 'lucide-react';
import type { Post, PostReply } from '@hamilton/shared';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { TickerChip } from './TickerChip';
import { useLikePost, useSavePost, useReplies, useCreateReply, useDeleteReply } from '../../hooks/usePosts';
import { useAuthStore } from '../../stores/authStore';

const MAX_VISIBLE_IMAGES = 4;

function ImageGrid({ urls }: { urls: string[] }) {
  const visible = urls.slice(0, MAX_VISIBLE_IMAGES);
  const overflow = urls.length - MAX_VISIBLE_IMAGES;
  const cols = visible.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div className={`px-4 pb-3 grid ${cols} gap-1`}>
      {visible.map((url, i) => {
        const isLast = i === MAX_VISIBLE_IMAGES - 1 && overflow > 0;
        return (
          <div
            key={url}
            className="relative rounded overflow-hidden bg-[var(--color-bg-elevated)]"
            style={{ aspectRatio: visible.length === 1 ? '16/9' : '1/1' }}
          >
            <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
            {isLast && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-white font-semibold text-lg">+{overflow}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReplyItem({
  reply,
  currentUserId,
  postId,
}: {
  reply: PostReply;
  currentUserId?: string;
  postId: string;
}) {
  const deleteReply = useDeleteReply(postId);

  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden">
        {reply.user.avatar_url ? (
          <img src={reply.user.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">
            {reply.user.display_name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Link
            to={`/profile/${reply.user.username}`}
            className="text-xs font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
          >
            {reply.user.display_name}
          </Link>
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
            @{reply.user.username}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{reply.body}</p>
      </div>
      {currentUserId === reply.user.id && (
        <button
          onClick={() => deleteReply.mutate(reply.id)}
          disabled={deleteReply.isPending}
          className="flex-shrink-0 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-negative)] transition-colors"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function ReplySection({ postId }: { postId: string }) {
  const user = useAuthStore((s) => s.user);
  const [body, setBody] = useState('');
  const { data: replies = [], isLoading } = useReplies(postId);
  const createReply = useCreateReply(postId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    createReply.mutate(body, { onSuccess: () => setBody('') });
  };

  return (
    <div className="px-4 pb-3 border-t border-[var(--color-border-subtle)] pt-3">
      {isLoading ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">Loading replies...</p>
      ) : replies.length > 0 ? (
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {replies.map((reply) => (
            <ReplyItem key={reply.id} reply={reply} currentUserId={user?.id} postId={postId} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-tertiary)] py-1">No replies yet.</p>
      )}

      {user && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2.5">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply..."
            maxLength={500}
            className="flex-1 min-w-0 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2.5 py-1.5 text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          <button
            type="submit"
            disabled={!body.trim() || createReply.isPending}
            className="flex-shrink-0 p-1.5 rounded bg-[var(--color-accent)] text-black disabled:opacity-40 hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <Send size={12} />
          </button>
        </form>
      )}
    </div>
  );
}

interface PostCardProps {
  post: Post;
}

const POST_TYPE_LABELS: Record<Post['post_type'], string> = {
  discussion: 'Discussion',
  trade_call: 'Trade Call',
  research: 'Research',
  update: 'Update',
};

const POST_TYPE_VARIANTS: Record<Post['post_type'], 'default' | 'accent' | 'info' | 'warning'> = {
  discussion: 'default',
  trade_call: 'accent',
  research: 'info',
  update: 'warning',
};

const POST_TYPE_ICONS: Record<Post['post_type'], React.ReactNode> = {
  discussion: <MessageSquare size={12} />,
  trade_call: <TrendingUp size={12} />,
  research: <FileText size={12} />,
  update: <RefreshCw size={12} />,
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function PostCard({ post }: PostCardProps) {
  const author = post.author;
  const isLocked = post.locked === true;
  const user = useAuthStore((s) => s.user);
  const likePost = useLikePost();
  const savePost = useSavePost();
  const [showReplies, setShowReplies] = useState(false);

  return (
    <Card
      noPadding
      className="hover:border-[var(--color-border-subtle)] transition-colors duration-150 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden">
            {author?.avatar_url ? (
              <img
                src={author.avatar_url}
                alt={author.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                {author ? getInitials(author.display_name) : '??'}
              </span>
            )}
          </div>

          {/* Author info */}
          <div className="min-w-0">
            <Link
              to={`/profile/${author?.username ?? ''}`}
              className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
            >
              {author?.display_name ?? 'Unknown'}
            </Link>
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
              @{author?.username ?? 'unknown'}
            </p>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant={POST_TYPE_VARIANTS[post.post_type]}>
            <span className="flex items-center gap-1">
              {POST_TYPE_ICONS[post.post_type]}
              {POST_TYPE_LABELS[post.post_type]}
            </span>
          </Badge>
          {isLocked && (
            <Badge variant="default">
              <span className="flex items-center gap-1">
                <Lock size={10} />
                {post.unlock_price != null
                  ? `$${(post.unlock_price / 100).toFixed(2)}`
                  : 'Locked'}
              </span>
            </Badge>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-4 pb-2">
        <Link
          to={`/posts/${post.id}`}
          className="block text-base font-semibold font-display text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors leading-snug"
        >
          {post.title}
        </Link>
      </div>

      {/* Body preview */}
      <div className="px-4 pb-3 relative">
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed line-clamp-3">
          {post.body_public}
        </p>
        {/* Paywall gradient */}
        {isLocked && (
          <div
            className="absolute inset-x-4 bottom-3 h-8"
            style={{
              background: 'linear-gradient(to bottom, transparent, var(--color-bg-surface))',
            }}
          />
        )}
      </div>

      {/* Tickers */}
      {(post.ticker_tags?.length > 0 || post.tickers.length > 0) && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {post.ticker_tags?.length > 0
            ? post.ticker_tags.map((tag) => (
                <TickerChip
                  key={tag.ticker}
                  symbol={tag.ticker}
                  to={`/tag/${tag.ticker}`}
                />
              ))
            : post.tickers.map((ticker) => (
                <TickerChip key={ticker} symbol={ticker} to={`/tag/${ticker}`} />
              ))}
        </div>
      )}

      {/* Images */}
      {post.image_urls?.length > 0 && (
        <ImageGrid urls={post.image_urls} />
      )}

      {/* Footer: date + interaction bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border-subtle)]">
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {post.published_at ? formatDate(post.published_at) : formatDate(post.created_at)}
        </span>

        <div className="flex items-center gap-3">
          {/* Like */}
          <button
            onClick={() => user && likePost.mutate(post.id)}
            disabled={!user || likePost.isPending}
            className={`flex items-center gap-1 text-xs transition-colors ${
              post.user_liked
                ? 'text-[var(--color-negative)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-negative)]'
            } disabled:opacity-40`}
          >
            <Heart size={13} fill={post.user_liked ? 'currentColor' : 'none'} />
            <span className="font-mono">{post.likes_count ?? 0}</span>
          </button>

          {/* Reply */}
          <button
            onClick={() => setShowReplies((v) => !v)}
            className={`flex items-center gap-1 text-xs transition-colors ${
              showReplies
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]'
            }`}
          >
            <MessageSquare size={13} />
            <span className="font-mono">{post.replies_count ?? 0}</span>
          </button>

          {/* Save */}
          <button
            onClick={() => user && savePost.mutate(post.id)}
            disabled={!user || savePost.isPending}
            className={`flex items-center gap-1 text-xs transition-colors ${
              post.user_saved
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)]'
            } disabled:opacity-40`}
          >
            <Bookmark size={13} fill={post.user_saved ? 'currentColor' : 'none'} />
            <span className="font-mono">{post.saves_count ?? 0}</span>
          </button>

          {isLocked && (
            <Link
              to={`/posts/${post.id}`}
              className="text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors ml-1"
            >
              Unlock →
            </Link>
          )}
        </div>
      </div>

      {/* Reply section (collapsible) */}
      {showReplies && <ReplySection postId={post.id} />}
    </Card>
  );
}
