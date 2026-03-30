# Change Log

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
