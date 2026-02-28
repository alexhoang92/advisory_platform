from apify_client import ApifyClient
from dotenv import load_dotenv
import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from db.models import get_session, KOL, RawTweet
from datetime import datetime

load_dotenv()

def scrape_kol_tweets(max_per_run: int = 50, handles_filter: list = None):
    """Fetch latest tweets from active KOLs and store in database.

    handles_filter: optional list of handles to restrict to (e.g. for new-KOL-only scrapes).
                    When None, scrapes all active KOLs.
    """

    client  = ApifyClient(os.getenv("APIFY_API_TOKEN"))
    session = get_session()

    # Get active KOLs, optionally filtered to a specific set
    kols = session.query(KOL).filter_by(is_active=True).all()
    if handles_filter:
        filter_set = {h.lstrip("@").lower() for h in handles_filter}
        kols = [k for k in kols if k.handle.lower() in filter_set]
        print(f"  (Filtered to {len(kols)} handles from handles_filter)")

    # Strip @ from handles for Apify (it doesn't want the @ symbol)
    # But keep a lookup dict that matches both ways
    kol_lookup = {}
    for kol in kols:
        clean_handle = kol.handle.lstrip("@").lower()
        kol_lookup[clean_handle] = kol

    handles_for_apify = list(kol_lookup.keys())
    print(f"🔍 Scraping {len(handles_for_apify)} handles: {handles_for_apify}")

    # Call Apify
    run_input = {
        "twitterHandles": handles_for_apify,
        "maxItems": max_per_run * len(handles_for_apify),
        "sort": "Latest",
        "tweetLanguage": "en",
    }

    print("⏳ Running Apify actor... (this takes 1-2 minutes)")
    run = client.actor("apidojo/tweet-scraper").call(run_input=run_input)

    # Process results
    tweets_added   = 0
    tweets_skipped = 0

    for item in client.dataset(run["defaultDatasetId"]).iterate_items():

        # Match tweet author back to KOL in our database
        author_handle = item.get("author", {}).get("userName", "").lower()
        kol = kol_lookup.get(author_handle)

        if not kol:
            print(f"⚠️  No KOL match for author: {author_handle}")
            tweets_skipped += 1
            continue

        # Skip retweets — we only want original content
        if item.get("isRetweet", False):
            tweets_skipped += 1
            continue

        # Skip if already in database (avoid duplicates)
        tweet_id = int(item.get("id", 0))
        existing = session.query(RawTweet).filter_by(id=tweet_id).first()
        if existing:
            tweets_skipped += 1
            continue

        # Parse the posted date
        try:
            posted_at = datetime.strptime(
                item.get("createdAt", ""),
                "%a %b %d %H:%M:%S +0000 %Y"
            )
        except:
            posted_at = datetime.utcnow()

        # Save to database
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

    # Update last_crawled_at for all KOLs
    for kol in kols:
        kol.last_crawled_at = datetime.utcnow()

    session.commit()
    session.close()

    print(f"✅ Done! Added {tweets_added} new tweets, skipped {tweets_skipped}")
    return tweets_added

if __name__ == "__main__":
    scrape_kol_tweets()