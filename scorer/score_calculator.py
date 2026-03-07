import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from datetime import datetime, timezone, timedelta
from db.models import get_session, Recommendation, PriceSnapshot, KOLScore, KOL

# Period = lookback window: only score predictions made in the last N days
PERIOD_DAYS = {"T7D": 7, "T30D": 30}

def is_correct_call(direction: str, price_t0: float, price_tx: float) -> bool:
    """
    A call is correct if:
    - BUY/LONG → price went UP
    - SELL/SHORT → price went DOWN
    """
    if direction in ("BUY", "LONG"):
        return price_tx > price_t0
    elif direction in ("SELL", "SHORT"):
        return price_tx < price_t0
    return False

def get_return_pct(direction: str, price_t0: float, price_tx: float) -> float:
    """Calculate % return if you followed the recommendation."""
    if price_t0 == 0:
        return 0.0
    raw_return = (price_tx - price_t0) / price_t0 * 100
    # For SELL/SHORT, profit is inverse
    if direction in ("SELL", "SHORT"):
        return -raw_return
    return raw_return

def calculate_scores():
    """
    Calculate accuracy scores for every KOL across all time periods.
    Scores are saved to kol_scores table and printed as a leaderboard.
    """
    session = get_session()
    kols    = session.query(KOL).all()
    periods = ["T7D", "T30D", "all"]

    print("🏆 Calculating KOL accuracy scores...\n")

    # Wipe all existing scores so stale rows (e.g. from old period logic) don't persist
    session.query(KOLScore).delete()
    session.commit()

    all_scores = []

    for kol in kols:
        recs = session.query(Recommendation).filter_by(kol_id=kol.id).all()

        if not recs:
            continue

        for period in periods:
            # Filter recs to this period's lookback window; "all" uses all recs
            if period == "all":
                window_recs = recs
            else:
                cutoff      = datetime.utcnow() - timedelta(days=PERIOD_DAYS[period])
                window_recs = [r for r in recs if r.posted_at and r.posted_at >= cutoff]

            total_calls   = len(window_recs)   # all predictions in window (incl. pending)
            correct_calls = 0
            total_return  = 0.0
            evaluated     = 0

            for rec in window_recs:
                # Get T0 price (baseline)
                t0 = session.query(PriceSnapshot).filter_by(
                    recommendation_id=rec.id,
                    snapshot_type="T0"
                ).first()

                # Use best available outcome snapshot (T1D → T7D → T30D).
                # Recent predictions won't have T7D/T30D data yet, but can
                # still be evaluated using T1D if it exists.
                tx = None
                for snap_type in ["T7D", "T30D"]:
                    tx = session.query(PriceSnapshot).filter_by(
                        recommendation_id=rec.id,
                        snapshot_type=snap_type
                    ).first()
                    if tx:
                        break

                # Win rate only counts evaluated predictions (both snapshots exist)
                if not t0 or not tx:
                    continue

                evaluated    += 1
                correct       = is_correct_call(rec.direction, t0.price, tx.price)
                ret           = get_return_pct(rec.direction, t0.price, tx.price)

                if correct:
                    correct_calls += 1
                total_return += ret

            if total_calls == 0:
                continue

            win_rate   = correct_calls / evaluated * 100 if evaluated > 0 else 0
            avg_return = total_return  / evaluated       if evaluated > 0 else 0

            # Save or update score in database
            existing = session.query(KOLScore).filter_by(
                kol_id=kol.id,
                period=period
            ).first()

            if existing:
                existing.total_calls      = total_calls
                existing.correct_calls    = correct_calls
                existing.win_rate         = win_rate
                existing.avg_return_pct   = avg_return
                existing.score_updated_at = datetime.now(timezone.utc)
            else:
                score = KOLScore(
                    kol_id           = kol.id,
                    period           = period,
                    total_calls      = total_calls,
                    correct_calls    = correct_calls,
                    win_rate         = win_rate,
                    avg_return_pct   = avg_return,
                    score_updated_at = datetime.now(timezone.utc)
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

        # Sort by win rate descending
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