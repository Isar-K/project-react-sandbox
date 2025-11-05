"""
Show all trackable vessels (>100m, excluding container ships) with complete information.
"""
import sqlite3
from pathlib import Path
from mmsi_mid_lookup import get_flag_state

DB_NAME = "vessel_static_data.db"

script_dir = Path(__file__).parent
db_path = script_dir / DB_NAME

conn = sqlite3.connect(db_path, timeout=30)
cursor = conn.cursor()

# Query for vessels matching tracking criteria
query = '''
    SELECT mmsi, name, ship_type, length, beam, imo, call_sign, flag_state, last_updated
    FROM vessels_static
    WHERE length >= 100
      AND mmsi IS NOT NULL
      AND length IS NOT NULL
      AND (ship_type IS NULL OR ship_type NOT IN (71, 72))
    ORDER BY length DESC
'''

cursor.execute(query)
vessels = cursor.fetchall()

print("\n" + "="*100)
print(f"TRACKABLE VESSELS - {len(vessels)} SHIPS")
print("="*100)
print("Criteria: Length >= 100m, Excluding Container Ships (Type 71, 72)")
print("="*100 + "\n")

# Ship type reference (common types)
ship_types = {
    30: "Fishing",
    33: "Dredging/Underwater ops",
    36: "Sailing",
    37: "Pleasure Craft",
    50: "Pilot Vessel",
    51: "Search and Rescue",
    52: "Tug",
    60: "Passenger",
    62: "Passenger (Hazardous B)",
    64: "Passenger (Hazardous D)",
    70: "Cargo",
    79: "Cargo (No additional info)",
    80: "Tanker",
    81: "Tanker (Hazardous A)",
    82: "Tanker (Hazardous B)",
    89: "Tanker (No additional info)",
    96: "Other"
}

for idx, vessel in enumerate(vessels, 1):
    mmsi, name, ship_type, length, beam, imo, call_sign, flag_state, last_updated = vessel
    
    # Get flag state if not in database
    if not flag_state:
        flag_state = get_flag_state(mmsi)
    
    # Get ship type description
    ship_type_desc = ship_types.get(ship_type, f"Type {ship_type}") if ship_type else "Unknown"
    
    print(f"{idx}. " + "="*95)
    print(f"   MMSI:        {mmsi}")
    print(f"   Name:        {name or 'Unknown'}")
    print(f"   Flag:        {flag_state or 'Unknown'}")
    print(f"   Type:        {ship_type_desc}")
    print(f"   Dimensions:  {length}m (L) x {beam}m (B)")
    print(f"   IMO:         {imo or 'N/A'}")
    print(f"   Call Sign:   {call_sign or 'N/A'}")
    print(f"   Last Update: {last_updated}")
    print()

conn.close()

print("="*100)
print(f"TOTAL: {len(vessels)} vessels ready for tracking")
print(f"WebSocket connections needed: {(len(vessels) + 49) // 50}")
print("="*100)
print("\nTo track these vessels in real-time, run:")
print("  python track_filtered_vessels.py")
print("="*100 + "\n")
