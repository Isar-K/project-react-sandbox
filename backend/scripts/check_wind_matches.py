"""
Quick script to check wind vessel matches in the database.
"""
import sqlite3
from pathlib import Path

DB_NAME = "vessel_static_data.db"

project_root = Path(__file__).parent
db_path = project_root / DB_NAME

if not db_path.exists():
    print(f"Database not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("="*80)
print("WIND VESSEL MATCHING STATUS")
print("="*80)

# Check if tables exist
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='wind_propulsion'")
if not cursor.fetchone():
    print("\n❌ wind_propulsion table does not exist yet!")
    print("   Run: python src/utils/import_wind_propulsion.py")
    conn.close()
    exit(1)

# Check if wind_assisted column exists
cursor.execute("PRAGMA table_info(vessels_static)")
columns = [row[1] for row in cursor.fetchall()]
if 'wind_assisted' not in columns:
    print("\n❌ wind_assisted column does not exist yet!")
    print("   Run: python src/utils/import_wind_propulsion.py")
    conn.close()
    exit(1)

# Total wind vessels in database
cursor.execute('SELECT COUNT(*) FROM wind_propulsion')
total_wind = cursor.fetchone()[0]
print(f"\n📊 Total wind vessels in database: {total_wind}")

# Matched vessels
cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE wind_assisted = 1')
matched = cursor.fetchone()[0]
print(f"✅ Matched with AIS data: {matched}")
print(f"❌ Not yet tracked: {total_wind - matched}")

if matched > 0:
    print(f"\n{'='*80}")
    print("MATCHED VESSELS (Currently tracked in AIS):")
    print(f"{'='*80}")
    cursor.execute('''
        SELECT v.name, v.length, v.ship_type, w.technology_installed
        FROM vessels_static v
        INNER JOIN wind_propulsion w ON UPPER(TRIM(v.name)) = UPPER(TRIM(w.vessel_name))
        WHERE v.wind_assisted = 1
        ORDER BY v.length DESC
    ''')
    
    for i, (name, length, ship_type, tech) in enumerate(cursor.fetchall(), 1):
        print(f"{i:2}. {name:30} ({length:3}m) - {tech}")

print(f"\n{'='*80}")
print("UNMATCHED VESSELS (Not yet in AIS tracking):")
print(f"{'='*80}")
cursor.execute('''
    SELECT vessel_name, length, vessel_type, technology_installed
    FROM wind_propulsion
    WHERE vessel_name NOT IN (
        SELECT name FROM vessels_static WHERE wind_assisted = 1
    )
    ORDER BY length DESC
    LIMIT 20
''')

unmatched = cursor.fetchall()
if unmatched:
    for i, (name, length, vtype, tech) in enumerate(unmatched, 1):
        print(f"{i:2}. {name:30} ({length:3}m {vtype:20}) - {tech}")
    if len(unmatched) == 20:
        cursor.execute('''
            SELECT COUNT(*)
            FROM wind_propulsion
            WHERE vessel_name NOT IN (
                SELECT name FROM vessels_static WHERE wind_assisted = 1
            )
        ''')
        total_unmatched = cursor.fetchone()[0]
        if total_unmatched > 20:
            print(f"\n    ... and {total_unmatched - 20} more")
else:
    print("  All vessels matched! 🎉")

print(f"\n{'='*80}\n")

conn.close()
