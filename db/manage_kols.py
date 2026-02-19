import sys
import os
import csv
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from datetime import datetime, timezone
from db.models import get_session, KOL, init_db

def add_single_kol(handle: str, display_name: str = None,
                   content_type: str = "stock picks",
                   prediction_style: str = "explicit"):
    """Add a single KOL by handle."""
    session = get_session()

    # Clean handle — remove @ if present
    clean_handle = handle.lstrip("@").strip()

    # Check if already exists
    existing = session.query(KOL).filter_by(handle=clean_handle).first()
    if existing:
        print(f"⚠️  @{clean_handle} already exists in database")
        session.close()
        return False

    kol = KOL(
        handle           = clean_handle,
        display_name     = display_name or clean_handle,
        profile_url      = f"https://x.com/{clean_handle}",
        content_type     = content_type,
        prediction_style = prediction_style,
        is_active        = True,
        created_at       = datetime.now(timezone.utc)
    )
    session.add(kol)
    session.commit()
    session.close()
    print(f"✅ Added @{clean_handle} to database")
    return True


def add_from_csv(filepath: str):
    """
    Add multiple KOLs from a CSV file.

    CSV format (with header row):
    handle,display_name,content_type,prediction_style

    Example rows:
    chamath,Chamath Palihapitiya,venture/growth,implied
    TihoBrkan,Tiho Brkan,macro/charts,explicit
    """
    if not os.path.exists(filepath):
        print(f"❌ File not found: {filepath}")
        return

    added   = 0
    skipped = 0

    with open(filepath, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            handle = row.get('handle', '').strip()
            if not handle:
                continue

            success = add_single_kol(
                handle           = handle,
                display_name     = row.get('display_name', handle),
                content_type     = row.get('content_type', 'stock picks'),
                prediction_style = row.get('prediction_style', 'explicit'),
            )
            if success:
                added += 1
            else:
                skipped += 1

    print(f"\n✅ CSV import complete: {added} added, {skipped} skipped")


def list_kols(active_only: bool = True):
    """Print all KOLs currently in the database."""
    session  = get_session()
    query    = session.query(KOL)
    if active_only:
        query = query.filter_by(is_active=True)
    kols = query.all()

    print(f"\n── KOLs in Database ({len(kols)}) {'─'*30}")
    print(f"  {'#':<4} {'Handle':<25} {'Display Name':<25} {'Type':<20}")
    print(f"  {'─'*4} {'─'*25} {'─'*25} {'─'*20}")
    for i, k in enumerate(kols, 1):
        print(f"  {i:<4} @{k.handle:<24} {k.display_name:<25} {k.content_type:<20}")

    session.close()
    return kols


def deactivate_kol(handle: str):
    """Stop tracking a KOL without deleting their data."""
    session      = get_session()
    clean_handle = handle.lstrip("@").strip()
    kol          = session.query(KOL).filter_by(handle=clean_handle).first()

    if not kol:
        print(f"❌ @{clean_handle} not found in database")
        session.close()
        return

    kol.is_active = False
    session.commit()
    session.close()
    print(f"⏸️  @{clean_handle} deactivated (data kept, just not crawled)")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Manage KOLs in the database')
    parser.add_argument('--list',       action='store_true',  help='List all KOLs')
    parser.add_argument('--add',        type=str,             help='Add single KOL by handle')
    parser.add_argument('--name',       type=str,             help='Display name for --add')
    parser.add_argument('--type',       type=str,             help='Content type for --add')
    parser.add_argument('--csv',        type=str,             help='Path to CSV file to import')
    parser.add_argument('--deactivate', type=str,             help='Deactivate a KOL by handle')
    args = parser.parse_args()

    init_db()

    if args.list:
        list_kols()
    elif args.add:
        add_single_kol(
            handle       = args.add,
            display_name = args.name,
            content_type = args.type or "stock picks"
        )
    elif args.csv:
        add_from_csv(args.csv)
    elif args.deactivate:
        deactivate_kol(args.deactivate)
    else:
        # Default: just show the list
        list_kols()