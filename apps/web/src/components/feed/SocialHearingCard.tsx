import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, UserPlus, UserCheck } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useKolFollow } from '../../hooks/useKolFollow';
import { useAuthStore } from '../../stores/authStore';
import type { SocialHearingItem } from '@hamilton/shared';

function timeAgo(iso: string | null): string {
  if (!iso) return 'recently';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins < 2 ? 'just now' : `${mins}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function DirectionBadge({ direction }: { direction: string }) {
  const upper = direction.toUpperCase();
  const isBuy = upper === 'BUY' || upper === 'LONG';
  const isSell = upper === 'SELL' || upper === 'SHORT';
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
      {isBuy ? 'BUY' : isSell ? 'SELL' : upper}
    </span>
  );
}

interface Props {
  item: SocialHearingItem;
}

export function SocialHearingCard({ item }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const isLoggedIn = Boolean(currentUser);
  const handle = item.kol_profile.twitter_handle;

  const [isFollowing, setIsFollowing] = useState(false);
  const [showUnfollowModal, setShowUnfollowModal] = useState(false);
  const { follow, unfollow } = useKolFollow(handle);

  function handleFollowClick() {
    if (!isLoggedIn) return;
    if (isFollowing) {
      setShowUnfollowModal(true);
    } else {
      follow.mutate(undefined, { onSuccess: () => setIsFollowing(true) });
    }
  }

  function handleUnfollowConfirm() {
    unfollow.mutate(undefined, {
      onSuccess: () => {
        setIsFollowing(false);
        setShowUnfollowModal(false);
      },
    });
  }

  return (
    <>
      <Card className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Avatar placeholder */}
            <div className="w-8 h-8 rounded-full bg-[var(--color-bg-subtle)] flex items-center justify-center shrink-0 border border-[var(--color-border)]">
              <TrendingUp size={14} className="text-[var(--color-text-tertiary)]" />
            </div>

            <div className="min-w-0">
              <Link
                to={`/profile/${handle}`}
                className="text-sm font-semibold text-[var(--color-text-primary)] hover:underline truncate"
              >
                {item.kol_profile.display_name || handle}
              </Link>
              <p className="text-xs text-[var(--color-text-tertiary)] font-mono">@{handle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Social Hearing badge */}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#4a9eff18] text-[var(--color-info)] border border-[#4a9eff30] whitespace-nowrap">
              Social Hearing
            </span>

            {/* Unclaimed badge */}
            {item.kol_profile.status === 'unclaimed' && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#f5a62318] text-[var(--color-warning)] border border-[#f5a62330] whitespace-nowrap">
                Unclaimed
              </span>
            )}

            {/* Follow button */}
            {isLoggedIn && (
              <Button
                variant={isFollowing ? 'secondary' : 'ghost'}
                size="sm"
                onClick={handleFollowClick}
                loading={follow.isPending || unfollow.isPending}
                className="!py-0.5 !px-2 !text-xs"
              >
                {isFollowing ? (
                  <>
                    <UserCheck size={11} />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus size={11} />
                    Follow
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Recommendation body */}
        <div className="flex items-center gap-3 flex-wrap">
          <DirectionBadge direction={item.direction} />
          <span className="font-mono text-base font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
            {item.ticker}
          </span>
          {item.conviction && (
            <span className="text-xs text-[var(--color-text-tertiary)] capitalize">
              {item.conviction.toLowerCase()} conviction
            </span>
          )}
          {item.target_price && (
            <span className="text-xs text-[var(--color-text-secondary)] font-mono">
              Target:{' '}
              <span className="text-[var(--color-text-primary)]">
                ${item.target_price.toLocaleString()}
              </span>
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
          <span>{timeAgo(item.posted_at)}</span>
          <Link
            to={`/profile/${handle}`}
            className="hover:text-[var(--color-text-secondary)] transition-colors"
          >
            View profile →
          </Link>
        </div>
      </Card>

      {showUnfollowModal && (
        <ConfirmModal
          title={`Unfollow @${handle}?`}
          message="You'll stop seeing their recommendations in your Followed feed."
          confirmLabel="Unfollow"
          onConfirm={handleUnfollowConfirm}
          onCancel={() => setShowUnfollowModal(false)}
          isLoading={unfollow.isPending}
        />
      )}
    </>
  );
}
