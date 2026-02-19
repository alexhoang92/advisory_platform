import schedule
import time
import sys
import os
from datetime import datetime

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from crawler.apify_scraper import scrape_kol_tweets
from parser.llm_parser import run_parser
from pricer.yfinance_fetch import fetch_price_snapshots
from scorer.score_calculator import calculate_scores, print_leaderboard

def run_daily_pipeline():
    """
    Full daily pipeline — runs all 4 stages in sequence.
    Designed to run once per day at 7:30 AM ET.
    """
    print(f"\n{'='*50}")
    print(f"🚀 Daily Pipeline Starting: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")

    # Stage 1: Scrape new tweets
    print("📡 Stage 1/4: Scraping tweets from KOL handles...")
    tweets_added = scrape_kol_tweets(max_per_run=100)
    print(f"   → {tweets_added} new tweets collected\n")

    # Stage 2: Parse recommendations
    print("🧠 Stage 2/4: Parsing tweets for stock recommendations...")
    recs_found = run_parser(batch_size=500)
    print(f"   → {recs_found} new recommendations extracted\n")

    # Stage 3: Fetch price snapshots
    print("💰 Stage 3/4: Fetching price snapshots...")
    snapshots_added = fetch_price_snapshots()
    print(f"   → {snapshots_added} price snapshots recorded\n")

    # Stage 4: Recalculate scores
    print("🏆 Stage 4/4: Recalculating KOL accuracy scores...")
    scores = calculate_scores()
    print_leaderboard(scores)

    print(f"\n{'='*50}")
    print(f"✅ Pipeline Complete: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")

def run_now():
    """Run the pipeline immediately — useful for testing."""
    run_daily_pipeline()

def start_scheduler():
    """
    Start the daily scheduler.
    Runs pipeline every day at 7:30 AM ET.
    """
    # Schedule daily run at 7:30 AM ET
    schedule.every().day.at("07:30").do(run_daily_pipeline)

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