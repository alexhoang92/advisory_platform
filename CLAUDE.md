# KOL Tracker — Project Guide for Claude Code

## What This Project Does
Tracks stock recommendations from financial influencers (KOLs) on X/Twitter.
Scores their prediction accuracy at 1D, 7D, and 30D intervals.

## Tech Stack
- Python 3.11, FastAPI, SQLAlchemy, SQLite
- Apify for tweet scraping
- Anthropic Claude Haiku for LLM parsing
- yfinance for stock prices
- HTML/CSS/JS frontend

## Project Structure
- `crawler/apify_scraper.py` — scrapes tweets from Apify
- `parser/llm_parser.py` — extracts stock recommendations using regex + Claude
- `pricer/yfinance_fetch.py` — fetches stock price snapshots
- `scorer/score_calculator.py` — calculates KOL win rates
- `db/models.py` — all database table definitions
- `db/manage_kols.py` — add/remove KOLs from tracking
- `api.py` — FastAPI backend serving data to frontend
- `frontend/index.html` — single page UI
- `main.py` — daily pipeline scheduler
- `kols_to_add.csv` — CSV template for adding new KOLs

## Environment Variables (in .env)
- APIFY_API_TOKEN — for tweet scraping
- ANTHROPIC_API_KEY — for LLM parsing
- DATABASE_URL — sqlite:///kol_tracker.db

## Common Commands
- Run full pipeline: `python3 main.py --now`
- Start API: `uvicorn api:app --reload`
- Add KOLs from CSV: `python3 db/manage_kols.py --csv kols_to_add.csv`
- List KOLs: `python3 db/manage_kols.py --list`

## Important Rules
- Always activate venv first: `source venv/bin/activate`
- Never commit .env file
- KOL handles in CSV must not have @ symbol
- Database is SQLite stored as kol_tracker.db in project root
- Regex filter runs before Claude to save API costs
## Today's Tasks (DO THESE IN ORDER)

### Task 1: Deploy Publicly
Deploy the application so anyone can access it without Codespaces running.

**Backend (FastAPI API):**
- Deploy to Railway (railway.app)
- Use the free starter plan
- Make sure all environment variables are set:
  APIFY_API_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL
- The API must be publicly accessible via a Railway URL

**Frontend (HTML UI):**
- Deploy to Vercel (vercel.com)
- Update the API constant in frontend/index.html to point 
  to the Railway URL instead of localhost
- The frontend must load the leaderboard from the live API

**Steps to complete:**
1. Create a requirements.txt if it doesn't exist
2. Create a Procfile for Railway
3. Create a railway.json config file
4. Create a vercel.json config file
5. Commit everything to GitHub
6. Provide me instructions for the manual Railway + Vercel 
   signup steps (these require browser clicks I cannot do)

### Task 2: Top Assets UI Component
Add a new component to frontend/index.html next to the leaderboard.

**What it should show:**
- Title: "🔥 Most Predicted Assets (Last 7 Days)"
- A ranked list of stock tickers that have the most 
  recommendations in the last 7 days
- For each ticker show:
  - Ticker symbol (e.g. $AAPL)
  - Number of predictions (e.g. 10 predictions)
  - Breakdown: how many BUY vs SELL calls
  - A simple bar to visualize the count

**Backend changes needed:**
- Add a new endpoint to api.py: GET /top-assets?days=7
- Returns top 10 tickers by recommendation count in last N days
- Include direction breakdown (BUY/SELL counts) per ticker

**Frontend changes needed:**
- Add the component to frontend/index.html
- Place it to the right of the leaderboard on desktop,
  below on mobile
- Match the existing dark theme styling
- Load data from the new /top-assets endpoint
- Auto-refresh every 5 minutes

### Definition of Done
- [ ] requirements.txt exists and is complete
- [ ] Procfile exists for Railway deployment
- [ ] railway.json and vercel.json config files exist
- [ ] frontend/index.html updated with top assets component
- [ ] api.py has /top-assets endpoint
- [ ] All changes committed to GitHub with clear commit messages
- [ ] A file called DEPLOYMENT.md exists with manual steps 
      I need to follow to complete the Railway and Vercel setup
