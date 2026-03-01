from sqlalchemy import create_engine, Column, Integer, BigInteger, String, Text, Boolean, DateTime, Float, Enum, UniqueConstraint, Index
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

Base = declarative_base()

# ── Table 1: KOLs ──────────────────────────────────────────────
class KOL(Base):
    __tablename__ = "kols"

    id               = Column(Integer, primary_key=True)
    handle           = Column(String(100), unique=True, nullable=False)
    display_name     = Column(String(200))
    profile_url      = Column(String(500))
    followers_approx = Column(Integer)
    content_type     = Column(String(100))
    prediction_style = Column(String(100))
    is_active        = Column(Boolean, default=True)
    last_crawled_at  = Column(DateTime, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    # Baseline follower count for social proof — assigned once randomly (10–20)
    # Real KOLFollow rows are added on top at display time
    follower_base    = Column(Integer, default=0, nullable=False)

# ── Table 2: Raw Tweets ────────────────────────────────────────
class RawTweet(Base):
    __tablename__ = "raw_tweets"

    id          = Column(BigInteger, primary_key=True)  # Twitter's own tweet ID
    kol_id      = Column(Integer, nullable=False)
    text        = Column(Text, nullable=False)
    posted_at   = Column(DateTime, nullable=False)
    likes       = Column(Integer, default=0)
    retweets    = Column(Integer, default=0)
    replies     = Column(Integer, default=0)
    quotes      = Column(Integer, default=0)
    url         = Column(String(500))
    is_reply    = Column(Boolean, default=False)
    is_retweet  = Column(Boolean, default=False)
    is_parsed   = Column(Boolean, default=False)
    crawled_at  = Column(DateTime, default=datetime.utcnow)

# ── Table 3: Parsed Recommendations ───────────────────────────
class Recommendation(Base):
    __tablename__ = "recommendations"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    tweet_id         = Column(BigInteger, nullable=False)
    kol_id           = Column(Integer, nullable=False)
    ticker           = Column(String(10), nullable=False)
    direction        = Column(String(10), nullable=False)   # BUY / SELL / SHORT / HOLD
    conviction       = Column(String(10))                   # HIGH / MEDIUM / LOW
    price_at_mention = Column(Float, nullable=True)
    target_price     = Column(Float, nullable=True)
    timeframe        = Column(String(50))
    signal_text      = Column(Text)
    parse_method     = Column(String(20), default="llm")
    posted_at        = Column(DateTime)
    created_at       = Column(DateTime, default=datetime.utcnow)

# ── Table 4: Price Snapshots ───────────────────────────────────
class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    recommendation_id = Column(Integer, nullable=False)
    ticker            = Column(String(10), nullable=False)
    snapshot_date     = Column(DateTime, nullable=False)
    price             = Column(Float, nullable=False)
    snapshot_type     = Column(String(10), nullable=False)  # T0, T1D, T7D, T30D, T90D
    created_at        = Column(DateTime, default=datetime.utcnow)

# ── Table 5: KOL Scores ────────────────────────────────────────
class KOLScore(Base):
    __tablename__ = "kol_scores"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    kol_id           = Column(Integer, nullable=False)
    period           = Column(String(20), nullable=False)   # 7D, 30D, 90D, all_time
    total_calls      = Column(Integer, default=0)
    correct_calls    = Column(Integer, default=0)
    win_rate         = Column(Float, default=0.0)
    avg_return_pct   = Column(Float, default=0.0)
    score_updated_at = Column(DateTime, default=datetime.utcnow)

# ── Table 6: KOL Requests ──────────────────────────────────────
class KOLRequest(Base):
    __tablename__ = "kol_requests"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    handle       = Column(String(100), nullable=False)
    reason       = Column(Text)
    requested_at = Column(DateTime, default=datetime.utcnow)
    status       = Column(String(20), default="pending")  # pending / approved / rejected

# ── Table 7: Subscribers ───────────────────────────────────────
class Subscriber(Base):
    __tablename__ = "subscribers"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    email         = Column(String(255), unique=True, nullable=False)
    subscribed_at = Column(DateTime, default=datetime.utcnow)
    is_active     = Column(Boolean, default=True)

# ── Table 8: Waitlist ──────────────────────────────────────────
class Waitlist(Base):
    __tablename__ = "waitlist"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    email     = Column(String(255), unique=True, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

# ── Table 9: KOL Follows ───────────────────────────────────────
class KOLFollow(Base):
    __tablename__ = "kol_follows"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    email       = Column(String(255), nullable=False)
    kol_handle  = Column(String(100), nullable=False)
    followed_at = Column(DateTime, default=datetime.utcnow)
    is_active   = Column(Boolean, default=True)

    __table_args__ = (
        UniqueConstraint('email', 'kol_handle', name='uq_email_kol_handle'),
    )


# ── Performance indexes ────────────────────────────────────────
Index('idx_rec_posted_at',    Recommendation.posted_at)
Index('idx_rec_ticker',       Recommendation.ticker)
Index('idx_rec_kol_id',       Recommendation.kol_id)
Index('idx_raw_is_parsed',    RawTweet.is_parsed)
Index('idx_kol_follow_email', KOLFollow.email)
Index('idx_kol_follow_handle',KOLFollow.kol_handle)


# ── Database connection helpers ────────────────────────────────
def get_engine():
    db_url = os.getenv("DATABASE_URL", "sqlite:///kol_tracker.db")
    if db_url.startswith("postgresql"):
        return create_engine(db_url, pool_pre_ping=True, echo=False)
    return create_engine(db_url, echo=False)

def get_session():
    engine = get_engine()
    Session = sessionmaker(bind=engine)
    return Session()

def init_db():
    engine = get_engine()
    Base.metadata.create_all(engine)
    print("✅ Database tables created successfully")

if __name__ == "__main__":
    init_db()