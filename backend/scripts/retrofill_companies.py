import sqlite3
import json
import time
from pathlib import Path
from company_lookup import get_signatory_company

DB_PATH = Path(__file__).parent / "vessel_static_data.db"
CACHE_FILE = Path(__file__).parent / "company_cache.json"


def load_company_cache():
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_company_cache(cache):
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        print(f"[!] Error saving cache: {e}")


def ensure_column_exists(conn):
    """Add signatory_company column if missing."""
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(vessels_static)")
    columns = [row[1] for row in cur.fetchall()]
    if "signatory_company" not in columns:
        print("🧱 Adding missing 'signatory_company' column...")
        cur.execute("ALTER TABLE vessels_static ADD COLUMN signatory_company TEXT")
        conn.commit()


def retrofill_companies():
    conn = sqlite3.connect(DB_PATH)
    ensure_column_exists(conn)
    cur = conn.cursor()

    cache = load_company_cache()

    # Select vessels missing company info
    cur.execute("SELECT mmsi, name FROM vessels_static WHERE name IS NOT NULL AND (signatory_company IS NULL OR signatory_company = '')")
    vessels = cur.fetchall()

    print(f"📦 Found {len(vessels)} vessels without company info.\n")

    for i, (mmsi, name) in enumerate(vessels, 1):
        if not name:
            continue

        if name in cache:
            company = cache[name]
            print(f"[{i}/{len(vessels)}] Cached: {name} → {company}")
        else:
            company = get_signatory_company(name)
            if company:
                cache[name] = company
                save_company_cache(cache)
                print(f"[{i}/{len(vessels)}] ✅ {name} → {company}")
            else:
                print(f"[{i}/{len(vessels)}] ✗ No company found for {name}")

        if company:
            cur.execute("UPDATE vessels_static SET signatory_company = ? WHERE mmsi = ?", (company, mmsi))
            conn.commit()

        time.sleep(1.5)  # polite delay

    conn.close()
    print("\n🎯 Done! All available company info added!.")


if __name__ == "__main__":
    retrofill_companies()
