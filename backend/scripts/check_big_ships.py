"""
Check for ships over 100m in the database.
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

# Count ships over 100m
cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE length >= 100')
count = cursor.fetchone()[0]

print("\n" + "="*70)
print(f"SHIPS OVER 100 METERS: {count}")
print("="*70)

if count == 0:
    print("\nNo ships over 100m found yet.")
    print("\nNote: Large commercial vessels broadcast Message Type 5 (ShipStaticData)")
    print("which includes length. Keep the collector running to capture these!")
    
    # Show largest ships we have
    cursor.execute('''
        SELECT mmsi, name, length, beam, ship_type, imo, call_sign 
        FROM vessels_static 
        WHERE length IS NOT NULL AND length > 0
        ORDER BY length DESC 
        LIMIT 10
    ''')
    vessels = cursor.fetchall()
    
    if vessels:
        print(f"\nTOP 10 LARGEST VESSELS IN DATABASE:")
        print("-"*70)
        for mmsi, name, length, beam, ship_type, imo, call_sign in vessels:
            print(f"\nMMSI: {mmsi}")
            print(f"Name: {name or 'Unknown'}")
            print(f"Dimensions: {length}m x {beam}m (Length x Beam)")
            print(f"Type: {ship_type or 'N/A'}, IMO: {imo or 'N/A'}, Call Sign: {call_sign or 'N/A'}")
    
else:
    # Show all ships over 100m
    cursor.execute('''
        SELECT mmsi, name, length, beam, ship_type, imo, call_sign 
        FROM vessels_static 
        WHERE length >= 100
        ORDER BY length DESC
    ''')
    vessels = cursor.fetchall()
    
    for mmsi, name, length, beam, ship_type, imo, call_sign in vessels:
        print(f"\n{'='*70}")
        print(f"MMSI: {mmsi}")
        print(f"Name: {name or 'Unknown'}")
        print(f"Length: {length}m")
        print(f"Beam: {beam}m")
        print(f"Ship Type: {ship_type or 'N/A'}")
        print(f"IMO: {imo or 'N/A'}")
        print(f"Call Sign: {call_sign or 'N/A'}")

print("\n" + "="*70 + "\n")

conn.close()
