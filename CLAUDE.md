# CLAUDE.md — Hamilton Platform

> This file is the authoritative reference for architecture, conventions, and design decisions.
> Every new feature, extension, or agent task must be consistent with what is documented here.
> Update this file when a decision changes — never let it drift from the codebase.

---

## 1. Platform Identity

**Name:** Hamilton
**Tagline:** _Where serious investors follow serious traders._

Hamilton is a two-sided social investment advisory marketplace:

- **Experts (Suppliers):** Professional or semi-professional traders who publish trade recommendations, deep-dive research, and market commentary. They monetize directly through paid subscriptions, per-post unlocks, and tips from their follower base.
- **Retail Users (Consumers):** Individual investors who discover experts, follow their track records, purchase access to premium content, and build a curated feed of investment ideas.
- **Platform Role:** Hamilton provides independently verified credibility scores for experts, enforces content monetization mechanics, and will progressively integrate financial data to give users in-platform analytical tools — without attempting to be a full-blown Bloomberg terminal.

### Core Value Propositions

| For Experts | For Retail Users |
|---|---|
| Direct monetization without intermediary | Verified, unbiased expert credibility scores |
| Subscriber base with recurring revenue | Paywall preview before committing to unlock |
| Structured trade call publishing | Aggregated stock sentiment across experts |
| Track record auto-computed from calls | Curated expert discovery |

---

## 2. Domain Model

### Entities

```
User
  id, email, password_hash, username, display_name, avatar_url
  role: 'expert' | 'retail' | 'admin'
  bio, location, website
  stripe_account_id (experts only)
  created_at, updated_at

ExpertProfile                          # extends User where role = 'expert'
  user_id (FK)
  specializations: string[]            # e.g. ['growth', 'options', 'macro']
  subscription_price_monthly: decimal
  credibility_score: decimal           # computed, cached
  total_followers: int                 # denormalized count
  win_rate: decimal                    # computed from PortfolioCalls
  avg_return: decimal                  # computed from closed PortfolioCalls

Post
  id, author_id (FK User), title, slug
  body_public: text                    # always visible (preview teaser)
  body_locked: text                    # gated content, null if post is fully public
  visibility: 'public' | 'preview' | 'subscribers_only'
  unlock_price: decimal                # one-time unlock; null if not individually unlockable
  tickers: string[]                    # e.g. ['AAPL', 'NVDA']
  post_type: 'discussion' | 'trade_call' | 'research' | 'update'
  published_at, created_at, updated_at

PortfolioCall                          # structured trade recommendation, linked to a Post
  id, post_id (FK), expert_id (FK)
  ticker: string
  direction: 'long' | 'short'
  entry_price: decimal (nullable)      # populated later via market data integration
  target_price: decimal
  stop_loss: decimal
  timeframe: 'intraday' | 'swing' | 'position' | 'long_term'
  conviction: 'low' | 'medium' | 'high'
  status: 'open' | 'closed' | 'stopped_out'
  outcome_return: decimal (nullable)   # computed when closed
  opened_at, closed_at

Follow
  id, follower_id (FK User), following_id (FK User)
  created_at

Subscription
  id, subscriber_id (FK User), expert_id (FK User)
  stripe_subscription_id
  status: 'active' | 'cancelled' | 'past_due'
  current_period_end: timestamp
  created_at

PostUnlock
  id, user_id (FK), post_id (FK)
  amount_paid: decimal
  stripe_payment_intent_id
  unlocked_at

Tip
  id, from_user_id (FK), post_id (FK)
  amount: decimal
  stripe_payment_intent_id
  created_at

CredibilityScore                       # cached computation, recalculated periodically
  expert_id (FK)
  score: decimal                       # 0–100
  win_rate: decimal
  avg_return_per_call: decimal
  total_calls: int
  calls_closed: int
  follower_growth_30d: int
  computed_at: timestamp

Ticker                                 # enriched tag, populated via financial data APIs (Phase 4)
  symbol: string (PK)
  name: string
  sector: string
  last_price: decimal (nullable)
  change_pct: decimal (nullable)
  synced_at: timestamp
```

---

## 3. Tech Stack

### Monorepo Structure (Turborepo)

```
hamilton/
├── apps/
│   ├── web/                # React frontend
│   └── api/                # Express/NestJS backend
├── packages/
│   ├── shared/             # Shared TypeScript types, validation schemas (Zod)
│   └── ui/                 # (future) shared component library
├── turbo.json
├── package.json
└── CLAUDE.md               ← this file
```

### Frontend (`apps/web`)

| Concern | Choice | Reason |
|---|---|---|
| Framework | React 18 + TypeScript | Ecosystem, type safety |
| Routing | React Router v6 | Industry standard, nested layouts |
| State | Zustand | Lightweight, no boilerplate |
| Server state | TanStack Query | Cache, pagination, mutations |
| Styling | Tailwind CSS + CSS Variables | Utility-first + design token flexibility |
| Forms | React Hook Form + Zod | Performance, schema validation |
| Rich text | TipTap | Extensible, works well with paywall blocks |
| Payments | Stripe.js | PCI compliance, hosted fields |
| Build | Vite | Fast dev server |

### Backend (`apps/api`)

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js 20+ | LTS, TypeScript native |
| Framework | NestJS | Modules, guards (paywall), decorators |
| ORM | Prisma | Type-safe, great migrations |
| Database | PostgreSQL 15 | Relational, JSONB for flexible metadata |
| Cache | Redis | Sessions, rate limiting, credibility score cache |
| Auth | JWT (access + refresh) | Stateless, refresh rotation |
| Payments | Stripe Connect | Expert payouts, subscriptions, one-time |
| File uploads | S3-compatible (Cloudflare R2) | Avatar, post images |
| Queue | BullMQ (Redis-backed) | Credibility score recomputation jobs |

### Infrastructure

| Concern | Dev | Production |
|---|---|---|
| Local env | Docker Compose | — |
| API hosting | — | Railway / Fly.io |
| Frontend | — | Vercel |
| DB | local Postgres | Supabase or RDS |
| Redis | local Redis | Upstash |
| CDN / Storage | — | Cloudflare R2 |

---

## 4. UI Design System

### Philosophy

Hamilton's UI is inspired by Robinhood's web interface: **dark, data-dense, modern trading platform aesthetic**. Every pixel should feel like it belongs on a professional trading desk — not a social media app that happens to talk about stocks.

### Color Palette

```css
:root {
  /* Backgrounds */
  --color-bg-base:        #0a0a0a;   /* page background */
  --color-bg-surface:     #111111;   /* cards, panels */
  --color-bg-elevated:    #1a1a1a;   /* modals, dropdowns */
  --color-bg-subtle:      #222222;   /* hover states, dividers */

  /* Brand / Accent */
  --color-accent:         #00c805;   /* Robinhood green — CTAs, positive values */
  --color-accent-muted:   #00c80520; /* green tint for backgrounds */
  --color-accent-hover:   #00e006;   /* hover on accent elements */

  /* Semantic */
  --color-positive:       #00c805;   /* gains, buy signals */
  --color-negative:       #ff5000;   /* losses, sell signals */
  --color-warning:        #f5a623;   /* caution, pending states */
  --color-info:           #4a9eff;   /* informational */

  /* Typography */
  --color-text-primary:   #ffffff;
  --color-text-secondary: #8a8a8a;
  --color-text-tertiary:  #555555;
  --color-text-inverse:   #0a0a0a;

  /* Borders */
  --color-border:         #222222;
  --color-border-subtle:  #1a1a1a;
  --color-border-accent:  #00c80540;
}
```

### Typography

```css
/* Display / Headlines — sharp, geometric */
--font-display: 'Syne', sans-serif;

/* Body / UI — clean, readable */
--font-body: 'DM Sans', sans-serif;

/* Numbers / Tickers / Code — monospace, trading terminal feel */
--font-mono: 'JetBrains Mono', monospace;
```

**Scale:** `12 / 13 / 14 / 16 / 18 / 24 / 32 / 48px`
Numbers (prices, percentages, returns) always render in `--font-mono`.
Tickers always render UPPERCASE in `--font-mono` with letter-spacing.

### Spacing

Base unit: `4px`. Use multiples: `4, 8, 12, 16, 24, 32, 48, 64px`.

### Component Principles

- **Cards:** `background: var(--color-bg-surface)`, `border: 1px solid var(--color-border)`, `border-radius: 12px`. No box shadows — rely on borders and background contrast.
- **Buttons:** Primary = accent green fill, black text. Secondary = transparent with border. Destructive = red fill. All have `border-radius: 8px`.
- **Inputs:** Dark fill (`--color-bg-elevated`), subtle border, green focus ring.
- **Locked content:** Blurred body (`filter: blur(4px)`), overlay with lock icon + price + unlock CTA.
- **Credibility Badge:** Circular score dial (0–100), color-coded green/amber/red.
- **Ticker Chips:** Pill-shaped, monospace, uppercase, with live price change coloring.
- **Paywall Preview Gradient:** Fade-to-surface gradient at the bottom of `body_public` to signal more content below.

### Layout

- **Authenticated app:** 3-column — fixed left sidebar (240px nav) + fluid center feed + right panel (320px contextual info).
- **Auth pages:** Full-bleed centered, minimal chrome.
- **Mobile:** Sidebar collapses to bottom nav; right panel hidden; single-column feed.

### Iconography

Use **Lucide React** — clean, consistent stroke weight. Never use filled icons except for active nav states.

---

## 5. MVP Roadmap

### Phase 1 — Foundation ✅
- [x] Monorepo setup (Turborepo, TypeScript, Vite, NestJS)
- [x] Design system (CSS variables, Tailwind config, base components)
- [x] Auth: register (with role selection), login, refresh tokens
- [x] User profiles: view and edit
- [x] Basic post creation (public visibility only)
- [x] Home feed (all public posts, paginated)
- [x] API scaffold with Prisma schema and first migrations
- [x] clone gihub repo https://github.com/alexhoang92/kol-tracker to this repo, integrated code to make KOL-tracker a subcall process in this repos. Remove unncessary front end setup

### Phase 2 — Monetization Core
- [ ] Expert profiles with ExpertProfile extension
- [ ] Post paywall: preview + locked body + per-post unlock pricing
- [ ] Tip mechanic: send tip on a post
- [ ] Follow system
- [ ] Expert subscription (Stripe Connect onboarding for experts)
- [ ] Subscriber-only post visibility enforcement

### Phase 3 — Credibility Engine
- [ ] PortfolioCall creation (structured trade recommendation)
- [ ] Call outcome tracking (manual close, P&L computation)
- [ ] CredibilityScore computation job (BullMQ)
- [ ] Expert leaderboard / discovery page
- [ ] Per-expert track record page

### Phase 4 — Financial Data Integration
- [ ] Ticker entity with API sync (Polygon.io or Alpha Vantage)
- [ ] Live price / change % on ticker chips
- [ ] In-platform basic stock overview (price chart, key metrics)
- [ ] Entry price auto-population on PortfolioCalls via market snapshot

---

## 6. API Conventions

### Base URL
```
/api/v1/
```

### Response Envelope
```json
{
  "data": { ... },
  "meta": { "page": 1, "total": 100 },
  "error": null
}
```

### Error Shape
```json
{
  "data": null,
  "error": {
    "code": "POST_LOCKED",
    "message": "This post requires a subscription or unlock payment.",
    "statusCode": 403
  }
}
```

### Pagination
Cursor-based for feeds, offset-based for admin/analytics.
```
GET /api/v1/posts?cursor=<post_id>&limit=20
```

### Auth Headers
```
Authorization: Bearer <access_token>
```
Access tokens expire in 15 minutes. Refresh via `POST /api/v1/auth/refresh`.

### Key Endpoints (Phase 1)

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me

GET    /api/v1/users/:username
PATCH  /api/v1/users/me

GET    /api/v1/posts              # paginated feed
POST   /api/v1/posts              # create post
GET    /api/v1/posts/:id          # single post (enforces visibility)
PATCH  /api/v1/posts/:id          # edit own post
DELETE /api/v1/posts/:id          # delete own post
```

---

## 7. Content Visibility Rules

These are enforced server-side in the Post resolver — never trust the client.

| Post visibility | Anonymous | Retail (free) | Follower | Subscriber | Author |
|---|---|---|---|---|---|
| `public` | ✅ full | ✅ full | ✅ full | ✅ full | ✅ full |
| `preview` | preview only | preview only | preview only | ✅ full | ✅ full |
| `preview` + unlock paid | — | ✅ full (if paid) | ✅ full (if paid) | ✅ full | ✅ full |
| `subscribers_only` | ❌ | ❌ | ❌ | ✅ full | ✅ full |

`body_locked` is **never sent in API response** unless the user has access. The client receives `locked: true` and `unlock_price` instead.

---

## 8. Code Style & Conventions

### General
- TypeScript strict mode everywhere. No `any`.
- Zod schemas in `packages/shared` are the single source of truth for request/response shapes.
- No logic in React components beyond UI concerns — data fetching via TanStack Query hooks, business logic in service layers (API) or custom hooks (web).

### File Naming
- React components: `PascalCase.tsx`
- Hooks: `useXxx.ts`
- API modules: `xxx.module.ts`, `xxx.controller.ts`, `xxx.service.ts`
- DB migrations: timestamped, descriptive (`20240101_create_posts_table`)

### Git Conventions
- Branch: `feat/`, `fix/`, `chore/`, `docs/`
- Commits: conventional commits (`feat: add post unlock flow`)
- PRs require passing TypeScript + lint checks

### Extension Boundaries (if using Flarum skeleton)
All custom logic lives under `extensions/hamilton/` registered as Composer path repositories. Every extension adding a page includes a left-panel nav entry.

---

## 9. Security Checklist

- [ ] Passwords hashed with bcrypt (cost factor 12)
- [ ] JWT secrets rotated, stored in env only
- [ ] Refresh tokens stored in HttpOnly cookies
- [ ] Rate limiting on auth endpoints (Redis-backed)
- [ ] All financial amounts handled in **integer cents**, never floats
- [ ] Stripe webhooks verified via signature
- [ ] `body_locked` stripped server-side before response if user lacks access
- [ ] Input sanitization on all rich-text fields before storage
- [ ] CORS restricted to known frontend origins in production

---

## 10. Environment Variables

```env
# API
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=

# Storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Financial Data (Phase 4)
POLYGON_API_KEY=
```

---

_Last updated: 2026-03-31 — Phase 1 complete + UX & data fixes_
## _Next task 30-Mar-2026: 
Objective: Design new homepage (pre login) to become a market explore page purposes give users a good sense of value proposition and encourage registration / login.  Following front end design principle of modern trading platform and optimize for mobile browsing screen as well

Task:

1/ Redesign front end of homepage with following section and guideline. If any section we have not build detail function. Leave it as placeholder at the moment.

- Top navigation bar with  basic menu and login - register option
- Hero section with 3 boxes showcase top key  users can enjoy to join the platform. Currently offer 3
    - Most credible experts:
        - Position: outer left
        - Info: top 3 experts with highest percentage of correct trading recommendation last 30 days. using data parsed from KOL-tracker database
    - Top buying opportunities:
        - List of assets with highest numbers of buy recommedation last 7D and percentage of price change since L7D
    - Number of new recommendation made
        - carrousel types of new recommendation made to trigger users to login and explore more eg: Expert A just recommend buy assets X (based on database of current calls)
- Rearrange remaining info of homepage prelogin with current data but shorter and more call to action to login

2/ Bring hero section to feedpage (post login) with option for users to click and explore detail longer list one login

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

---
# New task 31-Mar-2026 round 2

Objective

# An “Expert profile” pages that user for both normal users and experts 

# A follow system that allow users to follow each others, follow experts view post of the account that they followed in feed followed filter section

Detail tasks

# “Expert Profile” Page

## 🎯 Goal

Display detailed information about a financial expert and their activity.

- --

## 📦 Available Data

- `name`
- `description` (trading style)
- `recent_recommendations` from social tracking
- `recent_posts` in Hammilton platform
- Profile type (claimed, un_claimed)

## ❌ Exclude (Do NOT include yet)

- Success rate
- Average return
- Rating distribution
- Rankings
- Sector / GEO breakdown
- Any percentage-based metrics
- --

## 🧱 UI Structure

### Header

- Back button
- Expert name
- --

### Profile Section

- Avatar (placeholder)
- Name (prominent)
- Description (trading style summary)
- --

### Section: “Recent Recommendations”

List of recent asset calls.

Each item includes:

- Asset name / ticker
- Recommendation type (Buy / Sell / Hold if available)
- Optional timestamp (if available)
- source tag (social or “exclusive on Hamilton”)

### Optional Section: “About Strategy”

- Expanded paragraph using description
- --

## 📱 Mobile Optimization

- Single column layout
- Large tap areas
- Smooth vertical scrolling
- --

# Follow system

- follow button on each profile pages and post detail pages show when user click to expert profiles or post detail
- Followed posts integrated into feed with current built filters
- Unfollow click and confirm unfollow box (only for unfollow use case)

# Expected Output

- Clean, production-ready UI
- Scalable architecture for future data expansion

---

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