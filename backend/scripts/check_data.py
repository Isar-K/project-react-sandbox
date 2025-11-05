"""
Quick script to check vessel data quality in the database.
"""
import sqlite3
from pathlib import Path

DB_NAME = "vessel_static_data.db"

script_dir = Path(__file__).parent
db_path = script_dir / DB_NAME

if not db_path.exists():
    print(f"Database not found: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Total vessels
cursor.execute('SELECT COUNT(*) FROM vessels_static')
total = cursor.fetchone()[0]

# Vessels with names
cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE name IS NOT NULL AND name != ""')
with_names = cursor.fetchone()[0]

# Vessels with length data
cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE length IS NOT NULL AND length > 0')
with_length = cursor.fetchone()[0]

# Vessels with beam data
cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE beam IS NOT NULL AND beam > 0')
with_beam = cursor.fetchone()[0]

# Vessels with ship type
cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE ship_type IS NOT NULL AND ship_type > 0')
with_type = cursor.fetchone()[0]

# Vessels with call sign
cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE call_sign IS NOT NULL AND call_sign != ""')
with_callsign = cursor.fetchone()[0]

print("\n" + "="*60)
print("VESSEL DATABASE STATISTICS")
print("="*60)
print(f"Total vessels:              {total}")
print(f"Vessels with names:         {with_names} ({with_names/total*100:.1f}%)" if total > 0 else "Vessels with names:         0")
print(f"Vessels with length:        {with_length} ({with_length/total*100:.1f}%)" if total > 0 else "Vessels with length:        0")
print(f"Vessels with beam:          {with_beam} ({with_beam/total*100:.1f}%)" if total > 0 else "Vessels with beam:          0")
print(f"Vessels with ship type:     {with_type} ({with_type/total*100:.1f}%)" if total > 0 else "Vessels with ship type:     0")
print(f"Vessels with call sign:     {with_callsign} ({with_callsign/total*100:.1f}%)" if total > 0 else "Vessels with call sign:     0")
print("="*60)

# Show sample vessels with complete data
print("\nSample vessels with LENGTH data:")
print("-"*60)
cursor.execute('''
    SELECT mmsi, name, length, beam, ship_type, call_sign 
    FROM vessels_static 
    WHERE length IS NOT NULL AND length > 0
    ORDER BY length DESC
    LIMIT 10
''')

vessels = cursor.fetchall()
if vessels:
    for mmsi, name, length, beam, ship_type, call_sign in vessels:
        print(f"MMSI: {mmsi}")
        print(f"  Name: {name or 'N/A'}")
        print(f"  Dimensions: {length}m x {beam}m (L x B)")
        print(f"  Type: {ship_type or 'N/A'}, Call Sign: {call_sign or 'N/A'}")
        print()
else:
    print("No vessels with length data found yet.")
    print("Note: Length data comes from ReportB messages, which are less common.")
    print("Keep the collector running to gather more data.")

conn.close()
