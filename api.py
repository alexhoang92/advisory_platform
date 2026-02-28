from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from db.models import get_session, KOL, KOLScore, Recommendation, RawTweet, PriceSnapshot, KOLRequest, Subscriber, Waitlist
from sqlalchemy import func, case
from datetime import datetime, timedelta
import os
import threading
import yfinance as yf
from dotenv import load_dotenv
import resend

load_dotenv()

DEPLOYED_URL = "https://web-production-94c5.up.railway.app"
OWNER_EMAIL  = os.getenv("OWNER_EMAIL")

_resend_key = os.getenv("RESEND_API_KEY")
if _resend_key:
    resend.api_key = _resend_key
else:
    print("⚠️  RESEND_API_KEY not set — email sending disabled")

app = FastAPI(title="KOL Tracker API")

# Allow frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/", include_in_schema=False)
def serve_frontend():
    return FileResponse("frontend/index.html")

@app.get("/robots.txt", include_in_schema=False)
def robots():
    return FileResponse("frontend/robots.txt")

@app.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    return FileResponse("frontend/sitemap.xml")

# ── Email helper ───────────────────────────────────────────────
def _send_email(to: str, subject: str, html: str):
    """Send email via Resend. No-op if RESEND_API_KEY is missing."""
    if not _resend_key:
        return
    try:
        resend.Emails.send({
            "from"   : "KOL Tracker <onboarding@resend.dev>",
            "to"     : [to],
            "subject": subject,
            "html"   : html,
        })
    except Exception as e:
        print(f"⚠️  Email send failed ({to}): {e}")


# ── Ticker price cache (expires after 60 minutes) ──────────────
# Structure: {ticker: {"price": 123.45, "fetched_at": datetime}}
ticker_price_cache: dict = {}


def _refresh_price_cache(tickers: set):
    """Fetch current prices for tickers not in cache or with expired (>60 min) entries.
    Never called inside a per-recommendation loop — always batched first."""
    now_dt = datetime.utcnow()
    uncached = [
        t for t in tickers
        if t not in ticker_price_cache
        or (now_dt - ticker_price_cache[t]["fetched_at"]).total_seconds() >= 3600
    ]
    for ticker in uncached:
        try:
            stock = yf.Ticker(ticker)
            price = stock.fast_info.last_price
            if price:
                ticker_price_cache[ticker] = {
                    "price": round(float(price), 2),
                    "fetched_at": now_dt,
                }
        except Exception:
            pass


def _price_change_and_status(direction: str, price_at_call, current_price):
    """Compute price_change_pct and call_status from direction + prices."""
    price_change_pct = None
    call_status = "pending"

    if price_at_call is not None and current_price is not None and price_at_call > 0:
        price_change_pct = round(((current_price - price_at_call) / price_at_call) * 100, 1)

    if price_at_call is not None and price_change_pct is not None:
        if direction in ("BUY", "LONG"):
            call_status = "correct" if price_change_pct > 0 else "wrong"
        elif direction in ("SELL", "SHORT"):
            call_status = "correct" if price_change_pct < 0 else "wrong"

    return price_change_pct, call_status


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
# Returns single KOL detail with recommendations and per-call performance
@app.get("/kols/{handle}")
def get_kol_detail(handle: str, period: str = Query("all")):
    session = get_session()

    kol = session.query(KOL).filter_by(handle=handle).first()
    if not kol:
        raise HTTPException(status_code=404, detail="KOL not found")

    # Get scores across all periods
    scores = {}
    for p in ["T1D", "T7D", "T30D"]:
        score = session.query(KOLScore).filter_by(kol_id=kol.id, period=p).first()
        scores[p] = {
            "total_calls"   : score.total_calls   if score else 0,
            "correct_calls" : score.correct_calls if score else 0,
            "win_rate"      : round(score.win_rate, 1)       if score else 0,
            "avg_return"    : round(score.avg_return_pct, 2) if score else 0,
        }

    # Filter predictions by posting-date window matching the period.
    # This ensures the list count matches kol_scores.total_calls, and that
    # 30D shows more predictions than 7D which shows more than 1D.
    now = datetime.utcnow()
    period_days = {"T1D": 1, "T7D": 7, "T30D": 30}
    query = session.query(Recommendation).filter_by(kol_id=kol.id)
    if period in period_days:
        cutoff = now - timedelta(days=period_days[period])
        recs = query.filter(Recommendation.posted_at >= cutoff)\
                    .order_by(Recommendation.posted_at.desc()).all()
    else:
        # "all" — show last 50 regardless of date
        recs = query.order_by(Recommendation.posted_at.desc()).limit(50).all()

    # Batch-fetch T0 price snapshots for all recs (no N+1)
    rec_ids = [r.id for r in recs]
    t0_snapshots: dict = {}
    if rec_ids:
        snap_rows = session.query(PriceSnapshot).filter(
            PriceSnapshot.recommendation_id.in_(rec_ids),
            PriceSnapshot.snapshot_type == "T0"
        ).all()
        for s in snap_rows:
            t0_snapshots[s.recommendation_id] = s.price

    # Batch-fetch current prices — NEVER inside the rec loop
    tickers_needing_price = {r.ticker for r in recs if t0_snapshots.get(r.id) is not None}
    _refresh_price_cache(tickers_needing_price)

    # Build recommendation list with performance data
    today = now.date()
    rec_list = []
    for r in recs:
        price_at_call = t0_snapshots.get(r.id)
        current_price = ticker_price_cache.get(r.ticker, {}).get("price") if price_at_call else None
        price_change_pct, call_status = _price_change_and_status(
            r.direction, price_at_call, current_price
        )

        posted_date = r.posted_at.date() if r.posted_at else None
        days_since  = (today - posted_date).days if posted_date else None

        rec_list.append({
            "id"                 : r.id,
            "ticker"             : r.ticker,
            "direction"          : r.direction,
            "conviction"         : r.conviction,
            "target_price"       : r.target_price,
            "timeframe"          : r.timeframe,
            "signal_text"        : r.signal_text,
            "posted_at"          : r.posted_at.isoformat() if r.posted_at else None,
            "posted_at_formatted": r.posted_at.strftime("%b %d, %Y") if r.posted_at else None,
            "days_since_call"    : days_since,
            "price_at_call"      : price_at_call,
            "current_price"      : current_price,
            "price_change_pct"   : price_change_pct,
            "call_status"        : call_status,
        })

    session.close()
    return {
        "handle"         : kol.handle,
        "display_name"   : kol.display_name,
        "profile_url"    : kol.profile_url,
        "content_type"   : kol.content_type,
        "last_crawled"   : kol.last_crawled_at.isoformat() if kol.last_crawled_at else None,
        "scores"         : scores,
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
@app.post("/subscribe")
def subscribe(email: str):
    session = get_session()
    existing = session.query(Subscriber).filter_by(email=email).first()
    if existing:
        session.close()
        return {"message": "Already subscribed!"}

    sub = Subscriber(email=email)
    session.add(sub)
    session.commit()
    session.close()

    # Welcome email to subscriber
    _send_email(
        to      = email,
        subject = "You're on the list 📈",
        html    = f"""
<h2>Welcome to KOL Tracker!</h2>
<p>You're now tracking who actually calls it right on Stock Twitter.</p>
<p>We'll send you weekly leaderboard updates every Monday morning.</p>
<p><a href="{DEPLOYED_URL}">View the leaderboard →</a></p>
<p style="color:#888;font-size:12px">To unsubscribe reply with "unsubscribe"</p>
""",
    )

    # Notify owner
    if OWNER_EMAIL:
        _send_email(
            to      = OWNER_EMAIL,
            subject = f"New KOL Tracker subscriber: {email}",
            html    = f"<p>New subscriber: <strong>{email}</strong></p>",
        )

    return {"message": "Subscribed! Check your inbox."}


# ── POST /waitlist ──────────────────────────────────────────────
@app.post("/waitlist")
def join_waitlist(email: str):
    session = get_session()
    existing = session.query(Waitlist).filter_by(email=email).first()
    if existing:
        session.close()
        return {"message": "Already on the waitlist!"}

    entry = Waitlist(email=email)
    session.add(entry)
    session.commit()
    session.close()

    # Confirmation email to user
    _send_email(
        to      = email,
        subject = "You're on the waitlist 🚀",
        html    = f"""
<h2>You're on the waitlist!</h2>
<p>We'll notify you when premium features launch — and you'll get 3 months free as an early supporter.</p>
<p><a href="{DEPLOYED_URL}">View the leaderboard →</a></p>
""",
    )

    # Notify owner
    if OWNER_EMAIL:
        _send_email(
            to      = OWNER_EMAIL,
            subject = f"New KOL Tracker waitlist: {email}",
            html    = f"<p>New waitlist signup: <strong>{email}</strong></p>",
        )

    return {"message": "You're on the waitlist!"}


# ── POST /request-kol ──────────────────────────────────────────
# Let users submit KOL requests — saves to file AND database
@app.post("/request-kol")
def request_kol(handle: str, reason: str = ""):
    # Keep legacy text file
    with open("kol_requests.txt", "a") as f:
        f.write(f"{handle} | {reason}\n")

    # Also persist to database for admin review
    session = get_session()
    req = KOLRequest(handle=handle, reason=reason, status="pending")
    session.add(req)
    session.commit()
    session.close()

    return {"message": f"Request for @{handle} received. We'll review it soon!"}


# ── GET /admin/pending-requests ────────────────────────────────
# Returns all pending KOL requests (protected by X-Admin-Key)
@app.get("/admin/pending-requests")
def get_pending_requests(x_admin_key: str = Header(None)):
    admin_key = os.getenv("ADMIN_KEY", "changeme123")
    if x_admin_key != admin_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")

    session = get_session()
    requests = session.query(KOLRequest).filter_by(status="pending").all()
    result = [
        {
            "id"          : r.id,
            "handle"      : r.handle,
            "reason"      : r.reason,
            "requested_at": r.requested_at.isoformat() if r.requested_at else None,
            "status"      : r.status,
        }
        for r in requests
    ]
    session.close()
    return result


# ── POST /admin/approve-kol ────────────────────────────────────
# Approve a KOL request, add to tracking, kick off pipeline
@app.post("/admin/approve-kol")
def approve_kol(handle: str, x_admin_key: str = Header(None)):
    admin_key = os.getenv("ADMIN_KEY", "changeme123")
    if x_admin_key != admin_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")

    session = get_session()

    # Mark request as approved (latest request for this handle)
    req = session.query(KOLRequest).filter_by(handle=handle)\
        .order_by(KOLRequest.id.desc()).first()
    request_found = req is not None
    if req:
        req.status = "approved"

    # Add to kols table if not already present
    existing_kol = session.query(KOL).filter_by(handle=handle).first()
    kol_added = False
    if not existing_kol:
        new_kol = KOL(
            handle       = handle,
            display_name = handle,
            profile_url  = f"https://x.com/{handle}",
            content_type = "stock picks",
            is_active    = True,
        )
        session.add(new_kol)
        kol_added = True
    else:
        existing_kol.is_active = True

    session.commit()
    session.close()

    # Run full pipeline in background so HTTP request returns immediately
    def run_pipeline_bg():
        try:
            from crawler.apify_scraper import scrape_kol_tweets as _scrape
            from parser.llm_parser import run_parser as _parse
            from pricer.yfinance_fetch import fetch_price_snapshots as _price
            from scorer.score_calculator import calculate_scores as _score
            from db.models import get_session as _gs, RawTweet as _RT

            print(f"🔄 Pipeline starting for newly approved KOL: @{handle}")
            _scrape(max_per_run=100)

            while True:
                s = _gs()
                remaining = s.query(_RT).filter_by(is_parsed=False, is_retweet=False).count()
                s.close()
                if remaining == 0:
                    break
                _parse(batch_size=100)

            _price()
            _score()
            print(f"✅ Pipeline complete for @{handle}")
        except Exception as e:
            print(f"❌ Background pipeline failed for @{handle}: {e}")

    threading.Thread(target=run_pipeline_bg, daemon=True).start()

    return {
        "handle"          : handle,
        "kol_added"       : kol_added,
        "request_approved": request_found,
        "message"         : f"@{handle} approved and added. Pipeline running in background.",
    }


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
            case((Recommendation.direction == "BUY", 1), else_=0)
        ).label("buy_count"),
        func.sum(
            case((Recommendation.direction.in_(["SELL", "SHORT"]), 1), else_=0)
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


# ── GET /asset/{ticker} ────────────────────────────────────────
# All predictions for a ticker in the last N days, with performance data
@app.get("/asset/{ticker}")
def get_asset_detail(ticker: str, days: int = Query(7, ge=1, le=365)):
    session = get_session()
    ticker  = ticker.upper()
    cutoff  = datetime.utcnow() - timedelta(days=days)

    recs = session.query(Recommendation).filter(
        Recommendation.ticker   == ticker,
        Recommendation.posted_at >= cutoff
    ).order_by(Recommendation.posted_at.desc()).all()

    if not recs:
        session.close()
        return {
            "ticker": ticker, "days": days,
            "total": 0, "buy_count": 0, "sell_count": 0,
            "predictions": [],
        }

    # Batch-fetch T0 price snapshots
    rec_ids = [r.id for r in recs]
    t0_snapshots: dict = {}
    snap_rows = session.query(PriceSnapshot).filter(
        PriceSnapshot.recommendation_id.in_(rec_ids),
        PriceSnapshot.snapshot_type == "T0"
    ).all()
    for s in snap_rows:
        t0_snapshots[s.recommendation_id] = s.price

    # Refresh cache for this single ticker (one yfinance call, not per-rec)
    _refresh_price_cache({ticker})
    current_price = ticker_price_cache.get(ticker, {}).get("price")

    # Batch-load KOL handles
    kol_ids = list({r.kol_id for r in recs})
    kol_map = {k.id: k for k in session.query(KOL).filter(KOL.id.in_(kol_ids)).all()}

    today      = datetime.utcnow().date()
    buy_count  = 0
    sell_count = 0
    predictions = []

    for r in recs:
        kol = kol_map.get(r.kol_id)
        price_at_call = t0_snapshots.get(r.id)
        curr_price    = current_price if price_at_call else None

        price_change_pct, call_status = _price_change_and_status(
            r.direction, price_at_call, curr_price
        )

        if r.direction in ("BUY", "LONG"):
            buy_count += 1
        elif r.direction in ("SELL", "SHORT"):
            sell_count += 1

        posted_date = r.posted_at.date() if r.posted_at else None
        days_since  = (today - posted_date).days if posted_date else None

        predictions.append({
            "kol_handle"         : kol.handle if kol else "unknown",
            "direction"          : r.direction,
            "conviction"         : r.conviction,
            "posted_at_formatted": r.posted_at.strftime("%b %d, %Y") if r.posted_at else None,
            "days_since_call"    : days_since,
            "price_at_call"      : price_at_call,
            "price_change_pct"   : price_change_pct,
            "call_status"        : call_status,
            "signal_text"        : r.signal_text,
        })

    session.close()
    return {
        "ticker"     : ticker,
        "days"       : days,
        "total"      : len(predictions),
        "buy_count"  : buy_count,
        "sell_count" : sell_count,
        "predictions": predictions,
    }


# ── GET /stats ─────────────────────────────────────────────────
@app.get("/stats")
def get_stats():
    session          = get_session()
    kol_count        = session.query(KOL).filter_by(is_active=True).count()
    rec_count        = session.query(Recommendation).count()
    tweet_count      = session.query(RawTweet).count()
    subscriber_count = session.query(Subscriber).filter_by(is_active=True).count()
    session.close()
    return {
        "kols_tracked"      : kol_count,
        "recommendations"   : rec_count,
        "tweets_analyzed"   : tweet_count,
        "total_subscribers" : subscriber_count,
    }


# ── GET /admin/subscribers ──────────────────────────────────────
@app.get("/admin/subscribers")
def get_subscribers(x_admin_key: str = Header(None)):
    admin_key = os.getenv("ADMIN_KEY", "changeme123")
    if x_admin_key != admin_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")

    session = get_session()

    total_subs     = session.query(Subscriber).filter_by(is_active=True).count()
    total_waitlist = session.query(Waitlist).count()

    recent_subs = session.query(Subscriber)\
        .order_by(Subscriber.subscribed_at.desc()).limit(10).all()
    recent_wait = session.query(Waitlist)\
        .order_by(Waitlist.joined_at.desc()).limit(10).all()

    session.close()
    return {
        "total_subscribers" : total_subs,
        "total_waitlist"    : total_waitlist,
        "recent_subscribers": [
            {"email": s.email, "subscribed_at": s.subscribed_at.isoformat()}
            for s in recent_subs
        ],
        "recent_waitlist"   : [
            {"email": w.email, "joined_at": w.joined_at.isoformat()}
            for w in recent_wait
        ],
    }


# ── POST /admin/send-digest ────────────────────────────────────
@app.post("/admin/send-digest")
def send_digest(x_admin_key: str = Header(None)):
    admin_key = os.getenv("ADMIN_KEY", "changeme123")
    if x_admin_key != admin_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")

    session = get_session()

    # Top 5 KOLs by T7D win rate
    kols   = session.query(KOL).filter_by(is_active=True).all()
    scored = []
    for kol in kols:
        score = session.query(KOLScore).filter_by(kol_id=kol.id, period="T7D").first()
        if score and score.total_calls > 0:
            scored.append((kol.handle, score.win_rate, score.total_calls))
    scored.sort(key=lambda x: x[1], reverse=True)
    top5 = scored[:5]

    # Top 3 assets last 7 days
    cutoff = datetime.utcnow() - timedelta(days=7)
    rows = session.query(
        Recommendation.ticker,
        func.count(Recommendation.id).label("total"),
    ).filter(Recommendation.posted_at >= cutoff)\
     .group_by(Recommendation.ticker)\
     .order_by(func.count(Recommendation.id).desc())\
     .limit(3).all()

    # Active subscribers
    subscribers = session.query(Subscriber).filter_by(is_active=True).all()
    session.close()

    if not subscribers:
        return {"message": "No active subscribers to send to."}

    kol_rows_html = "".join(
        f"<tr><td style='padding:8px 16px;'>@{h}</td>"
        f"<td style='padding:8px 16px;text-align:center;'>{round(wr,1)}%</td>"
        f"<td style='padding:8px 16px;text-align:center;'>{calls}</td></tr>"
        for h, wr, calls in top5
    )
    asset_list_html = "".join(
        f"<li><strong>${r.ticker}</strong> — {r.total} predictions</li>"
        for r in rows
    )

    html_body = f"""
<h2 style="color:#00ff88;">This Week's Top Performers</h2>
<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
  <thead>
    <tr style="background:#1a1a1a;color:#888;font-size:12px;">
      <th style="padding:8px 16px;text-align:left;">Handle</th>
      <th style="padding:8px 16px;">Win Rate</th>
      <th style="padding:8px 16px;">Predictions</th>
    </tr>
  </thead>
  <tbody>
    {kol_rows_html}
  </tbody>
</table>
<h2 style="color:#00ff88;margin-top:24px;">Most Predicted Assets This Week</h2>
<ul>{asset_list_html}</ul>
<p style="margin-top:24px;"><a href="{DEPLOYED_URL}" style="color:#00ff88;">See full leaderboard →</a></p>
"""

    sent = 0
    for sub in subscribers:
        _send_email(
            to      = sub.email,
            subject = "KOL Tracker Weekly Update 📊",
            html    = html_body,
        )
        sent += 1

    return {"message": f"Digest sent to {sent} subscribers."}
