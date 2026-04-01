import { z } from 'zod';

export const PostVisibilitySchema = z.enum(['public', 'preview', 'subscribers_only']);
export const PostTypeSchema = z.enum(['discussion', 'trade_call', 'research', 'update']);

export const TradeDirectionSchema = z.enum(['long', 'short']);
export const TradeTimeframeSchema = z.enum(['intraday', 'swing', 'position', 'long_term']);
export const TradeConvictionSchema = z.enum(['low', 'medium', 'high']);

export const CreatePostSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be at most 255 characters'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(255, 'Slug must be at most 255 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens')
    .optional(),
  body_public: z.string().min(1, 'Post body is required'),
  body_locked: z.string().optional().nullable(),
  visibility: PostVisibilitySchema.default('public'),
  unlock_price: z.number().int().nonnegative().optional().nullable(),
  tickers: z.array(z.string().toUpperCase()).default([]),
  image_urls: z.array(z.string()).default([]),
  ticker_tags: z.array(z.string().toUpperCase()).default([]),
  user_mentions: z.array(z.string()).default([]),
  post_type: PostTypeSchema.default('discussion'),
  published_at: z.string().datetime().optional().nullable(),
  // Trade-call specific fields (required when post_type === 'trade_call')
  trade_ticker: z.string().toUpperCase().optional(),
  trade_direction: TradeDirectionSchema.optional(),
  trade_target_price: z.number().positive().optional().nullable(),
  trade_stop_loss: z.number().positive().optional().nullable(),
  trade_timeframe: TradeTimeframeSchema.optional(),
  trade_conviction: TradeConvictionSchema.optional(),
});

export type CreatePostInput = z.infer<typeof CreatePostSchema>;

export const UpdatePostSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  body_public: z.string().min(1).optional(),
  body_locked: z.string().optional().nullable(),
  visibility: PostVisibilitySchema.optional(),
  unlock_price: z.number().int().nonnegative().optional().nullable(),
  tickers: z.array(z.string().toUpperCase()).optional(),
  image_urls: z.array(z.string()).optional(),
  ticker_tags: z.array(z.string().toUpperCase()).optional(),
  user_mentions: z.array(z.string()).optional(),
  post_type: PostTypeSchema.optional(),
  published_at: z.string().datetime().optional().nullable(),
});

export type UpdatePostInput = z.infer<typeof UpdatePostSchema>;
