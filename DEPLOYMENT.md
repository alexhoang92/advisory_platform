# KOL Tracker — Deployment Guide

Current live URL: **https://web-production-94c5.up.railway.app**

---

## Current Production Setup

| Component | Provider | Status |
|---|---|---|
| Backend API + scheduler | Railway | ✅ Live |
| Database | Neon PostgreSQL (serverless) | ✅ Live, persistent |
| Frontend | Served by Railway (FastAPI) | ✅ Live |
| Error monitoring | Sentry | ✅ Configured |

The `Procfile` starts both processes together:
```
web: uvicorn api:app --host 0.0.0.0 --port $PORT & python3 main.py & wait
```
- `uvicorn` serves the API and all frontend pages
- `main.py` runs the daily pipeline scheduler (07:30 ET)

---

## Part 1: Deploy Backend to Railway

### Prerequisites
- A GitHub account with this repo pushed to it
- A free Railway account (sign up at https://railway.app)

### Steps

1. **Sign up / log in at https://railway.app**

2. **Create a new project**
   - Click **"New Project"**
   - Select **"Deploy from GitHub repo"**
   - Authorize Railway to access your GitHub account if prompted
   - Select the **kol-tracker** repository

3. **Add a PostgreSQL database**
   - Inside the project, click **"+ New" → "Database" → "PostgreSQL"**
   - Railway automatically injects `DATABASE_URL` into your service — no manual config needed
   - Do **not** add a SQLite `DATABASE_URL` variable manually

4. **Configure environment variables**
   In the Railway project dashboard, go to your service → **Variables** tab and add:
   ```
   APIFY_API_TOKEN=<your Apify token>
   ANTHROPIC_API_KEY=<your Anthropic key>
   ADMIN_KEY=<a secret string for admin endpoints>
   RESEND_API_KEY=<your Resend key>        # optional — email sending
   OWNER_EMAIL=<your email>                # optional — admin notifications
   SENTRY_DSN=<your Sentry DSN>            # optional — error monitoring
   ```
   `DATABASE_URL` is set automatically by the PostgreSQL plugin — do not override it.

5. **Confirm the start command**
   Railway should auto-detect `Procfile`. The start command will be:
   ```
   uvicorn api:app --host 0.0.0.0 --port $PORT & python3 main.py & wait
   ```
   If not, set it manually under **Settings → Deploy → Start Command**.

6. **Initialize the database**
   After the first deploy succeeds, open a Railway Shell on your service and run:
   ```bash
   python3 -c "from db.models import init_db; init_db()"
   ```
   This creates all 9 tables in Postgres.

7. **Populate data**
   ```bash
   python3 main.py --now
   ```
   This runs the full pipeline — scrape, parse, price, score. Takes 5–10 minutes.

8. **Get your Railway URL**
   After deploy succeeds, Railway gives you a public URL like:
   ```
   https://kol-tracker-production-xxxx.up.railway.app
   ```

9. **Test the deployment**
   ```bash
   curl https://YOUR-RAILWAY-URL/stats
   # Should return: {"kols_tracked": 80, "recommendations": 945, ...}
   ```

---

## Part 2: Pages & Routes

All pages are served by FastAPI from the `frontend/` directory. No separate static hosting needed.

| URL | File | Description |
|---|---|---|
| `/` | `frontend/index.html` | Main leaderboard |
| `/disclaimer` | `frontend/disclaimer.html` | Investment disclaimer |
| `/how-it-works` | `frontend/how-it-works.html` | Methodology & education |
| `/kol/{handle}` | `frontend/index.html` | KOL profile (client-side routing) |
| `/docs` | FastAPI auto-generated | API Swagger UI |

### Testing each page
```
https://YOUR-RAILWAY-URL/
https://YOUR-RAILWAY-URL/disclaimer
https://YOUR-RAILWAY-URL/how-it-works
https://YOUR-RAILWAY-URL/kol/TraderStewie
https://YOUR-RAILWAY-URL/docs
```

---

## Part 3: Vercel (Optional — Frontend Only)

The frontend is already served by Railway. Vercel is only needed if you want to
host the frontend separately (e.g. on a custom domain with edge CDN).

> **Note:** If using Vercel, the `vercel.json` routes all paths to `index.html`,
> which means `/disclaimer` and `/how-it-works` will render the main app instead
> of their dedicated pages. To fix this, update `vercel.json` to route those paths
> to their respective files.

### Updated vercel.json for separate pages:
```json
{
  "version": 2,
  "builds": [
    { "src": "frontend/*.html", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/disclaimer",    "dest": "frontend/disclaimer.html" },
    { "src": "/how-it-works",  "dest": "frontend/how-it-works.html" },
    { "src": "/(.*)",          "dest": "frontend/index.html" }
  ]
}
```

### Vercel setup steps:
1. Sign up / log in at https://vercel.com (use your GitHub account)
2. Click **"Add New… → Project"** → import the **kol-tracker** repository
3. Framework Preset: **Other**, Root Directory: `/`
4. Click **"Deploy"**

---

## Environment Variable Summary

| Variable | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | ✅ Auto-set | Injected by Railway PostgreSQL plugin |
| `APIFY_API_TOKEN` | ✅ Required | https://console.apify.com → Settings → Integrations |
| `ANTHROPIC_API_KEY` | ✅ Required | https://console.anthropic.com → API Keys |
| `ADMIN_KEY` | ✅ Required | Any secret string you choose |
| `RESEND_API_KEY` | Optional | https://resend.com → API Keys |
| `OWNER_EMAIL` | Optional | Your email address |
| `SENTRY_DSN` | Optional | https://sentry.io → Project → DSN |

---

## Daily Pipeline

The pipeline runs automatically every day at **07:30 ET** via `main.py` (started alongside the API by the Procfile).

To run it manually at any time (Railway Shell or locally):
```bash
python3 main.py --now
```

Stages:
1. `crawler/apify_scraper.py` — scrapes new tweets from all KOLs
2. `parser/llm_parser.py` — extracts stock calls using Claude Haiku
3. `pricer/yfinance_fetch.py` — fetches T0/T1D/T7D/T30D price snapshots
4. `scorer/score_calculator.py` — recalculates win rates and rankings

---

## Troubleshooting

**API returns 500 errors:**
- Check Railway logs: your service → **Logs** tab
- Verify all required environment variables are set
- Run `python3 -c "from db.models import init_db; init_db()"` to ensure tables exist

**Pages return 404:**
- Confirm `api.py` has routes for `/disclaimer` and `/how-it-works`
- Check that `frontend/disclaimer.html` and `frontend/how-it-works.html` exist

**Frontend shows "Failed to load data":**
- Check that `const API` in `frontend/index.html` matches your Railway URL exactly (no trailing slash)
- Check browser console for CORS errors

**Database is empty after redeploy:**
- PostgreSQL on Neon persists independently of Railway redeploys — data is safe
- If starting fresh: run `python3 main.py --now` in Railway Shell

**Scheduler not running:**
- Confirm the Procfile contains both `uvicorn` and `python3 main.py` joined with `&`
- Check Railway logs for `✅ Pipeline scheduler started`
