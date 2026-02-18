from sqlalchemy import create_engine, Column, Integer, BigInteger, String, Text, Boolean, DateTime, Float, Enum
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

# ── Database connection helpers ────────────────────────────────
def get_engine():
    db_url = os.getenv("DATABASE_URL", "sqlite:///kol_tracker.db")
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