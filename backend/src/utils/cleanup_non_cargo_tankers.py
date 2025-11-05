#!/usr/bin/env python3
"""
Cleanup script to remove all vessels from the database that are NOT cargo (70-79) or tankers (80-89).
This removes old data from before we implemented the cargo/tanker filter.
"""

import sqlite3
from pathlib import Path

DB_NAME = "vessel_static_data.db"

def cleanup_database():
    """Remove all vessels that are not cargo or tankers."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    print(f"Opening database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Count vessels before cleanup
    cursor.execute('SELECT COUNT(*) FROM vessels_static')
    total_before = cursor.fetchone()[0]
    print(f"\n📊 Total vessels before cleanup: {total_before}")
    
    # Count cargo/tankers
    cursor.execute('''
        SELECT COUNT(*) 
        FROM vessels_static 
        WHERE ship_type >= 70 AND ship_type < 90
    ''')
    cargo_tanker_count = cursor.fetchone()[0]
    print(f"✅ Cargo/Tanker vessels (70-89): {cargo_tanker_count}")
    
    # Count non-cargo/tanker
    cursor.execute('''
        SELECT COUNT(*) 
        FROM vessels_static 
        WHERE ship_type < 70 OR ship_type >= 90 OR ship_type IS NULL
    ''')
    non_cargo_tanker_count = cursor.fetchone()[0]
    print(f"❌ Non-Cargo/Tanker vessels to delete: {non_cargo_tanker_count}")
    
    if non_cargo_tanker_count == 0:
        print("\n✨ Database is already clean! No vessels to remove.")
        conn.close()
        return
    
    # Show some examples of what will be deleted
    print("\n📋 Examples of vessels to be deleted:")
    cursor.execute('''
        SELECT mmsi, name, ship_type 
        FROM vessels_static 
        WHERE ship_type < 70 OR ship_type >= 90 OR ship_type IS NULL
        LIMIT 10
    ''')
    for mmsi, name, ship_type in cursor.fetchall():
        print(f"  - MMSI {mmsi}: {name or 'Unknown'} (type {ship_type})")
    
    # Ask for confirmation
    print(f"\n⚠️  WARNING: This will delete {non_cargo_tanker_count} vessels from the database!")
    response = input("Do you want to proceed? (yes/no): ").strip().lower()
    
    if response != 'yes':
        print("❌ Cleanup cancelled.")
        conn.close()
        return
    
    print("\n🗑️  Deleting non-cargo/tanker vessels...")
    
    # First, delete their position history
    cursor.execute('''
        DELETE FROM vessel_positions 
        WHERE mmsi IN (
            SELECT mmsi FROM vessels_static 
            WHERE ship_type < 70 OR ship_type >= 90 OR ship_type IS NULL
        )
    ''')
    positions_deleted = cursor.rowcount
    print(f"  ✓ Deleted {positions_deleted} position records")
    
    # Then delete the vessels
    cursor.execute('''
        DELETE FROM vessels_static 
        WHERE ship_type < 70 OR ship_type >= 90 OR ship_type IS NULL
    ''')
    vessels_deleted = cursor.rowcount
    conn.commit()
    print(f"  ✓ Deleted {vessels_deleted} vessels")
    
    # Count vessels after cleanup
    cursor.execute('SELECT COUNT(*) FROM vessels_static')
    total_after = cursor.fetchone()[0]
    
    # Vacuum to reclaim space
    print("\n🧹 Vacuuming database to reclaim space...")
    cursor.execute('VACUUM')
    conn.commit()
    
    print(f"\n✅ Cleanup complete!")
    print(f"   Before: {total_before} vessels")
    print(f"   After:  {total_after} vessels")
    print(f"   Deleted: {total_before - total_after} vessels")
    print(f"\n💾 Database now contains ONLY cargo (70-79) and tanker (80-89) vessels!")
    
    conn.close()


if __name__ == "__main__":
    try:
        cleanup_database()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
