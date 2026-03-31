"""
backfill_confidence.py
----------------------
One-shot script to populate confidence_score for existing recommendations
where confidence_score IS NULL.

Sends the original signal_text (or a short excerpt of it) to the LLM with
a simplified prompt that asks only for a confidence value.

Safe to re-run: skips rows where confidence_score IS NOT NULL.
"""

import os
import re
import sys
import json
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from anthropic import Anthropic, AuthenticationError, APIConnectionError, RateLimitError
from dotenv import load_dotenv
from db.models import get_session, Recommendation, RawTweet

load_dotenv()

BATCH_SIZE = 100
LOG_INTERVAL = 100

SYSTEM_PROMPT = """You are a financial signal classifier.
Respond with valid JSON only — no explanation, no markdown, no extra text."""


def score_confidence(text: str, client: Anthropic) -> float:
    """Ask the LLM to score how actionable a piece of text is as a stock recommendation."""
    prompt = f"""Rate the following text on how likely it contains a genuine, forward-looking,
actionable stock recommendation (not a vague mention, historical reference, question, or off-topic statement).

Text: "{text[:300]}"

Respond with this exact JSON:
{{"confidence": <float between 0.0 and 1.0>}}

Guidelines:
  1.0 — Explicit "BUY X target $Y" or "SHORT X, stop at $Z" style call
  0.8 — Clear directional bias with ticker ("$AAPL looks strong here, adding")
  0.6 — Directional but ambiguous ("watching NVDA for a breakout")
  0.4 — Ticker mentioned but no clear direction
  0.2 — Ticker mentioned only in passing or historical context
  0.0 — No actionable content"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=50,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    raw = re.sub(r'```json|```', '', raw).strip()
    data = json.loads(raw)
    val = float(data.get("confidence", 0.5))
    return max(0.0, min(1.0, val))  # clamp to [0, 1]


def main():
    session = get_session()
    client = Anthropic()

    # Count total work
    total = session.query(Recommendation).filter(
        Recommendation.confidence_score.is_(None)
    ).count()
    print(f"Found {total} recommendations without confidence_score")

    if total == 0:
        print("Nothing to do.")
        session.close()
        return

    processed = 0
    errors = 0
    offset = 0

    while True:
        batch = (
            session.query(Recommendation)
            .filter(Recommendation.confidence_score.is_(None))
            .order_by(Recommendation.id)
            .limit(BATCH_SIZE)
            .offset(offset)
            .all()
        )
        if not batch:
            break

        for rec in batch:
            # Prefer signal_text; fall back to fetching original tweet text
            text = rec.signal_text
            if not text:
                tweet = session.query(RawTweet).filter_by(id=rec.tweet_id).first()
                text = tweet.text if tweet else ""

            if not text:
                rec.confidence_score = 0.5
                processed += 1
                continue

            try:
                rec.confidence_score = score_confidence(text, client)
                processed += 1
            except (AuthenticationError, APIConnectionError, RateLimitError) as e:
                print(f"\nAPI error at rec {rec.id}: {e} — aborting")
                session.commit()
                session.close()
                sys.exit(1)
            except Exception as e:
                print(f"\nError on rec {rec.id}: {e} — defaulting to 0.5")
                rec.confidence_score = 0.5
                errors += 1
                processed += 1

            if processed % LOG_INTERVAL == 0:
                session.commit()
                print(f"  Progress: {processed}/{total} ({int(processed/total*100)}%)", flush=True)

        session.commit()
        offset += BATCH_SIZE

    session.close()
    print(f"\nDone. Processed: {processed}, Errors: {errors}")


if __name__ == "__main__":
    main()
