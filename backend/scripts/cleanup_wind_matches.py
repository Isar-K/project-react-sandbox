"""
Clean up incorrect wind vessel matches.
This removes all name-based matches and keeps only MMSI-based matches.
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
print("CLEANING UP WIND VESSEL MATCHES")
print("="*80)

# First, show current matches
cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE wind_assisted = 1')
before_count = cursor.fetchone()[0]
print(f"\nBefore cleanup: {before_count} vessels flagged as wind-assisted")

# Show which vessels are currently flagged
cursor.execute('''
    SELECT mmsi, name, length
    FROM vessels_static
    WHERE wind_assisted = 1
    ORDER BY name
''')
print(f"\nCurrently flagged vessels:")
for mmsi, name, length in cursor.fetchall():
    print(f"  {mmsi:9} - {name:30} ({length}m)")

# Reset ALL wind_assisted flags
print(f"\n{'='*80}")
print("STEP 1: Resetting all wind_assisted flags...")
cursor.execute('UPDATE vessels_static SET wind_assisted = 0')
conn.commit()
print(f"✓ Reset {cursor.rowcount} vessels")

# Re-match ONLY by MMSI from wind_propulsion_mmsi table
print(f"\n{'='*80}")
print("STEP 2: Re-matching ONLY by MMSI (100% accurate)...")

cursor.execute('SELECT DISTINCT mmsi, vessel_name FROM wind_propulsion_mmsi WHERE mmsi > 0')
wind_vessels = cursor.fetchall()

matched = 0
for mmsi, vessel_name in wind_vessels:
    cursor.execute('UPDATE vessels_static SET wind_assisted = 1 WHERE mmsi = ?', (mmsi,))
    if cursor.rowcount > 0:
        cursor.execute('SELECT name FROM vessels_static WHERE mmsi = ?', (mmsi,))
        ais_name = cursor.fetchone()[0]
        print(f"  ✓ {mmsi:9} - {vessel_name:30} -> {ais_name}")
        matched += 1

conn.commit()

print(f"\n{'='*80}")
print(f"CLEANUP COMPLETE")
print(f"{'='*80}")
print(f"Before: {before_count} vessels flagged")
print(f"After:  {matched} vessels flagged (MMSI-based only)")
print(f"Removed: {before_count - matched} incorrect matches")
print(f"{'='*80}")

# Show final state
cursor.execute('''
    SELECT v.mmsi, v.name, v.length, w.technology_installed
    FROM vessels_static v
    LEFT JOIN wind_propulsion_mmsi w ON v.mmsi = w.mmsi
    WHERE v.wind_assisted = 1
    ORDER BY v.length DESC
''')

results = cursor.fetchall()
if results:
    print(f"\nFinal verified wind-assisted vessels:")
    for mmsi, name, length, tech in results:
        print(f"  {mmsi:9} - {name:30} ({length:3}m) - {tech or 'N/A'}")
else:
    print(f"\n⚠ No vessels matched yet!")
    print(f"   You need to add MMSI numbers to import_wind_propulsion_mmsi.py")

print(f"\n{'='*80}\n")

conn.close()
