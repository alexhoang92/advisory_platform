import re
import os
import json
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from anthropic import Anthropic, AuthenticationError, APIConnectionError, RateLimitError, APIStatusError
from dotenv import load_dotenv
from datetime import datetime
from db.models import get_session, RawTweet, Recommendation, KOL

load_dotenv()

# ── Stage 1: Regex Filter ──────────────────────────────────────────────────────
# These are keywords and patterns that strongly suggest a stock recommendation

STOCK_KEYWORDS = [
    # Directional signals
    "buy", "sell", "short", "long", "bullish", "bearish",
    "calls", "puts", "yolo", "position", "entry", "exit",
    "target", "stop loss", "stop-loss", "sl ", "tp ",
    # Action words
    "loading", "accumulating", "trimming", "adding", "bought",
    "sold", "holding", "watching", "breaking out", "breakdown",
    "squeeze", "oversold", "overbought", "support", "resistance",
    # Options specific
    "strike", "expiry", "expiration", "0dte", "dte",
    "sweep", "unusual", "flow", "block trade",
]

def passes_regex_filter(text: str) -> bool:
    """
    Stage 1: Quick free check before sending to Claude.
    Returns True if tweet likely contains a stock recommendation.
    """
    text_lower = text.lower()

    # Check 1: Contains a cashtag like $NVDA $AAPL $TSLA
    has_cashtag = bool(re.search(r'\$[A-Z]{1,5}\b', text))

    # Check 2: Contains stock-related keywords
    has_keyword = any(keyword in text_lower for keyword in STOCK_KEYWORDS)

    # Must have EITHER a cashtag OR a keyword to pass
    return has_cashtag or has_keyword


# ── Stage 2: Claude Parser ─────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a financial signal extraction system. 
Your job is to read tweets from stock market influencers and extract 
any stock recommendations or trading signals.

You must always respond with valid JSON only — no explanation, 
no markdown, no extra text. Just the raw JSON object."""

def parse_with_claude(tweet_text: str) -> dict:
    """
    Stage 2: Send tweet to Claude and extract structured recommendation.
    Only called for tweets that passed the regex filter.
    """
    client = Anthropic()

    user_prompt = f"""Analyze this tweet from a stock market influencer and extract any trading recommendation or directional position statement.

Tweet: "{tweet_text}"

Respond with this exact JSON structure:
{{
  "has_recommendation": true or false,
  "ticker": "SYMBOL or null",
  "direction": "BUY or SELL or SHORT or HOLD or null",
  "conviction": "HIGH or MEDIUM or LOW or null",
  "target_price": number or null,
  "timeframe": "intraday or swing or long-term or unspecified or null",
  "signal_text": "the exact phrase that indicated the recommendation, or null"
}}

Rules:
- ticker must be the stock symbol only (e.g. NVDA not Nvidia)
- Only extract recommendations for individual stocks or ETFs, not general market index commentary
- Set has_recommendation TRUE for any of these patterns:
  * Explicit directional calls: "buying X", "selling X", "shorting X", "long X", "short X"
  * Position updates (these ARE actionable): "added to position", "added to my X", "remain long", "staying long", "remain short", "staying short", "trimmed X", "exiting X"
  * Conviction statements: "love X here", "X is a strong buy", "X looks like a short"
  * Price targets with a ticker: "$X target $200", "X to $50"
  * Options positioning: "buying calls on X", "buying puts on X"
- Direction mapping:
  * BUY: buy, long, bullish, added, accumulating, loading, remains long, love this, strong buy
  * SELL: sell, exit, trimmed, reducing, take profit
  * SHORT: short, bearish, put, remains short
- Set has_recommendation FALSE for: pure news, earnings reports with no directional call, general market commentary without a specific ticker call, price observations with no direction
- If a tweet mentions multiple tickers with the same direction, pick the most prominently featured one"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}]
    )

    # Parse the JSON response
    raw = response.content[0].text.strip()
    # Remove markdown code blocks if Claude added them
    raw = re.sub(r'```json|```', '', raw).strip()
    return json.loads(raw)


# ── Main Parser Pipeline ───────────────────────────────────────────────────────

def run_parser(batch_size: int = 50):
    """
    Process unparsed tweets through the 2-stage pipeline.
    batch_size: how many tweets to process per run
    """
    session = get_session()

    # Get unprocessed tweets
    unparsed = session.query(RawTweet)\
        .filter_by(is_parsed=False, is_retweet=False)\
        .limit(batch_size)\
        .all()

    print(f"📋 Found {len(unparsed)} unparsed tweets to process")

    # Counters
    filtered_out  = 0  # Rejected by regex
    sent_to_claude = 0  # Passed to Claude
    recs_found    = 0  # Actual recommendations extracted
    errors        = 0  # Parse errors

    for tweet in unparsed:

        # ── Stage 1: Regex filter ──────────────────────────
        if not passes_regex_filter(tweet.text):
            tweet.is_parsed = True  # Mark as processed (just not relevant)
            filtered_out += 1
            continue

        # ── Stage 2: Claude ────────────────────────────────
        try:
            sent_to_claude += 1
            result = parse_with_claude(tweet.text)

            # Mark tweet as parsed regardless of outcome
            tweet.is_parsed = True

            # Only save if Claude found a real recommendation
            if result.get("has_recommendation") and result.get("ticker"):

                # Duplicate guard: skip if rec already exists for this tweet
                existing = session.query(Recommendation).filter_by(tweet_id=tweet.id).first()
                if existing:
                    continue

                rec = Recommendation(
                    tweet_id    = tweet.id,
                    kol_id      = tweet.kol_id,
                    ticker      = result["ticker"].upper(),
                    direction   = result.get("direction", "UNKNOWN"),
                    conviction  = result.get("conviction", "MEDIUM"),
                    target_price = result.get("target_price"),
                    timeframe   = result.get("timeframe", "unspecified"),
                    signal_text = result.get("signal_text"),
                    parse_method = "llm",
                    posted_at   = tweet.posted_at,
                )
                session.add(rec)
                recs_found += 1

                # Print a preview of what was found
                kol = session.query(KOL).filter_by(id=tweet.kol_id).first()
                print(f"  📈 @{kol.handle}: {result['direction']} ${result['ticker']} "
                      f"[{result.get('conviction','?')} conviction] "
                      f"— \"{tweet.text[:60]}...\"")

        except (AuthenticationError, APIConnectionError, RateLimitError, APIStatusError) as e:
            # API-level errors: don't mark tweets as parsed — allow retry after fix
            print(f"  ❌ API error (batch aborted): {e}")
            session.commit()
            session.close()
            raise

        except Exception as e:
            errors += 1
            print(f"  ⚠️  Parse error on tweet {tweet.id}: {e}")
            tweet.is_parsed = True  # Mark as parsed to avoid retrying malformed tweets
            continue

    session.commit()
    session.close()

    # Summary
    print(f"\n── Parser Summary ──────────────────────")
    print(f"  Tweets processed  : {len(unparsed)}")
    print(f"  Rejected by regex : {filtered_out} (free, no Claude cost)")
    print(f"  Sent to Claude    : {sent_to_claude}")
    print(f"  Recommendations   : {recs_found}")
    print(f"  Errors            : {errors}")
    print(f"  Filter efficiency : {filtered_out}/{len(unparsed)} = "
          f"{int(filtered_out/max(len(unparsed),1)*100)}% saved from Claude")

    return recs_found

if __name__ == "__main__":
    run_parser()