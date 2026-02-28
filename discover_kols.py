#!/usr/bin/env python3
"""
Task 2: Discover new KOL candidates via ticker search on Twitter/X.

Searches Apify for tweets mentioning high-volume tickers + recommendation keywords.
Finds accounts that appear frequently with explicit recommendation language.
Writes candidates.txt and kols_to_add.csv, then imports top 45 to DB.
"""
import sys
import os
import re
import csv
import time
from collections import defaultdict
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from apify_client import ApifyClient
from dotenv import load_dotenv
from db.models import get_session, KOL
from db.manage_kols import add_from_csv

load_dotenv()

# ── Tickers to search (3 batches) ─────────────────────────────
BATCHES = [
    ["$NVDA", "$TSLA", "$AAPL", "$AMD", "$SPY"],
    ["$PLTR", "$MSTR", "$COIN", "$META", "$MSFT"],
    ["$SMCI", "$ARM", "$AVGO", "$CRWD", "$PANW"],
]

RECOMMENDATION_KEYWORDS = [
    "buy", "sell", "short", "long", "bullish", "bearish",
    "target", "calls", "puts", "entry", "exit",
    "loading", "accumulating", "trimming", "adding",
    "bought", "sold", "holding", "watching",
    "position", "yolo", "sweep", "flow",
]

MIN_APPEARANCES = 3
MIN_FOLLOWERS   = 10_000


def has_explicit_rec(text: str) -> bool:
    """Return True only if tweet has BOTH a $TICKER and a recommendation keyword."""
    text_lower = text.lower()
    has_cashtag = bool(re.search(r'\$[A-Z]{1,5}\b', text))
    has_keyword = any(kw in text_lower for kw in RECOMMENDATION_KEYWORDS)
    return has_cashtag and has_keyword


def get_existing_handles() -> set:
    """Return lowercase set of handles already tracked."""
    db = get_session()
    rows = db.query(KOL.handle).all()
    db.close()
    return {r[0].lower() for r in rows}


def run_apify_search(client: ApifyClient, tickers: list, batch_num: int) -> list:
    """Search Twitter for explicit rec tweets mentioning these tickers."""
    search_terms = []
    for ticker in tickers:
        search_terms += [
            f"{ticker} buy",
            f"{ticker} sell",
            f"{ticker} short",
            f"{ticker} long",
            f"{ticker} target",
        ]

    print(f"\n📡 Batch {batch_num}/3: {len(search_terms)} search terms "
          f"({tickers[0]} … {tickers[-1]})")

    run_input = {
        "searchTerms": search_terms,
        "maxItems": len(search_terms) * 25,   # ~25 results per term
        "sort": "Latest",
        "tweetLanguage": "en",
    }

    run   = client.actor("apidojo/tweet-scraper").call(run_input=run_input)
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    print(f"   Got {len(items)} tweets")
    return items


def discover_candidates(all_tweets: list, existing: set) -> dict:
    """
    Analyse tweets and build candidate dict.
    Returns {handle: {follower_count, times_appeared, display_name, sample_tweets}}
    """
    candidates = defaultdict(lambda: {
        "follower_count": 0,
        "times_appeared": 0,
        "display_name":   "",
        "sample_tweets":  [],
    })

    for item in all_tweets:
        if item.get("isRetweet", False):
            continue

        author = item.get("author", {})
        handle = author.get("userName", "").lower().strip()
        if not handle or handle in existing:
            continue

        text = item.get("text", "")
        if not has_explicit_rec(text):
            continue

        followers = (
            author.get("followers")
            or author.get("followersCount")
            or 0
        )

        c = candidates[handle]
        c["follower_count"] = max(c["follower_count"], int(followers))
        c["times_appeared"] += 1
        c["display_name"]    = author.get("name", "") or handle
        if len(c["sample_tweets"]) < 2:
            c["sample_tweets"].append(text[:120].replace("\n", " "))

    return dict(candidates)


def main():
    print("=" * 60)
    print("Task 2: Discover New KOLs via Ticker Search")
    print("=" * 60)

    client   = ApifyClient(os.getenv("APIFY_API_TOKEN"))
    existing = get_existing_handles()
    print(f"\n   Already tracking {len(existing)} handles — will skip them")

    # ── Run Apify searches in 3 batches ───────────────────────
    all_tweets: list = []
    for batch_num, tickers in enumerate(BATCHES, 1):
        for attempt in range(2):
            try:
                items = run_apify_search(client, tickers, batch_num)
                all_tweets.extend(items)
                break
            except Exception as e:
                if attempt == 0 and "rate" in str(e).lower():
                    print(f"   ⏳ Rate limit hit, waiting 60s…")
                    time.sleep(60)
                else:
                    print(f"   ❌ Batch {batch_num} failed: {e}")
                    break
        time.sleep(3)   # polite pause between batches

    print(f"\n📊 Processing {len(all_tweets)} total search-result tweets…")

    # ── Build candidate list ───────────────────────────────────
    all_candidates = discover_candidates(all_tweets, existing)
    print(f"   Unique candidates with explicit recs: {len(all_candidates)}")

    # ── Apply quality filters ──────────────────────────────────
    qualified = {
        h: d for h, d in all_candidates.items()
        if d["times_appeared"] >= MIN_APPEARANCES
        and d["follower_count"] >= MIN_FOLLOWERS
    }
    print(f"   Qualified (≥{MIN_APPEARANCES} appearances, ≥{MIN_FOLLOWERS:,} followers): "
          f"{len(qualified)}")

    # ── Score and rank ─────────────────────────────────────────
    ranked = sorted(
        qualified.items(),
        key=lambda x: x[1]["follower_count"] * x[1]["times_appeared"],
        reverse=True,
    )

    # ── Write candidates.txt ───────────────────────────────────
    with open("candidates.txt", "w") as f:
        f.write(f"# KOL Discovery Candidates — {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write("# handle | follower_count | times_appeared | sample_tweet\n\n")
        for handle, d in ranked:
            sample = d["sample_tweets"][0] if d["sample_tweets"] else ""
            f.write(f"{handle} | {d['follower_count']:,} | {d['times_appeared']} | {sample}\n")

    print(f"\n✅ Written {len(ranked)} candidates to candidates.txt")

    # ── Take top 45 for CSV ────────────────────────────────────
    top = ranked[:45]
    csv_path = "kols_to_add.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["handle", "display_name", "content_type", "prediction_style"])
        for handle, d in top:
            w.writerow([handle, d["display_name"] or handle, "stock picks", "explicit"])

    print(f"✅ Written top {len(top)} candidates to {csv_path}")

    if top:
        print(f"\n🚀 Top 10 candidates (follower × appearances score):")
        for i, (handle, d) in enumerate(top[:10], 1):
            score = d["follower_count"] * d["times_appeared"]
            print(f"   {i:>2}. @{handle:<25} "
                  f"{d['follower_count']:>10,} followers × {d['times_appeared']} = {score:,}")

    # ── Import to DB ───────────────────────────────────────────
    print(f"\n📥 Importing top {len(top)} candidates to database…")
    add_from_csv(csv_path)

    print(f"\n✅ Task 2 complete!")
    return len(top)


if __name__ == "__main__":
    main()
