"""
Automatic Database Cleanup Script
Removes old position data and optimizes database to prevent disk space issues.
Run this daily via cron or manually when needed.
"""

import sqlite3
from pathlib import Path
from datetime import datetime

DB_NAME = "vessel_static_data.db"
DAYS_TO_KEEP = 7  # Keep last 7 days of position data


def cleanup_old_positions(conn):
    """Delete position records older than DAYS_TO_KEEP days."""
    cursor = conn.cursor()
    
    print(f"\n🧹 Cleaning old position data (keeping last {DAYS_TO_KEEP} days)...")
    
    # Count before
    cursor.execute("SELECT COUNT(*) FROM vessel_positions")
    before_count = cursor.fetchone()[0]
    print(f"   Position records before: {before_count:,}")
    
    # Delete old records
    cursor.execute(f"""
        DELETE FROM vessel_positions 
        WHERE timestamp < datetime('now', '-{DAYS_TO_KEEP} days')
    """)
    deleted = cursor.rowcount
    conn.commit()
    
    # Count after
    cursor.execute("SELECT COUNT(*) FROM vessel_positions")
    after_count = cursor.fetchone()[0]
    
    print(f"   Deleted: {deleted:,} old records")
    print(f"   Remaining: {after_count:,} records")
    
    return deleted


def vacuum_database(conn):
    """Reclaim disk space by vacuuming the database."""
    print(f"\n🗜️  Vacuuming database to reclaim space...")
    
    cursor = conn.cursor()
    cursor.execute("VACUUM")
    
    print(f"   ✅ Database optimized")


def show_database_stats(conn):
    """Show current database statistics."""
    cursor = conn.cursor()
    
    print(f"\n📊 Database Statistics:")
    print(f"   {'='*60}")
    
    # Vessel count
    cursor.execute("SELECT COUNT(*) FROM vessels_static")
    vessel_count = cursor.fetchone()[0]
    print(f"   Vessels in database: {vessel_count:,}")
    
    # Position count
    cursor.execute("SELECT COUNT(*) FROM vessel_positions")
    position_count = cursor.fetchone()[0]
    print(f"   Position records: {position_count:,}")
    
    # Emissions count
    try:
        cursor.execute("SELECT COUNT(*) FROM eu_mrv_emissions")
        emissions_count = cursor.fetchone()[0]
        print(f"   Emissions records: {emissions_count:,}")
    except sqlite3.OperationalError:
        print(f"   Emissions records: N/A (table not created)")
    
    # Oldest position
    cursor.execute("SELECT MIN(timestamp) FROM vessel_positions")
    oldest = cursor.fetchone()[0]
    if oldest:
        print(f"   Oldest position: {oldest}")
    
    # Newest position
    cursor.execute("SELECT MAX(timestamp) FROM vessel_positions")
    newest = cursor.fetchone()[0]
    if newest:
        print(f"   Newest position: {newest}")
    
    print(f"   {'='*60}")


def main():
    """Main cleanup process."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    if not db_path.exists():
        print(f"❌ Database not found: {db_path}")
        return
    
    # Get file size before
    size_before = db_path.stat().st_size / (1024 * 1024)  # MB
    
    print(f"{'='*70}")
    print(f"DATABASE CLEANUP - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}")
    print(f"Database: {db_path}")
    print(f"Size before: {size_before:.1f} MB")
    
    conn = sqlite3.connect(db_path)
    
    try:
        # Show stats before
        show_database_stats(conn)
        
        # Clean old positions
        deleted = cleanup_old_positions(conn)
        
        # Vacuum if we deleted a lot
        if deleted > 10000:
            vacuum_database(conn)
        else:
            print(f"\n⏭️  Skipping vacuum (only {deleted:,} records deleted)")
        
        # Show stats after
        show_database_stats(conn)
        
        # Get file size after
        conn.close()
        size_after = db_path.stat().st_size / (1024 * 1024)  # MB
        saved = size_before - size_after
        
        print(f"\n✅ Cleanup Complete!")
        print(f"   Size after: {size_after:.1f} MB")
        if saved > 0:
            print(f"   Space saved: {saved:.1f} MB")
        print(f"{'='*70}\n")
        
    except Exception as e:
        print(f"\n❌ Error during cleanup: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
