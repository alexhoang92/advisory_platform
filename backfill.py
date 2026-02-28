#!/usr/bin/env python3
"""
Task 1: Deep backfill — scrape 200 tweets per KOL, run full pipeline.
Prints before/after call counts per KOL.
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


def get_call_counts():
    """Return {handle: call_count} for all KOLs."""
    db = get_session()
    results = (
        db.query(KOL.handle, func.count(Recommendation.id).label("cnt"))
        .outerjoin(Recommendation, KOL.id == Recommendation.kol_id)
        .group_by(KOL.id)
        .order_by(func.count(Recommendation.id).desc())
        .all()
    )
    db.close()
    return {h: c for h, c in results}


def print_summary(before: dict, after: dict):
    print("\n── Before / After Call Counts ──────────────────────────────────")
    print(f"  {'Handle':<28} {'Before':>7} {'After':>7} {'Change':>8}")
    print(f"  {'─'*28} {'─'*7} {'─'*7} {'─'*8}")
    for handle in sorted(set(list(before) + list(after))):
        b = before.get(handle, 0)
        a = after.get(handle, 0)
        diff = a - b
        marker = f"+{diff}" if diff > 0 else str(diff)
        print(f"  @{handle:<27} {b:>7} {a:>7} {marker:>8}")

    print()
    after_vals = list(after.values())
    zero       = sum(1 for c in after_vals if c == 0)
    one_five   = sum(1 for c in after_vals if 1 <= c <= 5)
    five_plus  = sum(1 for c in after_vals if c >= 5)
    total      = sum(after_vals)
    print(f"KOLs with 0 calls:   {zero}")
    print(f"KOLs with 1-5 calls: {one_five}")
    print(f"KOLs with 5+ calls:  {five_plus}")
    print(f"Total calls in database: {total}")


if __name__ == "__main__":
    print("=" * 60)
    print("Task 1: Deep Backfill — 200 tweets per KOL")
    print("=" * 60)

    # ── Record state before ────────────────────────────────────
    print("\n📊 Recording baseline call counts...")
    before = get_call_counts()
    print(f"  {len(before)} KOLs, {sum(before.values())} total calls, "
          f"{sum(1 for c in before.values() if c == 0)} with zero calls")

    # ── Stage 1: Scrape 200 tweets per KOL ────────────────────
    print("\n📡 Stage 1/4: Scraping 200 tweets per existing KOL...")
    try:
        added = scrape_kol_tweets(max_per_run=200)
        print(f"   ✅ {added} new tweets added")
    except Exception as e:
        print(f"   ❌ Scrape failed: {e}")
        raise

    # ── Stage 2: Parse all unparsed tweets ────────────────────
    print("\n🧠 Stage 2/4: Parsing tweets for stock recommendations...")
    total_recs = 0
    batches = 0
    try:
        while True:
            db = get_session()
            remaining = db.query(RawTweet).filter_by(is_parsed=False, is_retweet=False).count()
            db.close()
            if remaining == 0:
                break
            print(f"   → {remaining} unparsed tweets remaining...")
            batch_recs = run_parser(batch_size=100)
            total_recs += batch_recs
            batches += 1
        print(f"   ✅ {total_recs} recommendations extracted across {batches} batches")
    except Exception as e:
        print(f"   ❌ Parse stage failed: {e}")
        raise

    # ── Stage 3: Fetch price snapshots ────────────────────────
    print("\n💰 Stage 3/4: Fetching price snapshots...")
    try:
        snaps = fetch_price_snapshots()
        print(f"   ✅ {snaps} price snapshots added")
    except Exception as e:
        print(f"   ❌ Pricer failed: {e}")

    # ── Stage 4: Recalculate scores ───────────────────────────
    print("\n🏆 Stage 4/4: Recalculating KOL accuracy scores...")
    try:
        scores = calculate_scores()
        print(f"   ✅ {len(scores)} score entries updated")
    except Exception as e:
        print(f"   ❌ Scorer failed: {e}")

    # ── Print comparison ───────────────────────────────────────
    after = get_call_counts()
    print_summary(before, after)

    new_calls = sum(after.values()) - sum(before.values())
    print(f"\n✅ Deep backfill complete! +{new_calls} new calls added.")
