from models import get_session, KOL, init_db
from datetime import datetime

# Your 10 KOLs from the spreadsheet
KOLS = [
    {"handle": "unusual_whales",  "display_name": "Unusual Whales",   "content_type": "options flow",    "prediction_style": "explicit"},
    {"handle": "jimcramer",       "display_name": "Jim Cramer",        "content_type": "stock picks",     "prediction_style": "explicit"},
    {"handle": "CathieDWood",     "display_name": "Cathie Wood",       "content_type": "growth stocks",   "prediction_style": "explicit"},
    {"handle": "PeterLBrandt",    "display_name": "Peter Brandt",      "content_type": "chart analysis",  "prediction_style": "explicit"},
    {"handle": "SJosephBurns",    "display_name": "SJoseph Burns",     "content_type": "trading",         "prediction_style": "explicit"},
    {"handle": "markminervini",   "display_name": "Mark Minervini",    "content_type": "momentum",        "prediction_style": "explicit"},
    {"handle": "NorthmanTrader",  "display_name": "Northman Trader",   "content_type": "macro",           "prediction_style": "implied"},
    {"handle": "TraderStewie",    "display_name": "Trader Stewie",     "content_type": "trading",         "prediction_style": "explicit"},
    {"handle": "InvestorsLive",   "display_name": "Investors Live",    "content_type": "day trading",     "prediction_style": "explicit"},
    {"handle": "OptionsHawk",     "display_name": "Options Hawk",      "content_type": "options flow",    "prediction_style": "explicit"},
]

def seed_kols():
    session = get_session()
    added = 0
    skipped = 0

    for kol_data in KOLS:
        # Check if already exists
        existing = session.query(KOL).filter_by(handle=kol_data["handle"]).first()
        if existing:
            skipped += 1
            continue

        kol = KOL(
            handle           = kol_data["handle"],
            display_name     = kol_data["display_name"],
            profile_url      = f"https://x.com/{kol_data['handle']}",
            content_type     = kol_data["content_type"],
            prediction_style = kol_data["prediction_style"],
            is_active        = True,
            created_at       = datetime.utcnow()
        )
        session.add(kol)
        added += 1

    session.commit()
    session.close()
    print(f"✅ Seeded {added} KOLs, skipped {skipped} duplicates")

if __name__ == "__main__":
    init_db()
    seed_kols()