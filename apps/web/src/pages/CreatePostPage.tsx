import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { CreatePostSchema, type CreatePostInput } from '@hamilton/shared';
import { useCreatePost } from '../hooks/usePosts';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { MentionInput, type TickerMention, type UserMention } from '../components/posts/MentionInput';
import { ImageUpload, extractPastedImages } from '../components/posts/ImageUpload';
import { ApiError, getStoredToken } from '../lib/api';

const POST_TYPES = [
  { value: 'discussion', label: 'Discussion' },
  { value: 'trade_call', label: 'Trade Call' },
  { value: 'research', label: 'Research' },
  { value: 'update', label: 'Update' },
] as const;

const TRADE_TIMEFRAMES = [
  { value: 'intraday', label: 'Intraday' },
  { value: 'swing', label: 'Swing' },
  { value: 'position', label: 'Position' },
  { value: 'long_term', label: 'Long Term' },
] as const;

const TRADE_CONVICTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', description: 'Everyone can read' },
  { value: 'preview', label: 'Preview', description: 'Public teaser + locked body' },
  { value: 'subscribers_only', label: 'Subscribers Only', description: 'Paid subscribers only' },
] as const;

export function CreatePostPage() {
  const navigate = useNavigate();
  const createPost = useCreatePost();

  const [tickerTags, setTickerTags] = useState<TickerMention[]>([]);
  const [userMentions, setUserMentions] = useState<UserMention[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

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
      ticker_tags: [],
      user_mentions: [],
    },
  });

  const visibility = watch('visibility');
  const postType = watch('post_type');

  async function onSubmit(data: CreatePostInput) {
    const tickers = tickerTags.map((t) => t.ticker);
    try {
      const post = await createPost.mutateAsync({
        ...data,
        tickers,
        ticker_tags: tickers,
        user_mentions: userMentions.map((u) => u.username),
        image_urls: imageUrls,
      });
      void navigate(`/posts/${post.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError('root', { message: err.message });
      } else {
        setError('root', { message: 'Failed to publish post. Please try again.' });
      }
    }
  }

  // Keep hidden form fields in sync for Zod validation
  function handleTickerTagsChange(tags: TickerMention[]) {
    setTickerTags(tags);
    setValue('ticker_tags', tags.map((t) => t.ticker));
    setValue('tickers', tags.map((t) => t.ticker));
  }

  function handleUserMentionsChange(mentions: UserMention[]) {
    setUserMentions(mentions);
    setValue('user_mentions', mentions.map((u) => u.username));
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

        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          onPaste={(e) => {
            const files = extractPastedImages(e);
            if (files.length === 0) return;
            e.preventDefault();
            void (async () => {
              const token = getStoredToken();
              const urls: string[] = [];
              for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/v1/uploads/image', {
                  method: 'POST',
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                  body: formData,
                });
                if (res.ok) {
                  const json = (await res.json()) as { data: { url: string } };
                  urls.push(json.data.url);
                }
              }
              if (urls.length > 0) setImageUrls((prev) => [...prev, ...urls]);
            })();
          }}
          className="flex flex-col gap-5"
        >
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

          {/* Trade-call structured fields */}
          {postType === 'trade_call' && (
            <div className="p-4 rounded-xl border border-[var(--color-border-accent)] bg-[var(--color-accent-muted)] flex flex-col gap-4">
              <p className="text-xs font-semibold text-[var(--color-accent)] uppercase tracking-wide">
                Trade Call Details
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Ticker *"
                  placeholder="e.g. NVDA"
                  error={errors.trade_ticker?.message}
                  {...register('trade_ticker')}
                />

                {/* Direction */}
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
                    Direction *
                  </p>
                  <div className="flex gap-2">
                    {(['long', 'short'] as const).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setValue('trade_direction', dir)}
                        className={[
                          'flex-1 py-1.5 rounded text-sm font-mono font-bold uppercase transition-all border',
                          watch('trade_direction') === dir
                            ? dir === 'long'
                              ? 'bg-[var(--color-accent)] text-black border-[var(--color-accent)]'
                              : 'bg-[var(--color-negative)] text-white border-[var(--color-negative)]'
                            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-tertiary)]',
                        ].join(' ')}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Target Price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 950.00"
                  error={errors.trade_target_price?.message}
                  {...register('trade_target_price', { valueAsNumber: true })}
                />
                <Input
                  label="Stop Loss"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 780.00"
                  error={errors.trade_stop_loss?.message}
                  {...register('trade_stop_loss', { valueAsNumber: true })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Timeframe */}
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
                    Timeframe
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TRADE_TIMEFRAMES.map((tf) => (
                      <button
                        key={tf.value}
                        type="button"
                        onClick={() => setValue('trade_timeframe', tf.value)}
                        className={[
                          'px-2.5 py-1 rounded text-xs font-medium transition-all border',
                          watch('trade_timeframe') === tf.value
                            ? 'bg-[var(--color-accent-muted)] border-[var(--color-border-accent)] text-[var(--color-accent)]'
                            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-tertiary)]',
                        ].join(' ')}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conviction */}
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
                    Conviction
                  </p>
                  <div className="flex gap-1.5">
                    {TRADE_CONVICTIONS.map((cv) => (
                      <button
                        key={cv.value}
                        type="button"
                        onClick={() => setValue('trade_conviction', cv.value)}
                        className={[
                          'flex-1 py-1 rounded text-xs font-medium transition-all border',
                          watch('trade_conviction') === cv.value
                            ? 'bg-[var(--color-accent-muted)] border-[var(--color-border-accent)] text-[var(--color-accent)]'
                            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-tertiary)]',
                        ].join(' ')}
                      >
                        {cv.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

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

          {/* Image upload */}
          <ImageUpload imageUrls={imageUrls} onChange={setImageUrls} />

          {/* Mentions: $TICKER and @user */}
          <MentionInput
            tickerTags={tickerTags}
            userMentions={userMentions}
            onTickerTagsChange={handleTickerTagsChange}
            onUserMentionsChange={handleUserMentionsChange}
          />

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
