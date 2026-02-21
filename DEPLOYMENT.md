# KOL Tracker — Deployment Guide

This document walks you through deploying the KOL Tracker backend to Railway
and the frontend to Vercel. Both use free tiers.

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

3. **Configure environment variables**
   In the Railway project dashboard, go to your service → **Variables** tab and add:
   ```
   APIFY_API_TOKEN=<your Apify token>
   ANTHROPIC_API_KEY=<your Anthropic key>
   DATABASE_URL=sqlite:///kol_tracker.db
   ```

4. **Confirm the start command**
   Railway should auto-detect `Procfile`. The start command will be:
   ```
   uvicorn api:app --host 0.0.0.0 --port $PORT
   ```
   If not, set it manually under **Settings → Deploy → Start Command**.

5. **Get your Railway URL**
   After the deploy succeeds, Railway gives you a public URL like:
   ```
   https://kol-tracker-production-xxxx.up.railway.app
   ```
   Copy this URL — you'll need it in Part 2.

6. **Test the API**
   Open `https://YOUR-RAILWAY-URL/docs` in your browser.
   You should see the FastAPI Swagger UI with all endpoints listed.

---

## Part 2: Update the Frontend with the Railway URL

Before deploying to Vercel, update the API constant in the frontend:

1. Open `frontend/index.html`
2. Find this line near the bottom of the file:
   ```js
   const API = "https://YOUR-APP-NAME.up.railway.app";
   ```
3. Replace it with your actual Railway URL:
   ```js
   const API = "https://kol-tracker-production-xxxx.up.railway.app";
   ```
4. Save the file and commit + push the change to GitHub:
   ```bash
   git add frontend/index.html
   git commit -m "Update frontend to use live Railway API URL"
   git push
   ```

---

## Part 3: Deploy Frontend to Vercel

### Steps

1. **Sign up / log in at https://vercel.com** (use your GitHub account)

2. **Create a new project**
   - Click **"Add New… → Project"**
   - Import the **kol-tracker** GitHub repository

3. **Configure the project**
   - Framework Preset: **Other**
   - Root Directory: leave as `/` (the project root)
   - Build & Output Settings: Vercel will read `vercel.json` automatically

4. **Deploy**
   - Click **"Deploy"**
   - Vercel will build and publish the frontend
   - You'll get a URL like: `https://kol-tracker-xxxx.vercel.app`

5. **Test**
   - Open the Vercel URL in your browser
   - You should see the KOL Tracker leaderboard loading data from Railway

---

## Part 4: Enable Persistent Database on Railway (Optional but Recommended)

SQLite on Railway resets on every redeploy because the filesystem is ephemeral.
To keep data between deploys, add a Railway Volume:

1. In your Railway project, click **"+ New"** → **"Volume"**
2. Attach it to your service, mount path: `/app/data`
3. Update `DATABASE_URL` environment variable to:
   ```
   sqlite:////app/data/kol_tracker.db
   ```

This ensures your database survives redeploys.

---

## Environment Variable Summary

| Variable | Where to get it |
|---|---|
| `APIFY_API_TOKEN` | https://console.apify.com → Settings → Integrations |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |
| `DATABASE_URL` | `sqlite:///kol_tracker.db` (local) or `/app/data/kol_tracker.db` (Railway volume) |

---

## Troubleshooting

**API returns 500 errors:**
- Check Railway logs under your service → **Logs** tab
- Verify all environment variables are set correctly

**Frontend shows "Failed to load data":**
- Check that `const API` in `frontend/index.html` matches your Railway URL exactly (no trailing slash)
- Check browser console for CORS errors (the API has `allow_origins=["*"]` so this shouldn't happen)

**Database is empty after redeploy:**
- You need a Railway Volume (see Part 4 above)
- Or run the pipeline manually: in Railway shell, run `python main.py --now`
