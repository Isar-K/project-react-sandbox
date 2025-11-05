"""
Import wind propulsion technology data for vessels using MMSI numbers.
This version uses MMSI for accurate matching instead of vessel names.
"""

import sqlite3
from pathlib import Path
from datetime import datetime

DB_NAME = "vessel_static_data.db"

# Wind-assisted vessels data with MMSI numbers - ALL 77 VESSELS
# Format: (vessel_name, mmsi, vessel_type, dwt, gt, length, technology_installed, installation_year, installation_type)
WIND_VESSELS_MMSI = [
    ("E-Ship 1", 218108000, "Ro-Ro", 10020, 12968, 130, "4 x 27m fixed rotor sails", 2010, "newbuild"),
    ("Estraden", 230917000, "Ro-Ro", 9741, 18205, 163, "2 x 18m fixed rotor sails", 2014, "retrofit"),
    ("Goldy Seven", 677012600, "General Cargo", 4250, 2844, 90, "1 x 18m fixed rotor sail", 2018, "retrofit"),
    ("New Vitality", 477231700, "Tanker", 306751, 162636, 333, "2 x 32m retractable wing sails", 2018, "newbuild"),
    ("Hu Po", 667002022, "Tanker", 109647, 61724, 245, "2 x 30m fixed rotor sails", 2018, "retrofit"),
    ("Afros", 538007531, "Bulk Carrier", 63223, 36452, 199, "4 x 16m movable rotor sails", 2018, "newbuild"),
    ("Copenhagen", 219423000, "Ferry", 5088, 24000, 169, "1 x 30m fixed rotor sail", 2020, "retrofit"),
    ("Ankie", 244554000, "General Cargo", 3638, 2528, 90, "2 x 13m hinged suction wings", 2020, "retrofit"),
    ("Annika Braren", 211302790, "General Cargo", 5023, 2996, 85, "1 x 18m fixed rotor sail", 2021, "newbuild"),
    ("SC Connector", 256149000, "Ro-Ro", 8843, 12251, 155, "2 x 35m hinged rotor sails", 2021, "retrofit"),
    ("Sea Zhoushan", 353441000, "Bulk Carrier", 324268, 173504, 340, "5 x 24m hinged rotor sails", 2021, "newbuild"),
    ("Frisian Sea", 244780424, "General Cargo", 6477, 4298, 118, "2 x 11m flat-rack/hinged suction wings", 2021, "retrofit"),
    ("Naumon", 224118520, "General Cargo/Theatre", 1006, 1057, 59, "1 x 17m fixed suction sail", 2021, "retrofit"),
    ("GNV Bridge", 247435900, "Ferry", 8632, 32581, 203, "1 x 12m retractable wing sail", 2021, "retrofit"),
    ("Marfret Niolon", 253343000, "Ro-Ro", 5282, 7395, 123, "2 x 12m hinged/container suction wings", 2022, "retrofit"),
    ("Anna", 245615000, "General Cargo", 5097, 2993, 90, "2 x 16m hinged suctions wings", 2022, "retrofit"),
    ("Berlin", 211727510, "Ferry", 4835, 22319, 169, "1 x 30m fixed rotor sail", 2022, "retrofit"),
    ("Shofu Maru", 431794000, "Bulk Carrier", 100422, 58209, 235, "1 x 48m retractable wing sail", 2022, "newbuild"),
    ("Delphine", 248189000, "Ro-Ro", 27687, 74273, 234, "1 x 35m hinged rotor sails", 2022, "retrofit"),
    ("New Aden", 477833400, "Tanker", 306751, 162636, 333, "4 x 40m retractable wing sails", 2022, "newbuild"),
    ("MN Pelican", 228315700, "Ro-Ro", 8847, 12076, 154, "1 x 100m2 inflatable wing sail", 2022, "retrofit"),
    ("EEMS Traveller", 246498000, "General Cargo", 2850, 2137, 90, "2 x 17m fixed suction sails", 2023, "retrofit"),
    ("Sunnanvik", 259286000, "Cement Carrier", 9060, 7454, 124, "2 x 16m suction wings", 2023, "retrofit"),
    ("Chang Hang Sheng Hai", 412379910, "Bulk Carrier", 45542, 27629, 190, "4 x 24m rotor sails", 2023, "retrofit"),
    ("TR Lady", 538007011, "Bulk Carrier", 82042, 44190, 229, "3 x 24m movable rotor sails", 2023, "retrofit"),
    ("Cape Brolga", 431568000, "Bulk Carrier", 211982, 108967, 300, "1 x 1000m2 dynamic kite", 2023, "retrofit"),
    ("Canopee", 228438700, "Ro-Ro", 4700, 10400, 121, "4 x 30m retractable hybrid wing sails", 2023, "newbuild"),
    ("Pyxis Ocean", 563021600, "Bulk Carrier", 80962, 43291, 229, "2 x 40m retractable wing sails", 2023, "retrofit"),
    ("Jun Bai 56", 413560160, "Tanker", 4940, 2988, 96, "1 x 16m rotor sail", 2024, "newbuild"),
    ("Hai Yang Shi You 226", 413301740, "Heavy Lift Deck Carrier", 12752, 17223, 153, "2 x 18m rotor sails", 2024, "retrofit"),
    ("Grain de Sail II", 228450700, "General Cargo", 350, 497, 51, "2 x mast soft sail (traditional)", 2024, "newbuild"),
    ("Chemical Challenger", 256160000, "Tanker", 16111, 9155, 134, "4 x 16m suction wings", 2024, "retrofit"),
    ("Odda Marie", 230691000, "General Cargo", 5000, 3998, 100, "2 x 12m suction wings", 2024, "retrofit"),
    ("Ville de Bordeaux", 228084000, "Ro-Ro", 5200, 21528, 154, "3 x 22m suction sails", 2024, "retrofit"),
    ("Berge Olympus", 232012398, "Bulk Carrier", 211153, 109716, 300, "4 x 40m retractable wing sails", 2024, "retrofit"),
    ("Juren Ae", 538011083, "General Cargo", 292, 460, 48, "2 x mast soft sail (Indosail)", 2024, "newbuild"),
    ("Kalamazoo", 563004600, "Container", 12593, 9743, 143, "2 x 2 x 12m containerised retractable suction wings", 2024, "retrofit"),
    ("Northern Pioneer", 257833000, "CO2 Tanker", 8000, 10747, 130, "1 x 28m rotor sail", 2024, "newbuild"),
    ("Northern Pathfinder", 257874000, "CO2 Tanker", 8000, 10747, 130, "1 x 28m rotor sail", 2024, "newbuild"),
    ("Alcyone", 228423800, "Tanker", 49990, 29507, 183, "1 x 35m rotor sail", 2024, "retrofit"),
    ("Berge Neblina", 235094793, "Bulk Carrier", 388000, 195199, 360, "4 x 35m hinged rotor sails", 2024, "retrofit"),
    ("Koryu", 538005264, "Bulk Carrier", 53762, 30476, 190, "1 x 35m hinged rotor sail", 2024, "retrofit"),
    ("NBA Magritte", 229347000, "Bulk Carrier", 82099, 43013, 229, "2 x 10m flat-rack/hinged suction wings", 2024, "retrofit"),
    ("Anemos", 228439900, "General Cargo", 1512, 1672, 80, "2 x mast soft sail (traditional)", 2024, "newbuild"),
    ("Green Winds", 352003910, "Bulk Carrier", 63896, 36498, 200, "1 x 48m retractable wing sail", 2024, "newbuild"),
    ("Sohar Max", 538004888, "Bulk Carrier", 400315, 201757, 360, "5 x 35m rotor sails", 2024, "retrofit"),
    ("Artemis", 228440700, "General Cargo", 1581, 1672, 80, "2 x mast soft sail (traditional)", 2024, "newbuild"),
    ("Amadeus Saffier", 245918000, "General Cargo", 3600, 2549, 88, "2 x 16m suction wings", 2024, "newbuild"),
    ("Jumbo Jubilee", 246309000, "Heavy Load Carrier", 13017, 15342, 145, "2 x 16m suction wings", 2024, "retrofit"),
    ("Cem Commander", 209903000, "Cement Carrier", 5876, 4332, 113, "1 x 24m rotor sail", 2024, "retrofit"),
    ("Chinook Oldendorff", 636093073, "Bulk Carrier", 100450, 53219, 235, "3 x 24m rotor sails", 2024, "retrofit"),
    ("Pacific Grebe", 235076847, "Nuclear Fuel Carrier", 4902, 6840, 104, "1 x 20m rigid wing", 2024, "retrofit"),
    ("Yodohime", 431288000, "Bulk Carrier", 85022, 47181, 229, "1 x 24m rotor sail", 2024, "retrofit"),
    ("Camellia Dream", 432992000, "Bulk Carrier", 206863, 108115, 299, "2 x 35m rotor sails", 2024, "retrofit"),
    ("Oceanus Aurora", 636021172, "Gas Tanker", 58495, 53694, 230, "2 x 20m rotor sails", 2025, "newbuild"),
    ("Coral Patula", 244870429, "Chemical/LPG Tanker", 8571, 7251, 115, "2 x 16m suction wings", 2025, "retrofit"),
    ("Coral Pearl", 244870430, "Chemical/LPG Tanker", 8602, 7251, 115, "2 x 16m suction wings", 2025, "retrofit"),
    ("Prima Verde", 636024717, "General Cargo", 17611, 13281, 130, "1 x 10m suction wing (containerized)", 2025, "newbuild"),
    ("Waalvliet", 244781000, "General Cargo", 3800, 2781, 88, "2 x 16m suction wings", 2025, "newbuild"),
    ("Rijnvliet", 244890021, "General Cargo", 3800, 2781, 88, "2 x 16m suction wings", 2025, "newbuild"),
    ("Tern Vik", 219034365, "Chemical Tanker", 15109, 11408, 147, "4 x 16m suction wings", 2025, "newbuild"),
    ("Onego Deusto", 244638000, "General Cargo", 9832, 6312, 132, "2 x 16m suction wings", 2025, "retrofit"),
    ("Pacific Sentinel", 636020778, "Chemical Tanker", 50332, 29708, 183, "3 x 22m suction sails", 2025, "retrofit"),
    ("Bow Olympus", 257081350, "Chemical Tanker", 49000, 34148, 183, "3 x 22m suction sails", 2025, "retrofit"),
    ("Atlantic Orchard", 636018592, "Fruit Juice Carrier", 34584, 28243, 180, "4 x 26m suction sails", 2025, "retrofit"),
    ("Buran", 538011478, "Chemical Tanker", 18500, 12118, 150, "1 x 20m + 1 x 24m rotor sails", 2025, "newbuild"),
    ("Vectis Progress", 235094626, "General Cargo", 11183, 7230, 124, "1 x 20m wing sail", 2025, "retrofit"),
    ("Wilson Eyde", 314377000, "General Cargo", 4815, 3621, 90, "2 x 16m suction wings", 2025, "retrofit"),
    ("Ostro I", 249723000, "Chemical Tanker", 18653, 11952, 150, "1 x 20m + 1 x 24m rotor sails", 2025, "newbuild"),
    ("Brands Hatch", 538011492, "Oil/Product Tanker", 113006, 62730, 250, "3 x 20m x 37.5m wing sails", 2025, "newbuild"),
    ("Launkalne", 210388000, "General Cargo", 11048, 6621, 132, "2 x 16m suction wings", 2025, "retrofit"),
    ("Jutlandia Swan", 256446000, "Chemical/Oil Products Tanker", 12479, 7217, 124, "4 x 16m suction wings", 2025, "retrofit"),
    ("Ilha de Tinhare", 710999986, "Offshore Supply Vessel", 1106, 550, 64, "Container - 2 x 10m suction wings", 2025, "retrofit"),
    ("Bise", 538011772, "Chemical Tanker", 18500, 12118, 150, "1 x 20m + 1 x 24m rotor sails", 2025, "newbuild"),
    ("Zonda", 538011596, "Chemical Tanker", 18500, 12118, 150, "1 x 20m + 1 x 24m rotor sails", 2025, "newbuild"),
    ("Grand Pioneer", 563110200, "Bulk Carrier", 324963, 173721, 340, "4 x 35m rotor sails", 2025, "retrofit"),
    ("Neoliner Origin", 228472900, "Ro-Ro", 6300, 13278, 136, "2 x 76m solid sails", 2025, "newbuild"),
]


def create_wind_propulsion_table(conn):
    """Create the wind propulsion technology table with MMSI."""
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS wind_propulsion_mmsi (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vessel_name TEXT NOT NULL,
            mmsi INTEGER,
            vessel_type TEXT,
            dwt INTEGER,
            gt INTEGER,
            length INTEGER,
            technology_installed TEXT,
            installation_year INTEGER,
            installation_type TEXT,
            last_updated TEXT NOT NULL,
            UNIQUE(mmsi, installation_year)
        )
    ''')
    
    # Create indexes
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_wind_mmsi ON wind_propulsion_mmsi(mmsi)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_wind_vessel_name_mmsi ON wind_propulsion_mmsi(vessel_name)')
    
    conn.commit()
    print("✓ Wind propulsion MMSI table created")


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
    """Import wind-assisted vessel data with MMSI."""
    cursor = conn.cursor()
    timestamp = datetime.utcnow().isoformat()
    
    inserted = 0
    updated = 0
    skipped = 0
    
    for vessel_data in WIND_VESSELS_MMSI:
        name, mmsi, vtype, dwt, gt, length, tech, year, inst_type = vessel_data
        
        if mmsi == 0:
            print(f"  ⚠ Skipped: {name} (MMSI not yet looked up)")
            skipped += 1
            continue
        
        try:
            cursor.execute('''
                INSERT INTO wind_propulsion_mmsi (vessel_name, mmsi, vessel_type, dwt, gt, length, technology_installed, installation_year, installation_type, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mmsi, installation_year) DO UPDATE SET
                    vessel_name = excluded.vessel_name,
                    vessel_type = excluded.vessel_type,
                    dwt = excluded.dwt,
                    gt = excluded.gt,
                    length = excluded.length,
                    technology_installed = excluded.technology_installed,
                    installation_type = excluded.installation_type,
                    last_updated = excluded.last_updated
            ''', (name, mmsi, vtype, dwt, gt, length, tech, year, inst_type, timestamp))
            
            if cursor.rowcount == 1:
                inserted += 1
            else:
                updated += 1
                
        except Exception as e:
            print(f"  Error importing {name} (MMSI: {mmsi}): {e}")
    
    conn.commit()
    
    print(f"\n{'='*80}")
    print("WIND PROPULSION DATA IMPORT COMPLETE")
    print(f"{'='*80}")
    print(f"✓ Inserted: {inserted} new vessels")
    print(f"✓ Updated: {updated} existing vessels")
    print(f"⚠ Skipped: {skipped} vessels (MMSI not yet looked up)")
    print(f"✓ Total imported: {inserted + updated}")
    print(f"{'='*80}\n")


def match_wind_vessels_to_ais(conn):
    """Match wind-assisted vessels to AIS database by MMSI and mark them."""
    cursor = conn.cursor()
    
    print("\nMatching wind-assisted vessels to AIS database by MMSI...")
    
    # Get all wind vessel MMSIs
    cursor.execute('SELECT DISTINCT mmsi, vessel_name FROM wind_propulsion_mmsi WHERE mmsi > 0')
    wind_vessels = cursor.fetchall()
    
    matched = 0
    not_found = []
    
    for mmsi, wind_name in wind_vessels:
        # Match by MMSI (100% accurate!)
        cursor.execute('''
            UPDATE vessels_static
            SET wind_assisted = 1
            WHERE mmsi = ?
        ''', (mmsi,))
        
        if cursor.rowcount > 0:
            matched += 1
            # Get the actual name from AIS
            cursor.execute('SELECT name FROM vessels_static WHERE mmsi = ?', (mmsi,))
            ais_name = cursor.fetchone()[0]
            print(f"  ✓ Matched: {wind_name} (MMSI: {mmsi}) -> AIS name: {ais_name}")
        else:
            not_found.append((mmsi, wind_name))
    
    conn.commit()
    
    print(f"\n  Total AIS vessels flagged as wind-assisted: {matched}")
    
    if not_found:
        print(f"\n  Vessels not yet in AIS database ({len(not_found)}):")
        for mmsi, name in not_found:
            print(f"    - {name} (MMSI: {mmsi})")
        print(f"\n  💡 These vessels will be flagged automatically when they appear in AIS tracking")


def show_statistics(conn):
    """Show statistics about wind-assisted vessels."""
    cursor = conn.cursor()
    
    print(f"\n{'='*80}")
    print("WIND PROPULSION STATISTICS")
    print(f"{'='*80}")
    
    # Total wind vessels
    cursor.execute('SELECT COUNT(*) FROM wind_propulsion_mmsi WHERE mmsi > 0')
    total = cursor.fetchone()[0]
    print(f"Total wind-assisted vessels with MMSI: {total}")
    
    # By installation type
    cursor.execute('''
        SELECT installation_type, COUNT(*) 
        FROM wind_propulsion_mmsi 
        WHERE mmsi > 0
        GROUP BY installation_type
    ''')
    print(f"\nBy installation type:")
    for inst_type, count in cursor.fetchall():
        print(f"  {inst_type}: {count}")
    
    # Matched with AIS
    cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE wind_assisted = 1')
    matched = cursor.fetchone()[0]
    print(f"\nVessels matched with AIS data: {matched}")
    
    if matched > 0:
        print(f"\n{'='*80}")
        print("CURRENTLY TRACKED WIND-ASSISTED VESSELS:")
        print(f"{'='*80}")
        cursor.execute('''
            SELECT v.mmsi, v.name, v.length, w.technology_installed
            FROM vessels_static v
            INNER JOIN wind_propulsion_mmsi w ON v.mmsi = w.mmsi
            WHERE v.wind_assisted = 1
            ORDER BY v.length DESC
        ''')
        
        for i, (mmsi, name, length, tech) in enumerate(cursor.fetchall(), 1):
            print(f"{i:2}. MMSI {mmsi} - {name:30} ({length:3}m) - {tech}")
    
    print(f"{'='*80}\n")


def export_template_for_mmsi_lookup():
    """Export a template CSV to help look up MMSI numbers."""
    output_file = Path(__file__).parent.parent.parent / "wind_vessels_mmsi_template.csv"
    
    # Original vessel list without MMSI
    vessels = [
        ("E-Ship 1", "Ro-Ro", 130),
        ("Estraden", "Ro-Ro", 163),
        ("Goldy Seven", "General Cargo", 90),
        ("New Vitality", "Tanker", 333),
        ("Hu Po", "Tanker", 245),
        ("Afros", "Bulk Carrier", 199),
        ("Copenhagen", "Ferry", 169),
        ("Ankie", "General Cargo", 90),
        ("Anika Braren", "General Cargo", 85),
        ("SC Connector", "Ro-Ro", 155),
        ("Sea Zhoushan", "Bulk Carrier", 340),
        ("Frisian Sea", "General Cargo", 118),
        ("Naumon", "General Cargo/Theatre Vessel", 59),
        ("GNV BRIDGE", "Ferry", 203),
        ("Marfret Niolon", "Ro-Ro", 123),
        ("Anna", "General Cargo", 90),
        ("Berlin", "Ferry", 169),
        ("Shofu Maru", "Bulk Carrier", 235),
        ("Delphine", "Ro-Ro", 234),
        ("New Aden", "Tanker", 333),
        ("MN Pelican", "Ro-Ro", 154),
        ("EEMS Traveller", "General Cargo", 90),
        ("Sunnanvik", "Cement Carrier", 124),
        ("Chang Hang Sheng Hai", "Bulk Carrier", 190),
        ("TR Lady", "Bulk Carrier", 229),
        ("Cape Brolga", "Bulk Carrier", 300),
        ("Canopee", "Ro-Ro", 121),
        ("Pyxis Ocean", "Bulk Carrier", 229),
        # Add more as needed...
    ]
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("Vessel Name,Type,Length,MMSI (look up online),Notes\n")
        for name, vtype, length in vessels:
            f.write(f'"{name}","{vtype}",{length},,\n')
    
    print(f"\n📋 Template exported to: {output_file}")
    print("   Fill in MMSI column by searching on marinetraffic.com or vesselfinder.com")


def main():
    """Main import process."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    if not db_path.exists():
        print(f"Error: Database not found: {db_path}")
        print("Run ais_collector.py first to create the database.")
        return
    
    print(f"{'='*80}")
    print("WIND PROPULSION TECHNOLOGY IMPORT (MMSI-based)")
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
        
        print("\n" + "="*80)
        print("NEXT STEPS:")
        print("="*80)
        print("1. Look up MMSI numbers for remaining vessels on:")
        print("   - https://www.marinetraffic.com")
        print("   - https://www.vesselfinder.com")
        print("2. Add MMSI numbers to WIND_VESSELS_MMSI list in this script")
        print("3. Run this script again to match more vessels")
        print("="*80 + "\n")
        
    except Exception as e:
        print(f"\n✗ Error during import: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()


if __name__ == '__main__':
    main()
