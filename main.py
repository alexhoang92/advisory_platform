import schedule
import time
import sys
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import sentry_sdk
_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.1, environment="production")


def _capture(e: Exception):
    if _sentry_dsn:
        sentry_sdk.capture_exception(e)

from crawler.apify_scraper import scrape_kol_tweets
from parser.llm_parser import run_parser
from pricer.yfinance_fetch import fetch_price_snapshots
from scorer.score_calculator import calculate_scores, print_leaderboard
from db.models import get_session, RawTweet


def run_daily_pipeline():
    """
    Full daily pipeline — runs all 4 stages in sequence.
    Each stage is wrapped in try/except so a failure does not block the others.
    Designed to run once per day at 7:30 AM ET.
    """
    print(f"\n{'='*50}")
    print(f"🚀 Daily Pipeline Starting: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")

    # ── Stage 1: Scrape new tweets ──────────────────────────────
    print("📡 Stage 1/4: Scraping tweets from KOL handles...")
    tweets_added = 0
    try:
        tweets_added = scrape_kol_tweets(max_per_run=100)
        print(f"   ✅ {tweets_added} new tweets collected\n")
    except Exception as e:
        print(f"   ❌ Stage 1 failed: {e}\n")
        _capture(e)

    # ── Stage 2: Parse all unparsed tweets (loop until done) ───
    print("🧠 Stage 2/4: Parsing tweets for stock recommendations...")
    total_recs = 0
    batches = 0
    try:
        while True:
            s = get_session()
            remaining = s.query(RawTweet).filter_by(is_parsed=False, is_retweet=False).count()
            s.close()
            print(f"   → {remaining} unparsed tweets remaining...")
            if remaining == 0:
                break
            batch_recs = run_parser(batch_size=100)
            total_recs += batch_recs
            batches += 1
        print(f"   ✅ {total_recs} recommendations extracted across {batches} batches\n")
    except Exception as e:
        print(f"   ❌ Stage 2 failed: {e}\n")
        _capture(e)

    # ── Stage 3: Fetch price snapshots ──────────────────────────
    print("💰 Stage 3/4: Fetching price snapshots...")
    snapshots_added = 0
    try:
        snapshots_added = fetch_price_snapshots()
        print(f"   ✅ {snapshots_added} price snapshots recorded\n")
    except Exception as e:
        print(f"   ❌ Stage 3 failed: {e}\n")
        _capture(e)

    # ── Stage 4: Recalculate scores ─────────────────────────────
    print("🏆 Stage 4/4: Recalculating KOL accuracy scores...")
    try:
        scores = calculate_scores()
        print_leaderboard(scores)
        print(f"   ✅ {len(scores)} score entries updated\n")
    except Exception as e:
        print(f"   ❌ Stage 4 failed: {e}\n")
        _capture(e)

    print(f"\n{'='*50}")
    print(f"✅ Pipeline Complete: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")


def run_now():
    """Run the pipeline immediately — useful for testing."""
    run_daily_pipeline()


def _pipeline_ran_today() -> bool:
    """Return True if the scraper already ran today (last crawled_at is today's date)."""
    try:
        from db.models import get_session, RawTweet
        from sqlalchemy import func
        s = get_session()
        latest = s.query(func.max(RawTweet.crawled_at)).scalar()
        s.close()
        if latest is None:
            return False
        # latest may be a string or datetime depending on SQLite driver
        latest_str = str(latest)[:10]  # "YYYY-MM-DD"
        today_str  = datetime.utcnow().strftime("%Y-%m-%d")
        return latest_str == today_str
    except Exception:
        return False


def start_scheduler():
    """
    Start the daily scheduler.
    Runs pipeline every day at 7:30 AM server local time.
    Set TZ=America/New_York in your environment for ET.

    On startup: if it's already past 07:30 and the pipeline hasn't run
    today (e.g. after a deploy restart), run it immediately so a redeploy
    never silently skips a day.
    """
    schedule.every().day.at("07:30").do(run_daily_pipeline)

    now = datetime.utcnow()
    scheduled_today = now.hour > 7 or (now.hour == 7 and now.minute >= 30)
    if scheduled_today and not _pipeline_ran_today():
        print("⚡ Missed today's scheduled run — executing pipeline now...")
        run_daily_pipeline()

    print(f"⏰ Scheduler started — pipeline will run daily at 7:30 AM ET")
    print(f"   Current time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   Press Ctrl+C to stop\n")

    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='KOL Tracker Pipeline')
    parser.add_argument('--now', action='store_true',
                        help='Run pipeline immediately instead of waiting for schedule')
    args = parser.parse_args()

    if args.now:
        run_now()
    else:
        start_scheduler()
