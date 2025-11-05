"""
Track Filtered Vessels - Real-time Position Tracking
Filters vessels from the database (length >= 100m, excluding container ships)
and tracks their real-time positions via AISStream WebSocket.
"""

import websocket
import json
import sqlite3
import threading
import time
from pathlib import Path
from datetime import datetime

# Configuration
DB_NAME = "vessel_static_data.db"
API_KEY_FILE = "api.txt"
WEBSOCKET_URL = "wss://stream.aisstream.io/v0/stream"
MAX_MMSI_PER_CONNECTION = 50  # AISStream limit

# Global API key
API_KEY = None


def load_api_key():
    """Load the API key from api.txt file."""
    try:
        script_dir = Path(__file__).parent
        api_file_path = script_dir / API_KEY_FILE
        
        with open(api_file_path, 'r') as f:
            lines = f.readlines()
            for line in reversed(lines):
                line = line.strip()
                if line:
                    return line
        
        raise ValueError("No API key found in api.txt")
    except FileNotFoundError:
        raise FileNotFoundError(f"API key file '{API_KEY_FILE}' not found.")
    except Exception as e:
        raise Exception(f"Error loading API key: {e}")


def get_filtered_vessels():
    """
    Query database for vessels matching filter criteria:
    - Length >= 100m
    - Ship type NOT IN (71, 72) - excluding container ships
    - Valid MMSI and length
    
    Returns:
        List of MMSI numbers
    """
    script_dir = Path(__file__).parent
    db_path = script_dir / DB_NAME
    
    # Use timeout to handle concurrent access with ais_collector.py
    conn = sqlite3.connect(db_path, timeout=30)
    cursor = conn.cursor()
    
    query = '''
        SELECT mmsi, name, length, ship_type, flag_state
        FROM vessels_static
        WHERE length >= 100
          AND mmsi IS NOT NULL
          AND length IS NOT NULL
          AND (ship_type IS NULL OR ship_type NOT IN (71, 72))
        ORDER BY length DESC
    '''
    
    cursor.execute(query)
    vessels = cursor.fetchall()
    conn.close()
    
    print(f"\n{'='*70}")
    print(f"FILTERED VESSELS FOR TRACKING")
    print(f"{'='*70}")
    print(f"Total vessels matching criteria: {len(vessels)}")
    print(f"\nCriteria:")
    print(f"  - Length >= 100m")
    print(f"  - Excluding container ships (type 71, 72)")
    print(f"{'='*70}\n")
    
    if vessels:
        print("Sample vessels to track:")
        for mmsi, name, length, ship_type, flag_state in vessels[:10]:
            print(f"  MMSI: {mmsi}, Name: {name or 'Unknown'}, "
                  f"Length: {length}m, Type: {ship_type or 'N/A'}, "
                  f"Flag: {flag_state or 'Unknown'}")
        if len(vessels) > 10:
            print(f"  ... and {len(vessels) - 10} more vessels")
        print()
    
    return [vessel[0] for vessel in vessels]


def create_mmsi_batches(mmsi_list, batch_size=MAX_MMSI_PER_CONNECTION):
    """
    Split MMSI list into batches of specified size.
    
    Args:
        mmsi_list: List of MMSI numbers
        batch_size: Maximum MMSIs per batch
    
    Returns:
        List of batches (each batch is a list of MMSIs)
    """
    batches = []
    for i in range(0, len(mmsi_list), batch_size):
        batches.append(mmsi_list[i:i + batch_size])
    return batches


class VesselTracker:
    """Handles WebSocket connection for tracking a batch of vessels."""
    
    def __init__(self, batch_id, mmsi_batch, api_key):
        self.batch_id = batch_id
        self.mmsi_batch = mmsi_batch
        self.api_key = api_key
        self.ws_app = None
        self.thread = None
        self.running = False
        self.reconnect_delay = 5
        self.max_reconnect_delay = 60
        
    def on_message(self, ws, message):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(message)
            
            # Check for errors
            if "error" in data or "Error" in data:
                print(f"[Batch {self.batch_id}] ERROR: {data}")
                return
            
            msg_type = data.get("MessageType")
            
            # Process PositionReport
            if msg_type == "PositionReport":
                metadata = data.get("MetaData", {})
                position_data = data.get("Message", {}).get("PositionReport", {})
                
                mmsi = metadata.get("MMSI")
                lat = metadata.get("latitude")
                lon = metadata.get("longitude")
                sog = position_data.get("Sog")  # Speed Over Ground
                cog = position_data.get("Cog")  # Course Over Ground
                timestamp = metadata.get("time_utc", datetime.utcnow().isoformat())
                ship_name = metadata.get("ShipName", "Unknown")
                
                print(f"\n[POSITION] Batch {self.batch_id}")
                print(f"  MMSI: {mmsi} ({ship_name})")
                print(f"  Position: {lat:.6f}, {lon:.6f}")
                print(f"  Speed: {sog} knots, Course: {cog}°")
                print(f"  Time: {timestamp}")
            
            # Process VoyageReport (if available)
            elif msg_type == "VoyageReport":
                metadata = data.get("MetaData", {})
                voyage_data = data.get("Message", {}).get("VoyageReport", {})
                
                mmsi = metadata.get("MMSI")
                destination = voyage_data.get("Destination", "Unknown")
                eta = voyage_data.get("Eta")
                draught = voyage_data.get("Draught")
                ship_name = metadata.get("ShipName", "Unknown")
                
                print(f"\n[VOYAGE] Batch {self.batch_id}")
                print(f"  MMSI: {mmsi} ({ship_name})")
                print(f"  Destination: {destination}")
                print(f"  ETA: {eta}")
                print(f"  Draught: {draught}m")
                
        except json.JSONDecodeError:
            print(f"[Batch {self.batch_id}] Non-JSON message received")
        except Exception as e:
            print(f"[Batch {self.batch_id}] Error processing message: {e}")
    
    def on_error(self, ws, error):
        """Handle WebSocket errors."""
        error_str = str(error)
        if "Connection to remote host was lost" not in error_str:
            print(f"[Batch {self.batch_id}] Error: {error}")
    
    def on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket close."""
        print(f"[Batch {self.batch_id}] Connection closed: {close_status_code} - {close_msg}")
    
    def on_open(self, ws):
        """Handle WebSocket open and send subscription."""
        print(f"[Batch {self.batch_id}] Connected - Tracking {len(self.mmsi_batch)} vessels")
        
        # Convert MMSI list to the format AISStream expects
        # Each MMSI should be a string in the array
        mmsi_strings = [str(mmsi) for mmsi in self.mmsi_batch]
        
        subscribe_message = {
            "APIKey": self.api_key,
            "FiltersShipMMSI": mmsi_strings,
            "BoundingBoxes": [[[90, -180], [-90, 180]]]  # Global coverage
        }
        
        ws.send(json.dumps(subscribe_message))
        print(f"[Batch {self.batch_id}] Subscription sent")
    
    def start(self):
        """Start the WebSocket connection in a separate thread."""
        self.running = True
        self.thread = threading.Thread(target=self._run_forever, daemon=True)
        self.thread.start()
    
    def _run_forever(self):
        """Run WebSocket with auto-reconnect."""
        while self.running:
            try:
                self.ws_app = websocket.WebSocketApp(
                    WEBSOCKET_URL,
                    on_open=self.on_open,
                    on_message=self.on_message,
                    on_error=self.on_error,
                    on_close=self.on_close
                )
                
                self.ws_app.run_forever()
                
                if self.running:
                    print(f"[Batch {self.batch_id}] Reconnecting in {self.reconnect_delay}s...")
                    time.sleep(self.reconnect_delay)
                    self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)
                
            except Exception as e:
                print(f"[Batch {self.batch_id}] Exception: {e}")
                if self.running:
                    time.sleep(self.reconnect_delay)
    
    def stop(self):
        """Stop the WebSocket connection."""
        self.running = False
        if self.ws_app:
            self.ws_app.close()


def main():
    """Main function to start vessel tracking."""
    global API_KEY
    
    try:
        # Load API key
        print("Loading API key...")
        API_KEY = load_api_key()
        print("API key loaded.\n")
        
        # Get filtered vessels from database
        print("Querying database for vessels to track...")
        mmsi_list = get_filtered_vessels()
        
        if not mmsi_list:
            print("No vessels found matching filter criteria.")
            print("Make sure ais_collector.py has been running to collect vessel data.")
            return
        
        # Create batches
        batches = create_mmsi_batches(mmsi_list)
        print(f"Created {len(batches)} tracking batch(es)")
        print(f"  (Max {MAX_MMSI_PER_CONNECTION} MMSIs per connection)\n")
        
        # Create and start trackers
        trackers = []
        for i, batch in enumerate(batches, 1):
            tracker = VesselTracker(i, batch, API_KEY)
            tracker.start()
            trackers.append(tracker)
            time.sleep(1)  # Stagger connection starts
        
        print(f"\n{'='*70}")
        print("TRACKING ACTIVE")
        print(f"{'='*70}")
        print(f"Monitoring {len(mmsi_list)} vessels across {len(batches)} connection(s)")
        print("Press Ctrl+C to stop")
        print(f"{'='*70}\n")
        
        # Keep main thread alive
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n\nStopping trackers...")
            for tracker in trackers:
                tracker.stop()
            print("Tracking stopped.")
    
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
