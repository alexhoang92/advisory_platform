# Change Log

---
## Codebase Optimisation (31-Mar-2026)

### 1. Shared `OptionalJwtGuard`
- Extracted identical inline guard class from `posts.controller.ts`, `users.controller.ts`, and `kol-profiles.controller.ts` into `apps/api/src/common/guards/optional-jwt.guard.ts`
- All three controllers now import from the shared location; `ExecutionContext` and `AuthGuard` imports removed from each controller

### 2. Dead type removal
- Deleted `ExpertProfile` interface from `packages/shared` — zero usages in any app code
- Deleted deprecated `CredibilityScore` interface — replaced by `ExpertCredibility`; no remaining usages

### 3. CORS fallback fix
- Removed `http://localhost:3001` from hardcoded CORS fallback in `apps/api/src/main.ts` — port 3001 was never used anywhere in the codebase
- Correct dev setup: API on `:3000`, Vite dev server on `:5173`

### 4. Dev server ports — canonical command
- **Why multiple ports appeared**: Running API and web servers manually without `npm run dev` caused port collisions. The single correct command from the repo root is `npm run dev` (invokes turbo, starts both concurrently with correct ports)
- API: `:3000` (set via `PORT` env var or `.env`), Vite proxy forwards `/api` → `localhost:3000`
- Web: `:5173` (Vite default, CORS-allowed in API)

### 5. Uploads excluded from git
- Added `apps/api/uploads/` to `.gitignore`

---
## Known Gap: PortfolioCall creation not wired to trade_call posts

When a user creates a post with `post_type: "trade_call"`, no `PortfolioCall` record is created. The table and shared type exist but `PostsService.create()` does not invoke any portfolio logic. Credibility scoring therefore has no platform call data to work with until this is implemented.

**Deferred to next session.** Implementation requires:
- Adding portfolio call fields to `CreatePostDto`
- Creating a `PortfolioCallsService` or extending `PostsService`
- Triggering `CredibilityService.triggerRecompute()` after creation
- No schema changes needed

---
## Phase 3 — Credibility Engine (31-Mar-2026)

### Session A — Schema Migrations

**A1 — `credibility_scores` table rebuilt** (`20260331140000_add_credibility_scores`)
- Replaced old 7-field simple table with dual-track schema: platform and public (social) tracks, each with 30d/90d windows, composite integer scores (0–100), win rate, avg return, call counts, JSON rating distributions
- New fields: `displayState`, `platformCallCount`, `platformScore30d/90d`, `socialCallCount`, `socialScore30d/90d`, `platformRatingDist`, `socialRatingDist`, `windowNote`
- `User.credibilityScore` relation renamed from `credibility_score` to `credibilityScore`

**A2 — `PortfolioCall` extended** (`20260331140001_add_portfolio_call_outcome_fields`)
- Added `success30d Boolean?`, `success90d Boolean?`, `measuredAt DateTime?` — written back by the scoring engine on each compute run

**A3 — Python `recommendations` table extended via Alembic**
- Added `confidence_score Float`, `superseded_by_platform_call_id String`, `excluded_reason String` to SQLAlchemy `Recommendation` model
- Initialized Alembic (`alembic/`, `alembic.ini`) configured to read `DATABASE_URL` and import `db.models.Base`
- Migration `0001_add_recommendation_credibility_fields` applied and at HEAD
- Added `alembic==1.14.1` to `requirements.txt`

**A4 — Shared TypeScript types**
- Added `CredibilityDisplayState`, `RatingDistribution`, `CredibilityTrack`, `ExpertCredibility` to `packages/shared/src/types/index.ts`
- Extended `User` interface with `credibility?: ExpertCredibility`

---

### Session B — Credibility Scoring Engine (NestJS)

**New module: `apps/api/src/credibility/`**
- `credibility.module.ts` — BullModule with async Redis config (graceful if `REDIS_URL` unset), registers `credibility` queue
- `credibility.service.ts` — core engine:
  - `computeForExpert(expertUserId)`: fetches platform calls → computes `success30d`/`success90d` (LONG >+2%, SHORT <-2%), writes flags back; fetches social calls via `KolService.getSocialCallsForScoring()`; applies ±7-day conflict resolution (flags superseded social calls); scores both tracks independently using formula `win_rate×0.4 + return×0.3 + volume×0.15 + recency×0.15`; determines `displayState`; upserts `credibility_scores`; invalidates Redis cache
  - `getForExpert(expertUserId)`: Redis → DB fallback, 1h TTL, returns `NO_DATA` shape when no row exists
  - `triggerRecompute(expertUserId)`: enqueues BullMQ job or runs inline if Redis unavailable
  - `nightlyBatch()`: `@Cron(EVERY_DAY_AT_2AM)` — enqueues recompute for all experts with linked KOL handle
- `credibility.processor.ts` — `@Process('credibility-recompute')` BullMQ handler
- `credibility.controller.ts`:
  - `GET /api/v1/users/:username/credibility` — public, returns `null` for non-experts
  - `POST /api/v1/users/:username/credibility/recompute` — dev/admin trigger

**KolService additions:**
- `getSocialCallsForScoring(handle)` — returns recommendations with T0/T30D/T90D price snapshots, excluding already-excluded rows
- `markRecommendationSuperseded(recId, platformCallId)` — sets `excluded_reason = 'superseded'`

**UsersService / UsersModule:**
- `findByUsername` now attaches `credibility` from cached `getForExpert` for expert users
- `UsersModule` imports `CredibilityModule`

**Packages added:** `bull`, `@nestjs/bull`, `ioredis`

---

### Session C — KOL Parser: Confidence Scoring

**`parser/llm_parser.py`**
- Extended Claude prompt to return `confidence` field (0.0–1.0) with detailed per-tier guidelines
- Saves `confidence_score` when writing `Recommendation` to DB; defaults to `0.5` if LLM omits it

**`scripts/backfill_confidence.py`**
- Queries all `recommendations` where `confidence_score IS NULL`, batches 100 at a time
- Sends `signal_text` (or original tweet text) to `claude-haiku` with a simplified confidence-only prompt
- Commits every 100 rows, logs progress %; aborts cleanly on API errors; defaults failing rows to `0.5`
- Safe to re-run (skips rows where `confidence_score IS NOT NULL`)

---

### Session D — Profile Page UI

**New components: `apps/web/src/components/credibility/`**
- `CredibilityScoreDial.tsx` — SVG arc dial (270° sweep), color-coded green/amber/red by score bracket, `—` when null, `sm`/`md` size variants
- `PerformanceCard.tsx` — 30d/90d tab switcher; shows dial + win rate + avg return; "Insufficient data" copy when 90d null; ⓘ tooltip explains formula
- `RatingDistributionChart.tsx` — SVG donut chart (buy/hold/sell); legend + total count; placeholder state for null data
- `StockCoverageTable.tsx` — ticker/direction/target/return/date table; source toggle (Platform Calls / Public Statements) when `PLATFORM_PRIMARY` with ≥20 social calls; "Pending" for unscored returns; fetches platform calls via `/users/:username/calls`, public calls via `/kol-profiles/:username/recommendations`

**New hook: `apps/web/src/hooks/useCredibility.ts`**
- Fetches `GET /api/v1/users/:username/credibility`; 5-min stale time; only enabled for expert users

**`apps/web/src/pages/ProfilePage.tsx`**
- `HamiltonUserProfile` now has three tabs: **Credibility** (first, experts only) | Posts | Recommendations
- Four `CredibilityTab` display state layouts:
  - `NO_DATA` — placeholder with "Building track record..." message
  - `PUBLIC_ONLY` — info banner + `PerformanceCard` + `RatingDistributionChart` for public track
  - `PLATFORM_PRIMARY` — platform track primary; collapsible "Public Statement Evaluation" section if ≥20 social calls; coverage table with source toggle
  - `PLATFORM_ONLY` — platform track only, no public section, no toggle

---
## _Changes 31-Mar-2026:

### 1. Signup flow — removed display name field
- Registration now requires only email, username, password, and role.
- `display_name` defaults to `username` on user creation (backend).
- Removed from `RegisterSchema` (shared), `RegisterDto` (API), and `RegisterPage` (frontend).

### 2. Account Settings page
- **Entry point:** clicking the user card (bottom-left sidebar) navigates to `/settings`.
- **Bio:** editable textarea, hard-capped at 200 characters with live counter.
- **Password change:** current password verification → new password (min 8 chars) → confirm.
- New `PATCH /api/v1/users/me/password` endpoint added (bcrypt verification + re-hash).
- New `SettingsPage` component at `apps/web/src/pages/SettingsPage.tsx`.

### 3. KOL hero section & leaderboard — live Neon queries
- Leaderboard now computes win rates **live** from `recommendations + price_snapshots` tables,
  removing the dependency on the pre-computed `kol_scores` table. Data shows without a pipeline re-run.
- Top Opportunities time window extended from 7 days → 90 days.
- Recent Calls: `posted_at` handled as nullable; `timeAgo()` shows `"recently"` for null/invalid timestamps.



## _Changes 31-Mar-2026 round 2:

### 1. Follow system — backend + frontend
- `POST /api/v1/users/:username/follow` — follow a user (auth required, no-op if already following)
- `DELETE /api/v1/users/:username/follow` — unfollow a user (auth required)
- `GET /api/v1/users/:username` now uses OptionalJwtGuard so it returns `is_following: true/false` for authenticated callers
- `findByUsername` returns `follower_count`, `following_count`, `is_following`, and linked `kol_profile` in the response
- New `useFollow(username)` hook: optimistic cache updates for follow/unfollow mutations
- Unfollow requires confirmation via `ConfirmModal` component

### 2. Enhanced ProfilePage
- Shows **follower / following counts** in the profile header
- **Follow / Unfollow button** for non-own profiles (redirects to login if unauthenticated)
- `Posts` tab: loads actual posts by that author via `GET /posts?author=:username`
- `Recommendations` tab (experts with linked KOL profile): fetches live social recommendations from KOL-tracker DB via `GET /kol-profiles/:handle/recommendations`
- **Verified KOL** badge shown when the user has claimed a KOL profile
- Twitter/X handle link shown for claimed KOL profiles
- Back button added for easy navigation

### 3. Follow button on PostDetailPage
- Follow / Unfollow button shown beside the author name on post detail pages
- Fetches author profile to get live `is_following` state
- Instant optimistic cache update — no full page reload needed

### 4. Posts by author filter
- `GET /api/v1/posts?author=:username` now returns posts filtered to a specific user
- Works independently of feed filter (latest/followed/trending)

### 5. KOL recommendations per profile
- `GET /api/v1/kol-profiles/:handle/recommendations` — new endpoint returning recent social calls for a specific KOL handle
- Backed by `KolService.getRecommendationsByHandle()` querying the KOL-tracker Neon DB

### 6. Shared types
- `User` extended with `follower_count?`, `following_count?`, `is_following?`, `kol_profile?`
- New `KolProfileSummary` interface added to `@hamilton/shared`

### 7. New UI component
- `ConfirmModal` — reusable modal dialog used for the unfollow confirmation flow

---

## _Changes 31-Mar-2026 round 3:

### 1. Leaderboard ranking — corrected logic
- **Minimum 20 calls** required to appear (`HAVING COUNT(r.id) >= 20`); KOLs below threshold excluded entirely
- **Sorted by `win_rate DESC`** (percentage of correct calls), `correct_calls` as tiebreaker — was previously sorted by total call count
- Removed JS-side qualified/unqualified split; now enforced entirely in SQL
- `qualified` field always `true` for returned entries (filter already applied)

### 2. KOL data pipeline fixes
- Leaderboard was empty — `JOIN recommendations` inner-joined out all KOLs with 0 calls; changed to `LEFT JOIN` with `HAVING` for the 20-call cutoff
- Top opportunities price-change formula was inverted (`(ps0−ps7)/ps7`) → corrected to `(ps7−ps0)/ps0`
- `KolLeaderboard` and hero TopExpertsBox show "Tracking…" instead of "0%" when no calls recorded yet
- Created `scripts/seed_kol_recommendations.py` — dev seed script injecting 278 realistic recommendations + price snapshots for 10 KOLs with realistic win-rate biases

### 3. Hero section — all 3 boxes carousel-ified
- Most Credible Experts and Top Buying Opportunities now match the Live Recommendations carousel pattern
- Each box: one card at a time, auto-cycles every 3–3.5 s, clickable dot indicators, scrolling ticker tape
- Most Credible Experts card: rank (colour-coded gold/silver/bronze), name, call count, large win rate %, avg return sentence
- Top Buying Opportunities card: ticker + BUY badge, 7d price change %, scaled buy-volume progress bar

### 4. Feed page UI overhaul
- Removed user profile card, "New Post" card, and "About Hamilton" card from right panel
- KolLeaderboard remains in right panel
- **Floating FAB**: green circular button fixed `bottom-6 right-6`, pen icon, links to `/posts/new`
- **Hero section at full width**: moved to new `AppLayout.topSlot` — renders across the full center column width above the `max-w-2xl` feed container; eliminates text wrapping in market pulse cards
- `AppLayout` extended with optional `topSlot?: React.ReactNode` prop
- Hero card header fonts reduced one step (`text-sm`→`text-xs`, `text-[10px]`→`text-[9px]`); LIVE badge also shrunk to prevent wrapping

---

## 2026-03-31 — Unified profiles & Social Hearing feed (branch: KOL_scraper_clone)

Unclaimed KOL profiles from the KOL-tracker database are now first-class public entities on Hamilton. Users can discover, follow, and see recommendations from public market experts who haven't yet joined the platform.

### Added

**Database**
- New migration `20260331130000_add_kol_follow`:
  - `kol_follows` table — `(follower_id FK users, kol_profile_id FK unclaimed_kol_profiles)` with unique constraint; allows Hamilton users to follow unclaimed KOL profiles independently of the Hamilton user follow system

**Backend**
- `POST /api/v1/kol-profiles/:handle/follow` — follow a KOL profile (JwtAuthGuard, upsert — safe to call multiple times)
- `DELETE /api/v1/kol-profiles/:handle/follow` — unfollow a KOL profile (JwtAuthGuard)
- `GET /api/v1/kol-profiles/followed-recommendations` — returns recent recommendations from KOL profiles the authenticated user follows, enriched with KOL profile metadata (declared before `:handle` route to avoid NestJS routing conflict)
- `GET /api/v1/kol-profiles` and `GET /api/v1/kol-profiles/:handle` now use `OptionalJwtGuard`; responses include `kol_followers_count` (Hamilton follows) and `is_following` (bool for authenticated caller)
- `KolService.getRecommendationsByHandles(handles[], limit)` — batch SQL query for recommendations across multiple KOL handles using `ANY($1)` param

**Shared types (`packages/shared/src/types/index.ts`)**
- `KolProfileSummary` extended with `kol_followers_count: number` and `is_following: boolean`
- New `SocialHearingItem` interface — typed KOL recommendation enriched with `kol_profile` metadata for feed rendering

**Frontend**
- `hooks/useKolProfile.ts` — fetches a single KOL profile by handle from `/kol-profiles/:handle`; `retry: false` to allow fast fallback
- `hooks/useKolFollow.ts` — follow/unfollow mutations for KOL profiles with optimistic cache updates on `is_following` and `kol_followers_count`
- `hooks/useFeed.ts` — new unified feed hook replacing direct `useInfinitePosts` in FeedPage:
  - **Latest**: merges Hamilton posts + all recent KOL calls (20 calls), sorted by timestamp
  - **Followed**: merges Hamilton posts from followed users + recommendations from followed KOL profiles
  - **Trending**: Hamilton posts only (unchanged)
- `components/feed/SocialHearingCard.tsx` — feed card for KOL recommendations; shows "Social Hearing" badge (blue), "Unclaimed" badge (amber) when applicable, ticker, BUY/SELL direction, conviction, timestamp, follow button, and link to KOL profile
- `hooks/useUser.ts` — added `retry: false` so 404s immediately trigger the KOL profile fallback without delay
- `pages/ProfilePage.tsx` — unified profile resolution:
  - If `/profile/:username` matches a Hamilton user → renders existing `HamiltonUserProfile` view (no change)
  - If Hamilton user not found → falls back to `KolProfileView` for the same handle
  - `KolProfileView`: "Unclaimed" / "Verified KOL" badge, Hamilton follower count, social follower count, KOL follow/unfollow button with confirm dialog, Recommendations tab with "Social Hearing" tag, claim CTA for unclaimed profiles
- `pages/FeedPage.tsx` — updated to use `useFeed` hook; renders `SocialHearingCard` for `item_type: 'social_hearing'` items and `PostCard` for `item_type: 'post'` items

---

## 2026-03-31 — Expert profiles, follow system, KOL data pipeline fix (branch: KOL_scraper_clone)

### Added

**Backend**
- `POST /api/v1/users/:username/follow` — follow a user (auth required, 409 if already following)
- `DELETE /api/v1/users/:username/follow` — unfollow a user (auth required)
- `GET /api/v1/users/:username` now uses OptionalJwtGuard; returns `follower_count`, `following_count`, `is_following`, and `kol_profile` in response
- `GET /api/v1/posts?author=:username` — new filter to fetch posts by a specific user
- `GET /api/v1/kol-profiles/:handle/recommendations?limit=N` — live social recommendations per KOL handle from the KOL-tracker Neon DB
- `KolService.getRecommendationsByHandle()` — per-KOL SQL query on the recommendations table
- `scripts/seed_kol_recommendations.py` — dev seed: 278 realistic recommendations + price snapshots across 10 KOLs with per-KOL win rate biases

**Shared types (`packages/shared/src/types/index.ts`)**
- `User` extended with `follower_count?`, `following_count?`, `is_following?`, `kol_profile?`
- New `KolProfileSummary` interface

**Frontend**
- `hooks/useFollow.ts` — follow/unfollow mutations with optimistic cache updates
- `hooks/usePosts.ts` — added `useInfinitePostsByAuthor(username)`
- `components/ui/ConfirmModal.tsx` — reusable confirmation dialog
- `pages/ProfilePage.tsx` — full rebuild: follower/following counts, Follow/Unfollow button with confirm dialog, Posts tab (infinite scroll), Recommendations tab (live KOL calls), Verified KOL badge, Twitter/X link, back button
- `pages/PostDetailPage.tsx` — Follow/Unfollow button beside author name

### Fixed

**KOL data pipeline**
- Leaderboard returned empty — `JOIN recommendations` excluded KOLs with 0 calls; changed to `LEFT JOIN`
- Top opportunities price formula inverted: `(ps0 - ps7) / ps7` → `(ps7 - ps0) / ps0`
- `KolLeaderboard` and hero TopExpertsBox show "Tracking…" instead of "0%" when no calls yet

### Changed

**Leaderboard ranking**
- Minimum 20 calls required (`HAVING COUNT(r.id) >= 20`) — KOLs below threshold excluded
- Sorted by `win_rate DESC` (% correct calls), `correct_calls` as tiebreaker — was sorted by total calls
- Removed client-side qualified/unqualified split; enforced in SQL

**Hero section — all 3 boxes carousel-ified**
- Each box shows one item at a time, auto-cycles (3–3.5 s), clickable dots + ticker tape
- Most Credible Experts: rank, name, win rate large, avg return sentence
- Top Buying Opportunities: ticker, BUY badge, 7d change %, scaled buy-volume bar

**Feed page UI**
- Removed user profile card, New Post card, About Hamilton card from right panel
- KolLeaderboard remains in right panel
- Hero section moved to `AppLayout` `topSlot` — full available width, no more text wrapping
- Floating FAB (green circle, pen icon, `bottom-6 right-6`) replaces in-panel New Post button
- `AppLayout` extended with optional `topSlot` prop
- Hero card header fonts reduced one step to prevent wrapping at narrower widths

---

## 2026-03-31 — Post interactions, feed filters, image upload fix (branch: KOL_scraper_clone)

### Fixed

- **Image uploads broken on all post types** — Vite dev server only proxied `/api` to the backend;
  `/uploads` static assets were resolving to the frontend origin (port 5173) and returning 404.
  Added `/uploads` proxy in `apps/web/vite.config.ts` to forward to `http://localhost:3000`.

### Added

**Database**
- New migration `20260331000744_add_post_interactions`:
  - `post_likes` — unique per `(user_id, post_id)`
  - `post_saves` — unique per `(user_id, post_id)`
  - `post_replies` — threaded replies with `body`, timestamps, and cascading deletes

**Backend (`apps/api/src/interactions/`)**
- `interactions.service.ts` — toggle like, toggle save, create/list/delete replies,
  batch-fetch interaction counts + per-user state for post lists
- `interactions.controller.ts` — routes mounted under `POST /api/v1/posts/:postId`:
  - `POST   /like` — toggle like; returns `{ liked, count }`
  - `POST   /save` — toggle save; returns `{ saved, count }`
  - `GET    /replies` — list replies (asc order)
  - `POST   /replies` — create reply (auth required)
  - `DELETE /replies/:replyId` — delete own reply (auth required)
- `posts.service.ts` — `findAll` and `findOne` now attach `likes_count`, `saves_count`,
  `replies_count`, `user_liked`, `user_saved` to every serialized post
- `posts.service.ts` — new `filter` query parameter on `GET /api/v1/posts`:
  - `latest` (default) — ordered by `created_at DESC`
  - `followed` — restricts to posts authored by users the current user follows;
    sets `meta.empty_followed = true` when the user has no follows
  - `trending` — aggregates `likes + saves + replies` per post in last 48 h,
    returns posts ranked by engagement score; falls back to latest if no data

**Shared types (`packages/shared/src/types/index.ts`)**
- Added `PostReply` interface
- Added `likes_count`, `saves_count`, `replies_count`, `user_liked`, `user_saved` to `Post`
- Added `empty_followed?: boolean` to `ApiMeta`

**Frontend**
- `hooks/usePosts.ts` — new hooks: `useLikePost`, `useSavePost`, `useReplies`,
  `useCreateReply`, `useDeleteReply`; optimistic updates via `InfiniteData` cache patching;
  `useInfinitePosts` now accepts a `FeedFilter` param
- `components/posts/PostCard.tsx`:
  - Like button (heart, fills on active), reply count button, save button (bookmark)
  - All buttons show counts in monospace; buttons disabled when unauthenticated
  - Collapsible reply section: lists replies with author chips, delete button for own replies,
    inline reply input with send button
- `pages/FeedPage.tsx`:
  - Tab bar — Latest / Followed / Trending with active accent underline
  - Followed empty state: "Follow top experts to get inspired daily" with icon + description
  - Trending empty state copy variant

---

## 2026-03-30 — Homepage redesign + Market Pulse hero section (branch: KOL_scraper_clone)

Redesigned the pre-login homepage into a market explore page and added a live
data hero section ("Market Pulse") visible on both the landing page and the
post-login feed.

### Added

**Backend (`apps/api/src/kol/`)**
- `kol.service.ts` — `getTopOpportunities()`: queries `recommendations` + `price_snapshots`
  for tickers with the most BUY calls in the last 7 days and their avg price change (T0 vs T7D)
- `kol.service.ts` — `getRecentCalls(limit)`: fetches latest BUY/LONG recommendations
  joined with KOL handle, conviction, and target price
- `kol.controller.ts` — `GET /api/v1/kol/top-opportunities` and
  `GET /api/v1/kol/recent-calls?limit=N` routes wired to the new service methods

**Frontend (`apps/web/src/`)**
- `components/kol/HeroSection.tsx` — new reusable 3-box hero component:
  - **Most Credible Experts**: top 3 KOLs by win rate (T30D) with rank medals
  - **Top Buying Opportunities**: buy-call count bar + avg 7D price change per ticker
  - **Live Recommendations**: auto-cycling carousel (3 s) of latest buy calls with
    conviction badges, target prices, time-ago, dot navigation, and scrolling ticker tape
  - CTAs adapt to context: sign-up prompts on landing, "explore" links on feed
- `tailwind.config.ts` — added `marquee` keyframe + animation for ticker tape scroll

### Changed

- `pages/LandingPage.tsx` — full redesign:
  - Sticky nav with anchor links (How it works, For experts)
  - Compact hero copy with "Live market data" live badge
  - Market Pulse HeroSection as primary above-the-fold content
  - Condensed 3-column value props (was 4-card grid)
  - Expert monetization callout section with checklist
  - Stronger single CTA footer
- `pages/FeedPage.tsx` — HeroSection embedded at the top of the main feed column
  (with `isLoggedIn=true`), CTAs point to feed exploration instead of registration

---

## 2026-03-30 — Pipeline-only cleanup (branch: KOL_scraper_clone)

Removed all code not required to run the KOL data pipeline or deliver data
to Hamilton. Existing database data and all pipeline processes are intact.

### Removed
- `api.py` — FastAPI server (standalone web UI; not needed for Hamilton data feed)
- `Procfile`, `railway.json`, `vercel.json` — deployment configs for web hosting
- `frontend/` — entire HTML/CSS/JS frontend directory (index, how-it-works, disclaimer, feedback, robots.txt, sitemap.xml)
- `db/migrate_to_postgres.py` — one-shot SQLite→Postgres migration (already complete)

### Updated
- `db/models.py` — removed frontend-only ORM tables: `KOLRequest`, `Subscriber`, `Waitlist`, `KOLFollow` and their indexes. Core pipeline tables (KOL, RawTweet, Recommendation, PriceSnapshot, KOLScore) unchanged.
- `run_all.sh` — removed `uvicorn api:app` process; script now starts only the pipeline scheduler.
- `requirements.txt` — removed `fastapi`, `uvicorn`, `aiofiles`, `resend` (no longer used).

### Verified
All pipeline modules import and are functional:
- `crawler/apify_scraper.py`, `parser/llm_parser.py`, `pricer/yfinance_fetch.py`, `scorer/score_calculator.py`
- `main.py --now` (full pipeline), `backfill.py`, `scrape_new_kols.py`, `discover_kols.py`
- `db/manage_kols.py` (KOL CRUD)

---

## 2026-03-29 — KOL Tracker integration (branch: KOL_scraper_clone)

This branch merges a fully-functional KOL (Key Opinion Leader) stock-recommendation
tracker into the advisory platform repository.

### What was added

**Core pipeline**
- `api.py` — FastAPI backend (1 450 lines): leaderboard, KOL profiles, recommendations, scores, top-assets, stats, subscribe/waitlist, admin digest
- `main.py` — daily scheduler: scrape → parse → price → score
- `backfill.py` — one-shot backfill of historical prices and scores
- `scrape_new_kols.py` — discovers and onboards new KOL candidates
- `discover_kols.py` — heuristic-based KOL discovery from Twitter lists
- `run_all.sh` — convenience wrapper to run the full pipeline

**Modules**
- `crawler/apify_scraper.py` — Apify tweet scraper
- `parser/llm_parser.py` — regex + Claude Haiku recommendation extractor
- `pricer/yfinance_fetch.py` — yfinance price snapshot fetcher (T0/T1D/T7D/T30D)
- `scorer/score_calculator.py` — win-rate and avg-return scorer
- `db/models.py` — SQLAlchemy ORM: KOL, RawTweet, Recommendation, PriceSnapshot, KOLScore, KOLRequest, Subscriber, Waitlist, KOLFollow
- `db/manage_kols.py` — CLI to add/remove/list KOLs
- `db/migrate_to_postgres.py` — SQLite → Postgres migration via COPY protocol
- `db/seed.py` — seed script for local dev

**Frontend**
- `frontend/index.html` — single-page leaderboard UI (dark theme, 2 425 lines)
- `frontend/how-it-works.html` — explainer page
- `frontend/disclaimer.html` — legal disclaimer
- `frontend/feedback.html` — user feedback form
- `frontend/robots.txt`, `frontend/sitemap.xml` — SEO

**Deployment config**
- `requirements.txt` — Python dependencies
- `Procfile` — Railway process declaration (`web: uvicorn api:app ...`)
- `railway.json` — Railway builder config
- `vercel.json` — Vercel frontend deployment config
- `DEPLOYMENT.md` — step-by-step manual Railway + Vercel signup instructions

**Data / config**
- `kols_to_add.csv` — CSV template for bulk KOL onboarding
- `kols_quality.csv` — curated high-quality KOL seed list
- `candidates.txt` — raw candidate handles from discovery runs
- `.gitignore` additions — `.venv/`, `*.db`, `.vite`, `__pycache__`, `.env`

### Database

Production database is **Neon PostgreSQL** (connection string in `.env` as
`DATABASE_URL`). Current data as of 2026-03-29:

| Table | Rows |
|---|---|
| kols | 86 |
| raw_tweets | 39 578 |
| recommendations | 2 690 |
| price_snapshots | 6 423 |
| kol_scores | 137 |
| subscribers | 2 |

The local `kol_tracker.db` SQLite file is empty — it exists only as a dev
fallback when `DATABASE_URL` is not set.

### Dependency install fix (2026-03-29)

FastAPI, uvicorn, pandas, yfinance, anthropic, and apify_client were not
present in the base Codespaces Python environment (no venv active). Installed
globally with pip to match `requirements.txt`.

```bash
pip install fastapi uvicorn aiofiles resend "sentry-sdk[fastapi]" \
            pandas yfinance schedule anthropic apify_client
```

---

## 2026-03-29 — Phase 1 debug fixes (branch: main)

### Problem 1: Frontend blank page

**Root cause A — Stale CJS files in `packages/shared/src/`**
Running `tsc` from the wrong directory compiled CommonJS `.js` files into
`packages/shared/src/` instead of `dist/`. Vite transforms `export * from
'./schemas/auth'` into `./schemas/auth.js`, which resolved to those CJS files
instead of the TypeScript source. A CJS `require()`/`exports` module inside
an ESM context crashes before React can mount — silent blank page.

Fix: deleted the 5 spurious `.js` files from `packages/shared/src/`.

**Root cause B — Vite pre-bundled `@hamilton/shared` from `node_modules`**
Vite's dependency optimizer cached `@hamilton/shared` → `dist/index.js` (CJS
build output) before the `resolve.alias` could take effect. Subsequent
requests used the cached CJS module, bypassing the alias.

Fix: added `optimizeDeps: { exclude: ['@hamilton/shared'] }` to `vite.config.ts`.

**Root cause C — `fs.allow` used a relative path**
`server.fs.allow: ['../..']` was not being resolved correctly by Vite,
leaving `packages/shared/src/` outside the serve allowlist (403).

Fix: changed to `path.resolve(__dirname, '../..')` (absolute path).

### Problem 2: API returning 404 on `GET /`

Not a bug. The API has a global prefix `/api/v1`. Direct access to `/` is
intentionally unhandled. Use `http://localhost:3000/api/v1/posts` etc.

### Problem 3: Vite/NestJS starting from wrong directory

Both `npx nest start` and `npx vite` must be run from their respective app
directories, not the monorepo root. Vite uses the config file's location to
determine the project root, and NestJS uses `nest-cli.json`.

Fix: always `cd apps/api` before starting NestJS, and `cd apps/web` before
starting Vite.

---

## Running instructions

### KOL Tracker (this branch)

**Prerequisites**
- Python 3.11+
- `.env` with `DATABASE_URL` pointing to Neon PostgreSQL, plus `APIFY_API_TOKEN` and `ANTHROPIC_API_KEY`

**Install dependencies**
```bash
pip install -r requirements.txt
```

**Start the API**
```bash
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```
API available at http://localhost:8000 — frontend served at `/`.

**Run the full pipeline manually**
```bash
python3 main.py --now
```

**Add KOLs from CSV**
```bash
python3 db/manage_kols.py --csv kols_to_add.csv
python3 db/manage_kols.py --list
```

**Common mistakes**
| Mistake | Fix |
|---|---|
| `ModuleNotFoundError: fastapi` | `pip install -r requirements.txt` |
| Empty leaderboard | Check `DATABASE_URL` in `.env` points to Neon, not localhost |
| `kol_tracker.db` empty | Normal — production uses Neon; SQLite is dev fallback only |
| KOL handles in CSV have `@` | Remove the `@` prefix from all handles |

---

### Hamilton platform (main branch)

**Prerequisites**
- Node.js 20+, npm 10+, Docker

**First-time setup**
```bash
npm install
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
cd packages/shared && npm install && cd ../..

cp .env.example .env
# Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET

docker compose up -d

cd apps/api
DATABASE_URL="postgresql://postgres:password@localhost:5432/hamilton" npx prisma migrate dev
cd ../..
```

**Start services (3 terminals)**
```bash
# Terminal 1
docker compose up -d

# Terminal 2 — API
cd apps/api
npx nest start --watch

# Terminal 3 — Frontend
cd apps/web
npx vite --host 0.0.0.0
```

**API:** http://localhost:3000/api/v1
**Frontend:** http://localhost:5173

**Common mistakes**
| Mistake | Fix |
|---|---|
| Running `npx nest start` from repo root | `cd apps/api` first |
| Running `npx vite` from repo root | `cd apps/web` first |
| Running `npx tsc` from wrong dir | Always `cd` into the package first |
| Port 5173 in use | `pkill -f vite` then restart |
| Shared package CJS files in `src/` | Delete any `.js` files in `packages/shared/src/` |
| `PrismaClientInitializationError: Can't reach database server at localhost:5433` | `apps/api/.env` had wrong port/credentials. Correct `DATABASE_URL` is `postgresql://postgres:password@localhost:5432/hamilton` (matches docker-compose.yml). Run `docker compose up -d` first, then `npx prisma migrate deploy` from `apps/api/`. |

**Vite cache reset (if blank page returns)**
```bash
rm -rf apps/web/node_modules/.vite
pkill -f vite
cd apps/web && npx vite --host 0.0.0.0
```

**Stop everything**
```bash
pkill -f "nest start"
pkill -f vite
docker compose down
```
