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
  success30d: boolean (nullable)       # outcome flag — set by credibility engine
  success90d: boolean (nullable)
  measuredAt: timestamp (nullable)
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

CredibilityScore                       # dual-track cached computation, recalculated by BullMQ job
  id, expertUserId (FK User, unique)
  displayState: 'NO_DATA' | 'PUBLIC_ONLY' | 'PLATFORM_PRIMARY' | 'PLATFORM_ONLY'
  # Platform track (from PortfolioCalls on Hamilton)
  platformCallCount, platformCallsLast90d
  platformScore30d, platformScore90d   # 0–100 integer, null if < 10 calls
  platformWinRate30d/90d, platformAvgReturn30d/90d
  platformRatingDist: JSON             # { buy_pct, hold_pct, sell_pct, total_count }
  # Public track (from KOL scraper social recommendations)
  socialCallCount, socialCallsLast90d
  socialScore30d, socialScore90d       # 0–100 integer, null if < 20 calls
  socialWinRate30d/90d, socialAvgReturn30d/90d
  socialRatingDist: JSON
  computedAt, windowNote

KolProfile                             # scraped KOL identity, linked to User on claim
  id, kol_id, twitter_handle, display_name, avatar_url, bio
  followers_count, kol_followers_count
  content_type, profile_url
  status: 'unclaimed' | 'claimed' | 'rejected'
  user_id (FK User, nullable)          # set when expert claims profile

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
advisory_platform/
├── apps/
│   ├── web/                # React frontend (Vite, port 5173 in dev)
│   └── api/                # NestJS backend (port 3000 in dev)
├── kol-tracker/            # Python KOL scraper subprocess (integrated from kol-tracker repo)
├── packages/
│   ├── shared/             # Shared TypeScript types (packages/shared/src/types/index.ts)
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
| File uploads | Local disk (`uploads/`) in dev, S3/R2 in production |
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
- [x] KOL tracker integrated as subprocess (from kol-tracker repo)

### Phase 2 — Monetization Core (Partial)
- [x] Follow system (User → User follows, KOL profile follows)
- [x] Post paywall: preview + locked body + per-post unlock pricing (schema + API enforcement)
- [x] Expert profile pages with credibility tab
- [ ] Tip mechanic: send tip on a post
- [ ] Expert subscription (Stripe Connect onboarding for experts)
- [ ] Subscriber-only post visibility enforcement (schema ready, Stripe gate pending)

### Phase 3 — Credibility Engine ✅ (mostly)
- [x] `credibility_scores` dual-track schema (platform + public statement evaluation)
- [x] `CredibilityService.computeForExpert` — scoring formula, conflict resolution, display state
- [x] BullMQ `credibility-recompute` job + nightly batch cron
- [x] `GET /api/v1/users/:username/credibility` endpoint with Redis cache
- [x] KOL parser confidence scoring (`confidence_score` field, backfill script)
- [x] Credibility tab UI: `CredibilityScoreDial`, `PerformanceCard`, `RatingDistributionChart`, `StockCoverageTable`
- [ ] **Known gap:** `PostsService.create()` does not yet create `PortfolioCall` records when `post_type === 'trade_call'` — needs new DTO fields and service wiring
- [ ] Expert leaderboard / discovery page
- [ ] Call outcome tracking: manual close + P&L computation UI

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

### Key Endpoints

```
# Auth
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me

# Users
GET    /api/v1/users/:username
PATCH  /api/v1/users/me
GET    /api/v1/users/:username/credibility    # ExpertCredibility (cached, public)
POST   /api/v1/users/:username/credibility/recompute  # dev/admin trigger

# Posts
GET    /api/v1/posts              # paginated feed
POST   /api/v1/posts              # create post
GET    /api/v1/posts/:id          # single post (enforces visibility)
PATCH  /api/v1/posts/:id          # edit own post
DELETE /api/v1/posts/:id          # delete own post
POST   /api/v1/posts/:id/like
DELETE /api/v1/posts/:id/like
POST   /api/v1/posts/:id/save
DELETE /api/v1/posts/:id/save
POST   /api/v1/posts/:id/replies
GET    /api/v1/posts/:id/replies

# Follows (User → User)
POST   /api/v1/follows/:username
DELETE /api/v1/follows/:username

# KOL Profiles
GET    /api/v1/kol-profiles                        # list (filter by ?status=)
POST   /api/v1/kol-profiles/sync                   # sync from kol-tracker DB
GET    /api/v1/kol-profiles/followed-recommendations
GET    /api/v1/kol-profiles/:handle
POST   /api/v1/kol-profiles/:handle/claim
POST   /api/v1/kol-profiles/:handle/follow
DELETE /api/v1/kol-profiles/:handle/follow
GET    /api/v1/kol-profiles/:handle/recommendations
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
- Shared NestJS guards live in `apps/api/src/common/guards/`. Do not duplicate guard classes inline in controllers.

### File Naming
- React components: `PascalCase.tsx`
- Hooks: `useXxx.ts`
- API modules: `xxx.module.ts`, `xxx.controller.ts`, `xxx.service.ts`
- DB migrations: timestamped, descriptive (`20240101_create_posts_table`)

### Git Conventions
- Branch: `feat/`, `fix/`, `chore/`, `docs/`
- Commits: conventional commits (`feat: add post unlock flow`)
- PRs require passing TypeScript + lint checks

### Prisma Migrations
`prisma migrate dev` requires an interactive terminal and will not run in this Codespace environment. Always write migrations manually as SQL files under `apps/api/prisma/migrations/<timestamp_name>/migration.sql` and apply with `prisma migrate deploy`.

---

## 9. Credibility Engine Rules

These are standing architectural constraints — do not violate them in any future session.

- **Never merge platform and public scores into one number.** Always displayed in separate UI sections with distinct labels.
- **`display_state` is computed server-side** in `CredibilityService.computeForExpert`. Frontend branches on it — never derives state from counts client-side.
- **"Public Statement Evaluation" is the exact label.** Do not substitute "social", "unverified", "external", or any other term anywhere in UI or API responses.
- **Minimum thresholds are hard rules:** platform score requires 10+ calls, public score requires 20+ calls. Below threshold the score field is `null`, not zero, and is not rendered.
- **All score computation happens in `CredibilityService.computeForExpert`.** KolService, PostsService, and the frontend never compute scores inline.
- **Redis cache key pattern:** `credibility:{expertUserId}` — TTL 1 hour, invalidated on every `computeForExpert` run.
- **Do not modify the `kol_scores` table.** That belongs to the KOL pipeline. Hamilton's engine reads from `recommendations` and `price_snapshots` directly and writes only to `credibility_scores`.
- **Conflict resolution:** social recommendations on the same ticker as a platform call within ±7 days are flagged `excluded_reason = 'superseded'` — silently excluded, never shown to users.

---

## 10. Security Checklist

- [ ] Passwords hashed with bcrypt (cost factor 12)
- [ ] JWT secrets rotated, stored in env only
- [ ] Refresh tokens stored in HttpOnly cookies
- [ ] Rate limiting on auth endpoints (Redis-backed)
- [ ] All financial amounts handled in **integer cents**, never floats
- [ ] Stripe webhooks verified via signature
- [ ] `body_locked` stripped server-side before response if user lacks access
- [ ] Input sanitization on all rich-text fields before storage
- [ ] CORS restricted to known frontend origins in production (`CORS_ORIGINS` env var)

---

## 11. Environment Variables

```env
# API
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
CORS_ORIGINS=https://yourfrontend.com   # comma-separated; defaults to localhost:5173 in dev

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=

# Storage (production — dev uses local disk uploads/)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Financial Data (Phase 4)
POLYGON_API_KEY=
```

---

## 12. Running the Dev Environment

### Canonical startup (always use this)

```bash
# From repo root — starts API (port 3000) + Vite (port 5173) via Turborepo
npm run dev
```

**Do not start servers manually in separate terminals.** Running them outside of `turbo run dev` causes port conflicts because both apps try to bind the same defaults.

### Port map

| Service | Port | Notes |
|---------|------|-------|
| NestJS API | 3000 | `process.env.PORT ?? 3000` |
| Vite dev server | 5173 | hardcoded in `apps/web/vite.config.ts` |
| Vite proxy | — | `/api` and `/uploads` forwarded to `localhost:3000` |

### KOL tracker (Python subprocess)

The KOL tracker runs as a managed subprocess of the API. It starts automatically when the API boots. To run it standalone for debugging:

```bash
cd kol-tracker
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Alembic migrations for the KOL tracker DB:
```bash
cd kol-tracker
alembic upgrade head
```

### Build

```bash
npm run build          # builds all packages via Turborepo
cd apps/api && npx tsc --noEmit    # type-check API only
cd apps/web && npx tsc --noEmit    # type-check web only
```

---

_Last updated: 2026-03-31 — Phase 3 complete; Phase 2 partially complete_
