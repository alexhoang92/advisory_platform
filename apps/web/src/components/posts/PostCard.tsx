import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, TrendingUp, FileText, MessageSquare, RefreshCw } from 'lucide-react';
import type { Post } from '@hamilton/shared';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { TickerChip } from './TickerChip';

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
      {post.tickers.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {post.tickers.map((ticker) => (
            <TickerChip key={ticker} symbol={ticker} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-border-subtle)]">
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {post.published_at ? formatDate(post.published_at) : formatDate(post.created_at)}
        </span>
        {isLocked && (
          <Link
            to={`/posts/${post.id}`}
            className="text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
          >
            Unlock to read →
          </Link>
        )}
      </div>
    </Card>
  );
}
