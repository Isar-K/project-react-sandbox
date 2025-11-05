import websocket
import json
import sqlite3
import os
import sys
from datetime import datetime
from pathlib import Path

# Handle both direct script execution and module import
try:
    from .mmsi_mid_lookup import get_flag_state
except ImportError:
    # Add parent directory to path for direct script execution
    sys.path.insert(0, str(Path(__file__).parent))
    from mmsi_mid_lookup import get_flag_state

# Database configuration
DB_NAME = "vessel_static_data.db"
API_KEY_FILE = "api.txt"

# AISStream WebSocket URL
WEBSOCKET_URL = "wss://stream.aisstream.io/v0/stream"

# Global database connection
db_conn = None
API_KEY = None

# Statistics tracking
message_count = 0
vessel_count = 0
last_stats_time = None


def load_api_key():
    """
    Load the API key from environment variable or api.txt file.
    Reads the last non-empty line from the file.
    """
    # Check if API key is provided via environment variable
    env_key = os.environ.get('AIS_API_KEY')
    if env_key:
        print(f"Using API key from environment variable")
        return env_key
    try:
        project_root = Path(__file__).parent.parent.parent
        api_file_path = project_root / API_KEY_FILE
        
        with open(api_file_path, 'r') as f:
            lines = f.readlines()
            # Get the last non-empty line (stripped of whitespace)
            for line in reversed(lines):
                line = line.strip()
                if line:
                    return line
        
        raise ValueError("No API key found in api.txt")
    except FileNotFoundError:
        raise FileNotFoundError(f"API key file '{API_KEY_FILE}' not found. Please create it with your AISStream API key.")
    except Exception as e:
        raise Exception(f"Error loading API key: {e}")


def init_database():
    """
    Initialize the SQLite database and create the vessels_static table if it doesn't exist.
    Returns the database connection.
    """
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cursor = conn.cursor()
    
    # Create the vessels_static table with UPSERT support
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vessels_static (
            mmsi INTEGER PRIMARY KEY UNIQUE NOT NULL,
            name TEXT,
            ship_type INTEGER,
            detailed_ship_type TEXT,
            length INTEGER,
            beam INTEGER,
            imo INTEGER,
            call_sign TEXT,
            flag_state TEXT,
            signatory_company TEXT,
            last_updated TEXT NOT NULL
        )
    ''')
    
    # Create position history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vessel_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mmsi INTEGER NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            sog REAL,
            cog REAL,
            heading INTEGER,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (mmsi) REFERENCES vessels_static(mmsi)
        )
    ''')
    
    # Create index for faster queries
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_positions_mmsi_time 
        ON vessel_positions(mmsi, timestamp DESC)
    ''')
    
    # Add new columns if they don't exist (for existing databases)
    new_columns = [
        ('flag_state', 'TEXT'),
        ('signatory_company', 'TEXT'),
        ('destination', 'TEXT'),
        ('eta', 'TEXT'),
        ('draught', 'REAL'),
        ('nav_status', 'INTEGER'),
        ('detailed_ship_type', 'TEXT')
    ]
    
    for column_name, column_type in new_columns:
        try:
            cursor.execute(f'ALTER TABLE vessels_static ADD COLUMN {column_name} {column_type}')
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
    
    conn.commit()
    print(f"Database initialized: {db_path}")
    return conn


def save_vessel_data(mmsi, name, ship_type, length, beam, imo, call_sign, destination=None, eta=None, draught=None, nav_status=None):
    """
    Save or update vessel static data in the database using UPSERT.
    """
    global db_conn
    
    if db_conn is None:
        print("Error: Database connection not available")
        return
    
    # Get flag state from MMSI
    flag_state = get_flag_state(mmsi)
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Test if connection is still alive
            db_conn.execute("SELECT 1")
            
            cursor = db_conn.cursor()
            timestamp = datetime.utcnow().isoformat()
            
            # UPSERT: Insert or replace if MMSI already exists
            # NOTE: signatory_company is NOT updated here - it's preserved from retrofill_companies.py
            cursor.execute('''
                INSERT INTO vessels_static (mmsi, name, ship_type, length, beam, imo, call_sign, flag_state, destination, eta, draught, nav_status, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mmsi) DO UPDATE SET
                    name = COALESCE(excluded.name, name),
                    ship_type = COALESCE(excluded.ship_type, ship_type),
                    length = COALESCE(excluded.length, length),
                    beam = COALESCE(excluded.beam, beam),
                    imo = COALESCE(excluded.imo, imo),
                    call_sign = COALESCE(excluded.call_sign, call_sign),
                    flag_state = COALESCE(excluded.flag_state, flag_state),
                    destination = COALESCE(excluded.destination, destination),
                    eta = COALESCE(excluded.eta, eta),
                    draught = COALESCE(excluded.draught, draught),
                    nav_status = COALESCE(excluded.nav_status, nav_status),
                    last_updated = excluded.last_updated
            ''', (mmsi, name, ship_type, length, beam, imo, call_sign, flag_state, destination, eta, draught, nav_status, timestamp))
            
            db_conn.commit()
            print(f"✓ Saved to DB: MMSI {mmsi} - {name or 'Unknown'} ({flag_state or 'Unknown flag'})")
            return  # Success, exit function
            
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e) and attempt < max_retries - 1:
                import time
                time.sleep(0.1 * (attempt + 1))  # Exponential backoff
                continue
            print(f"Database error while saving vessel {mmsi}: {e}")
            return
        except Exception as e:
            print(f"Error saving vessel {mmsi}: {e}")
            return


def print_stats():
    """Print periodic statistics."""
    global message_count, vessel_count, last_stats_time
    import time
    
    current_time = time.time()
    if last_stats_time is None:
        last_stats_time = current_time
        return
    
    # Print stats every 5 minutes (300 seconds)
    if current_time - last_stats_time >= 300:
        try:
            cursor = db_conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM vessels_static')
            total_vessels = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE length IS NOT NULL AND length > 0')
            with_length = cursor.fetchone()[0]
            
            print(f"\n{'='*60}")
            print(f"[STATS] Messages processed: {message_count}")
            print(f"[STATS] Total vessels in DB: {total_vessels}")
            print(f"[STATS] Vessels with dimensions: {with_length}")
            print(f"[STATS] Uptime: {int((current_time - last_stats_time) / 60)} minutes")
            print(f"{'='*60}\n")
        except Exception as e:
            print(f"Error printing stats: {e}")
        
        last_stats_time = current_time


def on_message(ws, message):
    """
    Called when a message is received from the WebSocket.
    """
    global message_count, vessel_count
    
    try:
        message_count += 1
        
        # Print stats periodically
        if message_count % 1000 == 0:
            print_stats()
        
        data = json.loads(message)
        
        # Check for error messages from the server
        if "error" in data or "Error" in data:
            print(f"[ERROR] Server error: {data}")
            return
        
        # Process ShipStaticData messages (Message Type 5 - contains IMO)
        if "MessageType" in data and data["MessageType"] == "ShipStaticData":
            metadata = data.get("MetaData", {})
            ship_data = data.get("Message", {}).get("ShipStaticData", {})
            
            mmsi = metadata.get("MMSI") or ship_data.get("UserID")
            vessel_name = ship_data.get("Name", "").strip() or metadata.get("ShipName", "").strip() or None
            vessel_type = ship_data.get("Type") or ship_data.get("ShipType")
            
            # Get dimensions
            dimension = ship_data.get("Dimension", {})
            dim_a = dimension.get("A", 0)
            dim_b = dimension.get("B", 0)
            dim_c = dimension.get("C", 0)
            dim_d = dimension.get("D", 0)
            length = (dim_a + dim_b) if (dim_a + dim_b) > 0 else None
            beam = (dim_c + dim_d) if (dim_c + dim_d) > 0 else None
            
            call_sign = ship_data.get("CallSign", "").strip() or None
            imo = ship_data.get("ImoNumber") or None
            
            # Get voyage data
            destination = ship_data.get("Destination", "").strip() or None
            eta_raw = ship_data.get("Eta")
            # Convert ETA dict to string if present
            if eta_raw and isinstance(eta_raw, dict):
                eta = json.dumps(eta_raw)
            else:
                eta = None
            draught = ship_data.get("MaximumStaticDraught") or None
            nav_status = metadata.get("NavigationalStatus") or None
            
            # Print the received data
            print(f"\n--- Ship Static Data Received (Type 5) ---")
            print(f"  MMSI: {mmsi}")
            print(f"  Name: {vessel_name}")
            print(f"  Type: {vessel_type}")
            print(f"  Length: {length}m")
            print(f"  Beam: {beam}m")
            print(f"  IMO: {imo}")
            print(f"  Call Sign: {call_sign}")
            print(f"  Destination: {destination}")
            print(f"  ETA: {eta}")
            print(f"  Draught: {draught}m")
            print("-" * 40)
            
            # Save to database - Filter: >= 100m AND type 70-89 (Cargo/Tanker)
            if mmsi is not None:
                if length and length >= 100:
                    if vessel_type and (70 <= vessel_type <= 89):
                        save_vessel_data(mmsi, vessel_name, vessel_type, length, beam, imo, call_sign, destination, eta, draught, nav_status)
                        print(f"✓ Saved (type {vessel_type}, {length}m)")
                    else:
                        type_desc = f"type {vessel_type}" if vessel_type else "unknown type"
                        print(f"✗ Skipped ({type_desc}, not 70-89)")
                else:
                    print(f"✗ Skipped (length {length}m < 100m)")
            else:
                print("Warning: Received ShipStaticData without MMSI, skipping database save")
        
        # Check if the message contains AIS data and specifically a StaticDataReport
        elif "MessageType" in data and data["MessageType"] == "StaticDataReport":
            # Extract from MetaData (primary source) and Message (secondary)
            metadata = data.get("MetaData", {})
            static_report = data.get("Message", {}).get("StaticDataReport", {})
            
            # Get MMSI from MetaData (most reliable)
            mmsi = metadata.get("MMSI") or static_report.get("UserID")
            
            # Get vessel name from MetaData
            vessel_name = metadata.get("ShipName", "").strip() or None
            
            # Get ship type from ReportB if available
            report_b = static_report.get("ReportB", {})
            if report_b.get("Valid"):
                ship_type_val = report_b.get("ShipType", 0)
                vessel_type = ship_type_val if ship_type_val > 0 else None
            else:
                vessel_type = None
            
            # Get dimensions from ReportB
            dimension = report_b.get("Dimension", {})
            if report_b.get("Valid"):
                length_calc = dimension.get("A", 0) + dimension.get("B", 0)
                beam_calc = dimension.get("C", 0) + dimension.get("D", 0)
                length = length_calc if length_calc > 0 else None
                beam = beam_calc if beam_calc > 0 else None
            else:
                length = None
                beam = None
            
            # Get call sign from ReportB
            call_sign = report_b.get("CallSign", "").strip() or None if report_b.get("Valid") else None
            
            # IMO is not typically in Class B static reports (Message Type 24)
            imo = None

            # Print the received data
            print(f"\n--- Static Data Report Received ---")
            print(f"  MMSI: {mmsi}")
            print(f"  Name: {vessel_name}")
            print(f"  Type: {vessel_type}")
            print(f"  Length: {length}m")
            print(f"  Beam: {beam}m")
            print(f"  IMO: {imo}")
            print(f"  Call Sign: {call_sign}")
            print("-" * 40)
            
            # Save to database - Filter: >= 100m AND type 70-89 (Cargo/Tanker)
            if mmsi is not None:
                if length and length >= 100:
                    if vessel_type and (70 <= vessel_type <= 89):
                        save_vessel_data(mmsi, vessel_name, vessel_type, length, beam, imo, call_sign)
                        print(f"✓ Saved (type {vessel_type}, {length}m)")
                    else:
                        type_desc = f"type {vessel_type}" if vessel_type else "unknown type"
                        print(f"✗ Skipped ({type_desc}, not 70-89)")
                else:
                    print(f"✗ Skipped (length {length}m < 100m)")
            else:
                print("Warning: Received StaticDataReport without MMSI, skipping database save")
        
        # ALSO process PositionReport messages to catch ships already in Atlantic
        elif "MessageType" in data and data["MessageType"] == "PositionReport":
            metadata = data.get("MetaData", {})
            
            mmsi = metadata.get("MMSI")
            vessel_name = metadata.get("ShipName", "").strip() or None
            vessel_type = metadata.get("ShipType")
            
            # Only save if we don't already have this vessel in DB
            # This allows us to catch ships already in the Atlantic
            if mmsi and vessel_type and (70 <= vessel_type <= 79 or 80 <= vessel_type <= 89):
                # Check if vessel exists in database
                try:
                    cursor = db_conn.cursor()
                    cursor.execute('SELECT mmsi FROM vessels_static WHERE mmsi = ?', (mmsi,))
                    exists = cursor.fetchone()
                    
                    if not exists:
                        # Save basic info - will be enriched when we get static data
                        save_vessel_data(mmsi, vessel_name, vessel_type, None, None, None, None)
                        print(f"✓ Added from PositionReport: {mmsi} - {vessel_name or 'Unknown'} (type {vessel_type})")
                except Exception as e:
                    print(f"Error checking vessel existence: {e}")

    except json.JSONDecodeError:
        print(f"Received non-JSON message: {message}")
    except Exception as e:
        print(f"Error processing message: {e}")


def on_error(ws, error):
    """
    Called when a WebSocket error occurs.
    """
    # Only print critical errors, not connection drops (handled by reconnect)
    error_str = str(error)
    if "Connection to remote host was lost" not in error_str:
        print(f"### Error: {error} ###")
        print(f"### Error Type: {type(error).__name__} ###")


def on_close(ws, close_status_code, close_msg):
    """
    Called when the WebSocket connection is closed.
    Don't close the database - we'll reuse it on reconnect.
    """
    global db_conn
    
    print(f"\n### WebSocket Closed: {close_status_code} - {close_msg} ###")
    
    # Commit any pending transactions but keep connection open for reconnect
    if db_conn:
        try:
            db_conn.commit()
            print("Database transactions committed.")
        except Exception as e:
            print(f"Error committing database: {e}")


def on_open(ws):
    """
    Called when the WebSocket connection is established.
    Sends the subscription message.
    """
    print("WebSocket connection opened. Sending subscription message...")
    
    # Define the subscription message as a JSON object
    # We are filtering for only "StaticDataReport" messages
    # You can also add FilterBoundingBoxes to limit geographical area, e.g.:
    # "FilterBoundingBoxes": [
    #     {"MinLat": -90, "MaxLat": 90, "MinLon": -180, "MaxLon": 180}
    # ]
    
    # Subscribe with FULL ATLANTIC COVERAGE - US East Coast to Europe
    subscribe_message = {
        "APIKey": API_KEY,
        "BoundingBoxes": [
            [
                [25.0, -80.0],   # Southwest corner (Florida, Caribbean)
                [75.0, 35.0]     # Northeast corner (Arctic Norway, Baltic Sea)
            ]
        ]
        # FULL ATLANTIC COVERAGE:
        # - US East Coast (Florida, New York, Boston, Halifax)
        # - Complete trans-Atlantic shipping routes
        # - Caribbean approaches
        # - North Atlantic, European Atlantic Coast
        # - North Sea, Baltic Sea, Mediterranean
        # - Major routes: US-Europe, Gibraltar, English Channel, Suez
    }
    
    print(f"Sending subscription: {json.dumps(subscribe_message, indent=2)}")
    
    # Send the JSON message over the WebSocket
    ws.send(json.dumps(subscribe_message))
    print("Subscription message sent.\n")


if __name__ == "__main__":
    try:
        # Load API key from file
        print("Loading API key from api.txt...")
        API_KEY = load_api_key()
        print("API key loaded successfully.\n")
        
        # Initialize database
        print("Initializing database...")
        db_conn = init_database()
        print("Database ready.\n")
        
        # Enable WebSocket debugging for troubleshooting (disable for cleaner output)
        # websocket.enableTrace(True)
        
        # Auto-reconnect loop
        reconnect_delay = 5  # seconds
        max_reconnect_delay = 60  # max 60 seconds between reconnects
        
        while True:
            try:
                print("Connecting to AISStream...")
                print("Press Ctrl+C to stop.\n")
                
                # Create a WebSocketApp instance
                ws_app = websocket.WebSocketApp(
                    WEBSOCKET_URL,
                    on_open=on_open,
                    on_message=on_message,
                    on_error=on_error,
                    on_close=on_close
                )

                # Run the WebSocket - will block until connection closes
                ws_app.run_forever()
                
                # If we get here, connection was closed
                print(f"\n[RECONNECT] Connection lost. Reconnecting in {reconnect_delay} seconds...")
                import time
                time.sleep(reconnect_delay)
                
                # Increase delay for next reconnect (exponential backoff)
                reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)
                
            except KeyboardInterrupt:
                print("\n\nScript interrupted by user.")
                break
            except Exception as e:
                print(f"\n[ERROR] Unexpected error: {e}")
                print(f"[RECONNECT] Retrying in {reconnect_delay} seconds...")
                import time
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)

    except KeyboardInterrupt:
        print("\n\nScript interrupted by user.")
    except Exception as e:
        print(f"\n\nFatal error: {e}")
    finally:
        # Ensure database is closed on exit
        if db_conn:
            try:
                db_conn.commit()
                db_conn.close()
                print("Database connection closed.")
            except:
                pass
        print("Script finished!.")
