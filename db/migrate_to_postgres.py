"""
Migrate all data from SQLite to Postgres (Neon) using COPY protocol (fast).

Usage:
  python3 db/migrate_to_postgres.py
"""

import os
import sys
import io
import csv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from sqlalchemy import create_engine, text, inspect
from db.models import Base

SQLITE_URL = "sqlite:///kol_tracker.db"
PG_URL     = os.getenv("NEON_DATABASE_URL")

if not PG_URL:
    print("❌ NEON_DATABASE_URL not set in .env — aborting")
    sys.exit(1)

print(f"📦 Source:      {SQLITE_URL}")
print(f"🚀 Destination: {PG_URL[:50]}...")
sys.stdout.flush()

sqlite_engine = create_engine(SQLITE_URL, echo=False)
pg_engine     = create_engine(PG_URL, pool_pre_ping=True, echo=False,
                               connect_args={"connect_timeout": 30})

# Columns that SQLite stores as 0/1 but Postgres expects as bool
BOOL_COLS = {
    "kols"       : {"is_active"},
    "raw_tweets" : {"is_reply", "is_retweet", "is_parsed"},
    "subscribers": {"is_active"},
}

# Create all tables in Postgres
print("\n🔧 Creating tables in Postgres...")
sys.stdout.flush()
Base.metadata.create_all(pg_engine)
print("✅ Tables ready\n")
sys.stdout.flush()

TABLE_ORDER = [
    "kols", "raw_tweets", "recommendations", "price_snapshots",
    "kol_scores", "kol_requests", "subscribers", "waitlist",
]

total_migrated = 0

# Get a raw psycopg2 connection for COPY
pg_dsn = PG_URL
raw_conn = psycopg2.connect(pg_dsn, connect_timeout=30)

with sqlite_engine.connect() as src:
    for table in TABLE_ORDER:
        insp = inspect(sqlite_engine)
        if table not in insp.get_table_names():
            print(f"  ⏭  {table}: not in SQLite — skipping")
            sys.stdout.flush()
            continue

        rows = src.execute(text(f"SELECT * FROM {table} ORDER BY id")).mappings().all()
        src_count = len(rows)

        if src_count == 0:
            print(f"  ⏭  {table}: 0 rows — skipping")
            sys.stdout.flush()
            continue

        bool_cols = BOOL_COLS.get(table, set())
        cols      = list(rows[0].keys())

        # Build CSV in memory
        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
        for row in rows:
            out = []
            for k in cols:
                v = row[k]
                if v is None:
                    out.append(r"\N")
                elif k in bool_cols:
                    out.append("true" if v else "false")
                else:
                    out.append(str(v))
            writer.writerow(out)
        buf.seek(0)

        # Truncate + COPY
        cur = raw_conn.cursor()
        cur.execute(f"TRUNCATE TABLE {table} CASCADE")
        cur.copy_expert(
            f"COPY {table} ({', '.join(cols)}) FROM STDIN WITH (FORMAT csv, NULL '\\N')",
            buf,
        )
        raw_conn.commit()
        cur.close()

        # Verify
        cur2 = raw_conn.cursor()
        cur2.execute(f"SELECT COUNT(*) FROM {table}")
        dst_count = cur2.fetchone()[0]
        cur2.close()

        status = "✅" if dst_count >= src_count else "⚠️ "
        print(f"  {status} {table}: {src_count} → {dst_count} rows")
        sys.stdout.flush()
        total_migrated += dst_count

raw_conn.close()
print(f"\n✅ Migration complete — {total_migrated} total rows in Postgres")
sys.stdout.flush()

# Reset sequences
print("\n🔧 Resetting Postgres sequences...")
sys.stdout.flush()
seq_tables = ["kols", "recommendations", "price_snapshots", "kol_scores",
              "kol_requests", "subscribers", "waitlist"]
with pg_engine.connect() as conn:
    for table in seq_tables:
        try:
            conn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE(MAX(id), 1)) FROM {table}"
            ))
            conn.commit()
        except Exception:
            pass
print("✅ Sequences reset")
sys.stdout.flush()
