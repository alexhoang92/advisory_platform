import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Globe, Calendar, Edit2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useUser } from '../hooks/useUser';
import { useAuthStore } from '../stores/authStore';

function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const { data: user, isLoading, isError } = useUser(username ?? '');

  const isOwnProfile = currentUser?.username === username;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="animate-pulse flex flex-col gap-4">
          <div className="h-40 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
          <div className="h-24 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)]" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !user) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[var(--color-text-secondary)] mb-2">User not found.</p>
          <Link to="/feed">
            <Button variant="secondary" size="sm">Back to Feed</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Card noPadding className="overflow-hidden">
        {/* Banner */}
        <div className="h-20 bg-gradient-to-r from-[var(--color-bg-elevated)] to-[var(--color-bg-subtle)]" />

        {/* Avatar + action row */}
        <div className="px-5 pb-4 -mt-8">
          <div className="flex items-end justify-between gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-[var(--color-bg-surface)] bg-[var(--color-bg-elevated)] flex items-center justify-center overflow-hidden">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-xl text-[var(--color-text-secondary)]">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            {isOwnProfile && (
              <Link to="/profile/me/edit">
                <Button variant="secondary" size="sm">
                  <Edit2 size={14} />
                  Edit profile
                </Button>
              </Link>
            )}
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
            </div>
            <p className="text-sm text-[var(--color-text-tertiary)] font-mono mt-0.5">
              @{user.username}
            </p>
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
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
              <Calendar size={12} />
              Joined {formatJoinDate(user.created_at)}
            </span>
          </div>
        </div>
      </Card>

      {/* Placeholder for future posts/stats tabs */}
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-4 border-b border-[var(--color-border)] pb-3">
          <button className="text-sm font-medium text-[var(--color-accent)] border-b-2 border-[var(--color-accent)] pb-2.5 -mb-3">
            Posts
          </button>
          {user.role === 'expert' && (
            <button className="text-sm font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors pb-2.5 -mb-3">
              Trade Calls
            </button>
          )}
        </div>

        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[var(--color-border)] rounded-lg">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {isOwnProfile ? "You haven't published any posts yet." : 'No posts yet.'}
          </p>
          {isOwnProfile && (
            <Link to="/posts/new" className="mt-3">
              <Button variant="primary" size="sm">
                Create your first post
              </Button>
            </Link>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
