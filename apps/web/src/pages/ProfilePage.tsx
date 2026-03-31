import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  MapPin,
  Globe,
  Calendar,
  Edit2,
  UserPlus,
  UserCheck,
  ArrowLeft,
  TrendingUp,
  ExternalLink,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { PostCard } from '../components/posts/PostCard';
import { PerformanceCard } from '../components/credibility/PerformanceCard';
import { RatingDistributionChart } from '../components/credibility/RatingDistributionChart';
import { StockCoverageTable } from '../components/credibility/StockCoverageTable';
import { useUser } from '../hooks/useUser';
import { useFollow } from '../hooks/useFollow';
import { useKolProfile } from '../hooks/useKolProfile';
import { useKolFollow } from '../hooks/useKolFollow';
import { useCredibility } from '../hooks/useCredibility';
import { useInfinitePostsByAuthor } from '../hooks/usePosts';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import type { ExpertCredibility } from '@hamilton/shared';

function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'recently';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
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

interface RecentCall {
  id: number;
  ticker: string;
  direction: string;
  conviction: string | null;
  posted_at: string | null;
}

function useKolRecommendations(twitterHandle: string | null | undefined) {
  return useQuery({
    queryKey: ['kol-recommendations', twitterHandle],
    queryFn: async () => {
      const response = await api.get<RecentCall[]>(
        `/kol-profiles/${twitterHandle}/recommendations?limit=10`,
      );
      return response.data ?? [];
    },
    enabled: Boolean(twitterHandle),
  });
}

// ─── KOL Profile View (Unclaimed / Claimed KOL profiles) ─────────────────────

function KolProfileView({ handle }: { handle: string }) {
  const currentUser = useAuthStore((s) => s.user);
  const isLoggedIn = Boolean(currentUser);
  const { data: kolProfile, isLoading } = useKolProfile(handle);
  const { follow, unfollow } = useKolFollow(handle);
  const [showUnfollowModal, setShowUnfollowModal] = useState(false);
  const { data: kolCalls, isLoading: callsLoading } = useKolRecommendations(handle);

  const isFollowing = kolProfile?.is_following ?? false;

  function handleFollowClick() {
    if (isFollowing) {
      setShowUnfollowModal(true);
    } else {
      follow.mutate();
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse flex flex-col gap-4">
        <div className="h-40 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
        <div className="h-24 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
      </div>
    );
  }

  if (!kolProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[var(--color-text-secondary)] mb-2">Profile not found.</p>
        <Link to="/feed">
          <Button variant="secondary" size="sm">Back to Feed</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Profile card */}
      <Card noPadding className="overflow-hidden">
        {/* Banner */}
        <div className="h-24 bg-gradient-to-r from-[var(--color-bg-elevated)] to-[var(--color-bg-subtle)]" />

        <div className="px-5 pb-5 -mt-8">
          {/* Avatar + actions */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="w-16 h-16 rounded-full border-4 border-[var(--color-bg-surface)] bg-[var(--color-bg-elevated)] flex items-center justify-center overflow-hidden shrink-0">
              {kolProfile.avatar_url ? (
                <img src={kolProfile.avatar_url} alt={kolProfile.display_name} className="w-full h-full object-cover" />
              ) : (
                <TrendingUp size={24} className="text-[var(--color-text-tertiary)]" />
              )}
            </div>

            <div className="flex items-center gap-2">
              {isLoggedIn ? (
                <Button
                  variant={isFollowing ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={handleFollowClick}
                  loading={follow.isPending || unfollow.isPending}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck size={14} />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      Follow
                    </>
                  )}
                </Button>
              ) : (
                <Link to="/login">
                  <Button variant="primary" size="sm">
                    <UserPlus size={14} />
                    Follow
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Name + badges */}
          <div className="mt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-bold text-xl text-[var(--color-text-primary)]">
                {kolProfile.display_name}
              </h1>
              <Badge variant="accent">Expert</Badge>
              {kolProfile.status === 'unclaimed' && (
                <Badge variant="warning">Unclaimed</Badge>
              )}
              {kolProfile.status === 'claimed' && (
                <Badge variant="info">Verified KOL</Badge>
              )}
            </div>
            <p className="text-sm text-[var(--color-text-tertiary)] font-mono mt-0.5">
              @{kolProfile.twitter_handle}
            </p>
          </div>

          {/* Follower count */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-sm text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {kolProfile.kol_followers_count ?? 0}
              </span>{' '}
              followers on Hamilton
            </span>
            {kolProfile.followers_count > 0 && (
              <span className="text-sm text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {kolProfile.followers_count.toLocaleString()}
                </span>{' '}
                social followers
              </span>
            )}
          </div>

          {/* Bio */}
          {kolProfile.bio && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-3 leading-relaxed">
              {kolProfile.bio}
            </p>
          )}

          {/* Links */}
          <div className="flex flex-wrap gap-3 mt-3">
            {kolProfile.profile_url && (
              <a
                href={kolProfile.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--color-info)] hover:underline"
              >
                <ExternalLink size={12} />
                @{kolProfile.twitter_handle} on X
              </a>
            )}
            {kolProfile.content_type && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
                <TrendingUp size={12} />
                {kolProfile.content_type}
              </span>
            )}
          </div>

          {/* Unclaimed CTA */}
          {kolProfile.status === 'unclaimed' && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-[#f5a62310] border border-[#f5a62330] text-xs text-[var(--color-warning)]">
              This is a public profile sourced from social media. The expert hasn&apos;t joined Hamilton yet.{' '}
              <Link to="/register" className="underline hover:text-[var(--color-text-primary)]">
                Are you this expert? Claim your profile.
              </Link>
            </div>
          )}
        </div>
      </Card>

      {/* Recommendations tab */}
      <div className="mt-6 flex items-center gap-1 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 border-[var(--color-accent)] text-[var(--color-accent)] -mb-px">
          <TrendingUp size={13} />
          Recommendations
          <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded bg-[#4a9eff18] text-[var(--color-info)] border border-[#4a9eff30]">
            Social Hearing
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {callsLoading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] animate-pulse"
              />
            ))}
          </div>
        )}

        {!callsLoading && (!kolCalls || kolCalls.length === 0) && (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
            <TrendingUp size={28} className="text-[var(--color-text-tertiary)] mb-2" />
            <p className="text-sm text-[var(--color-text-tertiary)]">No recommendations tracked yet.</p>
          </div>
        )}

        {kolCalls && kolCalls.length > 0 && (
          <Card noPadding className="overflow-hidden">
            {kolCalls.map((call, i) => (
              <div
                key={call.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  i < kolCalls.length - 1 ? 'border-b border-[var(--color-border)]' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <DirectionBadge direction={call.direction} />
                  <span className="font-mono text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                    {call.ticker}
                  </span>
                  {call.conviction && (
                    <span className="text-xs text-[var(--color-text-tertiary)] capitalize">
                      {call.conviction.toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {timeAgo(call.posted_at)}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4a9eff18] text-[var(--color-info)] border border-[#4a9eff30]">
                    Social Hearing
                  </span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Unfollow modal */}
      {showUnfollowModal && (
        <ConfirmModal
          title={`Unfollow @${handle}?`}
          message="You'll stop seeing their recommendations in your Followed feed."
          confirmLabel="Unfollow"
          onConfirm={() =>
            unfollow.mutate(undefined, { onSuccess: () => setShowUnfollowModal(false) })
          }
          onCancel={() => setShowUnfollowModal(false)}
          isLoading={unfollow.isPending}
        />
      )}
    </>
  );
}

// ─── Credibility Tab ─────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-elevated)] transition-colors text-left"
      >
        <span className="text-sm font-semibold text-[var(--color-text-secondary)]">{title}</span>
        {open ? (
          <ChevronUp size={14} className="text-[var(--color-text-tertiary)]" />
        ) : (
          <ChevronDown size={14} className="text-[var(--color-text-tertiary)]" />
        )}
      </button>
      {open && <div className="flex flex-col gap-4 p-4 bg-[var(--color-bg-surface)]">{children}</div>}
    </div>
  );
}

function CredibilityTab({
  username,
  credibility,
}: {
  username: string;
  credibility: ExpertCredibility | null | undefined;
}) {
  if (!credibility || credibility.display_state === 'NO_DATA') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[var(--color-border)] rounded-xl">
        <TrendingUp size={32} className="text-[var(--color-text-tertiary)] mb-3" />
        <p className="text-sm font-semibold text-[var(--color-text-secondary)] mb-1">
          Building track record...
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] max-w-xs">
          Follow this expert to be notified when their credibility score is ready.
        </p>
      </div>
    );
  }

  const { display_state, platform, public_statements, public_note } = credibility;

  const showPublicInPlatformPrimary =
    display_state === 'PLATFORM_PRIMARY' &&
    public_statements !== null &&
    (public_statements.call_count ?? 0) >= 20;

  const showCoverageToggle =
    display_state === 'PLATFORM_PRIMARY' && showPublicInPlatformPrimary;

  return (
    <div className="flex flex-col gap-4">
      {/* PUBLIC_ONLY banner */}
      {display_state === 'PUBLIC_ONLY' && public_note && (
        <div className="px-4 py-3 rounded-xl bg-[#4a9eff12] border border-[#4a9eff30] text-xs text-[var(--color-info)] leading-relaxed">
          {public_note}
        </div>
      )}

      {/* Platform primary score */}
      {(display_state === 'PLATFORM_PRIMARY' || display_state === 'PLATFORM_ONLY') &&
        platform && (
          <>
            <PerformanceCard track={platform} label="Platform Credibility" />
            <RatingDistributionChart data={platform.rating_distribution} />
          </>
        )}

      {/* Public primary score */}
      {display_state === 'PUBLIC_ONLY' && public_statements && (
        <>
          <PerformanceCard track={public_statements} label="Public Statement Evaluation" />
          <RatingDistributionChart data={public_statements.rating_distribution} />
        </>
      )}

      {/* Secondary public section (collapsible) */}
      {showPublicInPlatformPrimary && public_statements && (
        <CollapsibleSection title="Public Statement Evaluation">
          <PerformanceCard track={public_statements} label="Public Statement Evaluation" />
          <RatingDistributionChart data={public_statements.rating_distribution} />
        </CollapsibleSection>
      )}

      {/* Stock coverage table */}
      <StockCoverageTable
        username={username}
        displayState={display_state}
        showToggle={showCoverageToggle}
      />
    </div>
  );
}

// ─── Hamilton User Profile View ───────────────────────────────────────────────

function HamiltonUserProfile({ username }: { username: string }) {
  const currentUser = useAuthStore((s) => s.user);
  const { data: user, isLoading, isError } = useUser(username);
  const { follow, unfollow } = useFollow(username);
  const [showUnfollowModal, setShowUnfollowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'credibility' | 'posts' | 'calls'>('credibility');
  const { data: credibility } = useCredibility(
    user?.role === 'expert' ? username : undefined,
  );

  const isOwnProfile = currentUser?.username === username;
  const isLoggedIn = Boolean(currentUser);
  const isFollowing = user?.is_following ?? false;

  const kolHandle = user?.kol_profile?.twitter_handle as string | undefined;
  const kolStatus = user?.kol_profile?.status as string | undefined;

  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: postsLoading,
  } = useInfinitePostsByAuthor(username);

  const { data: kolCalls, isLoading: callsLoading } = useKolRecommendations(kolHandle);

  const allPosts = postsData?.pages.flatMap((p) => p.data ?? []) ?? [];

  function handleFollowClick() {
    if (isFollowing) {
      setShowUnfollowModal(true);
    } else {
      follow.mutate();
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse flex flex-col gap-4">
        <div className="h-40 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
        <div className="h-24 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
      </div>
    );
  }

  if (isError || !user) return null; // Caller handles fallback

  const showCalls = kolHandle || user.role === 'expert';

  return (
    <>
      {/* Profile card */}
      <Card noPadding className="overflow-hidden">
        {/* Banner */}
        <div className="h-24 bg-gradient-to-r from-[var(--color-bg-elevated)] to-[var(--color-bg-subtle)]" />

        {/* Avatar + action row */}
        <div className="px-5 pb-5 -mt-8">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="w-16 h-16 rounded-full border-4 border-[var(--color-bg-surface)] bg-[var(--color-bg-elevated)] flex items-center justify-center overflow-hidden shrink-0">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-xl text-[var(--color-text-secondary)]">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isOwnProfile ? (
                <Link to="/profile/me/edit">
                  <Button variant="secondary" size="sm">
                    <Edit2 size={14} />
                    Edit profile
                  </Button>
                </Link>
              ) : isLoggedIn ? (
                <Button
                  variant={isFollowing ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={handleFollowClick}
                  loading={follow.isPending || unfollow.isPending}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck size={14} />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      Follow
                    </>
                  )}
                </Button>
              ) : (
                <Link to="/login">
                  <Button variant="primary" size="sm">
                    <UserPlus size={14} />
                    Follow
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Name + role */}
          <div className="mt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-bold text-xl text-[var(--color-text-primary)]">
                {user.display_name}
              </h1>
              <Badge variant={user.role === 'expert' ? 'accent' : 'default'}>
                {user.role === 'expert' ? 'Expert' : 'Investor'}
              </Badge>
              {kolStatus === 'claimed' && (
                <Badge variant="info">Verified KOL</Badge>
              )}
            </div>
            <p className="text-sm text-[var(--color-text-tertiary)] font-mono mt-0.5">
              @{user.username}
            </p>
          </div>

          {/* Follower counts */}
          <div className="flex items-center gap-4 mt-3">
            <span className="text-sm text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {user.follower_count ?? 0}
              </span>{' '}
              followers
            </span>
            <span className="text-sm text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {user.following_count ?? 0}
              </span>{' '}
              following
            </span>
          </div>

          {/* Bio */}
          {user.bio && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-3 leading-relaxed">
              {user.bio}
            </p>
          )}

          {/* Meta */}
          <div className="flex flex-wrap gap-3 mt-3">
            {user.location && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
                <MapPin size={12} />
                {user.location}
              </span>
            )}
            {user.website && (
              <a
                href={user.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--color-info)] hover:underline"
              >
                <Globe size={12} />
                {user.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {kolHandle && (
              <a
                href={`https://x.com/${kolHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--color-info)] hover:underline"
              >
                <ExternalLink size={12} />
                @{kolHandle}
              </a>
            )}
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
              <Calendar size={12} />
              Joined {formatJoinDate(user.created_at)}
            </span>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-1 border-b border-[var(--color-border)] overflow-x-auto">
        {user.role === 'expert' && (
          <button
            onClick={() => setActiveTab('credibility')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === 'credibility'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Credibility
          </button>
        )}
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
            activeTab === 'posts'
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          Posts
        </button>
        {showCalls && (
          <button
            onClick={() => setActiveTab('calls')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === 'calls'
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <TrendingUp size={13} />
            Recommendations
          </button>
        )}
      </div>

      {/* Credibility tab */}
      {activeTab === 'credibility' && user.role === 'expert' && (
        <div className="mt-4">
          <CredibilityTab username={username} credibility={credibility} />
        </div>
      )}

      {/* Posts tab */}
      {activeTab === 'posts' && (
        <div className="mt-4 flex flex-col gap-4">
          {postsLoading && (
            <div className="flex flex-col gap-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-40 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] animate-pulse"
                />
              ))}
            </div>
          )}

          {!postsLoading && allPosts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
              <p className="text-sm text-[var(--color-text-tertiary)]">
                {isOwnProfile ? "You haven't published any posts yet." : 'No posts yet.'}
              </p>
              {isOwnProfile && (
                <Link to="/posts/new" className="mt-3">
                  <Button variant="primary" size="sm">Create your first post</Button>
                </Link>
              )}
            </div>
          )}

          {allPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}

          {hasNextPage && (
            <div className="flex justify-center mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void fetchNextPage()}
                loading={isFetchingNextPage}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Recommendations tab */}
      {activeTab === 'calls' && showCalls && (
        <div className="mt-4 flex flex-col gap-3">
          {callsLoading && (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] animate-pulse"
                />
              ))}
            </div>
          )}

          {!callsLoading && (!kolCalls || kolCalls.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
              <TrendingUp size={28} className="text-[var(--color-text-tertiary)] mb-2" />
              <p className="text-sm text-[var(--color-text-tertiary)]">No recommendations tracked yet.</p>
            </div>
          )}

          {kolCalls && kolCalls.length > 0 && (
            <Card noPadding className="overflow-hidden">
              {kolCalls.map((call, i) => (
                <div
                  key={call.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < kolCalls.length - 1 ? 'border-b border-[var(--color-border)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <DirectionBadge direction={call.direction} />
                    <span className="font-mono text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">
                      {call.ticker}
                    </span>
                    {call.conviction && (
                      <span className="text-xs text-[var(--color-text-tertiary)] capitalize">
                        {call.conviction.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {timeAgo(call.posted_at)}
                    </span>
                    <Badge variant="default" className="text-xs">Social</Badge>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Unfollow confirmation modal */}
      {showUnfollowModal && (
        <ConfirmModal
          title={`Unfollow @${username}?`}
          message={`You'll stop seeing their posts in your Followed feed. You can always follow them again.`}
          confirmLabel="Unfollow"
          onConfirm={() =>
            unfollow.mutate(undefined, { onSuccess: () => setShowUnfollowModal(false) })
          }
          onCancel={() => setShowUnfollowModal(false)}
          isLoading={unfollow.isPending}
        />
      )}
    </>
  );
}

// ─── Main ProfilePage — resolves Hamilton user OR unclaimed KOL ───────────────

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();

  const {
    data: user,
    isLoading: userLoading,
    isError: userError,
  } = useUser(username ?? '');

  // Only attempt KOL profile lookup if Hamilton user was not found
  const shouldFallbackToKol = !userLoading && (userError || !user);
  const { data: kolProfile, isLoading: kolLoading } = useKolProfile(
    shouldFallbackToKol ? username : undefined,
  );

  const isKolProfile = shouldFallbackToKol && (kolProfile || kolLoading);

  return (
    <AppLayout>
      {/* Back nav */}
      <Link
        to="/feed"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors mb-4"
      >
        <ArrowLeft size={14} />
        Back
      </Link>

      {/* Initial loading */}
      {userLoading && (
        <div className="animate-pulse flex flex-col gap-4">
          <div className="h-40 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
          <div className="h-24 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
        </div>
      )}

      {/* Hamilton user found */}
      {!userLoading && user && (
        <HamiltonUserProfile username={username ?? ''} />
      )}

      {/* Fallback: KOL profile */}
      {isKolProfile && (
        <KolProfileView handle={username ?? ''} />
      )}

      {/* Not found anywhere */}
      {!userLoading && !kolLoading && shouldFallbackToKol && !kolProfile && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={40} className="text-[var(--color-text-tertiary)] mb-3" />
          <p className="text-[var(--color-text-secondary)] mb-2">Profile not found.</p>
          <Link to="/feed">
            <Button variant="secondary" size="sm">Back to Feed</Button>
          </Link>
        </div>
      )}
    </AppLayout>
  );
}
