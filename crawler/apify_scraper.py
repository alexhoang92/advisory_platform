from apify_client import ApifyClient
from dotenv import load_dotenv
import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from db.models import get_session, KOL, RawTweet
from datetime import datetime, timedelta
from sqlalchemy import func

load_dotenv()

def scrape_kol_tweets(max_per_run: int = 50, handles_filter: list = None):
    """Fetch only NEW tweets from active KOLs and store in database.

    Per-KOL since-date filtering: for each KOL we look up the posted_at of
    their most recent tweet in the DB and pass `from:<handle> since:<date>`
    as a search term to Apify.  This means we never pay to re-scrape tweets
    we already have.

    handles_filter: optional list of handles to restrict to (e.g. new-KOL
                    targeted scrapes).  When None, scrapes all active KOLs.
    """

    client  = ApifyClient(os.getenv("APIFY_API_TOKEN"))
    session = get_session()

    # ── 1. Collect active KOLs ────────────────────────────────
    kols = session.query(KOL).filter_by(is_active=True).all()
    if handles_filter:
        filter_set = {h.lstrip("@").lower() for h in handles_filter}
        kols = [k for k in kols if k.handle.lower() in filter_set]
        print(f"  (Filtered to {len(kols)} handles from handles_filter)")

    kol_lookup = {kol.handle.lstrip("@").lower(): kol for kol in kols}

    # ── 2. Per-KOL: latest tweet posted_at from DB ───────────
    existing_handles: dict[str, str] = {}   # handle → since-date string
    new_handles:      list[str]       = []   # handles with no prior tweets

    for kol in kols:
        handle = kol.handle.lstrip("@").lower()
        row = session.query(func.max(RawTweet.posted_at)).filter(
            RawTweet.kol_id == kol.id
        ).scalar()
        if row:
            dt = row if isinstance(row, datetime) else datetime.fromisoformat(str(row)[:19])
            existing_handles[handle] = dt.strftime("%Y-%m-%d")
        else:
            new_handles.append(handle)

    # ── 3. Run Apify ─────────────────────────────────────────
    all_items: list[dict] = []

    # 3a. Existing KOLs — searchTerms with per-account since-date
    if existing_handles:
        search_terms = [
            f"from:{handle} since:{since}"
            for handle, since in existing_handles.items()
        ]
        print(f"🔍 Incremental scrape: {len(search_terms)} KOLs with since-date filter")
        for handle, since in sorted(existing_handles.items()):
            print(f"   @{handle}: since {since}")

        run = client.actor("apidojo/tweet-scraper").call(run_input={
            "searchTerms": search_terms,
            "maxItems":    max_per_run * len(search_terms),
            "sort":        "Latest",
            "tweetLanguage": "en",
        })
        all_items.extend(client.dataset(run["defaultDatasetId"]).iterate_items())

    # 3b. New KOLs (no prior tweets) — fetch last 100 tweets each
    if new_handles:
        print(f"🆕 Full backfill: {len(new_handles)} new KOLs (last 100 tweets each)")
        for h in new_handles:
            print(f"   @{h}")

        run = client.actor("apidojo/tweet-scraper").call(run_input={
            "twitterHandles": new_handles,
            "maxItems":       100 * len(new_handles),
            "sort":           "Latest",
            "tweetLanguage":  "en",
        })
        all_items.extend(client.dataset(run["defaultDatasetId"]).iterate_items())

    print("⏳ Apify runs complete — processing results...")

    # ── 4. Process results ────────────────────────────────────
    tweets_added   = 0
    tweets_skipped = 0

    for item in all_items:

        author_handle = item.get("author", {}).get("userName", "").lower()
        kol = kol_lookup.get(author_handle)

        if not kol:
            tweets_skipped += 1
            continue

        if item.get("isRetweet", False):
            tweets_skipped += 1
            continue

        # Skip if already stored (safety net for same-day overlap)
        tweet_id = int(item.get("id", 0))
        if session.query(RawTweet).filter_by(id=tweet_id).first():
            tweets_skipped += 1
            continue

        try:
            posted_at = datetime.strptime(
                item.get("createdAt", ""),
                "%a %b %d %H:%M:%S +0000 %Y"
            )
        except Exception:
            posted_at = datetime.utcnow()

        tweet = RawTweet(
            id         = tweet_id,
            kol_id     = kol.id,
            text       = item.get("text", ""),
            posted_at  = posted_at,
            likes      = item.get("likeCount", 0),
            retweets   = item.get("retweetCount", 0),
            replies    = item.get("replyCount", 0),
            quotes     = item.get("quoteCount", 0),
            url        = item.get("url", ""),
            is_reply   = item.get("isReply", False),
            is_retweet = item.get("isRetweet", False),
            is_parsed  = False,
            crawled_at = datetime.utcnow()
        )
        session.add(tweet)
        tweets_added += 1

    # Update last_crawled_at for all scraped KOLs
    for kol in kols:
        kol.last_crawled_at = datetime.utcnow()

    session.commit()
    session.close()

    print(f"✅ Done! Added {tweets_added} new tweets, skipped {tweets_skipped}")
    return tweets_added


if __name__ == "__main__":
    scrape_kol_tweets()
