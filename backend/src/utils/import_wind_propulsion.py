"""
Import wind propulsion technology data for vessels.
This script creates a table for wind-assisted vessels and imports the list of 77 ships
with wind propulsion technology installed.
"""

import sqlite3
from pathlib import Path
from datetime import datetime

DB_NAME = "vessel_static_data.db"

# Wind-assisted vessels data
WIND_VESSELS = [
    ("E-Ship 1", "Ro-Ro", 10020, 12968, 130, "4 x 27m fixed rotor sails", 2010, "newbuild"),
    ("Estraden", "Ro-Ro", 9741, 18205, 163, "2 x 18m fixed rotor sails", 2014, "retrofit"),
    ("Goldy Seven", "General Cargo", 4250, 2844, 90, "1 x 18m fixed rotor sail", 2018, "retrofit"),
    ("New Vitality", "Tanker", 306751, 162636, 333, "2 x 32m retractable wing sails", 2018, "newbuild"),
    ("Hu Po", "Tanker", 109647, 61724, 245, "2 x 30m fixed rotor sails", 2018, "retrofit"),
    ("Afros", "Bulk Carrier", 63223, 36452, 199, "4 x 16m movable rotor sails", 2018, "newbuild"),
    ("Copenhagen", "Ferry", 5088, 24000, 169, "1 x 30m fixed rotor sail", 2020, "retrofit"),
    ("Ankie", "General Cargo", 3638, 2528, 90, "2 x 13m hinged suction wings", 2020, "retrofit"),
    ("Anika Braren", "General Cargo", 5023, 2996, 85, "1 x 18m fixed rotor sail", 2021, "newbuild"),
    ("SC Connector", "Ro-Ro", 8843, 12251, 155, "2 x 35m hinged rotor sails", 2021, "retrofit"),
    ("Sea Zhoushan", "Bulk Carrier", 324268, 173504, 340, "5 x 24m hinged rotor sails", 2021, "newbuild"),
    ("Frisian Sea", "General Cargo", 6477, 4298, 118, "2 x 11m flat-rack/hinged suction wings", 2021, "retrofit"),
    ("Naumon", "General Cargo/Theatre Vessel", 1006, 1057, 59, "1 x 17m fixed suction sail", 2021, "retrofit"),
    ("GNV BRIDGE", "Ferry", 8632, 32581, 203, "1 x 12m retractable wing sail", 2021, "retrofit"),
    ("Marfret Niolon", "Ro-Ro", 5282, 7395, 123, "2 x 12m hinged/container suction wings", 2022, "retrofit"),
    ("Anna", "General Cargo", 5097, 2993, 90, "2 x 16m hinged suctions wings", 2022, "retrofit"),
    ("Berlin", "Ferry", 4835, 22319, 169, "1 x 30m fixed rotor sail", 2022, "retrofit"),
    ("Shofu Maru", "Bulk Carrier", 100422, 58209, 235, "1 x 48m retractable wing sail", 2022, "newbuild"),
    ("Delphine", "Ro-Ro", 27687, 74273, 234, "1 x 35m hinged rotor sails", 2022, "retrofit"),
    ("New Aden", "Tanker", 306751, 162636, 333, "4 x 40m retractable wing sails", 2022, "newbuild"),
    ("MN Pelican", "Ro-Ro", 8847, 12076, 154, "1 x 100m2 inflatable wing sail", 2022, "retrofit"),
    ("EEMS Traveller", "General Cargo", 2850, 2137, 90, "2 x 17m fixed suction sails", 2023, "retrofit"),
    ("Sunnanvik", "Cement Carrier", 9060, 7454, 124, "2 x 16m suction wings", 2023, "retrofit"),
    ("Chang Hang Sheng Hai", "Bulk Carrier", 45542, 27629, 190, "4 x 24m rotor sails", 2023, "retrofit"),
    ("TR Lady", "Bulk Carrier", 82042, 44190, 229, "3 x 24m movable rotor sails", 2023, "retrofit"),
    ("Cape Brolga", "Bulk Carrier", 211982, 108967, 300, "1 x 1,000m2 dynamic kite", 2023, "retrofit"),
    ("Canopee", "Ro-Ro", 4700, 10400, 121, "4 x 30m retractable hybrid wing sails", 2023, "newbuild"),
    ("Pyxis Ocean", "Bulk Carrier", 80962, 43291, 229, "2 x 40m retractable wing sails", 2023, "retrofit"),
    ("Jun Bai 56", "Tanker", 4940, 2988, 96, "1 x 16m rotor sail", 2024, "newbuild"),
    ("Hai Yang Shi You 226", "Heavy Lift Vessel - Deck Carrier", 12752, 17223, 153, "2 x 18m rotor sails", 2024, "retrofit"),
    ("Grain de Sail 2", "General Cargo", 350, 497, 51, "2 x mast soft sail (traditional)", 2024, "newbuild"),
    ("Chemical Challenger", "Tanker", 16111, 9155, 134, "4 x 16m suction wings", 2024, "retrofit"),
    ("Odda Marie", "General Cargo", 5000, 3998, 100, "2 x 12m suction wings", 2024, "retrofit"),
    ("Ville de Bordeaux", "Ro-Ro", 5200, 21528, 154, "3 x 22m suction sails", 2024, "retrofit"),
    ("Berge Olympus", "Bulk Carrier", 211153, 109716, 300, "4 x 40m retractable wing sails", 2024, "retrofit"),
    ("Juren Ae", "General Cargo", 292, 460, 48, "2 x mast soft sail (Indosail)", 2024, "newbuild"),
    ("Kalamazoo", "Container", 12593, 9743, 143, "2 x 2 x 12m containerised retractable suction wings", 2024, "retrofit"),
    ("Northern Pioneer", "Tanker - CO2", 8000, 10747, 130, "1 x 28m rotor sail", 2024, "newbuild"),
    ("Northern Pathfinder", "Tanker - CO2", 8000, 10747, 130, "1 x 28m rotor sail", 2024, "newbuild"),
    ("Alcyone", "Tanker", 49990, 29507, 183, "1 x 35m rotor sail", 2024, "retrofit"),
    ("Berge Neblina", "Bulk Carrier", 388000, 195199, 360, "4 x 35m hinged rotor sails", 2024, "retrofit"),
    ("Koryu", "Bulk Carrier", 53762, 30476, 190, "1 x 35m hinged rotor sail", 2024, "retrofit"),
    ("NBA Magritte", "Bulk Carrier", 82099, 43013, 229, "2 x 10m flat-rack/hinged suction wings", 2024, "retrofit"),
    ("Anemos", "General Cargo", 1512, 1672, 80, "2 x mast soft sail (traditional)", 2024, "newbuild"),
    ("Green Winds", "Bulk Carrier", 63896, 36498, 200, "1 x 48m retractable wing sail", 2024, "newbuild"),
    ("Sohar Max", "Bulk Carrier", 400315, 201757, 360, "5 x 35m rotor sails", 2024, "retrofit"),
    ("Artemis", "General Cargo", 1581, 1672, 80, "2 x mast soft sail (traditional)", 2024, "newbuild"),
    ("Amadeus Saffier", "General Cargo", 3600, 2549, 88, "2 x 16m suction wings", 2024, "newbuild"),
    ("Jumbo Jubilee", "Heavy Load Carrier", 13017, 15342, 145, "2 x 16m suction wings", 2024, "retrofit"),
    ("Cem Commander", "Cement Carrier", 5876, 4332, 113, "1 x 24m rotor sail", 2024, "retrofit"),
    ("Chinook Oldendorff", "Bulk Carrier", 100450, 53219, 235, "3 x 24m rotor sails", 2024, "retrofit"),
    ("Pacific Grebe", "Nuclear Transport Vessel", 4902, 6840, 104, "1 x 20m rigid wing", 2024, "retrofit"),
    ("Yodohime", "Bulk Carrier", 85022, 47181, 229, "1 x 24m rotor sail", 2024, "retrofit"),
    ("Camellia Dream", "Bulk Carrier", 206863, 108115, 299, "2 x 35m rotor sails", 2024, "retrofit"),
    ("Oceanus Aurora", "Gas Tanker", 58495, 53694, 230, "2 x 20m rotor sails", 2025, "newbuild"),
    ("Coral Patula", "Chemical Tanker/LPG", 8571, 7251, 115, "2 x 16m suction wings", 2025, "retrofit"),
    ("Coral Pearl", "Chemical Tanker/LPG", 8602, 7251, 115, "2 x 16m suction wings", 2025, "retrofit"),
    ("Prima Verde", "General Cargo", 17611, 13281, 130, "1 x 10m suction wing (containerized)", 2025, "newbuild"),
    ("Waalvliet", "General Cargo", 3800, 2781, 88, "2 x 16m suction wings", 2025, "newbuild"),
    ("Rijnvliet", "General Cargo", 3800, 2781, 88, "2 x 16m suction wings", 2025, "newbuild"),
    ("Tern Vik", "Chemical Tanker", 15109, 11408, 147, "4 x 16m suction wings", 2025, "newbuild"),
    ("Onego Duesto", "General Cargo", 9832, 6312, 132, "2 x 16m suction wings", 2025, "retrofit"),
    ("Pacific Sentinel", "Chemical Tanker", 50332, 29708, 183, "3 x 22m suction sails", 2025, "retrofit"),
    ("Bow Olympus", "Chemical Tanker", 49000, 34148, 183, "3 x 22m suction sails", 2025, "retrofit"),
    ("Atlantic Orchard", "Fruit Juice Carrier", 34584, 28243, 180, "4 x 26m suction sails", 2025, "retrofit"),
    ("Buran", "Chemical Tanker", 18500, 12118, 150, "1 x 20m + 1 x 24m rotor sails", 2025, "newbuild"),
    ("Vectis Progress", "General Cargo", 11183, 7230, 124, "1 x 20m wing sail", 2025, "retrofit"),
    ("Wilson Eyde", "General Cargo", 4815, 3621, 90, "2 x 16m suction wings", 2025, "retrofit"),
    ("Ostro 1", "Chemical Tanker", 18653, 11952, 150, "1 x 20m + 1 x 24 m rotor sails", 2025, "newbuild"),
    ("Brands Hatch", "Oil/Product Tanker", 113006, 62730, 250, "3 x 20m x 37.5m wing sails", 2025, "newbuild"),
    ("Launkalne", "General Cargo", 11048, 6621, 132, "2 x 16m suction wings", 2025, "retrofit"),
    ("Jutlandia Swan", "Chemical/Oil Products Tanker", 12479, 7217, 124, "4 x 16 suction wings", 2025, "retrofit"),
    ("Ilha de Tinhare", "Offshore Supply Vessel", 1106, 550, 64, "Container - 2 x 10m suction wings", 2025, "retrofit"),
    ("Bise", "Chemical Tanker", 18500, 12118, 150, "1 x 20m + 1 x 24m rotor sails", 2025, "newbuild"),
    ("Zonda", "Chemical Tanker", 18500, 12118, 150, "1 x 20m + 1 x 24m rotor sails", 2025, "newbuild"),
    ("Grand Pioneer", "Bulk Carrier", 324963, 173721, 340, "4 x 35m rotor sails", 2025, "retrofit"),
    ("Neoliner Origin", "Ro-Ro Cargo", 6300, 13278, 136, "2 x 76m solid sails", 2025, "newbuild"),
]


def create_wind_propulsion_table(conn):
    """Create the wind propulsion technology table."""
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wind_propulsion (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_name TEXT NOT NULL,
            vessel_type TEXT,
            dwt INTEGER,
            gt INTEGER,
            length INTEGER,
            technology_installed TEXT,
            installation_year INTEGER,
            installation_type TEXT,
            last_updated TEXT NOT NULL,
            UNIQUE(vessel_name, installation_year)
        )
    ''')
    
    # Create index for faster name lookups
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_wind_vessel_name ON wind_propulsion(vessel_name)')
    
    conn.commit()
    print("✓ Wind propulsion table created")


def add_wind_assisted_column(conn):
    """Add wind_assisted flag to vessels_static table."""
    cursor = conn.cursor()
    
    try:
        cursor.execute('ALTER TABLE vessels_static ADD COLUMN wind_assisted INTEGER DEFAULT 0')
        conn.commit()
        print("✓ Added wind_assisted column to vessels_static")
    except sqlite3.OperationalError:
        print("  wind_assisted column already exists")


def import_wind_vessels(conn):
    """Import wind-assisted vessel data."""
    cursor = conn.cursor()
    timestamp = datetime.utcnow().isoformat()
    
    inserted = 0
    updated = 0
    
    for vessel_data in WIND_VESSELS:
        name, vtype, dwt, gt, length, tech, year, inst_type = vessel_data
        
        try:
            cursor.execute('''
                INSERT INTO wind_propulsion (vessel_name, vessel_type, dwt, gt, length, technology_installed, installation_year, installation_type, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(vessel_name, installation_year) DO UPDATE SET
                    vessel_type = excluded.vessel_type,
                    dwt = excluded.dwt,
                    gt = excluded.gt,
                    length = excluded.length,
                    technology_installed = excluded.technology_installed,
                    installation_type = excluded.installation_type,
                    last_updated = excluded.last_updated
            ''', (name, vtype, dwt, gt, length, tech, year, inst_type, timestamp))
            
            if cursor.rowcount == 1:
                inserted += 1
            else:
                updated += 1
                
        except Exception as e:
            print(f"  Error importing {name}: {e}")
    
    conn.commit()
    
    print(f"\n{'='*80}")
    print("WIND PROPULSION DATA IMPORT COMPLETE")
    print(f"{'='*80}")
    print(f"✓ Inserted: {inserted} new vessels")
    print(f"✓ Updated: {updated} existing vessels")
    print(f"✓ Total wind-assisted vessels: {len(WIND_VESSELS)}")
    print(f"{'='*80}\n")


def match_wind_vessels_to_ais(conn):
    """Match wind-assisted vessels to AIS database by name and mark them."""
    cursor = conn.cursor()
    
    print("\nMatching wind-assisted vessels to AIS database...")
    
    # Get all wind vessel names
    cursor.execute('SELECT DISTINCT vessel_name FROM wind_propulsion')
    wind_names = [row[0] for row in cursor.fetchall()]
    
    matched = 0
    
    for wind_name in wind_names:
        # Try exact match first
        cursor.execute('''
            UPDATE vessels_static
            SET wind_assisted = 1
            WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
        ''', (wind_name,))
        
        if cursor.rowcount > 0:
            matched += cursor.rowcount
            print(f"  ✓ Matched: {wind_name}")
        else:
            # Try partial match (for vessels with slight name variations)
            cursor.execute('''
                UPDATE vessels_static
                SET wind_assisted = 1
                WHERE UPPER(name) LIKE UPPER(?)
            ''', (f'%{wind_name}%',))
            
            if cursor.rowcount > 0:
                matched += cursor.rowcount
                print(f"  ~ Partial match: {wind_name}")
    
    conn.commit()
    
    print(f"\n  Total AIS vessels flagged as wind-assisted: {matched}")
    
    # Show unmatched vessels
    cursor.execute('''
        SELECT vessel_name, length, vessel_type
        FROM wind_propulsion
        WHERE vessel_name NOT IN (
            SELECT name FROM vessels_static WHERE wind_assisted = 1
        )
        ORDER BY length DESC
    ''')
    
    unmatched = cursor.fetchall()
    if unmatched:
        print(f"\n  Vessels not yet in AIS database ({len(unmatched)}):")
        for name, length, vtype in unmatched[:10]:  # Show first 10
            print(f"    - {name} ({length}m {vtype})")
        if len(unmatched) > 10:
            print(f"    ... and {len(unmatched) - 10} more")


def show_statistics(conn):
    """Show statistics about wind-assisted vessels."""
    cursor = conn.cursor()
    
    print(f"\n{'='*80}")
    print("WIND PROPULSION STATISTICS")
    print(f"{'='*80}")
    
    # Total wind vessels
    cursor.execute('SELECT COUNT(*) FROM wind_propulsion')
    total = cursor.fetchone()[0]
    print(f"Total wind-assisted vessels in database: {total}")
    
    # By installation type
    cursor.execute('''
        SELECT installation_type, COUNT(*) 
        FROM wind_propulsion 
        GROUP BY installation_type
    ''')
    print(f"\nBy installation type:")
    for inst_type, count in cursor.fetchall():
        print(f"  {inst_type}: {count}")
    
    # By year
    cursor.execute('''
        SELECT installation_year, COUNT(*) 
        FROM wind_propulsion 
        GROUP BY installation_year
        ORDER BY installation_year
    ''')
    print(f"\nBy installation year:")
    for year, count in cursor.fetchall():
        print(f"  {year}: {count}")
    
    # Matched with AIS
    cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE wind_assisted = 1')
    matched = cursor.fetchone()[0]
    print(f"\nVessels matched with AIS data: {matched}")
    
    print(f"{'='*80}\n")


def main():
    """Main import process."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    if not db_path.exists():
        print(f"Error: Database not found: {db_path}")
        print("Run ais_collector.py first to create the database.")
        return
    
    print(f"{'='*80}")
    print("WIND PROPULSION TECHNOLOGY IMPORT")
    print(f"{'='*80}\n")
    
    conn = sqlite3.connect(db_path)
    
    try:
        create_wind_propulsion_table(conn)
        add_wind_assisted_column(conn)
        import_wind_vessels(conn)
        match_wind_vessels_to_ais(conn)
        show_statistics(conn)
        
        print("✓ Import successful!")
        print(f"✓ Database updated: {db_path}")
        
    except Exception as e:
        print(f"\n✗ Error during import: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()


if __name__ == '__main__':
    main()
