import yfinance as yf
import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from datetime import datetime, timedelta, timezone
from db.models import get_session, Recommendation, PriceSnapshot

def get_stock_price(ticker: str, target_date: datetime) -> float:
    """
    Fetch the closing stock price for a ticker on a specific date.
    If market was closed that day, returns the nearest available price.
    """
    try:
        stock = yf.Ticker(ticker)

        # Fetch a small window around the target date
        start = target_date - timedelta(days=5)
        end   = target_date + timedelta(days=2)

        hist = stock.history(start=start.strftime('%Y-%m-%d'),
                             end=end.strftime('%Y-%m-%d'))

        if hist.empty:
            return None

        # Find the closest date to our target
        target_str = target_date.strftime('%Y-%m-%d')
        hist.index = hist.index.strftime('%Y-%m-%d')

        if target_str in hist.index:
            return round(float(hist.loc[target_str, 'Close']), 2)
        else:
            # Market was closed (weekend/holiday) — use nearest available
            return round(float(hist['Close'].iloc[-1]), 2)

    except Exception as e:
        print(f"  ⚠️  Price fetch failed for {ticker} on {target_date}: {e}")
        return None


def snapshot_exists(session, recommendation_id: int, snapshot_type: str) -> bool:
    """Check if we already have this price snapshot to avoid duplicates."""
    return session.query(PriceSnapshot).filter_by(
        recommendation_id=recommendation_id,
        snapshot_type=snapshot_type
    ).first() is not None


def fetch_price_snapshots():
    """
    For every recommendation, fetch price at T0, T1D, T7D, T30D.
    Skips snapshots that already exist or are not yet due.
    """
    session = get_session()
    recs    = session.query(Recommendation).all()
    now     = datetime.now(timezone.utc)

    print(f"📊 Fetching price snapshots for {len(recs)} recommendations...")

    # Define snapshot windows
    snapshots = [
        ("T0",   timedelta(days=0)),
        ("T7D",  timedelta(days=7)),
        ("T30D", timedelta(days=30)),
    ]

    added   = 0
    skipped = 0

    for rec in recs:
        # Make posted_at timezone-aware for comparison
        posted_at = rec.posted_at
        if posted_at.tzinfo is None:
            posted_at = posted_at.replace(tzinfo=timezone.utc)

        for snap_type, delta in snapshots:
            target_date = posted_at + delta

            # Skip if snapshot not yet due (future date)
            if target_date > now:
                skipped += 1
                continue

            # Skip if already fetched
            if snapshot_exists(session, rec.id, snap_type):
                skipped += 1
                continue

            # Fetch the price
            price = get_stock_price(rec.ticker, target_date)

            if price:
                snapshot = PriceSnapshot(
                    recommendation_id = rec.id,
                    ticker            = rec.ticker,
                    snapshot_date     = target_date,
                    price             = price,
                    snapshot_type     = snap_type,
                )
                session.add(snapshot)
                added += 1
                print(f"  ✅ ${rec.ticker} {snap_type}: ${price} "
                      f"(rec #{rec.id}, {rec.direction})")
            else:
                skipped += 1

    session.commit()
    session.close()

    print(f"\n── Price Snapshot Summary ──────────────")
    print(f"  Snapshots added   : {added}")
    print(f"  Skipped/not due   : {skipped}")

    return added

if __name__ == "__main__":
    fetch_price_snapshots()