import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, X, Plus } from 'lucide-react';
import { CreatePostSchema, type CreatePostInput } from '@hamilton/shared';
import { useCreatePost } from '../hooks/usePosts';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { TickerChip } from '../components/posts/TickerChip';
import { ApiError } from '../lib/api';

const POST_TYPES = [
  { value: 'discussion', label: 'Discussion' },
  { value: 'trade_call', label: 'Trade Call' },
  { value: 'research', label: 'Research' },
  { value: 'update', label: 'Update' },
] as const;

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', description: 'Everyone can read' },
  { value: 'preview', label: 'Preview', description: 'Public teaser + locked body' },
  { value: 'subscribers_only', label: 'Subscribers Only', description: 'Paid subscribers only' },
] as const;

export function CreatePostPage() {
  const navigate = useNavigate();
  const createPost = useCreatePost();

  const [tickerInput, setTickerInput] = useState('');
  const [tickers, setTickers] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CreatePostInput>({
    resolver: zodResolver(CreatePostSchema),
    defaultValues: {
      post_type: 'discussion',
      visibility: 'public',
      tickers: [],
    },
  });

  const visibility = watch('visibility');
  const postType = watch('post_type');

  function addTicker() {
    const cleaned = tickerInput.trim().toUpperCase();
    if (cleaned && !tickers.includes(cleaned)) {
      const next = [...tickers, cleaned];
      setTickers(next);
      setValue('tickers', next);
    }
    setTickerInput('');
  }

  function removeTicker(ticker: string) {
    const next = tickers.filter((t) => t !== ticker);
    setTickers(next);
    setValue('tickers', next);
  }

  function handleTickerKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTicker();
    }
  }

  async function onSubmit(data: CreatePostInput) {
    try {
      const post = await createPost.mutateAsync({ ...data, tickers });
      void navigate(`/posts/${post.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError('root', { message: err.message });
      } else {
        setError('root', { message: 'Failed to publish post. Please try again.' });
      }
    }
  }

  return (
    <AppLayout>
      <div className="mb-5">
        <Link
          to="/feed"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Feed
        </Link>
      </div>

      <Card>
        <div className="mb-6">
          <h1 className="font-display font-bold text-2xl text-[var(--color-text-primary)]">
            Create Post
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Share research, trade calls, or commentary with the community.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-5">
          {/* Post type */}
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
              Post Type
            </p>
            <div className="flex gap-2 flex-wrap">
              {POST_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setValue('post_type', type.value)}
                  className={[
                    'px-3 py-1.5 rounded text-sm font-medium transition-all duration-150 border',
                    postType === type.value
                      ? 'bg-[var(--color-accent-muted)] border-[var(--color-border-accent)] text-[var(--color-accent)]'
                      : 'bg-transparent border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-tertiary)]',
                  ].join(' ')}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Title"
            placeholder="e.g. NVDA Q2 earnings setup — bullish into print"
            error={errors.title?.message}
            {...register('title')}
          />

          <Textarea
            label="Content (Public)"
            placeholder="Write your thesis, analysis, or commentary here. This is what everyone sees..."
            className="min-h-[160px]"
            error={errors.body_public?.message}
            {...register('body_public')}
          />

          {/* Visibility */}
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
              Visibility
            </p>
            <div className="flex flex-col gap-2">
              {VISIBILITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    'flex items-start gap-3 p-3 rounded border cursor-pointer transition-all duration-150',
                    visibility === opt.value
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-text-tertiary)]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    className="mt-0.5 accent-[var(--color-accent)]"
                    {...register('visibility')}
                  />
                  <div>
                    <p
                      className={[
                        'text-sm font-medium',
                        visibility === opt.value
                          ? 'text-[var(--color-accent)]'
                          : 'text-[var(--color-text-primary)]',
                      ].join(' ')}
                    >
                      {opt.label}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Locked body — only shown for preview visibility */}
          {visibility === 'preview' && (
            <Textarea
              label="Premium Content (Locked)"
              placeholder="The detailed analysis, specific levels, or exclusive insights that subscribers/unlockers see..."
              hint="This content is blurred until the reader pays to unlock or subscribes."
              className="min-h-[140px]"
              error={errors.body_locked?.message}
              {...register('body_locked')}
            />
          )}

          {/* Unlock price — only for preview */}
          {visibility === 'preview' && (
            <Input
              label="Per-Post Unlock Price (cents)"
              type="number"
              min={0}
              placeholder="e.g. 500 for $5.00"
              hint="Leave empty if you don't want a per-post unlock option."
              error={errors.unlock_price?.message}
              {...register('unlock_price', { valueAsNumber: true })}
            />
          )}

          {/* Tickers */}
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
              Tickers
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onKeyDown={handleTickerKeyDown}
                placeholder="e.g. NVDA"
                className="flex-1 px-3 py-2 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm font-mono uppercase placeholder:normal-case placeholder:font-body placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
              />
              <Button type="button" variant="secondary" size="sm" onClick={addTicker}>
                <Plus size={14} />
                Add
              </Button>
            </div>
            {tickers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tickers.map((ticker) => (
                  <span key={ticker} className="inline-flex items-center gap-1">
                    <TickerChip symbol={ticker} />
                    <button
                      type="button"
                      onClick={() => removeTicker(ticker)}
                      className="text-[var(--color-text-tertiary)] hover:text-[var(--color-negative)] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {errors.root && (
            <div className="px-3 py-2.5 rounded bg-[#ff500015] border border-[#ff500030]">
              <p className="text-sm text-[var(--color-negative)]">{errors.root.message}</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
            <Button type="submit" loading={createPost.isPending}>
              Publish Post
            </Button>
            <Link to="/feed">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </AppLayout>
  );
}
