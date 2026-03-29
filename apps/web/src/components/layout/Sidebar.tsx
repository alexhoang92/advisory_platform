import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Compass,
  User,
  PenSquare,
  TrendingUp,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  label: string;
}

const navItems: NavItem[] = [
  {
    to: '/feed',
    icon: <Home size={18} />,
    activeIcon: <Home size={18} fill="currentColor" />,
    label: 'Feed',
  },
  {
    to: '/discover',
    icon: <Compass size={18} />,
    activeIcon: <Compass size={18} fill="currentColor" />,
    label: 'Discover',
  },
  {
    to: '/profile/me',
    icon: <User size={18} />,
    activeIcon: <User size={18} fill="currentColor" />,
    label: 'My Profile',
  },
  {
    to: '/posts/new',
    icon: <PenSquare size={18} />,
    activeIcon: <PenSquare size={18} fill="currentColor" />,
    label: 'Create Post',
  },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    void navigate('/');
  }

  return (
    <aside className="w-[240px] flex-shrink-0 h-full flex flex-col border-r border-[var(--color-border)]">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-[var(--color-accent)]" />
          <span className="font-display font-bold text-lg text-[var(--color-text-primary)] tracking-tight">
            Hamilton
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 font-body">
          Serious investors. Serious traders.
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                'text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border border-[var(--color-border-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? item.activeIcon : item.icon}
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      {user && (
        <div className="px-3 py-4 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-2.5 px-2 py-1.5 mb-2">
            <div className="w-8 h-8 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                {user.display_name}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] font-mono truncate">
                @{user.username}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-negative)] hover:bg-[#ff500010] transition-all duration-150"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
