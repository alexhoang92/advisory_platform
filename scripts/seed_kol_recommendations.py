#!/usr/bin/env python3
"""
Dev seed script — populates sample recommendation + price_snapshot data in Neon
so the leaderboard, top opportunities, and recent calls sections show real data.

Usage:
  python3 scripts/seed_kol_recommendations.py

Safe to re-run: inserts are skipped if the recommendation already exists
(detected by checking tweet_id uniqueness).
"""

import os
import sys
import random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2

DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)

# ── Sample data configuration ─────────────────────────────────────────────────

TICKERS = [
    "NVDA", "AAPL", "TSLA", "MSFT", "AMD", "META", "AMZN", "GOOGL",
    "SPY", "QQQ", "PLTR", "COIN", "SOFI", "MARA", "RIOT", "ARM",
    "SMCI", "AVGO", "CRWD", "PANW",
]

# Realistic KOL call patterns (kol_handle → win_rate_bias, call_count)
KOL_PROFILES = {
    "unusual_whales":  {"calls": 45, "win_bias": 0.72, "style": "options"},
    "jimcramer":       {"calls": 30, "win_bias": 0.38, "style": "stock"},  # famously bad
    "CathieDWood":     {"calls": 28, "win_bias": 0.44, "style": "growth"},
    "PeterLBrandt":    {"calls": 22, "win_bias": 0.68, "style": "chart"},
    "SJosephBurns":    {"calls": 18, "win_bias": 0.61, "style": "swing"},
    "markminervini":   {"calls": 20, "win_bias": 0.75, "style": "growth"},
    "NorthmanTrader":  {"calls": 15, "win_bias": 0.58, "style": "macro"},
    "TraderStewie":    {"calls": 25, "win_bias": 0.65, "style": "swing"},
    "InvestorsLive":   {"calls": 35, "win_bias": 0.62, "style": "day"},
    "OptionsHawk":     {"calls": 40, "win_bias": 0.70, "style": "options"},
}

def seed():
    conn = psycopg2.connect(DB_URL, sslmode="require")
    cur = conn.cursor()

    # Fetch kol ids
    cur.execute("SELECT id, handle FROM kols WHERE is_active = true")
    kol_rows = cur.fetchall()
    kol_map = {row[1].lower(): row[0] for row in kol_rows}

    if not kol_map:
        print("No active KOLs found in database. Run db/seed.py first.")
        conn.close()
        return

    print(f"Found {len(kol_map)} active KOLs: {list(kol_map.keys())}")

    total_recs = 0
    total_snaps = 0
    fake_tweet_id = 900_000_000_000_000_000  # High number to avoid real tweet ID collisions

    for handle, profile in KOL_PROFILES.items():
        kol_id = kol_map.get(handle.lower())
        if not kol_id:
            print(f"  Skipping @{handle} — not found in DB")
            continue

        for i in range(profile["calls"]):
            fake_tweet_id += random.randint(1000, 9999)
            ticker = random.choice(TICKERS)
            direction = "BUY" if random.random() < 0.78 else "SELL"
            conviction = random.choice(["HIGH", "MEDIUM", "MEDIUM", "LOW"])

            # Spread calls across last 60 days, more recent ones more likely
            days_ago = int(random.expovariate(0.05))
            days_ago = min(days_ago, 89)
            posted_at = datetime.utcnow() - timedelta(days=days_ago)

            entry_price = round(random.uniform(50, 800), 2)
            target_price = round(entry_price * random.uniform(1.05, 1.35), 2) if direction == "BUY" else round(entry_price * random.uniform(0.65, 0.92), 2)

            # Insert recommendation (skip if tweet_id already exists)
            cur.execute("""
                INSERT INTO recommendations
                  (tweet_id, kol_id, ticker, direction, conviction,
                   price_at_mention, target_price, posted_at, parse_method)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
            """, (
                fake_tweet_id, kol_id, ticker, direction, conviction,
                entry_price, target_price, posted_at, "seed"
            ))
            row = cur.fetchone()
            if not row:
                continue  # already existed

            rec_id = row[0]
            total_recs += 1

            # Insert T0 price snapshot (entry price)
            cur.execute("""
                INSERT INTO price_snapshots (recommendation_id, ticker, snapshot_type, price, snapshot_date)
                VALUES (%s, %s, 'T0', %s, %s)
                ON CONFLICT DO NOTHING
            """, (rec_id, ticker, entry_price, posted_at))

            # For older calls (> 7 days), insert T7D snapshot with realistic outcome
            if days_ago >= 7:
                is_correct = random.random() < profile["win_bias"]
                if direction == "BUY":
                    change = random.uniform(0.02, 0.18) if is_correct else random.uniform(-0.12, -0.01)
                else:
                    change = random.uniform(-0.12, -0.01) if is_correct else random.uniform(0.02, 0.18)
                exit_price = round(entry_price * (1 + change), 2)
                snapshot_at = posted_at + timedelta(days=7)

                cur.execute("""
                    INSERT INTO price_snapshots (recommendation_id, ticker, snapshot_type, price, snapshot_date)
                    VALUES (%s, %s, 'T7D', %s, %s)
                    ON CONFLICT DO NOTHING
                """, (rec_id, ticker, exit_price, snapshot_at))
                total_snaps += 1

        print(f"  @{handle}: {profile['calls']} calls seeded")

    conn.commit()
    cur.close()
    conn.close()

    print(f"\n✅ Seed complete — {total_recs} recommendations + {total_snaps} price snapshots inserted")
    print("   Restart the API server then refresh the leaderboard.")

if __name__ == "__main__":
    seed()
