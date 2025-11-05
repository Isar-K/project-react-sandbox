"""
Automated Emissions Data Matcher
Continuously monitors vessels_static for new vessels and matches them with EU MRV emissions data.
Runs as a background service alongside the AIS collector.
"""

import sqlite3
import time
from pathlib import Path
from datetime import datetime
import threading

DB_NAME = "vessel_static_data.db"
CHECK_INTERVAL = 300  # Check every 5 minutes
BATCH_SIZE = 100  # Process vessels in batches


class EmissionsMatcher:
    """Background service to match AIS vessels with emissions data."""
    
    def __init__(self, db_path):
        self.db_path = db_path
        self.running = False
        self.stats = {
            'total_checked': 0,
            'new_matches': 0,
            'already_matched': 0,
            'no_emissions_data': 0,
            'last_check': None
        }
    
    def get_connection(self):
        """Get database connection with timeout."""
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn
    
    def sync_detailed_ship_types(self):
        """Sync detailed ship types from EU MRV emissions to vessels_static."""
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Update detailed_ship_type for vessels that have a match in EU MRV
            cursor.execute('''
                UPDATE vessels_static
                SET detailed_ship_type = (
                    SELECT e.ship_type
                    FROM eu_mrv_emissions e
                    WHERE e.imo = vessels_static.imo
                )
                WHERE vessels_static.imo IN (
                    SELECT imo FROM eu_mrv_emissions
                )
                AND (vessels_static.detailed_ship_type IS NULL 
                     OR vessels_static.detailed_ship_type != (
                         SELECT e.ship_type FROM eu_mrv_emissions e WHERE e.imo = vessels_static.imo
                     ))
            ''')
            
            updated_count = cursor.rowcount
            conn.commit()
            
            if updated_count > 0:
                print(f"  ✓ Updated detailed ship type for {updated_count} vessels")
            
            return updated_count
            
        except Exception as e:
            print(f"Error syncing detailed ship types: {e}")
            return 0
        finally:
            if conn:
                conn.close()
    
    def check_and_match_vessels(self):
        """Check for new vessels and match with emissions data."""
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Find vessels with IMO that haven't been checked recently
            # We'll add a flag column to track matching status
            cursor.execute('''
                SELECT v.mmsi, v.imo, v.name, v.ship_type, v.length, v.flag_state
                FROM vessels_static v
                WHERE v.imo IS NOT NULL 
                  AND v.imo > 0
                  AND NOT EXISTS (
                      SELECT 1 FROM eu_mrv_emissions e WHERE e.imo = v.imo
                  )
                LIMIT ?
            ''', (BATCH_SIZE,))
            
            unmatched_vessels = cursor.fetchall()
            
            if not unmatched_vessels:
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] No new vessels to match")
                # Still sync detailed ship types for existing matches
                self.sync_detailed_ship_types()
                return
            
            print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Found {len(unmatched_vessels)} vessels to check...")
            
            for mmsi, imo, name, ship_type, length, flag_state in unmatched_vessels:
                self.stats['total_checked'] += 1
                
                # Check if emissions data exists for this IMO
                cursor.execute('''
                    SELECT imo, vessel_name, ship_type, company_name, total_co2_emissions
                    FROM eu_mrv_emissions
                    WHERE imo = ?
                ''', (imo,))
                
                emissions_data = cursor.fetchone()
                
                if emissions_data:
                    self.stats['new_matches'] += 1
                    imo_num, mrv_name, detailed_type, company, co2 = emissions_data
                    print(f"  ✓ MATCH: {name} (IMO: {imo}) -> {co2:,.0f} tonnes CO2")
                    print(f"    Detailed Type: {detailed_type}")
                    print(f"    Company: {company}")
                else:
                    self.stats['no_emissions_data'] += 1
            
            # Also check for vessels that ARE in emissions but not yet in AIS
            cursor.execute('''
                SELECT COUNT(*)
                FROM eu_mrv_emissions e
                WHERE NOT EXISTS (
                    SELECT 1 FROM vessels_static v WHERE v.imo = e.imo
                )
            ''')
            
            unmatched_emissions = cursor.fetchone()[0]
            
            conn.close()
            
            # Sync detailed ship types for matched vessels
            updated = self.sync_detailed_ship_types()
            
            print(f"\n  Summary:")
            print(f"    New matches: {self.stats['new_matches']}")
            print(f"    No emissions data: {self.stats['no_emissions_data']}")
            print(f"    Emissions waiting for AIS: {unmatched_emissions}")
            if updated > 0:
                print(f"    Detailed types synced: {updated}")
            
            self.stats['last_check'] = datetime.now().isoformat()
            
        except Exception as e:
            print(f"Error in matching process: {e}")
        finally:
            if conn:
                conn.close()
    
    def get_match_statistics(self):
        """Get current matching statistics."""
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Total vessels with IMO in AIS
            cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE imo IS NOT NULL AND imo > 0')
            total_ais_with_imo = cursor.fetchone()[0]
            
            # Total vessels in emissions DB
            cursor.execute('SELECT COUNT(*) FROM eu_mrv_emissions')
            total_emissions = cursor.fetchone()[0]
            
            # Matched vessels (in both databases)
            cursor.execute('''
                SELECT COUNT(*)
                FROM vessels_static v
                INNER JOIN eu_mrv_emissions e ON v.imo = e.imo
            ''')
            matched = cursor.fetchone()[0]
            
            # Vessels with emissions data but no AIS
            cursor.execute('''
                SELECT COUNT(*)
                FROM eu_mrv_emissions e
                WHERE NOT EXISTS (
                    SELECT 1 FROM vessels_static v WHERE v.imo = e.imo
                )
            ''')
            emissions_only = cursor.fetchone()[0]
            
            # Vessels with AIS but no emissions
            cursor.execute('''
                SELECT COUNT(*)
                FROM vessels_static v
                WHERE v.imo IS NOT NULL AND v.imo > 0
                AND NOT EXISTS (
                    SELECT 1 FROM eu_mrv_emissions e WHERE e.imo = v.imo
                )
            ''')
            ais_only = cursor.fetchone()[0]
            
            return {
                'total_ais_with_imo': total_ais_with_imo,
                'total_emissions': total_emissions,
                'matched': matched,
                'emissions_only': emissions_only,
                'ais_only': ais_only,
                'match_rate': (matched / total_ais_with_imo * 100) if total_ais_with_imo > 0 else 0
            }
            
        except Exception as e:
            print(f"Error getting statistics: {e}")
            return None
        finally:
            if conn:
                conn.close()
    
    def run_continuous(self):
        """Run the matcher continuously in the background."""
        self.running = True
        print("="*80)
        print("EMISSIONS DATA MATCHER - STARTED")
        print("="*80)
        print(f"Check interval: {CHECK_INTERVAL} seconds")
        print(f"Batch size: {BATCH_SIZE} vessels")
        print("="*80 + "\n")
        
        # Initial statistics
        stats = self.get_match_statistics()
        if stats:
            print("Initial Statistics:")
            print(f"  AIS vessels with IMO: {stats['total_ais_with_imo']}")
            print(f"  Emissions database: {stats['total_emissions']} vessels")
            print(f"  Matched (both DBs): {stats['matched']} vessels ({stats['match_rate']:.1f}%)")
            print(f"  AIS only: {stats['ais_only']} vessels")
            print(f"  Emissions only: {stats['emissions_only']} vessels")
            print()
        
        while self.running:
            try:
                self.check_and_match_vessels()
                
                # Show updated statistics
                stats = self.get_match_statistics()
                if stats:
                    print(f"\n  Current match rate: {stats['match_rate']:.1f}% ({stats['matched']}/{stats['total_ais_with_imo']})")
                
                print(f"\n  Next check in {CHECK_INTERVAL} seconds...")
                print("  " + "-"*76 + "\n")
                
                # Sleep in small intervals to allow graceful shutdown
                for _ in range(CHECK_INTERVAL):
                    if not self.running:
                        break
                    time.sleep(1)
                    
            except KeyboardInterrupt:
                print("\n\nShutting down matcher...")
                self.running = False
                break
            except Exception as e:
                print(f"Error in main loop: {e}")
                time.sleep(60)  # Wait a minute before retrying
        
        print("\nEmissions matcher stopped.")
        print(f"Total vessels checked: {self.stats['total_checked']}")
        print(f"New matches found: {self.stats['new_matches']}")
    
    def stop(self):
        """Stop the matcher."""
        self.running = False


def main():
    """Main entry point."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    if not db_path.exists():
        print(f"Error: Database not found: {db_path}")
        print("Run ais_collector.py first to create the database.")
        return
    
    matcher = EmissionsMatcher(db_path)
    
    try:
        matcher.run_continuous()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
        matcher.stop()


if __name__ == "__main__":
    main()
