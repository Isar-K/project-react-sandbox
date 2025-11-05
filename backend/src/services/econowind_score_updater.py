"""
Econowind Fit Score Updater
Continuously recalculates Econowind fit scores for vessels in the emissions database.
Runs as a background service to keep scores up-to-date as new AIS data arrives.
"""

import sqlite3
import time
from pathlib import Path
from datetime import datetime
import numpy as np

DB_NAME = "vessel_static_data.db"
CHECK_INTERVAL = 3600  # Check every hour
BATCH_SIZE = 500

class EconowindScoreUpdater:
    """Background service to update Econowind fit scores."""
    
    def __init__(self, db_path):
        self.db_path = db_path
        self.running = False
        self.stats = {
            'total_updated': 0,
            'scores_changed': 0,
            'last_update': None
        }
    
    def get_connection(self):
        """Get database connection with timeout."""
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn
    
    def calculate_scores(self):
        """Calculate Econowind fit scores for all vessels."""
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting score calculation...")
            
            # Get all vessels from emissions database
            cursor.execute('''
                SELECT imo, ship_type, avg_co2_per_distance, technical_efficiency, econowind_fit_score
                FROM eu_mrv_emissions
            ''')
            
            vessels = cursor.fetchall()
            
            if not vessels:
                print("  No vessels found in emissions database")
                return
            
            print(f"  Processing {len(vessels)} vessels...")
            
            # Get length data from AIS database
            cursor.execute('''
                SELECT imo, length
                FROM vessels_static
                WHERE imo IS NOT NULL AND length IS NOT NULL AND length > 0
            ''')
            length_map = {imo: length for imo, length in cursor.fetchall()}
            
            # Preferred ship types
            preferred_types = {
                "Bulk carrier",
                "General cargo",
                "Chemical tanker",
                "LNG carrier",
                "Other ship types",
                "Ro-Ro cargo ship",
            }
            
            # Get CO2 quantiles for scoring
            co2_values = [v[2] for v in vessels if v[2] is not None]
            if co2_values:
                co2_75 = float(np.percentile(co2_values, 75))
                co2_50 = float(np.percentile(co2_values, 50))
            else:
                co2_75 = co2_50 = None
            
            updated_count = 0
            changed_count = 0
            
            # Calculate scores for each vessel
            for imo, ship_type, avg_co2, tech_eff, old_score in vessels:
                new_score = 0
                
                # 1. Ship type scoring
                if ship_type in preferred_types:
                    new_score += 2
                
                # 2. Length scoring
                length = length_map.get(imo)
                if length:
                    if 100 <= length <= 160:
                        new_score += 2
                    elif 80 <= length < 100 or 160 < length <= 200:
                        new_score += 1
                
                # 3. CO2 emissions intensity scoring
                if avg_co2 is not None and co2_75 is not None and co2_50 is not None:
                    if avg_co2 >= co2_75:
                        new_score += 2
                    elif avg_co2 >= co2_50:
                        new_score += 1
                
                # 4. Technical efficiency scoring
                if tech_eff:
                    try:
                        eff_value = float(str(tech_eff).split('(')[-1].strip(')').split()[0])
                        if eff_value > 10:
                            new_score += 2
                        elif eff_value >= 6:
                            new_score += 1
                    except:
                        pass
                
                # Update if score changed
                if new_score != old_score:
                    cursor.execute('''
                        UPDATE eu_mrv_emissions
                        SET econowind_fit_score = ?
                        WHERE imo = ?
                    ''', (new_score, imo))
                    changed_count += 1
                
                updated_count += 1
                
                # Commit in batches
                if updated_count % BATCH_SIZE == 0:
                    conn.commit()
                    print(f"  Progress: {updated_count}/{len(vessels)} vessels processed...")
            
            conn.commit()
            
            self.stats['total_updated'] = updated_count
            self.stats['scores_changed'] = changed_count
            self.stats['last_update'] = datetime.now().isoformat()
            
            print(f"\n  ✓ Complete!")
            print(f"    Total processed: {updated_count}")
            print(f"    Scores changed: {changed_count}")
            print(f"    Scores unchanged: {updated_count - changed_count}")
            
        except Exception as e:
            print(f"Error calculating scores: {e}")
        finally:
            if conn:
                conn.close()
    
    def run_continuous(self):
        """Run the updater continuously in the background."""
        self.running = True
        print("="*80)
        print("ECONOWIND FIT SCORE UPDATER - STARTED")
        print("="*80)
        print(f"Check interval: {CHECK_INTERVAL} seconds ({CHECK_INTERVAL//60} minutes)")
        print(f"Batch size: {BATCH_SIZE} vessels")
        print("="*80 + "\n")
        
        while self.running:
            try:
                self.calculate_scores()
                
                print(f"\n  Next update in {CHECK_INTERVAL} seconds...")
                print("  " + "-"*76 + "\n")
                
                # Sleep in small intervals to allow graceful shutdown
                for _ in range(CHECK_INTERVAL):
                    if not self.running:
                        break
                    time.sleep(1)
                    
            except KeyboardInterrupt:
                print("\n\nShutting down updater...")
                self.running = False
                break
            except Exception as e:
                print(f"Error in main loop: {e}")
                time.sleep(60)
        
        print("\nEconowind score updater stopped.")
        print(f"Total updates: {self.stats['total_updated']}")
        print(f"Scores changed: {self.stats['scores_changed']}")
    
    def stop(self):
        """Stop the updater."""
        self.running = False


def main():
    """Main entry point."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    if not db_path.exists():
        print(f"Error: Database not found: {db_path}")
        print("Run ais_collector.py first to create the database.")
        return
    
    updater = EconowindScoreUpdater(db_path)
    
    try:
        updater.run_continuous()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
        updater.stop()


if __name__ == "__main__":
    main()
