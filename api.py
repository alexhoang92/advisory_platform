from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from db.models import get_session, KOL, KOLScore, Recommendation, RawTweet, PriceSnapshot, KOLRequest, Subscriber, Waitlist, KOLFollow
from sqlalchemy import func, case
from datetime import datetime, timedelta
import os
import math
import threading
import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
import resend
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

load_dotenv()

DEPLOYED_URL = "https://web-production-94c5.up.railway.app"

# ── Social-proof baseline counts ──────────────────────────────
# Real signups add on top of these defaults.
# Keeps counts credible from day one without fabricating data.
SUBSCRIBER_BASE_COUNT = 1122  # added to real subscriber count in /stats

_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(
        dsn         = _sentry_dsn,
        integrations= [FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate = 0.1,
        environment = "production",
    )
else:
    print("ℹ️  SENTRY_DSN not set — error monitoring disabled")
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

@app.get("/disclaimer", include_in_schema=False)
def serve_disclaimer():
    return FileResponse("frontend/disclaimer.html")

@app.get("/how-it-works", include_in_schema=False)
def serve_how_it_works():
    return FileResponse("frontend/how-it-works.html")

@app.get("/kol/{handle}", include_in_schema=False)
def serve_kol_profile(handle: str):
    return FileResponse("frontend/index.html")

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
    Uses a single yf.download() batch call instead of one call per ticker."""
    now_dt = datetime.utcnow()
    uncached = [
        t for t in tickers
        if t not in ticker_price_cache
        or (now_dt - ticker_price_cache[t]["fetched_at"]).total_seconds() >= 3600
    ]
    if not uncached:
        return
    try:
        raw = yf.download(uncached, period="2d", progress=False, auto_adjust=True, threads=True)
        if raw.empty:
            return
        close = raw["Close"]
        if isinstance(close, pd.Series):
            # Single ticker — close is a Series
            col = close.dropna()
            if not col.empty:
                ticker_price_cache[uncached[0]] = {
                    "price": round(float(col.iloc[-1]), 2),
                    "fetched_at": now_dt,
                }
        else:
            # Multiple tickers — close is a DataFrame with ticker columns
            for ticker in uncached:
                try:
                    col = close[ticker].dropna()
                    if not col.empty:
                        ticker_price_cache[ticker] = {
                            "price": round(float(col.iloc[-1]), 2),
                            "fetched_at": now_dt,
                        }
                except Exception:
                    pass
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


# ── Leaderboard cache (5-minute TTL) ───────────────────────────
_leaderboard_cache: dict = {}  # {period: {"data": list, "ts": datetime}}

# ── KOL profile cache (2-minute TTL) ───────────────────────────
# Caches expensive rec_computed + activity stats per handle.
# is_followed and pagination are always computed fresh.
_kol_profile_cache: dict = {}  # {handle: {"data": dict, "ts": datetime}}

# ── GET /kols ──────────────────────────────────────────────────
# Returns leaderboard — all KOLs with their scores
@app.get("/kols")
def get_kols(period: str = "T7D"):
    now = datetime.utcnow()
    cached = _leaderboard_cache.get(period)
    if cached and (now - cached["ts"]).total_seconds() < 300:
        return cached["data"]

    session = get_session()

    # 1 query: all active KOLs
    kols    = session.query(KOL).filter_by(is_active=True).all()
    kol_ids = [k.id for k in kols]

    # 2 query: scores for requested period (batch)
    scores     = session.query(KOLScore).filter(
        KOLScore.kol_id.in_(kol_ids),
        KOLScore.period == period
    ).all()
    score_map  = {s.kol_id: s for s in scores}

    # 3 query: recommendation counts per KOL (aggregated)
    rec_rows   = session.query(
        Recommendation.kol_id,
        func.count(Recommendation.id)
    ).filter(Recommendation.kol_id.in_(kol_ids)).group_by(Recommendation.kol_id).all()
    rec_map    = {kol_id: cnt for kol_id, cnt in rec_rows}

    # 4 query: real follow counts per handle (aggregated)
    handles    = [k.handle for k in kols]
    follow_rows = session.query(
        KOLFollow.kol_handle,
        func.count(KOLFollow.id)
    ).filter(
        KOLFollow.kol_handle.in_(handles),
        KOLFollow.is_active == True
    ).group_by(KOLFollow.kol_handle).all()
    follow_map = {h: cnt for h, cnt in follow_rows}

    result = []
    for kol in kols:
        score            = score_map.get(kol.id)
        rec_count        = rec_map.get(kol.id, 0)
        displayed_follows = kol.follower_base + follow_map.get(kol.handle, 0)

        result.append({
            "id"            : kol.id,
            "handle"        : kol.handle,
            "display_name"  : kol.display_name,
            "profile_url"   : kol.profile_url,
            "content_type"  : kol.content_type,
            "followers"     : kol.followers_approx,
            "follower_count": displayed_follows,
            "total_recs"    : rec_count,
            "score"         : {
                "period"        : period,
                "total_calls"   : score.total_calls   if score else 0,
                "correct_calls" : score.correct_calls if score else 0,
                "win_rate"      : round(score.win_rate, 1)       if score else 0,
                "avg_return"    : round(score.avg_return_pct, 2) if score else 0,
            }
        })

    result.sort(key=lambda x: x["score"]["win_rate"], reverse=True)
    session.close()

    _leaderboard_cache[period] = {"data": result, "ts": now}
    return result


# ── GET /kols/{handle} ─────────────────────────────────────────
# Returns comprehensive KOL profile data with performance, ranking, history
@app.get("/kols/{handle}")
def get_kol_detail(
    handle   : str,
    period   : str = Query("T7D"),
    email    : str = Query(""),
    filter   : str = Query("all"),
    page     : int = Query(1, ge=1),
    per_page : int = Query(20, ge=1, le=100),
):
    session = get_session()
    kol = session.query(KOL).filter_by(handle=handle).first()
    if not kol:
        session.close()
        raise HTTPException(status_code=404, detail="KOL not found")

    now   = datetime.utcnow()
    today = now.date()

    # ── IDENTITY (always fresh — user-specific) ────────────────
    real_follows   = session.query(KOLFollow).filter_by(
        kol_handle=handle, is_active=True
    ).count()
    follower_count = kol.follower_base + real_follows
    is_followed = False
    if email:
        is_followed = session.query(KOLFollow).filter_by(
            email=email, kol_handle=handle, is_active=True
        ).first() is not None

    last_crawled_fmt = (
        kol.last_crawled_at.strftime("%b %d, %Y") if kol.last_crawled_at else None
    )

    # ── CHECK PROFILE CACHE (2-min TTL) ───────────────────────
    _cached = _kol_profile_cache.get(handle)
    if _cached and (now - _cached["ts"]).total_seconds() < 120:
        _cd            = _cached["data"]
        rec_computed   = _cd["rec_computed"]
        total_tweets   = _cd["total_tweets"]
        first_tweet_dt = _cd["first_tweet_dt"]
        last_tweet_dt  = _cd["last_tweet_dt"]
        buy_count_all  = _cd["buy_count_all"]
        sell_count_all = _cd["sell_count_all"]
        hold_count_all = _cd["hold_count_all"]
    else:
        # ── ACTIVITY STATS — 1 query instead of 3 ─────────────
        total_tweets, first_tweet_dt, last_tweet_dt = session.query(
            func.count(RawTweet.id),
            func.min(RawTweet.posted_at),
            func.max(RawTweet.posted_at),
        ).filter(RawTweet.kol_id == kol.id).one()

        # ── ALL-TIME RECS ──────────────────────────────────────
        all_recs = session.query(Recommendation).filter_by(kol_id=kol.id).all()

        buy_count_all  = sum(1 for r in all_recs if r.direction in ("BUY",  "LONG"))
        sell_count_all = sum(1 for r in all_recs if r.direction in ("SELL", "SHORT"))
        hold_count_all = sum(1 for r in all_recs if r.direction == "HOLD")

        # ── T0 SNAPSHOTS (batch) ───────────────────────────────
        all_rec_ids = [r.id for r in all_recs]
        t0_snaps: dict = {}
        if all_rec_ids:
            for s in session.query(PriceSnapshot).filter(
                PriceSnapshot.recommendation_id.in_(all_rec_ids),
                PriceSnapshot.snapshot_type == "T0",
            ).all():
                t0_snaps[s.recommendation_id] = s.price

        # ── CURRENT PRICES — single batch yfinance call ────────
        tickers_with_t0 = {r.ticker for r in all_recs if t0_snaps.get(r.id) is not None}
        _refresh_price_cache(tickers_with_t0)

        # ── COMPUTE STATUS FOR ALL RECS (one pass) ────────────
        rec_computed = []
        for r in all_recs:
            price_at_call = t0_snaps.get(r.id)
            current_price = (
                ticker_price_cache.get(r.ticker, {}).get("price")
                if price_at_call else None
            )
            pct, status = _price_change_and_status(r.direction, price_at_call, current_price)
            posted_date = r.posted_at.date() if r.posted_at else None
            days_since  = (today - posted_date).days if posted_date else None

            rec_computed.append({
                "id"                  : r.id,
                "ticker"              : r.ticker,
                "direction"           : r.direction,
                "conviction"          : r.conviction,
                "posted_at_dt"        : r.posted_at,
                "posted_at_formatted" : r.posted_at.strftime("%b %d, %Y") if r.posted_at else None,
                "days_since_call"     : days_since,
                "price_at_call"       : price_at_call,
                "current_price"       : current_price,
                "price_change_pct"    : pct,
                "call_status"         : status,
                "signal_text"         : (r.signal_text[:100] if r.signal_text else None),
            })

        _kol_profile_cache[handle] = {
            "ts": now,
            "data": {
                "rec_computed"  : rec_computed,
                "total_tweets"  : total_tweets,
                "first_tweet_dt": first_tweet_dt,
                "last_tweet_dt" : last_tweet_dt,
                "buy_count_all" : buy_count_all,
                "sell_count_all": sell_count_all,
                "hold_count_all": hold_count_all,
            },
        }

    # ── DERIVED ACTIVITY FIELDS ────────────────────────────────
    active_since = first_tweet_dt.strftime("%b %Y") if first_tweet_dt else None
    if last_tweet_dt:
        days_ago    = (now - last_tweet_dt).days
        last_active = (
            f"{days_ago} days ago" if days_ago < 30
            else last_tweet_dt.strftime("%b %d, %Y")
        )
    else:
        last_active = None

    total_all = buy_count_all + sell_count_all + hold_count_all
    buy_pct   = round(buy_count_all  / total_all * 100, 1) if total_all > 0 else 0
    sell_pct  = round(sell_count_all / total_all * 100, 1) if total_all > 0 else 0
    hold_pct  = round(hold_count_all / total_all * 100, 1) if total_all > 0 else 0

    avg_calls_per_week = 0.0
    if first_tweet_dt and total_all > 0:
        weeks = max(1, (now - first_tweet_dt).days / 7)
        avg_calls_per_week = max(0.1, round(total_all / weeks, 1))

    rec_computed_sorted = sorted(
        rec_computed,
        key=lambda x: x["posted_at_dt"] or datetime.min,
        reverse=True,
    )

    # ── PERFORMANCE FOR SELECTED PERIOD ───────────────────────
    period_days_map = {"T1D": 1, "T7D": 7, "T30D": 30}
    if period in period_days_map:
        cutoff      = now - timedelta(days=period_days_map[period])
        period_recs = [r for r in rec_computed if r["posted_at_dt"] and r["posted_at_dt"] >= cutoff]
    else:
        period_recs = rec_computed

    correct_count = sum(1 for r in period_recs if r["call_status"] == "correct")
    wrong_count   = sum(1 for r in period_recs if r["call_status"] == "wrong")
    pending_count = sum(1 for r in period_recs if r["call_status"] == "pending")
    returns       = [
        r["price_change_pct"]
        for r in period_recs
        if r["price_change_pct"] is not None and r["call_status"] in ("correct", "wrong")
    ]

    total_calls_period = len(period_recs)
    win_rate       = (
        round(correct_count / (correct_count + wrong_count) * 100, 1)
        if (correct_count + wrong_count) > 0 else None
    )
    avg_return_pct = round(sum(returns) / len(returns), 1) if returns else None

    # ── RANKING — reuse leaderboard cache when warm ────────────
    cached_lb = _leaderboard_cache.get("T7D")
    if cached_lb and (now - cached_lb["ts"]).total_seconds() < 300:
        ranked = sorted(
            [r for r in cached_lb["data"] if r["score"]["total_calls"] > 0],
            key=lambda x: x["score"]["win_rate"], reverse=True,
        )
        total_kols_ranked = len(ranked)
        my_rank   = next((i + 1 for i, r in enumerate(ranked) if r["handle"] == handle), None)
        my_t7d_wr = next((r["score"]["win_rate"] for r in ranked if r["handle"] == handle), None)
    else:
        t7d_scored = session.query(KOL, KOLScore).join(
            KOLScore, KOL.id == KOLScore.kol_id
        ).filter(
            KOL.is_active == True,
            KOLScore.period == "T7D",
            KOLScore.total_calls > 0,
        ).order_by(KOLScore.win_rate.desc()).all()
        total_kols_ranked = len(t7d_scored)
        my_rank = None
        my_t7d_wr = None
        for i, (k_obj, s_obj) in enumerate(t7d_scored):
            if k_obj.handle == handle:
                my_rank   = i + 1
                my_t7d_wr = s_obj.win_rate
                break

    star_rating = None
    if my_t7d_wr is not None:
        if my_t7d_wr >= 65:   star_rating = 5
        elif my_t7d_wr >= 55: star_rating = 4
        elif my_t7d_wr >= 45: star_rating = 3
        elif my_t7d_wr >= 35: star_rating = 2
        else:                  star_rating = 1

    # ── BEST / WORST CALLS (all-time) ─────────────────────────
    def _slim(c):
        return {k: c[k] for k in (
            "ticker","direction","conviction","posted_at_formatted",
            "days_since_call","price_at_call","price_change_pct",
            "call_status","signal_text",
        )}

    correct_recs = [r for r in rec_computed if r["call_status"] == "correct"]
    wrong_recs   = [r for r in rec_computed if r["call_status"] == "wrong"]

    best_calls  = [_slim(c) for c in sorted(
        correct_recs,
        key=lambda x: x["price_change_pct"] if x["price_change_pct"] is not None else -9999,
        reverse=True,
    )[:3]]
    worst_calls = [_slim(c) for c in sorted(
        wrong_recs,
        key=lambda x: x["price_change_pct"] if x["price_change_pct"] is not None else 9999,
    )[:3]]

    # ── CALL HISTORY (paginated + filtered) ───────────────────
    hist = rec_computed_sorted

    if period in period_days_map:
        cutoff = now - timedelta(days=period_days_map[period])
        hist   = [r for r in hist if r["posted_at_dt"] and r["posted_at_dt"] >= cutoff]

    if filter == "buy":
        hist = [r for r in hist if r["direction"] in ("BUY", "LONG")]
    elif filter == "sell":
        hist = [r for r in hist if r["direction"] in ("SELL", "SHORT")]
    elif filter == "correct":
        hist = [r for r in hist if r["call_status"] == "correct"]
    elif filter == "wrong":
        hist = [r for r in hist if r["call_status"] == "wrong"]
    elif filter == "pending":
        hist = [r for r in hist if r["call_status"] == "pending"]

    total_hist_count = len(hist)
    total_pages      = max(1, math.ceil(total_hist_count / per_page))
    offset           = (page - 1) * per_page
    paged_hist       = [
        {k: v for k, v in r.items() if k not in ("id", "posted_at_dt")}
        for r in hist[offset : offset + per_page]
    ]

    session.close()
    return {
        # IDENTITY
        "handle"            : kol.handle,
        "display_name"      : kol.display_name,
        "content_type"      : kol.content_type,
        "prediction_style"  : kol.prediction_style,
        "profile_url"       : kol.profile_url,
        "is_active"         : kol.is_active,
        "last_crawled_at"   : last_crawled_fmt,
        "follower_count"    : follower_count,
        "is_followed"       : is_followed,
        # ACTIVITY
        "total_tweets_tracked": total_tweets,
        "active_since"      : active_since,
        "last_active"       : last_active,
        "avg_calls_per_week": avg_calls_per_week,
        # PERFORMANCE (selected period)
        "total_calls"       : total_calls_period,
        "correct_calls"     : correct_count,
        "wrong_calls"       : wrong_count,
        "pending_calls"     : pending_count,
        "win_rate"          : win_rate,
        "avg_return_pct"    : avg_return_pct,
        # RANKING
        "rank"              : my_rank,
        "total_kols"        : total_kols_ranked,
        "star_rating"       : star_rating,
        # CALL BREAKDOWN (all-time)
        "call_breakdown"    : {
            "total"     : total_all,
            "buy_count" : buy_count_all,
            "sell_count": sell_count_all,
            "hold_count": hold_count_all,
            "buy_pct"   : buy_pct,
            "sell_pct"  : sell_pct,
            "hold_pct"  : hold_pct,
        },
        # TOP / WORST CALLS
        "best_calls"        : best_calls,
        "worst_calls"       : worst_calls,
        # CALL HISTORY
        "call_history"      : {
            "calls"      : paged_hist,
            "total_count": total_hist_count,
            "page"       : page,
            "per_page"   : per_page,
            "total_pages": total_pages,
        },
    }


# ── POST /follow-kol ───────────────────────────────────────────
@app.post("/follow-kol")
def follow_kol(email: str, kol_handle: str):
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    session = get_session()
    kol = session.query(KOL).filter_by(handle=kol_handle).first()
    if not kol:
        session.close()
        raise HTTPException(status_code=404, detail="KOL not found")

    existing = session.query(KOLFollow).filter_by(
        email=email, kol_handle=kol_handle
    ).first()

    if existing:
        if existing.is_active:
            session.close()
            return {
                "message": f"Already following @{kol_handle}",
                "status" : "already_followed",
            }
        else:
            existing.is_active   = True
            existing.followed_at = datetime.utcnow()
    else:
        session.add(KOLFollow(email=email, kol_handle=kol_handle))

    # Upsert subscriber
    sub = session.query(Subscriber).filter_by(email=email).first()
    if not sub:
        session.add(Subscriber(email=email))
    elif not sub.is_active:
        sub.is_active = True

    session.commit()

    # Get T7D score for email body
    score = session.query(KOLScore).filter_by(kol_id=kol.id, period="T7D").first()
    win_rate_val  = round(score.win_rate, 1)  if score else 0
    total_calls_v = score.total_calls         if score else 0

    session.close()

    _send_email(
        to      = email,
        subject = f"You're now following @{kol_handle} 📈",
        html    = f"""
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;
  background:#0f0f0f;color:#e0e0e0;padding:32px;border-radius:12px">
<h2 style="color:#00ff88;margin-bottom:8px">You're following @{kol_handle}!</h2>
<p style="color:#888">We'll include their latest calls in your weekly digest every Monday morning.</p>
<div style="background:#1a1a1a;border-radius:8px;padding:16px;margin:20px 0">
  <p style="color:#888;font-size:13px;margin:0">Current performance (7 days)</p>
  <p style="color:#00ff88;font-size:28px;font-weight:800;margin:4px 0">{win_rate_val}% win rate</p>
  <p style="color:#555;font-size:13px;margin:0">Based on {total_calls_v} tracked calls</p>
</div>
<a href="{DEPLOYED_URL}/kol/{kol_handle}"
  style="display:inline-block;background:#00ff88;color:#000;
  padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none">
  View full profile →</a>
<p style="color:#555;font-size:12px;margin-top:24px">To unsubscribe reply with "unsubscribe"</p>
</div>""",
    )

    admin_email = os.getenv("ADMIN_EMAIL")
    if admin_email:
        _send_email(
            to      = admin_email,
            subject = f"New follower for @{kol_handle}: {email}",
            html    = f"<p>New follower: <strong>{email}</strong> → <strong>@{kol_handle}</strong></p>",
        )

    return {
        "message"   : f"Now following @{kol_handle}!",
        "status"    : "followed",
        "kol_handle": kol_handle,
        "email"     : email,
    }


# ── POST /unfollow-kol ─────────────────────────────────────────
@app.post("/unfollow-kol")
def unfollow_kol(email: str, kol_handle: str):
    session = get_session()
    follow  = session.query(KOLFollow).filter_by(
        email=email, kol_handle=kol_handle, is_active=True
    ).first()
    if not follow:
        session.close()
        raise HTTPException(status_code=404, detail="Follow relationship not found")

    follow.is_active = False
    session.commit()
    session.close()
    return {"message": f"Unfollowed @{kol_handle}", "status": "unfollowed"}


# ── GET /my-follows ────────────────────────────────────────────
@app.get("/my-follows")
def get_my_follows(email: str = Query(None)):
    if not email:
        raise HTTPException(status_code=400, detail="email parameter required")

    session = get_session()
    follows = (
        session.query(KOLFollow)
        .filter_by(email=email, is_active=True)
        .order_by(KOLFollow.followed_at.desc())
        .all()
    )

    result = []
    for f in follows:
        kol   = session.query(KOL).filter_by(handle=f.kol_handle).first()
        if not kol:
            continue
        score = session.query(KOLScore).filter_by(kol_id=kol.id, period="T7D").first()
        result.append({
            "handle"      : f.kol_handle,
            "display_name": kol.display_name,
            "content_type": kol.content_type,
            "win_rate"    : round(score.win_rate, 1) if score else None,
            "total_calls" : score.total_calls         if score else 0,
            "followed_at" : f.followed_at.strftime("%b %d, %Y") if f.followed_at else None,
        })

    session.close()
    return result


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
    real_subscribers = session.query(Subscriber).filter_by(is_active=True).count()
    # Display SUBSCRIBER_BASE_COUNT + real signups for social proof
    displayed_subscribers = SUBSCRIBER_BASE_COUNT + real_subscribers
    session.close()
    return {
        "kols_tracked"      : kol_count,
        "recommendations"   : rec_count,
        "tweets_analyzed"   : tweet_count,
        "total_subscribers" : displayed_subscribers,
    }


# ── GET /admin/subscribers ──────────────────────────────────────
@app.get("/admin/subscribers")
def get_subscribers(x_admin_key: str = Header(None)):
    admin_key = os.getenv("ADMIN_KEY", "changeme123")
    if x_admin_key != admin_key:
        raise HTTPException(status_code=401, detail="Invalid admin key")

    session = get_session()

    real_subs      = session.query(Subscriber).filter_by(is_active=True).count()
    total_waitlist = session.query(Waitlist).count()

    recent_subs = session.query(Subscriber)\
        .order_by(Subscriber.subscribed_at.desc()).limit(10).all()
    recent_wait = session.query(Waitlist)\
        .order_by(Waitlist.joined_at.desc()).limit(10).all()

    total_follows = session.query(KOLFollow).filter_by(is_active=True).count()

    kol_follow_counts = (
        session.query(KOLFollow.kol_handle, func.count(KOLFollow.id).label("cnt"))
        .filter_by(is_active=True)
        .group_by(KOLFollow.kol_handle)
        .order_by(func.count(KOLFollow.id).desc())
        .all()
    )

    # Build per-KOL displayed follows (base + real) for admin transparency
    kol_follow_list = []
    for row in kol_follow_counts:
        kol_obj = session.query(KOL).filter_by(handle=row.kol_handle).first()
        base    = kol_obj.follower_base if kol_obj else 0
        kol_follow_list.append({
            "kol_handle"      : row.kol_handle,
            "real_follows"    : row.cnt,
            "displayed_follows": base + row.cnt,
        })

    session.close()
    return {
        # Real subscriber count (actual DB rows) — admin-only visibility
        "real_subscribers"      : real_subs,
        # Displayed count = SUBSCRIBER_BASE_COUNT + real (what /stats returns)
        "displayed_subscribers" : SUBSCRIBER_BASE_COUNT + real_subs,
        "total_waitlist"        : total_waitlist,
        "total_follows"         : total_follows,
        "recent_subscribers"    : [
            {"email": s.email, "subscribed_at": s.subscribed_at.isoformat()}
            for s in recent_subs
        ],
        "recent_waitlist"       : [
            {"email": w.email, "joined_at": w.joined_at.isoformat()}
            for w in recent_wait
        ],
        "kol_follows"           : kol_follow_list,
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

    # Pre-build KOL follow data: {email: [kol_handle, ...]}
    all_follows = session.query(KOLFollow).filter_by(is_active=True).all()
    email_follows: dict = {}
    for f in all_follows:
        email_follows.setdefault(f.email, []).append(f.kol_handle)

    # Pre-fetch recent calls (last 7 days) per KOL handle for digest
    rec_cutoff   = datetime.utcnow() - timedelta(days=7)
    recent_recs  = session.query(Recommendation, KOL).join(
        KOL, KOL.id == Recommendation.kol_id
    ).filter(Recommendation.posted_at >= rec_cutoff).all()

    kol_recent: dict = {}
    for rec, kol_obj in recent_recs:
        kol_recent.setdefault(kol_obj.handle, []).append(rec)

    # Build general top-performers block (reused for non-followers)
    general_rows_html = "".join(
        f"<tr><td style='padding:8px 16px;'><a href='{DEPLOYED_URL}/kol/{h}'"
        f" style='color:#00ff88;text-decoration:none;'>@{h}</a></td>"
        f"<td style='padding:8px 16px;text-align:center;'>{round(wr,1)}%</td>"
        f"<td style='padding:8px 16px;text-align:center;'>{calls}</td></tr>"
        for h, wr, calls in top5
    )
    general_block = f"""
<h2 style="color:#00ff88;">Top Performers This Week</h2>
<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
  <thead>
    <tr style="background:#1a1a1a;color:#888;font-size:12px;">
      <th style="padding:8px 16px;text-align:left;">Handle</th>
      <th style="padding:8px 16px;">Win Rate</th>
      <th style="padding:8px 16px;">Predictions</th>
    </tr>
  </thead>
  <tbody>{general_rows_html}</tbody>
</table>"""

    assets_block = f"""
<h2 style="color:#00ff88;margin-top:24px;">Most Predicted Assets This Week</h2>
<ul>{asset_list_html}</ul>"""

    sent = 0
    for sub in subscribers:
        followed_handles = email_follows.get(sub.email, [])
        has_follows = bool(followed_handles)

        if has_follows:
            subject = "This week: your followed KOLs' latest calls 📊"
            # Build followed KOLs section
            followed_section = "<h2 style='color:#00ff88;'>Your Followed KOLs</h2>"
            for h in followed_handles:
                h_score = next((s for name, s_wr, s_calls in top5 if name == h), None)
                kol_recs = kol_recent.get(h, [])[:3]
                rec_items = "".join(
                    f"<li style='margin-bottom:6px;'>"
                    f"<strong style='color:#fff;'>${r.ticker}</strong> "
                    f"<span style='color:#888;'>{r.direction}</span> "
                    f"<span style='color:#555;font-size:12px;'>"
                    f"{r.posted_at.strftime('%b %d') if r.posted_at else ''}</span></li>"
                    for r in kol_recs
                )
                followed_section += (
                    f"<div style='background:#1a1a1a;border-radius:8px;padding:16px;margin:12px 0;'>"
                    f"<a href='{DEPLOYED_URL}/kol/{h}' style='color:#00ff88;font-weight:700;"
                    f"text-decoration:none;'>@{h}</a>"
                    + (f"<ul style='padding-left:16px;margin-top:8px;'>{rec_items}</ul>" if rec_items else
                       "<p style='color:#555;font-size:13px;margin-top:8px;'>No new calls this week</p>")
                    + "</div>"
                )
            html_body = (
                followed_section
                + general_block
                + assets_block
                + f"<p style='margin-top:24px;'><a href='{DEPLOYED_URL}' style='color:#00ff88;'>See full leaderboard →</a></p>"
            )
        else:
            subject   = "KOL Tracker Weekly Update 📊"
            html_body = (
                general_block
                + assets_block
                + f"<p style='margin-top:24px;'><a href='{DEPLOYED_URL}' style='color:#00ff88;'>See full leaderboard →</a></p>"
            )

        _send_email(to=sub.email, subject=subject, html=html_body)
        sent += 1

    session.close()
    return {"message": f"Digest sent to {sent} subscribers."}
