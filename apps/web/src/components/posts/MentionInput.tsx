import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, AtSign, DollarSign } from 'lucide-react';
import { useTagSearch, type TagResult } from '../../hooks/useTags';
import { useUserSearch, type UserSearchResult } from '../../hooks/useUserSearch';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TickerMention {
  ticker: string;
  name: string;
  market: string;
}

export interface UserMention {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface MentionInputProps {
  tickerTags: TickerMention[];
  userMentions: UserMention[];
  onTickerTagsChange: (tags: TickerMention[]) => void;
  onUserMentionsChange: (mentions: UserMention[]) => void;
}

// ─── Dropdown item types ──────────────────────────────────────────────────────

type DropdownItem =
  | { kind: 'ticker'; data: TagResult }
  | { kind: 'user'; data: UserSearchResult };

// ─── Market badge colors ──────────────────────────────────────────────────────

const MARKET_COLORS: Record<string, string> = {
  us_stock: 'text-[var(--color-info)]',
  crypto: 'text-[var(--color-warning)]',
  id_stock: 'text-[var(--color-positive)]',
  vn_stock: 'text-[var(--color-accent)]',
};

const MARKET_LABELS: Record<string, string> = {
  us_stock: 'US',
  crypto: 'Crypto',
  id_stock: 'IDX',
  vn_stock: 'VN',
};

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TickerPill({ mention, onRemove }: { mention: TickerMention; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border-accent)]">
      <span className="font-mono text-xs font-semibold text-[var(--color-accent)] uppercase tracking-wide">
        ${mention.ticker}
      </span>
      <span className={`text-[10px] font-medium ${MARKET_COLORS[mention.market] ?? 'text-[var(--color-text-tertiary)]'}`}>
        {MARKET_LABELS[mention.market] ?? mention.market}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-negative)] transition-colors"
      >
        <X size={10} />
      </button>
    </span>
  );
}

function UserPill({ mention, onRemove }: { mention: UserMention; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border)]">
      <div className="w-4 h-4 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden flex-shrink-0">
        {mention.avatar_url ? (
          <img src={mention.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-mono text-[8px] text-[var(--color-text-secondary)]">
            {getInitials(mention.display_name)}
          </span>
        )}
      </div>
      <span className="text-xs text-[var(--color-text-secondary)] font-mono">
        @{mention.username}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-negative)] transition-colors"
      >
        <X size={10} />
      </button>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MentionInput({
  tickerTags,
  userMentions,
  onTickerTagsChange,
  onUserMentionsChange,
}: MentionInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Derive mention type and search query from the input value
  const isTicker = inputValue.startsWith('$');
  const isUser = inputValue.startsWith('@');
  const searchQuery = isTicker
    ? inputValue.slice(1)
    : isUser
    ? inputValue.slice(1)
    : '';

  const { data: tickerResults = [] } = useTagSearch(isTicker ? searchQuery : '');
  const { data: userResults = [] } = useUserSearch(isUser ? searchQuery : '');

  const dropdownItems: DropdownItem[] = isTicker
    ? tickerResults.map((d) => ({ kind: 'ticker' as const, data: d }))
    : isUser
    ? userResults.map((d) => ({ kind: 'user' as const, data: d }))
    : [];

  const showDropdown = dropdownItems.length > 0 && searchQuery.length >= 1;

  // Reset active index when dropdown items change
  useEffect(() => {
    setActiveIndex(0);
  }, [dropdownItems.length]);

  const addTickerTag = useCallback(
    (tag: TagResult) => {
      if (tickerTags.some((t) => t.ticker === tag.ticker)) return;
      onTickerTagsChange([
        ...tickerTags,
        { ticker: tag.ticker, name: tag.name, market: tag.market },
      ]);
    },
    [tickerTags, onTickerTagsChange],
  );

  const addUserMention = useCallback(
    (user: UserSearchResult) => {
      if (userMentions.some((u) => u.username === user.username)) return;
      onUserMentionsChange([
        ...userMentions,
        {
          username: user.username,
          display_name: user.display_name,
          avatar_url: user.avatar_url ?? null,
        },
      ]);
    },
    [userMentions, onUserMentionsChange],
  );

  function selectItem(item: DropdownItem) {
    if (item.kind === 'ticker') {
      addTickerTag(item.data);
    } else {
      addUserMention(item.data);
    }
    setInputValue('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) {
      // Allow Enter with raw ticker (no autocomplete match)
      if (e.key === 'Enter' && isTicker && searchQuery.length >= 1) {
        e.preventDefault();
        const ticker = searchQuery.toUpperCase();
        if (!tickerTags.some((t) => t.ticker === ticker)) {
          onTickerTagsChange([...tickerTags, { ticker, name: ticker, market: 'us_stock' }]);
        }
        setInputValue('');
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, dropdownItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = dropdownItems[activeIndex];
      if (item) selectItem(item);
    } else if (e.key === 'Escape') {
      setInputValue('');
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setInputValue('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const hasAnyMention = tickerTags.length > 0 || userMentions.length > 0;

  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
        Mentions
      </p>

      {/* Chips */}
      {hasAnyMention && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tickerTags.map((t) => (
            <TickerPill
              key={t.ticker}
              mention={t}
              onRemove={() => onTickerTagsChange(tickerTags.filter((x) => x.ticker !== t.ticker))}
            />
          ))}
          {userMentions.map((u) => (
            <UserPill
              key={u.username}
              mention={u}
              onRemove={() =>
                onUserMentionsChange(userMentions.filter((x) => x.username !== u.username))
              }
            />
          ))}
        </div>
      )}

      {/* Input + dropdown */}
      <div className="relative">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] text-[var(--color-text-tertiary)] flex items-center gap-1">
            <DollarSign size={10} />
            ticker
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">·</span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] flex items-center gap-1">
            <AtSign size={10} />
            user
          </span>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="$AAPL or @username"
          className="w-full px-3 py-2 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm font-mono placeholder:font-body placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
        />

        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl z-50 overflow-hidden"
          >
            {dropdownItems.map((item, i) => (
              <button
                key={item.kind === 'ticker' ? item.data.ticker : item.data.username}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectItem(item);
                }}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  i === activeIndex
                    ? 'bg-[var(--color-bg-subtle)]'
                    : 'hover:bg-[var(--color-bg-subtle)]',
                ].join(' ')}
              >
                {item.kind === 'ticker' ? (
                  <>
                    <span className="font-mono text-sm font-semibold text-[var(--color-accent)] uppercase w-24 flex-shrink-0">
                      ${item.data.ticker}
                    </span>
                    <span className="text-sm text-[var(--color-text-secondary)] truncate flex-1">
                      {item.data.name}
                    </span>
                    <span
                      className={`text-[10px] font-medium flex-shrink-0 ${MARKET_COLORS[item.data.market] ?? 'text-[var(--color-text-tertiary)]'}`}
                    >
                      {MARKET_LABELS[item.data.market] ?? item.data.market}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-6 h-6 rounded-full bg-[var(--color-bg-subtle)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.data.avatar_url ? (
                        <img
                          src={item.data.avatar_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">
                          {getInitials(item.data.display_name)}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-[var(--color-text-primary)] font-medium">
                      {item.data.display_name}
                    </span>
                    <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
                      @{item.data.username}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
