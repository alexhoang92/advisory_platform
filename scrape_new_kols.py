#!/usr/bin/env python3
"""
Task 4: Initial scrape and full pipeline for all newly added KOLs.

"New" = active KOLs whose last_crawled_at is NULL (never scraped before).
Runs: scrape(100) → parse loop → price snapshots → score → final summary.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import func
from db.models import get_session, KOL, RawTweet, Recommendation
from crawler.apify_scraper import scrape_kol_tweets
from parser.llm_parser import run_parser
from pricer.yfinance_fetch import fetch_price_snapshots
from scorer.score_calculator import calculate_scores


def get_new_kol_handles() -> list:
    """Return handles of KOLs that have never been scraped (last_crawled_at IS NULL)."""
    db = get_session()
    rows = (
        db.query(KOL.handle)
        .filter_by(is_active=True)
        .filter(KOL.last_crawled_at.is_(None))
        .all()
    )
    db.close()
    return [r[0] for r in rows]


def print_final_summary():
    """Print final platform summary."""
    db = get_session()

    total_kols = db.query(KOL).filter_by(is_active=True).count()
    total_calls = db.query(Recommendation).count()

    results = (
        db.query(KOL.handle, func.count(Recommendation.id).label("cnt"))
        .outerjoin(Recommendation, KOL.id == Recommendation.kol_id)
        .group_by(KOL.id)
        .filter(KOL.is_active == True)
        .order_by(func.count(Recommendation.id).desc())
        .all()
    )
    db.close()

    five_plus = sum(1 for _, c in results if c >= 5)

    print("\n" + "=" * 60)
    print("📊 FINAL SUMMARY")
    print("=" * 60)
    print(f"Total KOLs in database:  {total_kols}")
    print(f"Total calls recorded:    {total_calls}")
    print(f"KOLs with 5+ calls:      {five_plus}")
    print(f"\nTop 5 KOLs by call count:")
    for handle, cnt in results[:5]:
        print(f"  @{handle}: {cnt} calls")


if __name__ == "__main__":
    print("=" * 60)
    print("Task 4: Initial Scrape for New KOLs")
    print("=" * 60)

    # ── Find new (never-scraped) KOLs ─────────────────────────
    new_handles = get_new_kol_handles()
    if not new_handles:
        print("\n⚠️  No new KOLs found (all have been scraped already).")
        print_final_summary()
        sys.exit(0)

    print(f"\n🆕 Found {len(new_handles)} new KOLs to scrape:")
    for h in new_handles:
        print(f"   @{h}")

    # ── Stage 1: Scrape ───────────────────────────────────────
    print(f"\n📡 Stage 1/4: Scraping 100 tweets for each new KOL…")
    try:
        added = scrape_kol_tweets(max_per_run=100, handles_filter=new_handles)
        print(f"   ✅ {added} new tweets added")
    except Exception as e:
        print(f"   ❌ Scrape failed: {e}")
        raise

    # ── Stage 2: Parse ────────────────────────────────────────
    print("\n🧠 Stage 2/4: Parsing tweets…")
    total_recs = 0
    batches = 0
    try:
        while True:
            db = get_session()
            remaining = db.query(RawTweet).filter_by(is_parsed=False, is_retweet=False).count()
            db.close()
            if remaining == 0:
                break
            print(f"   → {remaining} unparsed tweets remaining…")
            batch_recs = run_parser(batch_size=100)
            total_recs += batch_recs
            batches += 1
        print(f"   ✅ {total_recs} recommendations extracted across {batches} batches")
    except Exception as e:
        print(f"   ❌ Parse failed: {e}")
        raise

    # ── Stage 3: Price snapshots ──────────────────────────────
    print("\n💰 Stage 3/4: Fetching price snapshots…")
    try:
        snaps = fetch_price_snapshots()
        print(f"   ✅ {snaps} price snapshots added")
    except Exception as e:
        print(f"   ❌ Pricer failed: {e}")

    # ── Stage 4: Score ────────────────────────────────────────
    print("\n🏆 Stage 4/4: Recalculating scores…")
    try:
        scores = calculate_scores()
        print(f"   ✅ {len(scores)} score entries updated")
    except Exception as e:
        print(f"   ❌ Scorer failed: {e}")

    # ── Final summary ─────────────────────────────────────────
    print_final_summary()
    print("\n✅ Task 4 complete!")
