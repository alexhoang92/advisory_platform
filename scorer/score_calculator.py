import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from datetime import datetime, timezone, timedelta
from db.models import get_session, Recommendation, PriceSnapshot, KOLScore, KOL

# Period = lookback window: only score predictions made in the last N days
PERIOD_DAYS = {"T7D": 7, "T30D": 30}

def is_correct_call(direction: str, price_t0: float, price_tx: float) -> bool:
    if direction in ("BUY", "LONG"):
        return price_tx > price_t0
    elif direction in ("SELL", "SHORT"):
        return price_tx < price_t0
    return False

def get_return_pct(direction: str, price_t0: float, price_tx: float) -> float:
    if price_t0 == 0:
        return 0.0
    raw_return = (price_tx - price_t0) / price_t0 * 100
    if direction in ("SELL", "SHORT"):
        return -raw_return
    return raw_return

def calculate_scores():
    """
    Calculate accuracy scores for every KOL across all time periods.
    Bulk-loads all recs and snapshots upfront to avoid N+1 queries.
    """
    session = get_session()

    print("🏆 Calculating KOL accuracy scores...\n")

    # ── Bulk load everything upfront ─────────────────────────────
    kols = session.query(KOL).all()
    all_recs = session.query(Recommendation).all()
    all_snaps = session.query(PriceSnapshot).all()

    # Index recs by kol_id
    recs_by_kol: dict[int, list] = {}
    for rec in all_recs:
        recs_by_kol.setdefault(rec.kol_id, []).append(rec)

    # Index snapshots by (rec_id, snapshot_type) → price
    snap_index: dict[tuple, float] = {}
    for snap in all_snaps:
        snap_index[(snap.recommendation_id, snap.snapshot_type)] = snap.price

    # Wipe all existing scores so stale rows don't persist
    session.query(KOLScore).delete()
    session.commit()

    periods = ["T7D", "T30D", "all"]
    all_scores = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for kol in kols:
        recs = recs_by_kol.get(kol.id, [])
        if not recs:
            continue

        for period in periods:
            if period == "all":
                window_recs = recs
            else:
                cutoff = now - timedelta(days=PERIOD_DAYS[period])
                window_recs = [r for r in recs if r.posted_at and r.posted_at >= cutoff]

            total_calls   = len(window_recs)
            correct_calls = 0
            total_return  = 0.0
            evaluated     = 0

            for rec in window_recs:
                t0_price = snap_index.get((rec.id, "T0"))
                if t0_price is None:
                    continue

                tx_price = snap_index.get((rec.id, "T7D")) or snap_index.get((rec.id, "T30D"))
                if tx_price is None:
                    continue

                evaluated += 1
                if is_correct_call(rec.direction, t0_price, tx_price):
                    correct_calls += 1
                total_return += get_return_pct(rec.direction, t0_price, tx_price)

            if total_calls == 0:
                continue

            win_rate   = correct_calls / evaluated * 100 if evaluated > 0 else 0
            avg_return = total_return  / evaluated       if evaluated > 0 else 0

            score = KOLScore(
                kol_id           = kol.id,
                period           = period,
                total_calls      = total_calls,
                correct_calls    = correct_calls,
                win_rate         = win_rate,
                avg_return_pct   = avg_return,
                score_updated_at = datetime.now(timezone.utc),
            )
            session.add(score)

            all_scores.append({
                "handle"       : kol.handle,
                "period"       : period,
                "total_calls"  : total_calls,
                "correct_calls": correct_calls,
                "win_rate"     : win_rate,
                "avg_return"   : avg_return,
            })

    session.commit()
    session.close()
    return all_scores

def print_leaderboard(scores: list):
    """Print a formatted leaderboard table."""

    for period in ["T7D", "T30D", "all"]:
        period_scores = [s for s in scores if s["period"] == period]

        if not period_scores:
            continue

        period_scores.sort(key=lambda x: x["win_rate"], reverse=True)

        print(f"── {period} Leaderboard {'─' * 40}")
        print(f"  {'Handle':<20} {'Calls':>6} {'Correct':>8} {'Win Rate':>10} {'Avg Return':>12}")
        print(f"  {'─'*20} {'─'*6} {'─'*8} {'─'*10} {'─'*12}")

        for s in period_scores:
            print(f"  @{s['handle']:<19} "
                  f"{s['total_calls']:>6} "
                  f"{s['correct_calls']:>8} "
                  f"{s['win_rate']:>9.1f}% "
                  f"{s['avg_return']:>+11.1f}%")
        print()

if __name__ == "__main__":
    scores = calculate_scores()
    print_leaderboard(scores)
    print(f"✅ Scores saved to database for {len(set(s['handle'] for s in scores))} KOLs")
