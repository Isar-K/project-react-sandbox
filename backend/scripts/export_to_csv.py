"""
Export vessel static data from SQLite database to CSV file.
"""
import sqlite3
import csv
from pathlib import Path
from datetime import datetime

DB_NAME = "vessel_static_data.db"


def export_to_csv(output_filename=None):
    """
    Export all vessel data to a CSV file.
    """
    script_dir = Path(__file__).parent
    db_path = script_dir / DB_NAME
    
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        print("Run ais_collector.py first to create and populate the database.")
        return
    
    # Generate default filename with timestamp if not provided
    if output_filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"vessel_data_{timestamp}.csv"
    
    output_path = script_dir / output_filename
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all vessel data
    cursor.execute('SELECT * FROM vessels_static ORDER BY mmsi')
    vessels = cursor.fetchall()
    
    if not vessels:
        print("No vessel data found in database.")
        conn.close()
        return
    
    # Get column names
    cursor.execute('PRAGMA table_info(vessels_static)')
    columns = [col[1] for col in cursor.fetchall()]
    
    # Write to CSV
    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        
        # Write header
        writer.writerow(columns)
        
        # Write data
        writer.writerows(vessels)
    
    conn.close()
    
    print(f"\n{'='*60}")
    print(f"Export completed successfully!")
    print(f"{'='*60}")
    print(f"Records exported: {len(vessels)}")
    print(f"Output file: {output_path}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    import sys
    
    # Allow custom filename from command line
    if len(sys.argv) > 1:
        filename = sys.argv[1]
        if not filename.endswith('.csv'):
            filename += '.csv'
        export_to_csv(filename)
    else:
        export_to_csv()
