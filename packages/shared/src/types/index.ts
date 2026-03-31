// ─── Credibility Engine ──────────────────────────────────────────────────────

export type CredibilityDisplayState =
  | 'NO_DATA'
  | 'PUBLIC_ONLY'
  | 'PLATFORM_PRIMARY'
  | 'PLATFORM_ONLY';

export interface RatingDistribution {
  buy_pct: number;
  hold_pct: number;
  sell_pct: number;
  total_count: number;
}

export interface CredibilityTrack {
  score_30d: number | null;
  score_90d: number | null;
  win_rate_30d: number | null;
  win_rate_90d: number | null;
  avg_return_30d: number | null;
  avg_return_90d: number | null;
  call_count: number;
  calls_last_90d: number;
  rating_distribution: RatingDistribution | null;
}

export interface ExpertCredibility {
  display_state: CredibilityDisplayState;
  platform: CredibilityTrack | null;
  public_statements: CredibilityTrack | null;
  computed_at: string;
  public_note: string | null;
}

// ─── Enums ──────────────────────────────────────────────────────────────────

export type UserRole = 'expert' | 'retail' | 'admin';

export type PostVisibility = 'public' | 'preview' | 'subscribers_only';

export type PostType = 'discussion' | 'trade_call' | 'research' | 'update';

export type TradeDirection = 'long' | 'short';

export type TradeTimeframe = 'intraday' | 'swing' | 'position' | 'long_term';

export type TradeConviction = 'low' | 'medium' | 'high';

export type CallStatus = 'open' | 'closed' | 'stopped_out';

export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due';

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  bio: string | null;
  location: string | null;
  website: string | null;
  stripe_account_id: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  // Profile enrichment (present when fetching a user profile)
  follower_count?: number;
  following_count?: number;
  is_following?: boolean;
  kol_profile?: KolProfileSummary | null;
  credibility?: ExpertCredibility;
}

export interface KolProfileSummary {
  id: string;
  kol_id: number;
  twitter_handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  kol_followers_count: number;
  content_type: string | null;
  profile_url: string | null;
  status: 'unclaimed' | 'claimed' | 'rejected';
  is_following: boolean;
}

export interface SocialHearingItem {
  item_type: 'social_hearing';
  id: number;
  kol_handle: string;
  display_name: string;
  ticker: string;
  direction: string;
  conviction: string | null;
  target_price: number | null;
  posted_at: string | null;
  kol_profile: {
    id: string;
    twitter_handle: string;
    display_name: string;
    avatar_url: string | null;
    status: string;
    kol_followers_count: number;
  };
}

export interface ExpertProfile {
  user_id: string;
  specializations: string[];
  subscription_price_monthly: number; // cents
  credibility_score: number;
  total_followers: number;
  win_rate: number;
  avg_return: number;
}

export interface AssetTagSummary {
  id: string;
  ticker: string;
  name: string;
  market: string;
  asset_type: string;
}

export interface PostReply {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export interface Post {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  body_public: string;
  /**
   * Only present in API response when the requesting user has access.
   * Otherwise null and `locked: true` is set.
   */
  body_locked: string | null;
  /**
   * Client-side indicator that locked content exists and the user does not have access.
   */
  locked?: boolean;
  visibility: PostVisibility;
  unlock_price: number | null; // cents
  tickers: string[];
  image_urls: string[];
  ticker_tags: AssetTagSummary[];
  user_mentions: Array<Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url'>>;
  post_type: PostType;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author?: Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  // Interaction counts
  likes_count: number;
  saves_count: number;
  replies_count: number;
  // Current user's interaction state
  user_liked: boolean;
  user_saved: boolean;
}

export interface PortfolioCall {
  id: string;
  post_id: string;
  expert_id: string;
  ticker: string;
  direction: TradeDirection;
  entry_price: number | null; // cents
  target_price: number; // cents
  stop_loss: number; // cents
  timeframe: TradeTimeframe;
  conviction: TradeConviction;
  status: CallStatus;
  outcome_return: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  subscriber_id: string;
  expert_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  current_period_end: string;
  created_at: string;
}

export interface PostUnlock {
  id: string;
  user_id: string;
  post_id: string;
  amount_paid: number; // cents
  stripe_payment_intent_id: string;
  unlocked_at: string;
}

export interface Tip {
  id: string;
  from_user_id: string;
  post_id: string;
  amount: number; // cents
  stripe_payment_intent_id: string;
  created_at: string;
}

/** @deprecated Use ExpertCredibility — see credibility engine types above */
export interface CredibilityScore {
  id: string;
  expertUserId: string;
  displayState: CredibilityDisplayState;
  platformScore30d: number | null;
  platformScore90d: number | null;
  platformCallCount: number;
  socialScore30d: number | null;
  socialScore90d: number | null;
  socialCallCount: number;
  computedAt: string;
  windowNote: string | null;
}

export interface Ticker {
  symbol: string;
  name: string;
  sector: string | null;
  last_price: number | null; // cents
  change_pct: number | null;
  synced_at: string;
}

// ─── API Response Envelope ───────────────────────────────────────────────────

export interface ApiMeta {
  page?: number;
  total?: number;
  cursor?: string | null;
  has_more?: boolean;
  empty_followed?: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
}

export interface ApiResponse<T> {
  data: T | null;
  meta?: ApiMeta;
  error: ApiError | null;
}

// ─── Auth Responses ──────────────────────────────────────────────────────────

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}
