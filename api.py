from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from db.models import get_session, KOL, KOLScore, Recommendation, RawTweet
from sqlalchemy import func
from datetime import datetime, timedelta
import os

app = FastAPI(title="KOL Tracker API")

# Allow frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── GET /kols ──────────────────────────────────────────────────
# Returns leaderboard — all KOLs with their scores
@app.get("/kols")
def get_kols(period: str = "T7D"):
    session = get_session()

    kols   = session.query(KOL).filter_by(is_active=True).all()
    result = []

    for kol in kols:
        score = session.query(KOLScore).filter_by(
            kol_id=kol.id,
            period=period
        ).first()

        rec_count = session.query(Recommendation).filter_by(
            kol_id=kol.id
        ).count()

        result.append({
            "id"            : kol.id,
            "handle"        : kol.handle,
            "display_name"  : kol.display_name,
            "profile_url"   : kol.profile_url,
            "content_type"  : kol.content_type,
            "followers"     : kol.followers_approx,
            "total_recs"    : rec_count,
            "score"         : {
                "period"        : period,
                "total_calls"   : score.total_calls   if score else 0,
                "correct_calls" : score.correct_calls if score else 0,
                "win_rate"      : round(score.win_rate, 1)       if score else 0,
                "avg_return"    : round(score.avg_return_pct, 2) if score else 0,
            }
        })

    # Sort by win rate descending
    result.sort(key=lambda x: x["score"]["win_rate"], reverse=True)

    session.close()
    return result


# ── GET /kols/{handle} ─────────────────────────────────────────
# Returns single KOL detail with all their recommendations
@app.get("/kols/{handle}")
def get_kol_detail(handle: str):
    session = get_session()

    kol = session.query(KOL).filter_by(handle=handle).first()
    if not kol:
        raise HTTPException(status_code=404, detail="KOL not found")

    # Get scores across all periods
    scores = {}
    for period in ["T1D", "T7D", "T30D"]:
        score = session.query(KOLScore).filter_by(
            kol_id=kol.id,
            period=period
        ).first()
        scores[period] = {
            "total_calls"   : score.total_calls   if score else 0,
            "correct_calls" : score.correct_calls if score else 0,
            "win_rate"      : round(score.win_rate, 1)       if score else 0,
            "avg_return"    : round(score.avg_return_pct, 2) if score else 0,
        }

    # Get recent recommendations
    recs = session.query(Recommendation)\
        .filter_by(kol_id=kol.id)\
        .order_by(Recommendation.posted_at.desc())\
        .limit(20)\
        .all()

    rec_list = []
    for r in recs:
        rec_list.append({
            "id"          : r.id,
            "ticker"      : r.ticker,
            "direction"   : r.direction,
            "conviction"  : r.conviction,
            "target_price": r.target_price,
            "timeframe"   : r.timeframe,
            "signal_text" : r.signal_text,
            "posted_at"   : r.posted_at.isoformat() if r.posted_at else None,
        })

    session.close()
    return {
        "handle"        : kol.handle,
        "display_name"  : kol.display_name,
        "profile_url"   : kol.profile_url,
        "content_type"  : kol.content_type,
        "last_crawled"  : kol.last_crawled_at.isoformat() if kol.last_crawled_at else None,
        "scores"        : scores,
        "recommendations": rec_list,
    }


# ── GET /search ────────────────────────────────────────────────
# Search by ticker symbol or KOL handle
@app.get("/search")
def search(q: str = Query(..., min_length=1)):
    session = get_session()
    q_upper = q.upper().lstrip("$")
    q_lower = q.lower().lstrip("@")

    # Search recommendations by ticker
    ticker_recs = session.query(Recommendation)\
        .filter(Recommendation.ticker == q_upper)\
        .order_by(Recommendation.posted_at.desc())\
        .limit(20)\
        .all()

    results = []
    for r in ticker_recs:
        kol = session.query(KOL).filter_by(id=r.kol_id).first()
        results.append({
            "type"       : "recommendation",
            "handle"     : kol.handle,
            "ticker"     : r.ticker,
            "direction"  : r.direction,
            "conviction" : r.conviction,
            "signal_text": r.signal_text,
            "posted_at"  : r.posted_at.isoformat() if r.posted_at else None,
        })

    # Search KOLs by handle
    kol_matches = session.query(KOL)\
        .filter(KOL.handle.ilike(f"%{q_lower}%"))\
        .limit(5)\
        .all()

    kol_results = []
    for kol in kol_matches:
        kol_results.append({
            "type"        : "kol",
            "handle"      : kol.handle,
            "display_name": kol.display_name,
            "content_type": kol.content_type,
            "profile_url" : kol.profile_url,
        })

    session.close()
    return {
        "query"          : q,
        "kols"           : kol_results,
        "recommendations": results,
    }


# ── POST /subscribe ────────────────────────────────────────────
# Save user email for updates
@app.post("/subscribe")
def subscribe(email: str):
    # For MVP — just save to a simple text file
    # Later replace with Supabase
    with open("subscribers.txt", "a") as f:
        f.write(f"{email}\n")
    return {"message": "Subscribed successfully"}


# ── POST /request-kol ──────────────────────────────────────────
# Let users submit KOL requests
@app.post("/request-kol")
def request_kol(handle: str, reason: str = ""):
    # For MVP — save to a text file for you to review
    with open("kol_requests.txt", "a") as f:
        f.write(f"{handle} | {reason}\n")
    return {"message": f"Request for @{handle} received. We'll review it soon!"}


# ── GET /top-assets ────────────────────────────────────────────
# Top tickers by recommendation count in the last N days
@app.get("/top-assets")
def get_top_assets(days: int = Query(7, ge=1, le=365)):
    session  = get_session()
    cutoff   = datetime.utcnow() - timedelta(days=days)

    rows = session.query(
        Recommendation.ticker,
        func.count(Recommendation.id).label("total"),
        func.sum(
            func.case((Recommendation.direction == "BUY", 1), else_=0)
        ).label("buy_count"),
        func.sum(
            func.case((Recommendation.direction.in_(["SELL", "SHORT"]), 1), else_=0)
        ).label("sell_count"),
    ).filter(
        Recommendation.posted_at >= cutoff
    ).group_by(
        Recommendation.ticker
    ).order_by(
        func.count(Recommendation.id).desc()
    ).limit(10).all()

    result = []
    for row in rows:
        result.append({
            "ticker"    : row.ticker,
            "total"     : row.total,
            "buy_count" : row.buy_count  or 0,
            "sell_count": row.sell_count or 0,
        })

    session.close()
    return result


# ── GET /stats ─────────────────────────────────────────────────
# Quick platform stats for homepage
@app.get("/stats")
def get_stats():
    session    = get_session()
    kol_count  = session.query(KOL).filter_by(is_active=True).count()
    rec_count  = session.query(Recommendation).count()
    tweet_count= session.query(RawTweet).count()
    session.close()
    return {
        "kols_tracked"      : kol_count,
        "recommendations"   : rec_count,
        "tweets_analyzed"   : tweet_count,
    }