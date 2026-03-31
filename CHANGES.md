# Change Log

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
