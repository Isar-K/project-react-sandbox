"""
Simple utility to query the vessel static data database.
"""
import sqlite3
from pathlib import Path
from datetime import datetime

DB_NAME = "vessel_static_data.db"


def get_db_connection():
    """Get database connection."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        print("Run ais_collector.py first to create and populate the database.")
        return None
    
    return sqlite3.connect(db_path)


def print_vessel(row):
    """Pretty print a vessel record."""
    mmsi, name, ship_type, length, beam, imo, call_sign, last_updated = row
    print(f"\n{'='*60}")
    print(f"MMSI: {mmsi}")
    print(f"Name: {name or 'N/A'}")
    print(f"Ship Type: {ship_type or 'N/A'}")
    print(f"Dimensions: {length or 'N/A'}m x {beam or 'N/A'}m (L x B)")
    print(f"IMO: {imo or 'N/A'}")
    print(f"Call Sign: {call_sign or 'N/A'}")
    print(f"Last Updated: {last_updated}")
    print(f"{'='*60}")


def show_statistics(conn):
    """Show database statistics."""
    cursor = conn.cursor()
    
    # Total vessels
    cursor.execute('SELECT COUNT(*) FROM vessels_static')
    total = cursor.fetchone()[0]
    
    # Vessels with names
    cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE name IS NOT NULL AND name != ""')
    with_names = cursor.fetchone()[0]
    
    # Most recent update
    cursor.execute('SELECT MAX(last_updated) FROM vessels_static')
    latest = cursor.fetchone()[0]
    
    print("\n" + "="*60)
    print("DATABASE STATISTICS")
    print("="*60)
    print(f"Total vessels: {total}")
    print(f"Vessels with names: {with_names}")
    print(f"Latest update: {latest or 'N/A'}")
    print("="*60 + "\n")


def list_all_vessels(conn, limit=10):
    """List all vessels (limited)."""
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM vessels_static 
        ORDER BY last_updated DESC 
        LIMIT ?
    ''', (limit,))
    
    vessels = cursor.fetchall()
    
    if not vessels:
        print("No vessels found in database.")
        return
    
    print(f"\n{'='*60}")
    print(f"SHOWING {len(vessels)} MOST RECENT VESSELS")
    print(f"{'='*60}")
    
    for vessel in vessels:
        print_vessel(vessel)


def search_by_mmsi(conn, mmsi):
    """Search for a vessel by MMSI."""
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM vessels_static WHERE mmsi = ?', (mmsi,))
    vessel = cursor.fetchone()
    
    if vessel:
        print_vessel(vessel)
    else:
        print(f"No vessel found with MMSI: {mmsi}")


def search_by_name(conn, name):
    """Search for vessels by name (partial match)."""
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM vessels_static 
        WHERE name LIKE ? 
        ORDER BY name
    ''', (f'%{name}%',))
    
    vessels = cursor.fetchall()
    
    if not vessels:
        print(f"No vessels found matching name: {name}")
        return
    
    print(f"\nFound {len(vessels)} vessel(s) matching '{name}':")
    for vessel in vessels:
        print_vessel(vessel)


def list_by_ship_type(conn, ship_type):
    """List vessels by ship type."""
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM vessels_static 
        WHERE ship_type = ? 
        ORDER BY last_updated DESC
    ''', (ship_type,))
    
    vessels = cursor.fetchall()
    
    if not vessels:
        print(f"No vessels found with ship type: {ship_type}")
        return
    
    print(f"\nFound {len(vessels)} vessel(s) with ship type {ship_type}:")
    for vessel in vessels:
        print_vessel(vessel)


def main():
    """Main interactive menu."""
    conn = get_db_connection()
    if not conn:
        return
    
    try:
        while True:
            print("\n" + "="*60)
            print("VESSEL DATABASE QUERY TOOL")
            print("="*60)
            print("1. Show statistics")
            print("2. List recent vessels (default: 10)")
            print("3. Search by MMSI")
            print("4. Search by name")
            print("5. List by ship type")
            print("6. Exit")
            print("="*60)
            
            choice = input("\nEnter your choice (1-6): ").strip()
            
            if choice == '1':
                show_statistics(conn)
            
            elif choice == '2':
                limit_str = input("How many vessels to show? (default: 10): ").strip()
                limit = int(limit_str) if limit_str.isdigit() else 10
                list_all_vessels(conn, limit)
            
            elif choice == '3':
                mmsi_str = input("Enter MMSI: ").strip()
                if mmsi_str.isdigit():
                    search_by_mmsi(conn, int(mmsi_str))
                else:
                    print("Invalid MMSI. Must be a number.")
            
            elif choice == '4':
                name = input("Enter vessel name (partial match): ").strip()
                if name:
                    search_by_name(conn, name)
                else:
                    print("Name cannot be empty.")
            
            elif choice == '5':
                ship_type_str = input("Enter ship type code: ").strip()
                if ship_type_str.isdigit():
                    list_by_ship_type(conn, int(ship_type_str))
                else:
                    print("Invalid ship type. Must be a number.")
            
            elif choice == '6':
                print("\nGoodbye!")
                break
            
            else:
                print("Invalid choice. Please enter 1-6.")
    
    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
    
    finally:
        conn.close()
        print("Database connection closed.")


if __name__ == "__main__":
    main()
