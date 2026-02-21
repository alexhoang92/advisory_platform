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