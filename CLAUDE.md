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



---

# Phase 3 — Credibility Engine: Architecture & Agent Task Specs

> Added: 2026-03-31
> Status: Planned — do not begin any session until the previous session is marked complete.
> Each session is a self-contained Claude Code task. Read the full spec for a session before writing any code.

---

## Architecture Overview

### Two Data Sources, Two Tracks

Hamilton's credibility engine draws from two independent recommendation sources and must never blend their scores into a single number.

**Platform Track** — Recommendations the expert deliberately publishes as a `PortfolioCall` on Hamilton. High-confidence signal. Expert owns and stands behind these calls.

**Public Statement Evaluation** — Recommendations parsed from the expert's public social posts (Twitter/X) by the KOL scraper pipeline. Useful signal, but subject to LLM misparse and informal phrasing. Scored separately. Never described to users as "unverified" — use the label "Public Statement Evaluation" consistently across UI and API.

### Four Display States

At render time, each expert profile is in exactly one of four states. The state is computed by `CredibilityService` and stored in `credibility_scores.display_state`. Frontend must branch on this field — never derive state client-side.
```
State: NO_DATA
  Condition: platform_call_count < 10 AND social_call_count < 20
  UI: Show "Building track record..." message. No score dials. No coverage table.

State: PUBLIC_ONLY
  Condition: platform_call_count < 10 AND social_call_count >= 20
  UI: Show Public Statement Evaluation score as the primary prominent score.
      Show note: "Based on {N} public statements tracked. Platform Credibility
      score unlocks after 10 published calls on Hamilton."
      Show public stock coverage table.
      No platform score section rendered at all.

State: PLATFORM_PRIMARY
  Condition: platform_call_count >= 10
  UI: Show Platform Credibility score as the primary prominent score.
      Show Public Statement Evaluation as a secondary collapsible section below,
      only if social_call_count >= 20. If social data exists but < 20 calls,
      omit the public section entirely.
      Show platform stock coverage table by default.
      Source toggle (Platform / Public Statements) on coverage table if public
      section is also shown.

State: PLATFORM_ONLY
  Condition: platform_call_count >= 10 AND no linked KOL handle
  UI: Same as PLATFORM_PRIMARY but public section is never rendered.
      No source toggle on coverage table.
```

### Conflict Resolution

When an expert has both a `PortfolioCall` and a social recommendation on the same ticker within a ±7-day window, the platform call takes precedence:

1. The social recommendation is flagged `excluded_reason = 'superseded'`.
2. It is excluded from Public Statement Evaluation scoring.
3. It does not appear in the public coverage table.
4. No user-facing explanation is shown — the exclusion is silent.

If the directions conflict (e.g. platform says LONG, social scrape says SELL on the same asset in the same week), the same rule applies: platform call wins, social call flagged superseded.

Social calls outside the ±7-day conflict window are scored independently in the public track regardless of any platform calls on the same ticker at other times.

### Scoring Formula

Applied identically to both platform and public tracks. Each track is scored independently.

**Per-call success threshold:**
- LONG call success: `price_at_window > entry_price * 1.02`
- SHORT call success: `price_at_window < entry_price * 0.98`
- Calls under 30 days old: excluded from 30d window score, excluded from 90d window score
- Calls between 30–89 days old: included in 30d score only
- Calls 90+ days old: included in both 30d and 90d scores

**Composite score (0–100 integer):**
```
win_rate_score  = win_rate_pct * 0.40
return_score    = min(avg_return_pct / 50.0, 1.0) * 30    # caps contribution at 50% avg return
volume_score    = min(log10(max(call_count, 1)) / log10(100), 1.0) * 15  # log scale, 10–100 calls
recency_score   = (calls_in_last_90d / total_calls) * 15
composite       = round(win_rate_score + return_score + volume_score + recency_score)
```

**Minimum thresholds before scoring:**
- Platform track: requires `platform_call_count >= 10`
- Public track: requires `social_call_count >= 20`
- Below threshold: score fields are `null`, not zero

**Rating distribution (buy/hold/sell %):**
- Computed from all non-excluded calls regardless of outcome
- Stored as JSON: `{ buy_pct, hold_pct, sell_pct, total_count }`
- Computed separately for platform and public tracks

### BullMQ Job

Job name: `credibility-recompute`
Queue name: `credibility`

Triggers:
- A `PortfolioCall` is created or its status changes to `closed` or `stopped_out`
- Nightly batch at 02:00 local time for all experts with a linked KOL handle (social scores update as new price snapshots arrive)
- On-demand via `CredibilityService.triggerRecompute(expertUserId)`

Job payload: `{ expertUserId: string }`

Job sequence:
1. Fetch all `PortfolioCalls` for expert → compute platform track (30d and 90d)
2. If expert has linked KOL handle → fetch social recommendations via `KolService` → apply conflict resolution → compute public track (30d and 90d)
3. Determine `display_state` from counts
4. Write result to `credibility_scores` (upsert on `expert_user_id`)
5. Delete Redis cache key `credibility:{expertUserId}`

---

## Session A — Schema Migrations

**Scope:** Database schema only. No service logic. No UI. Migrations must be non-destructive and backwards-compatible.

### A1 — Prisma migration: `credibility_scores` table

Create new table via `npx prisma migrate dev --name add_credibility_scores`.
```prisma
model CredibilityScore {
  id                    String   @id @default(cuid())
  expertUserId          String   @unique
  expert                User     @relation(fields: [expertUserId], references: [id], onDelete: Cascade)

  displayState          String   // 'NO_DATA' | 'PUBLIC_ONLY' | 'PLATFORM_PRIMARY' | 'PLATFORM_ONLY'

  // Platform track — 30-day window
  platformWinRate30d    Float?
  platformAvgReturn30d  Float?
  platformCallCount     Int      @default(0)
  platformScore30d      Int?     // 0–100, null if below threshold
  platformCallsLast90d  Int      @default(0)

  // Platform track — 90-day window
  platformWinRate90d    Float?
  platformAvgReturn90d  Float?
  platformScore90d      Int?     // 0–100, null if below threshold

  // Platform rating distribution
  platformRatingDist    Json?    // { buy_pct, hold_pct, sell_pct, total_count }

  // Public track — 30-day window
  socialWinRate30d      Float?
  socialAvgReturn30d    Float?
  socialCallCount       Int      @default(0)
  socialScore30d        Int?     // 0–100, null if below threshold
  socialCallsLast90d    Int      @default(0)

  // Public track — 90-day window
  socialWinRate90d      Float?
  socialAvgReturn90d    Float?
  socialScore90d        Int?     // 0–100, null if below threshold

  // Public rating distribution
  socialRatingDist      Json?    // { buy_pct, hold_pct, sell_pct, total_count }

  computedAt            DateTime @default(now())
  windowNote            String?  // e.g. "Insufficient data for 90-day window"

  @@map("credibility_scores")
}
```

Add the reverse relation on `User`:
```prisma
credibilityScore  CredibilityScore?
```

### A2 — Prisma migration: extend `PortfolioCall`

Add to existing `PortfolioCall` model via a second migration `add_portfolio_call_outcome_fields`:
```prisma
success30d    Boolean?   // null = not yet measurable
success90d    Boolean?
measuredAt    DateTime?  // when outcome was last computed
```

Do not modify any existing fields on `PortfolioCall`.

### A3 — Python SQLAlchemy: extend `recommendations` table

In `db/models.py`, add three nullable columns to the `Recommendation` model:
```python
confidence_score = Column(Float, nullable=True)
# LLM parse confidence 0.0–1.0. Populated by llm_parser.py.
# Recommendations with confidence_score < 0.7 are excluded from scoring.

superseded_by_platform_call_id = Column(String, nullable=True)
# Hamilton PortfolioCall.id that overrides this social recommendation.
# Set during conflict resolution in CredibilityService.

excluded_reason = Column(String, nullable=True)
# null | 'low_confidence' | 'superseded' | 'duplicate'
# Excluded recommendations are stored but never scored.
```

Create the Alembic migration. Do not use `--autogenerate` — write the migration explicitly:
```python
def upgrade():
    op.add_column('recommendations', sa.Column('confidence_score', sa.Float(), nullable=True))
    op.add_column('recommendations', sa.Column('superseded_by_platform_call_id', sa.String(), nullable=True))
    op.add_column('recommendations', sa.Column('excluded_reason', sa.String(), nullable=True))

def downgrade():
    op.drop_column('recommendations', 'excluded_reason')
    op.drop_column('recommendations', 'superseded_by_platform_call_id')
    op.drop_column('recommendations', 'confidence_score')
```

### A4 — Shared types

In `packages/shared/src/types/index.ts`, add:
```typescript
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
  rating_distribution: RatingDistribution | null;
}

export interface ExpertCredibility {
  display_state: CredibilityDisplayState;
  platform: CredibilityTrack | null;
  public_statements: CredibilityTrack | null;
  computed_at: string;
  public_note: string | null;
  // public_note is set when display_state = 'PUBLIC_ONLY':
  // "Based on {N} public statements tracked. Platform Credibility score
  //  unlocks after 10 published calls on Hamilton."
}
```

Extend the existing `User` type:
```typescript
credibility?: ExpertCredibility;
```

### A — Verification checklist before marking complete
- [ ] `npx prisma migrate dev` runs without error
- [ ] `npx prisma generate` produces updated client
- [ ] `CredibilityScore` model is queryable via Prisma client in a test script
- [ ] Alembic migration applies cleanly against Neon DB
- [ ] `packages/shared` compiles with `npx tsc --noEmit`

---

## Session B — Credibility Scoring Engine (NestJS)

**Prerequisite:** Session A complete and verified.
**Scope:** NestJS service, BullMQ job, and updated API endpoint. No frontend changes.

### B1 — Module scaffold

Create `apps/api/src/credibility/` with:
- `credibility.module.ts`
- `credibility.service.ts`
- `credibility.controller.ts` (one endpoint only — see B4)

Register `CredibilityModule` in `AppModule`. Import `KolModule` so `KolService` is available.

### B2 — `CredibilityService.computeForExpert(expertUserId: string)`

This is the core method. Structure:
```
1. Fetch expert user record. Confirm role = 'expert'. If not, throw BadRequestException.

2. Fetch platform track data:
   - Query all PortfolioCalls for this expertUserId
   - For 30d: filter calls where opened_at <= now() - 30 days
     Mark success30d = (direction=long AND outcome_return > 2%) OR (direction=short AND outcome_return < -2%)
     Compute: platform_call_count, win_rate_30d, avg_return_30d, calls_last_90d
     Apply scoring formula → platform_score_30d
   - For 90d: same logic using 90-day window
   - Compute rating distribution from all platform calls regardless of age
   - Write success30d / success90d / measuredAt back to each PortfolioCall record

3. Fetch public track data (only if expert has kol_profile with a handle):
   - Call KolService.getRecommendationsByHandle(handle) — returns raw rows from Neon DB
   - Filter out rows where excluded_reason IS NOT NULL
   - Filter out rows where confidence_score IS NOT NULL AND confidence_score < 0.7
   - Apply conflict resolution:
       For each remaining social recommendation:
         Query PortfolioCalls for same ticker, opened_at within ±7 days
         If match found: set superseded_by_platform_call_id, excluded_reason = 'superseded', skip
   - On remaining non-excluded rows: compute social track using same formula as platform
   - Compute social rating distribution

4. Determine display_state using the four-state rules from Architecture Overview above.

5. Build public_note string if display_state = 'PUBLIC_ONLY'.

6. Upsert credibility_scores record for this expert.

7. Delete Redis key `credibility:{expertUserId}`.

8. Return the upserted record.
```

All financial arithmetic uses integers where possible. `outcome_return` is stored as a percentage float (e.g. `4.5` = 4.5%). Do not convert to cents.

### B3 — `CredibilityService.getForExpert(expertUserId: string): Promise<ExpertCredibility>`
```
1. Check Redis for key `credibility:{expertUserId}`. If hit, parse and return.
2. If miss: read from credibility_scores table. If no row exists, return display_state = 'NO_DATA' with all nulls.
3. Map DB row → ExpertCredibility shape (shared type).
4. Write to Redis with TTL 3600 (1 hour).
5. Return.
```

### B4 — Controller endpoint
```
GET /api/v1/users/:username/credibility
```

- Public endpoint (no auth required)
- Resolves username → userId → calls `getForExpert`
- Returns `{ data: ExpertCredibility }`
- If user is not role `expert`, return `{ data: null }`

### B5 — BullMQ job

Install `@nestjs/bull` and `bull` if not already present. Create queue `credibility`.
```typescript
// credibility.processor.ts
@Process('credibility-recompute')
async handleRecompute(job: Job<{ expertUserId: string }>) {
  await this.credibilityService.computeForExpert(job.data.expertUserId);
}
```

Trigger points — add to existing services, do not restructure them:
- In `PostsService`: after a `PortfolioCall` is created, enqueue job
- In `PostsService`: after a `PortfolioCall` status is updated to `closed` or `stopped_out`, enqueue job
- In `CredibilityService`: expose `triggerRecompute(expertUserId)` as a public method for the nightly scheduler

Nightly batch: add a `@Cron('0 2 * * *')` method in `CredibilityService` that queries all users with `role = 'expert'` and a linked `kol_profile`, then enqueues a job for each. Use `CronExpression.EVERY_DAY_AT_2AM` from `@nestjs/schedule`.

### B6 — Update `GET /api/v1/users/:username`

In `UsersService.findByUsername()`, after fetching the user record, call `CredibilityService.getForExpert(userId)` and attach the result as `credibility` on the response. This must use the cached `getForExpert` path — never run `computeForExpert` inline on a profile request.

### B — Verification checklist before marking complete
- [ ] `POST /api/v1/credibility/recompute/:username` (temp dev endpoint) triggers compute and returns updated `ExpertCredibility`
- [ ] `GET /api/v1/users/:username` includes `credibility` field in response
- [ ] `GET /api/v1/users/:username/credibility` returns correct `display_state` for an expert with 0 calls (`NO_DATA`), for a seeded KOL with 20+ social calls (`PUBLIC_ONLY`), and for any expert with 10+ platform calls (`PLATFORM_PRIMARY` or `PLATFORM_ONLY`)
- [ ] Redis cache hit confirmed on second request
- [ ] BullMQ job visible in Bull dashboard or logs on PortfolioCall creation

---

## Session C — KOL Parser: Confidence Scoring

**Prerequisite:** Session A complete. Session B does not need to be complete.
**Scope:** Python KOL scraper only. No NestJS or frontend changes.

### C1 — Add confidence scoring to `llm_parser.py`

The LLM prompt currently extracts recommendation fields. Extend the prompt to also return a `confidence` field (0.0–1.0) representing how certain the model is that the tweet contains a genuine, actionable stock recommendation.

Update the prompt instruction to include:
```
Also return a field "confidence" between 0.0 and 1.0 representing your certainty
that this text contains a genuine, forward-looking, actionable stock recommendation
(not a vague mention, historical reference, question, or off-topic statement).
Use these guidelines:
  1.0 — Explicit "BUY X target $Y" or "SHORT X, stop at $Z" style call
  0.8 — Clear directional bias with ticker ("$AAPL looks strong here, adding")
  0.6 — Directional but ambiguous ("watching NVDA for a breakout")
  0.4 — Ticker mentioned but no clear direction
  0.2 — Ticker mentioned only in passing or historical context
  0.0 — No actionable content
```

After parsing, write `confidence` to `recommendations.confidence_score`. If the LLM response does not include `confidence`, default to `0.5`.

### C2 — Backfill existing recommendations

Write a one-shot script `scripts/backfill_confidence.py`:
- Queries all recommendations where `confidence_score IS NULL`
- For each, re-runs only the confidence scoring step by sending the original tweet text with a simplified prompt asking only for the confidence value
- Updates `confidence_score` in the DB
- Logs progress every 100 rows
- Safe to re-run (skips rows where `confidence_score IS NOT NULL`)

### C — Verification checklist before marking complete
- [ ] New recommendations written by `llm_parser.py` have `confidence_score` populated
- [ ] `backfill_confidence.py` runs to completion without error
- [ ] Spot-check: explicit BUY calls have score >= 0.8, vague mentions have score <= 0.5
- [ ] No existing `excluded_reason` values overwritten by the backfill

---

## Session D — Profile Page UI

**Prerequisite:** Sessions A and B complete and verified.
**Scope:** Frontend only (`apps/web/src/`). No backend changes.

### D1 — New hook: `useCredibility(username)`

In `hooks/useCredibility.ts`:
- Fetches `GET /api/v1/users/:username/credibility`
- Returns `{ credibility: ExpertCredibility | null, isLoading, error }`
- Cache key: `['credibility', username]`
- Stale time: 5 minutes

### D2 — New component: `CredibilityScoreDial`

File: `components/credibility/CredibilityScoreDial.tsx`

SVG arc dial, consistent with Hamilton design system:
- Circular arc showing score 0–100
- Arc color: green (`--color-positive`) for score >= 60, amber (`--color-warning`) for 30–59, red (`--color-negative`) for < 30
- Score number centered in large `--font-mono` type
- Label below: "Platform Credibility" or "Public Statement Evaluation" depending on prop
- Accepts: `score: number | null`, `label: string`, `size?: 'sm' | 'md'`
- If `score` is null: render greyed-out arc at 0 with "—" in center

### D3 — New component: `PerformanceCard`

File: `components/credibility/PerformanceCard.tsx`

Displays one track (platform or public) with 30d/90d tab switcher:
```
[30 Days]  [90 Days]         ← tab switcher, accent underline on active

┌────────────────┬───────────────────┐
│  Win Rate      │   Avg Return      │
│  [dial]        │                   │
│  69%           │   +46.2%          │
│  X/Y calls     │   per call        │
└────────────────┴───────────────────┘

Measured over {window}-day windows from call date.
[ⓘ] How is this calculated?
```

The ⓘ tooltip explains: "A call is successful if the asset moves more than 2% in the predicted direction within the measurement window. Score combines win rate, average return, call volume, and recency."

The 90-day tab shows "Insufficient data" text (not an error) when `score_90d` is null but `score_30d` is not — this is expected for newer calls.

Accepts: `track: CredibilityTrack`, `label: string`

### D4 — New component: `RatingDistributionChart`

File: `components/credibility/RatingDistributionChart.tsx`

SVG donut chart:
- Buy segment: `--color-positive` (green)
- Hold segment: `--color-text-tertiary` (grey)
- Sell segment: `--color-negative` (red)
- Legend to the right: "Buy X%" / "Hold X%" / "Sell X%" with colored dots
- Total call count below chart: "{N} Ratings"
- If `rating_distribution` is null: render placeholder donut in grey with "—" labels

### D5 — New component: `StockCoverageTable`

File: `components/credibility/StockCoverageTable.tsx`

Columns: Ticker | Direction | Target Price | Return | Date

- Ticker: uppercase monospace pill
- Direction: BUY in green, SELL in red, HOLD in grey
- Target Price: monospace, prefixed with $, "—" if null
- Return: green if positive, red if negative, "Pending" if outcome not yet measured
- Date: formatted as MMM DD 'YY

If `display_state` is `PLATFORM_PRIMARY` and public data also exists, show source toggle above the table:
```
Source: [Platform Calls]  [Public Statements]
```
Active tab has accent underline. Toggle switches dataset shown in table.

If no calls in selected source: "No calls recorded yet."

### D6 — Integrate into `ProfilePage`

Add **Credibility** as the first tab in `ProfilePage`. Tab order: **Credibility** | Posts | Recommendations

Render one of four layouts based on `credibility.display_state`:

**NO_DATA:**
```
"Building track record..."
"Follow this expert to be notified when their credibility score is ready."
```

**PUBLIC_ONLY:**
```
[public_note banner]
<PerformanceCard track={public_statements} label="Public Statement Evaluation" />
<RatingDistributionChart data={public_statements.rating_distribution} />
<StockCoverageTable source="public" />
```

**PLATFORM_PRIMARY:**
```
<PerformanceCard track={platform} label="Platform Credibility" />
<RatingDistributionChart data={platform.rating_distribution} />

// Only if social_call_count >= 20:
<CollapsibleSection title="Public Statement Evaluation">
  <PerformanceCard track={public_statements} label="Public Statement Evaluation" />
  <RatingDistributionChart data={public_statements.rating_distribution} />
</CollapsibleSection>

<StockCoverageTable
  platformCalls={...}
  publicCalls={public data exists ? ... : undefined}
/>
```

**PLATFORM_ONLY:**
```
<PerformanceCard track={platform} label="Platform Credibility" />
<RatingDistributionChart data={platform.rating_distribution} />
<StockCoverageTable source="platform" />
```

### D7 — Explicitly out of scope for this session — do not build

- Ranking position
- Sector breakdown
- GEO coverage breakdown
- Best Rating highlight card
- Any benchmark comparison

Leave no placeholder UI for these items.

### D — Verification checklist before marking complete
- [ ] Credibility tab is first tab on ProfilePage
- [ ] All four display states render without console errors
- [ ] `CredibilityScoreDial` arc is visible and color-coded correctly
- [ ] 30d/90d tab switcher updates dial and stats without page reload
- [ ] Source toggle switches between platform and public data in coverage table
- [ ] "Pending" return shown for calls with no measured outcome
- [ ] Mobile layout: single column, no horizontal overflow
- [ ] `npx tsc --noEmit` passes with zero errors

---

## Cross-Session Rules for All Agents

- **Never merge platform and public scores into one number.** Always displayed in separate UI sections with distinct labels.
- **`display_state` is computed server-side.** Frontend branches on it — never derives it from counts.
- **"Public Statement Evaluation" is the exact label to use.** Do not substitute "social", "unverified", "external", or any other term.
- **Minimum thresholds are hard rules:** platform score requires 10+ calls, public score requires 20+ calls. Below threshold the score field is `null`, not zero, and is not displayed.
- **All score computation happens in `CredibilityService.computeForExpert`.** KolService, PostsService, and the frontend never compute scores inline.
- **Redis cache key pattern:** `credibility:{expertUserId}` — invalidated on every `computeForExpert` run.
- **Do not modify `kol_scores` table.** That table belongs to the KOL pipeline's own scoring system. Hamilton's credibility engine reads from `recommendations` and `price_snapshots` directly and writes only to `credibility_scores`.