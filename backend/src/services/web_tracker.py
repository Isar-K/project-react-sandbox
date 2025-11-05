"""
Real-time Web-Based Vessel Tracker with Map Visualization
Displays tracked vessels on an interactive map with live updates.
"""

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import websocket
import json
import sqlite3
import threading
import time
from pathlib import Path
from datetime import datetime

# Configuration
DB_NAME = "vessel_static_data.db"


def ensure_econowind_column(conn):
    """Ensure the econowind_fit_score column exists before running queries."""
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(eu_mrv_emissions)")
        columns = {row[1] for row in cursor.fetchall()}
        if "econowind_fit_score" not in columns:
            cursor.execute(
                "ALTER TABLE eu_mrv_emissions ADD COLUMN econowind_fit_score INTEGER DEFAULT 0"
            )
            conn.commit()
    except sqlite3.OperationalError:
        # Table may not exist yet (e.g., before MRV import). Ignore so API can fail gracefully.
        pass


API_KEY_FILE = "api.txt"
WEBSOCKET_URL = "wss://stream.aisstream.io/v0/stream"
MAX_MMSI_PER_CONNECTION = 50

# Flask app
from werkzeug.middleware.proxy_fix import ProxyFix
import os
import sys

# Get project root directory (two levels up from this file)
project_root = Path(__file__).parent.parent.parent
template_dir = project_root / 'templates'
static_dir = project_root / 'static'

app = Flask(__name__, 
            template_folder=str(template_dir),
            static_folder=str(static_dir))
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
app.config['SECRET_KEY'] = 'ais-tracker-secret'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global state
API_KEY = None
vessel_positions = {}  # {mmsi: {lat, lon, sog, cog, timestamp, name, ...}}
vessel_static_data = {}  # {mmsi: {name, length, type, flag, ...}}
tracking_active = False


# Ship type mapping
SHIP_TYPE_NAMES = {
    20: "Wing in ground (WIG)",
    21: "WIG, Hazardous category A",
    22: "WIG, Hazardous category B",
    23: "WIG, Hazardous category C",
    24: "WIG, Hazardous category D",
    30: "Fishing",
    40: "Towing",
    41: "Towing (large)",
    42: "Towing (large)",
    43: "Dredging or underwater ops",
    44: "Diving ops",
    45: "Military ops",
    46: "Sailing",
    47: "Pleasure Craft",
    50: "Pilot Vessel",
    51: "Search and Rescue",
    52: "Tug",
    53: "Port Tender",
    54: "Anti-pollution equipment",
    55: "Law Enforcement",
    56: "Spare - Local Vessel",
    57: "Spare - Local Vessel",
    58: "Medical Transport",
    59: "Noncombatant ship",
    60: "Passenger",
    61: "Passenger, Hazardous category A",
    62: "Passenger, Hazardous category B",
    63: "Passenger, Hazardous category C",
    64: "Passenger, Hazardous category D",
    69: "Passenger, No additional info",
    70: "Cargo",
    71: "Cargo, Hazardous category A",
    72: "Cargo, Hazardous category B",
    73: "Cargo, Hazardous category C",
    74: "Cargo, Hazardous category D",
    79: "Cargo, No additional info",
    80: "Tanker",
    81: "Tanker, Hazardous category A",
    82: "Tanker, Hazardous category B",
    83: "Tanker, Hazardous category C",
    84: "Tanker, Hazardous category D",
    89: "Tanker, No additional info",
    90: "Other Type",
    91: "Other Type, Hazardous category A",
    92: "Other Type, Hazardous category B",
    93: "Other Type, Hazardous category C",
    94: "Other Type, Hazardous category D",
    99: "Other Type, no additional info"
}


def get_ship_type_name(ship_type_code):
    """Convert ship type code to human-readable name."""
    if ship_type_code is None:
        return None
    try:
        code = int(ship_type_code)
        return SHIP_TYPE_NAMES.get(code, f"Type {code}")
    except (ValueError, TypeError):
        return str(ship_type_code)


def load_api_keys():
    """Load all API keys from api.txt file."""
    try:
        project_root = Path(__file__).parent.parent.parent
        api_file_path = project_root / API_KEY_FILE
        
        api_keys = []
        with open(api_file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    api_keys.append(line)
        
        if not api_keys:
            raise ValueError("No API keys found in api.txt")
        
        print(f"Loaded {len(api_keys)} API key(s)")
        return api_keys
    except Exception as e:
        raise Exception(f"Error loading API keys: {e}")


def get_filtered_vessels():
    """Get vessels from database matching filter criteria."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        cursor = conn.cursor()
        
        # Try query with gross_tonnage first
        try:
            query = '''
                SELECT v.mmsi, v.name, v.ship_type, v.detailed_ship_type, v.length, v.beam, v.imo, 
                       v.call_sign, v.flag_state, v.signatory_company, v.wind_assisted, e.gross_tonnage
                FROM vessels_static v
                LEFT JOIN eu_mrv_emissions e ON v.imo = e.imo
                WHERE v.mmsi IS NOT NULL
                  AND v.last_updated >= datetime('now', '-30 days')
                ORDER BY v.last_updated DESC
                LIMIT 2000
            '''
            cursor.execute(query)
            vessels = cursor.fetchall()
            has_gross_tonnage = True
        except sqlite3.OperationalError:
            # Fallback query without gross_tonnage if column doesn't exist
            print("Warning: gross_tonnage column not found, using fallback query")
            query = '''
                SELECT v.mmsi, v.name, v.ship_type, v.detailed_ship_type, v.length, v.beam, v.imo, 
                       v.call_sign, v.flag_state, v.signatory_company, v.wind_assisted
                FROM vessels_static v
                WHERE v.mmsi IS NOT NULL
                  AND v.last_updated >= datetime('now', '-30 days')
                ORDER BY v.last_updated DESC
                LIMIT 2000
            '''
            cursor.execute(query)
            vessels = cursor.fetchall()
            has_gross_tonnage = False
    finally:
        if conn:
            conn.close()
    
    # Store static data
    for vessel in vessels:
        if has_gross_tonnage:
            mmsi, name, ship_type, detailed_ship_type, length, beam, imo, call_sign, flag_state, signatory_company, wind_assisted, gross_tonnage = vessel
        else:
            mmsi, name, ship_type, detailed_ship_type, length, beam, imo, call_sign, flag_state, signatory_company, wind_assisted = vessel
            gross_tonnage = None
            
        vessel_static_data[mmsi] = {
            'name': name or 'Unknown',
            'ship_type': ship_type,
            'detailed_ship_type': detailed_ship_type,  # From CO2 emissions dataset
            'length': length,
            'beam': beam,
            'imo': imo,
            'call_sign': call_sign,
            'flag_state': flag_state or 'Unknown',
            'signatory_company': signatory_company,
            'wind_assisted': wind_assisted or 0,  # Wind propulsion flag
            'gross_tonnage': gross_tonnage  # From EU MRV emissions
        }
    
    return [vessel[0] for vessel in vessels]


class VesselTrackerWebSocket:
    """Handles WebSocket connection for tracking vessels."""
    
    def __init__(self, batch_id, mmsi_batch, api_key):
        self.batch_id = batch_id
        self.mmsi_batch = mmsi_batch
        self.api_key = api_key
        self.ws_app = None
        self.thread = None
        self.running = False
        
    def on_message(self, ws, message):
        """Handle incoming WebSocket messages."""
        try:
            data = json.loads(message)
            
            if "error" in data or "Error" in data:
                print(f"[Batch {self.batch_id}] ERROR: {data}")
                return
            
            msg_type = data.get("MessageType")
            
            if msg_type == "PositionReport":
                metadata = data.get("MetaData", {})
                position_data = data.get("Message", {}).get("PositionReport", {})
                
                mmsi = metadata.get("MMSI")
                lat = metadata.get("latitude")
                lon = metadata.get("longitude")
                sog = position_data.get("Sog", 0)
                cog = position_data.get("Cog", 0)
                timestamp = metadata.get("time_utc", datetime.utcnow().isoformat())
                
                if mmsi and lat and lon:
                    # Update vessel position
                    vessel_positions[mmsi] = {
                        'lat': lat,
                        'lon': lon,
                        'sog': sog,
                        'cog': cog,
                        'timestamp': timestamp,
                        'name': vessel_static_data.get(mmsi, {}).get('name', 'Unknown'),
                        'length': vessel_static_data.get(mmsi, {}).get('length'),
                        'flag_state': vessel_static_data.get(mmsi, {}).get('flag_state', 'Unknown')
                    }
                    
                    # Save position to history database
                    conn = None
                    try:
                        project_root = Path(__file__).parent.parent.parent
                        db_path = project_root / DB_NAME
                        conn = sqlite3.connect(db_path, timeout=5)
                        conn.execute('PRAGMA journal_mode=WAL')
                        cursor = conn.cursor()
                        cursor.execute('''
                            INSERT INTO vessel_positions (mmsi, latitude, longitude, sog, cog, timestamp)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (mmsi, lat, lon, sog, cog, timestamp))
                        conn.commit()
                    except Exception as e:
                        print(f"[Position DB] Error saving: {e}")
                    finally:
                        if conn:
                            conn.close()
                    
                    # Emit to all connected web clients
                    socketio.emit('vessel_update', {
                        'mmsi': mmsi,
                        'position': vessel_positions[mmsi]
                    })
                    
                    print(f"[Position] {mmsi} - {vessel_positions[mmsi]['name']}: {lat:.4f}, {lon:.4f}")
                
        except Exception as e:
            print(f"[Batch {self.batch_id}] Error: {e}")
    
    def on_error(self, ws, error):
        """Handle WebSocket errors."""
        error_str = str(error)
        if "Connection to remote host was lost" not in error_str:
            print(f"[Batch {self.batch_id}] Error: {error}")
    
    def on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket close."""
        print(f"[Batch {self.batch_id}] Connection closed")
    
    def on_open(self, ws):
        """Handle WebSocket open and send subscription."""
        print(f"[Batch {self.batch_id}] Connected - Tracking {len(self.mmsi_batch)} vessels")
        
        mmsi_strings = [str(mmsi) for mmsi in self.mmsi_batch]
        
        subscribe_message = {
            "APIKey": self.api_key,
            "FiltersShipMMSI": mmsi_strings,
            "BoundingBoxes": [[[90, -180], [-90, 180]]]
        }
        
        ws.send(json.dumps(subscribe_message))
        print(f"[Batch {self.batch_id}] Subscription sent")
    
    def start(self):
        """Start the WebSocket connection."""
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
                    time.sleep(5)
                    
            except Exception as e:
                print(f"[Batch {self.batch_id}] Exception: {e}")
                time.sleep(5)


# Flask routes
@app.route('/ships/')
def index():
    """Serve the main map page."""
    return render_template('map.html')


@app.route('/ships/api/vessels')
def get_vessels():
    """Get all tracked vessels and their current positions."""
    vessels = []
    for mmsi, static in vessel_static_data.items():
        vessel_info = {
            'mmsi': mmsi,
            'name': static['name'],
            'length': static['length'],
            'flag_state': static['flag_state'],
            'ship_type': static['ship_type'],
            'detailed_ship_type': static.get('detailed_ship_type'),  # From CO2 emissions dataset
            'wind_assisted': static.get('wind_assisted', 0),  # Wind propulsion flag
            'gross_tonnage': static.get('gross_tonnage')  # From EU MRV emissions
        }
        
        # Add position if available
        if mmsi in vessel_positions:
            vessel_info.update(vessel_positions[mmsi])
        
        vessels.append(vessel_info)
    
    return jsonify(vessels)


@app.route('/ships/api/stats')
def get_stats():
    """Get tracking statistics."""
    return jsonify({
        'total_vessels': len(vessel_static_data),
        'vessels_with_position': len(vessel_positions),
        'tracking_active': tracking_active
    })


@app.route('/ships/database')
def database_viewer():
    """Serve the enhanced database viewer page with emissions data."""
    return render_template('database_enhanced.html')


@app.route('/ships/api/vessel/<int:mmsi>/route')
def get_vessel_route(mmsi):
    """Get position history for a specific vessel."""
    hours = request.args.get('hours', default=24, type=int)
    
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT latitude, longitude, sog, cog, timestamp
            FROM vessel_positions
            WHERE mmsi = ?
              AND timestamp >= datetime('now', '-' || ? || ' hours')
            ORDER BY timestamp ASC
        ''', (mmsi, hours))
        
        positions = cursor.fetchall()
        
        route = []
        for p in positions:
            route.append({
                'lat': p[0],
                'lon': p[1],
                'sog': p[2],
                'cog': p[3],
                'timestamp': p[4]
            })
        
        return jsonify(route)
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/database/vessels')
def get_all_vessels():
    """Get all vessels from database with filtering."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        cursor = conn.cursor()
        
        # Get filter parameters
        min_length = request.args.get('min_length', type=int)
        max_length = request.args.get('max_length', type=int)
        ship_type = request.args.get('ship_type', type=int)
        flag_state = request.args.get('flag_state', type=str)
        search = request.args.get('search', type=str)
        
        # Build query
        query = 'SELECT mmsi, name, ship_type, detailed_ship_type, length, beam, imo, call_sign, flag_state, destination, eta, draught, last_updated, signatory_company FROM vessels_static WHERE 1=1'
        params = []
        
        if min_length:
            query += ' AND length >= ?'
            params.append(min_length)
        
        if max_length:
            query += ' AND length <= ?'
            params.append(max_length)
        
        if ship_type:
            query += ' AND ship_type >= ? AND ship_type < ?'
            params.append(ship_type)
            params.append(ship_type + 10)
        
        if flag_state:
            query += ' AND flag_state = ?'
            params.append(flag_state)
        
        if search:
            query += ' AND (name LIKE ? OR CAST(mmsi AS TEXT) LIKE ? OR signatory_company LIKE ?)'
            search_param = f'%{search}%'
            params.append(search_param)
            params.append(search_param)
            params.append(search_param)
        
        query += ' ORDER BY last_updated DESC LIMIT 1000'
        
        cursor.execute(query, params)
        vessels = cursor.fetchall()
        
        # Format results
        results = []
        for v in vessels:
            results.append({
                'mmsi': v[0],
                'name': v[1],
                'ship_type': v[2],
                'detailed_ship_type': v[3],
                'length': v[4],
                'beam': v[5],
                'imo': v[6],
                'call_sign': v[7],
                'flag_state': v[8],
                'destination': v[9],
                'eta': v[10],
                'draught': v[11],
                'last_updated': v[12],
                'signatory_company': v[13]
            })
        
        return jsonify(results)
    except Exception as e:
        print(f"Error in get_all_vessels: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/companies')
def get_companies():
    """Get company statistics."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        cursor = conn.cursor()
        
        # Get company statistics
        cursor.execute('''
            SELECT signatory_company, COUNT(*) as vessel_count, 
                   AVG(length) as avg_length, MAX(length) as max_length
            FROM vessels_static
            WHERE signatory_company IS NOT NULL AND signatory_company != ''
            GROUP BY signatory_company
            ORDER BY vessel_count DESC
            LIMIT 50
        ''')
        
        companies = cursor.fetchall()
        results = []
        for c in companies:
            results.append({
                'company': c[0],
                'vessel_count': c[1],
                'avg_length': round(c[2], 1) if c[2] else 0,
                'max_length': c[3]
            })
        
        return jsonify(results)
    except Exception as e:
        print(f"Error in get_companies: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/sql')
def sql_query_page():
    """Render SQL query interface."""
    return render_template('sql_query.html')


@app.route('/ships/api/sql/query', methods=['POST'])
def execute_sql_query():
    """Execute a raw SQL query (READ-ONLY)."""
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        
        if not query:
            return jsonify({'error': 'No query provided'}), 400
        
        # Security: Only allow SELECT queries
        if not query.upper().startswith('SELECT'):
            return jsonify({'error': 'Only SELECT queries are allowed'}), 403
        
        project_root = Path(__file__).parent.parent.parent
        db_path = project_root / DB_NAME
        
        conn = None
        start_time = time.time()
        
        try:
            conn = sqlite3.connect(db_path, timeout=30)
            conn.execute('PRAGMA journal_mode=WAL')
            cursor = conn.cursor()
            
            cursor.execute(query)
            rows = cursor.fetchall()
            columns = [description[0] for description in cursor.description] if cursor.description else []
            
            # Convert ship_type codes to names if ship_type column exists
            ship_type_idx = None
            if 'ship_type' in columns:
                ship_type_idx = columns.index('ship_type')
            
            # Process rows to replace ship_type codes with names
            processed_rows = []
            for row in rows:
                row_list = list(row)
                if ship_type_idx is not None and row_list[ship_type_idx] is not None:
                    row_list[ship_type_idx] = get_ship_type_name(row_list[ship_type_idx])
                processed_rows.append(row_list)
            
            execution_time = int((time.time() - start_time) * 1000)  # ms
            
            return jsonify({
                'columns': columns,
                'rows': processed_rows,
                'row_count': len(processed_rows),
                'execution_time': execution_time
            })
            
        except sqlite3.Error as e:
            return jsonify({'error': f'SQL Error: {str(e)}'}), 400
        finally:
            if conn:
                conn.close()
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/ships/api/sql/export', methods=['POST'])
def export_sql_query():
    """Export SQL query results to CSV."""
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        
        if not query:
            return jsonify({'error': 'No query provided'}), 400
        
        # Security: Only allow SELECT queries
        if not query.upper().startswith('SELECT'):
            return jsonify({'error': 'Only SELECT queries are allowed'}), 403
        
        project_root = Path(__file__).parent.parent.parent
        db_path = project_root / DB_NAME
        
        conn = None
        try:
            conn = sqlite3.connect(db_path, timeout=30)
            conn.execute('PRAGMA journal_mode=WAL')
            cursor = conn.cursor()
            
            cursor.execute(query)
            rows = cursor.fetchall()
            columns = [description[0] for description in cursor.description] if cursor.description else []
            
            # Convert ship_type codes to names if ship_type column exists
            ship_type_idx = None
            if 'ship_type' in columns:
                ship_type_idx = columns.index('ship_type')
            
            # Process rows to replace ship_type codes with names
            processed_rows = []
            for row in rows:
                row_list = list(row)
                if ship_type_idx is not None and row_list[ship_type_idx] is not None:
                    row_list[ship_type_idx] = get_ship_type_name(row_list[ship_type_idx])
                processed_rows.append(row_list)
            
            # Generate CSV
            import io
            import csv
            
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(columns)
            writer.writerows(processed_rows)
            
            # Return as downloadable file
            from flask import Response
            return Response(
                output.getvalue(),
                mimetype='text/csv',
                headers={'Content-Disposition': 'attachment; filename=query_results.csv'}
            )
            
        except sqlite3.Error as e:
            return jsonify({'error': f'SQL Error: {str(e)}'}), 400
        finally:
            if conn:
                conn.close()
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@socketio.on('connect')
def handle_connect():
    """Handle client connection."""
    print('Client connected')
    emit('initial_data', {
        'vessels': list(vessel_static_data.keys()),
        'positions': vessel_positions
    })


def start_tracking():
    """Start tracking vessels via WebSocket."""
    global tracking_active, API_KEY
    
    try:
        print("Loading API keys...")
        api_keys = load_api_keys()
        
        print("Loading vessels from database...")
        mmsi_list = get_filtered_vessels()
        print(f"Loaded {len(mmsi_list)} vessels for tracking")
        
        # Create batches
        batches = []
        for i in range(0, len(mmsi_list), MAX_MMSI_PER_CONNECTION):
            batches.append(mmsi_list[i:i + MAX_MMSI_PER_CONNECTION])
        
        # Limit to 3 connections per API key
        max_connections = len(api_keys) * 3
        if len(batches) > max_connections:
            print(f"WARNING: {len(batches)} batches requested, but only {max_connections} connections available")
            print(f"Limiting to first {max_connections} batches ({max_connections * MAX_MMSI_PER_CONNECTION} vessels)")
            batches = batches[:max_connections]
        
        print(f"Creating {len(batches)} tracking connections across {len(api_keys)} API key(s)...")
        
        # Start trackers - rotate API keys (3 connections per key)
        for i, batch in enumerate(batches, 1):
            api_key_index = (i - 1) // 3  # Use each API key for 3 connections
            api_key = api_keys[api_key_index % len(api_keys)]
            print(f"Batch {i}: Using API key #{api_key_index + 1}")
            tracker = VesselTrackerWebSocket(i, batch, api_key)
            tracker.start()
            time.sleep(1)
        
        tracking_active = True
        print(f"Tracking {sum(len(b) for b in batches)} vessels across {len(batches)} connections")
        
    except Exception as e:
        print(f"Error starting tracking: {e}")


@app.route('/ships/api/emissions/vessel/<int:imo>')
def get_vessel_emissions(imo):
    """Get emissions data for a specific vessel by IMO."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        ensure_econowind_column(conn)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT e.*, v.mmsi, v.name as ais_name, v.length, v.flag_state
            FROM eu_mrv_emissions e
            LEFT JOIN vessels_static v ON e.imo = v.imo
            WHERE e.imo = ?
        ''', (imo,))
        
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Vessel not found'}), 404
        
        columns = [description[0] for description in cursor.description]
        result = dict(zip(columns, row))
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/emissions/vessel/<int:imo>/score-breakdown')
def get_score_breakdown(imo):
    """Get detailed breakdown of Econowind fit score for a vessel."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        ensure_econowind_column(conn)
        cursor = conn.cursor()
        
        # Get vessel data
        cursor.execute('''
            SELECT e.imo, e.vessel_name, e.ship_type, e.avg_co2_per_distance, 
                   e.technical_efficiency, e.econowind_fit_score, e.total_co2_emissions,
                   v.length
            FROM eu_mrv_emissions e
            LEFT JOIN vessels_static v ON e.imo = v.imo
            WHERE e.imo = ?
        ''', (imo,))
        
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Vessel not found'}), 404
        
        imo, vessel_name, ship_type, avg_co2, tech_eff, total_score, total_co2, length = row
        
        # Calculate score breakdown
        breakdown = {
            'vessel_name': vessel_name,
            'imo': imo,
            'total_score': total_score or 0,
            'max_score': 8,
            'breakdown': []
        }
        
        # 1. Ship type scoring
        preferred_types = {
            "Bulk carrier", "General cargo", "Chemical tanker",
            "LNG carrier", "Other ship types", "Ro-Ro cargo ship"
        }
        ship_type_score = 2 if ship_type in preferred_types else 0
        breakdown['breakdown'].append({
            'category': 'Ship Type',
            'score': ship_type_score,
            'max': 2,
            'value': ship_type,
            'explanation': f"{'✓ Preferred type' if ship_type_score == 2 else '✗ Not a preferred type'} ({ship_type})",
            'details': 'Preferred: Bulk carrier, General cargo, Chemical tanker, LNG carrier, Ro-Ro cargo, Other'
        })
        
        # 2. Length scoring
        length_score = 0
        length_explanation = 'No length data available'
        if length:
            if 100 <= length <= 160:
                length_score = 2
                length_explanation = f'✓ Optimal size ({length}m is in 100-160m range)'
            elif 80 <= length < 100 or 160 < length <= 200:
                length_score = 1
                length_explanation = f'~ Acceptable size ({length}m is in 80-100m or 160-200m range)'
            else:
                length_explanation = f'✗ Outside preferred range ({length}m)'
        
        breakdown['breakdown'].append({
            'category': 'Vessel Length',
            'score': length_score,
            'max': 2,
            'value': f'{length}m' if length else 'N/A',
            'explanation': length_explanation,
            'details': 'Optimal: 100-160m (+2), Acceptable: 80-100m or 160-200m (+1)'
        })
        
        # 3. CO2 emissions intensity
        co2_score = 0
        co2_explanation = 'No CO₂/distance data available'
        if avg_co2:
            # Get quantiles
            cursor.execute('SELECT avg_co2_per_distance FROM eu_mrv_emissions WHERE avg_co2_per_distance IS NOT NULL')
            co2_values = [r[0] for r in cursor.fetchall()]
            if co2_values:
                import numpy as np
                co2_75 = np.percentile(co2_values, 75)
                co2_50 = np.percentile(co2_values, 50)
                
                if avg_co2 >= co2_75:
                    co2_score = 2
                    co2_explanation = f'✓ High emitter ({avg_co2:.1f} kg/nm, top 25%)'
                elif avg_co2 >= co2_50:
                    co2_score = 1
                    co2_explanation = f'~ Above average ({avg_co2:.1f} kg/nm, above median)'
                else:
                    co2_explanation = f'✗ Below average ({avg_co2:.1f} kg/nm, already efficient)'
        
        breakdown['breakdown'].append({
            'category': 'CO₂ Emissions Intensity',
            'score': co2_score,
            'max': 2,
            'value': f'{avg_co2:.1f} kg/nm' if avg_co2 else 'N/A',
            'explanation': co2_explanation,
            'details': 'Top 25% emitters (+2), Above median (+1) - Higher emissions = more savings potential'
        })
        
        # 4. Technical efficiency
        eff_score = 0
        eff_explanation = 'No technical efficiency data'
        if tech_eff:
            try:
                eff_value = float(str(tech_eff).split('(')[-1].strip(')').split()[0])
                if eff_value > 10:
                    eff_score = 2
                    eff_explanation = f'✓ Poor efficiency ({eff_value:.1f} gCO₂/t·nm)'
                elif eff_value >= 6:
                    eff_score = 1
                    eff_explanation = f'~ Moderate efficiency ({eff_value:.1f} gCO₂/t·nm)'
                else:
                    eff_explanation = f'✗ Good efficiency ({eff_value:.1f} gCO₂/t·nm)'
            except:
                eff_explanation = f'Could not parse: {tech_eff}'
        
        breakdown['breakdown'].append({
            'category': 'Technical Efficiency',
            'score': eff_score,
            'max': 2,
            'value': tech_eff or 'N/A',
            'explanation': eff_explanation,
            'details': 'Poor efficiency >10 (+2), Moderate 6-10 (+1) - Lower efficiency = more improvement potential'
        })
        
        # Summary
        calculated_total = sum(item['score'] for item in breakdown['breakdown'])
        breakdown['calculated_total'] = calculated_total
        breakdown['total_co2_emissions'] = total_co2
        
        # Recommendation
        if calculated_total >= 6:
            breakdown['recommendation'] = 'Excellent candidate for wind propulsion retrofit'
            breakdown['recommendation_class'] = 'high'
        elif calculated_total >= 4:
            breakdown['recommendation'] = 'Good candidate for wind propulsion retrofit'
            breakdown['recommendation_class'] = 'medium'
        elif calculated_total >= 2:
            breakdown['recommendation'] = 'Potential candidate, further analysis recommended'
            breakdown['recommendation_class'] = 'low'
        else:
            breakdown['recommendation'] = 'Low priority for wind propulsion retrofit'
            breakdown['recommendation_class'] = 'na'
        
        return jsonify(breakdown)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/emissions/top')
def get_top_emitters():
    """Get top CO2 emitters."""
    limit = request.args.get('limit', 50, type=int)
    ship_type = request.args.get('ship_type', type=str)
    
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        ensure_econowind_column(conn)
        cursor = conn.cursor()
        
        query = '''
            SELECT e.imo, e.vessel_name, e.ship_type, e.company_name,
                   e.total_co2_emissions, e.total_distance_travelled,
                   e.avg_co2_per_distance, e.econowind_fit_score,
                   v.mmsi, v.length, v.flag_state
            FROM eu_mrv_emissions e
            LEFT JOIN vessels_static v ON e.imo = v.imo
            WHERE e.total_co2_emissions IS NOT NULL
        '''
        
        params = []
        if ship_type:
            query += ' AND e.ship_type = ?'
            params.append(ship_type)
        
        query += ' ORDER BY e.total_co2_emissions DESC LIMIT ?'
        params.append(limit)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        columns = [description[0] for description in cursor.description]
        results = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/emissions/company/<company_name>')
def get_company_emissions(company_name):
    """Get emissions data for all vessels of a specific company."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        ensure_econowind_column(conn)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT e.imo, e.vessel_name, e.ship_type, e.total_co2_emissions,
                   e.total_distance_travelled, e.avg_co2_per_distance,
                   e.econowind_fit_score, v.mmsi, v.length, v.flag_state
            FROM eu_mrv_emissions e
            LEFT JOIN vessels_static v ON e.imo = v.imo
            WHERE e.company_name LIKE ?
            ORDER BY e.total_co2_emissions DESC
        ''', (f'%{company_name}%',))
        
        rows = cursor.fetchall()
        columns = [description[0] for description in cursor.description]
        results = [dict(zip(columns, row)) for row in rows]
        
        # Calculate company totals
        total_co2 = sum(r['total_co2_emissions'] for r in results if r['total_co2_emissions'])
        total_vessels = len(results)
        
        return jsonify({
            'company': company_name,
            'total_vessels': total_vessels,
            'total_co2_emissions': total_co2,
            'average_co2_per_vessel': total_co2 / total_vessels if total_vessels > 0 else 0,
            'vessels': results
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/emissions/stats')
def get_emissions_stats():
    """Get overall emissions statistics."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        ensure_econowind_column(conn)
        cursor = conn.cursor()
        
        # Overall stats
        cursor.execute('''
            SELECT 
                COUNT(*) as total_vessels,
                SUM(total_co2_emissions) as total_co2,
                AVG(total_co2_emissions) as avg_co2,
                MAX(total_co2_emissions) as max_co2,
                COUNT(DISTINCT company_name) as total_companies
            FROM eu_mrv_emissions
            WHERE total_co2_emissions IS NOT NULL
        ''')
        
        overall = cursor.fetchone()
        
        # By ship type
        cursor.execute('''
            SELECT ship_type, COUNT(*) as count, SUM(total_co2_emissions) as total_co2
            FROM eu_mrv_emissions
            WHERE total_co2_emissions IS NOT NULL AND ship_type IS NOT NULL
            GROUP BY ship_type
            ORDER BY total_co2 DESC
            LIMIT 10
        ''')
        
        by_type = cursor.fetchall()
        
        # Vessels with AIS data
        cursor.execute('''
            SELECT COUNT(*) 
            FROM eu_mrv_emissions e
            INNER JOIN vessels_static v ON e.imo = v.imo
        ''')
        
        matched = cursor.fetchone()[0]
        
        return jsonify({
            'total_vessels': overall[0],
            'total_co2_emissions': overall[1],
            'average_co2_per_vessel': overall[2],
            'max_co2_emission': overall[3],
            'total_companies': overall[4],
            'vessels_with_ais_data': matched,
            'by_ship_type': [{'ship_type': row[0], 'count': row[1], 'total_co2': row[2]} for row in by_type]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/vessels/combined')
def get_combined_vessel_data():
    """Get vessels with both AIS and emissions data."""
    limit = request.args.get('limit', 100, type=int)
    min_co2 = request.args.get('min_co2', type=float)
    
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        ensure_econowind_column(conn)
        cursor = conn.cursor()
        
        query = '''
            SELECT v.mmsi, v.name, v.imo, v.ship_type, v.length, v.flag_state,
                   v.signatory_company, v.last_updated as ais_last_updated,
                   e.company_name as mrv_company, e.total_co2_emissions,
                   e.total_fuel_consumption, e.total_distance_travelled,
                   e.avg_co2_per_distance, e.reporting_period,
                   e.econowind_fit_score
            FROM vessels_static v
            INNER JOIN eu_mrv_emissions e ON v.imo = e.imo
            WHERE e.total_co2_emissions IS NOT NULL
        '''
        
        params = []
        if min_co2:
            query += ' AND e.total_co2_emissions >= ?'
            params.append(min_co2)
        
        query += ' ORDER BY e.total_co2_emissions DESC LIMIT ?'
        params.append(limit)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        columns = [description[0] for description in cursor.description]
        results = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/fleet-visualization')
def fleet_visualization():
    """Serve the 3D fleet visualization page."""
    return render_template('fleet_visualization.html')


@app.route('/ships/api/visualization/fleet-network')
def get_fleet_network():
    """Get company-ship network data for 3D visualization."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        ensure_econowind_column(conn)
        cursor = conn.cursor()
        
        # Get vessels with both AIS and emissions data
        cursor.execute('''
            SELECT 
                v.mmsi, v.name, v.imo, v.length, v.ship_type, v.flag_state,
                COALESCE(v.signatory_company, e.company_name) as company,
                e.total_co2_emissions, e.total_fuel_consumption,
                e.avg_co2_per_distance, e.econowind_fit_score
            FROM vessels_static v
            INNER JOIN eu_mrv_emissions e ON v.imo = e.imo
            WHERE e.total_co2_emissions IS NOT NULL
              AND v.length IS NOT NULL
              AND COALESCE(v.signatory_company, e.company_name) IS NOT NULL
            ORDER BY e.total_co2_emissions DESC
            LIMIT 500
        ''')
        
        vessels = cursor.fetchall()
        
        # Build nodes and links
        nodes = []
        links = []
        companies = {}
        
        for vessel in vessels:
            mmsi, name, imo, length, ship_type, flag, company, co2, fuel, co2_per_nm, fit_score = vessel
            
            # Track companies
            if company not in companies:
                companies[company] = {
                    'total_co2': 0,
                    'vessel_count': 0,
                    'total_length': 0
                }
            
            companies[company]['total_co2'] += co2 or 0
            companies[company]['vessel_count'] += 1
            companies[company]['total_length'] += length or 0
            
            # Create ship node
            nodes.append({
                'id': f'ship_{mmsi}',
                'type': 'ship',
                'mmsi': mmsi,
                'name': name or 'Unknown',
                'imo': imo,
                'length': length,
                'ship_type': ship_type,
                'flag_state': flag,
                'company': company,
                'co2': co2,
                'fuel': fuel,
                'co2_per_nm': co2_per_nm,
                'fit_score': fit_score or 0
            })
            
            # Create link from ship to company
            links.append({
                'source': f'ship_{mmsi}',
                'target': f'company_{company}'
            })
        
        # Create company nodes
        for company_name, stats in companies.items():
            nodes.append({
                'id': f'company_{company_name}',
                'type': 'company',
                'name': company_name,
                'vessel_count': stats['vessel_count'],
                'total_co2': stats['total_co2'],
                'avg_vessel_length': stats['total_length'] / stats['vessel_count'] if stats['vessel_count'] > 0 else 0
            })
        
        return jsonify({
            'nodes': nodes,
            'links': links,
            'stats': {
                'total_ships': len(vessels),
                'total_companies': len(companies),
                'total_co2': sum(c['total_co2'] for c in companies.values())
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/emissions/match-stats')
def get_match_statistics():
    """Get real-time matching statistics between AIS and emissions data."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        cursor = conn.cursor()
        
        # Total vessels with IMO in AIS
        cursor.execute('SELECT COUNT(*) FROM vessels_static WHERE imo IS NOT NULL AND imo > 0')
        total_ais_with_imo = cursor.fetchone()[0]
        
        # Total vessels in AIS (all)
        cursor.execute('SELECT COUNT(*) FROM vessels_static')
        total_ais = cursor.fetchone()[0]
        
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
        
        # Recent matches (vessels added in last 24 hours that have emissions data)
        cursor.execute('''
            SELECT COUNT(*)
            FROM vessels_static v
            INNER JOIN eu_mrv_emissions e ON v.imo = e.imo
            WHERE datetime(v.last_updated) > datetime('now', '-1 day')
        ''')
        recent_matches = cursor.fetchone()[0]
        
        return jsonify({
            'total_ais_vessels': total_ais,
            'total_ais_with_imo': total_ais_with_imo,
            'total_emissions_database': total_emissions,
            'matched_vessels': matched,
            'match_rate_percentage': round((matched / total_ais_with_imo * 100), 2) if total_ais_with_imo > 0 else 0,
            'ais_only': ais_only,
            'emissions_only': emissions_only,
            'recent_matches_24h': recent_matches,
            'potential_new_matches': ais_only  # Vessels that could potentially be matched
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/statistics/ship-types')
def get_ship_type_statistics():
    """Get statistics about ship types in the database."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        cursor = conn.cursor()
        
        # Get breakdown by AIS ship type
        cursor.execute('''
            SELECT ship_type, COUNT(*) as count
            FROM vessels_static
            WHERE ship_type IS NOT NULL
            GROUP BY ship_type
            ORDER BY count DESC
        ''')
        ais_types = cursor.fetchall()
        
        # Get breakdown by detailed ship type from EU MRV
        cursor.execute('''
            SELECT detailed_ship_type, COUNT(*) as count
            FROM vessels_static
            WHERE detailed_ship_type IS NOT NULL
            GROUP BY detailed_ship_type
            ORDER BY count DESC
        ''')
        detailed_types = cursor.fetchall()
        
        # Get vessels without detailed type but with IMO
        cursor.execute('''
            SELECT COUNT(*)
            FROM vessels_static
            WHERE imo IS NOT NULL AND imo > 0
            AND detailed_ship_type IS NULL
        ''')
        missing_detailed = cursor.fetchone()[0]
        
        # Format AIS types with names
        ais_breakdown = []
        for ship_type, count in ais_types:
            ais_breakdown.append({
                'code': ship_type,
                'name': get_ship_type_name(ship_type),
                'count': count
            })
        
        # Format detailed types
        detailed_breakdown = []
        for ship_type, count in detailed_types:
            detailed_breakdown.append({
                'type': ship_type,
                'count': count
            })
        
        return jsonify({
            'ais_types': ais_breakdown,
            'detailed_types': detailed_breakdown,
            'vessels_missing_detailed_type': missing_detailed,
            'total_vessels': sum(t['count'] for t in ais_breakdown)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/detailed-ship-types')
def get_detailed_ship_types():
    """Get list of unique detailed ship types for filtering."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        conn.execute('PRAGMA journal_mode=WAL')
        cursor = conn.cursor()
        
        # Check if column exists first
        cursor.execute("PRAGMA table_info(vessels_static)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'detailed_ship_type' not in columns:
            print("Warning: detailed_ship_type column does not exist yet")
            return jsonify([])  # Return empty array
        
        # Get unique detailed ship types with counts
        cursor.execute('''
            SELECT detailed_ship_type, COUNT(*) as count
            FROM vessels_static
            WHERE detailed_ship_type IS NOT NULL
            GROUP BY detailed_ship_type
            ORDER BY detailed_ship_type
        ''')
        
        types = []
        for ship_type, count in cursor.fetchall():
            types.append({
                'name': ship_type,
                'count': count
            })
        
        return jsonify(types)
    except Exception as e:
        print(f"Error in get_detailed_ship_types: {e}")
        return jsonify([]), 200  # Return empty array instead of error
    finally:
        if conn:
            conn.close()


@app.route('/ships/api/vessel/<int:mmsi>/photo')
def get_vessel_photo(mmsi):
    """Get vessel photo URL from public sources."""
    try:
        # Use direct photo URLs from public sources
        # These are publicly accessible and don't require scraping
        
        # Try MarineTraffic photo service (public API)
        photo_url = f"https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi={mmsi}"
        
        # Return the URL - the frontend will handle if it loads or not
        return jsonify({
            'photo_url': photo_url,
            'source': 'MarineTraffic',
            'mmsi': mmsi
        })
        
    except Exception as e:
        print(f"Error generating photo URL for MMSI {mmsi}: {e}")
        return jsonify({'photo_url': None, 'source': None, 'error': str(e)}), 500


@app.route('/ships/api/vessel/<int:mmsi>/wind-tech')
def get_vessel_wind_tech(mmsi):
    """Get wind propulsion technology details for a vessel."""
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / DB_NAME
    
    conn = None
    try:
        conn = sqlite3.connect(db_path, timeout=30)
        cursor = conn.cursor()
        
        # Try MMSI-based table first
        cursor.execute('''
            SELECT technology_installed, installation_year, installation_type
            FROM wind_propulsion_mmsi
            WHERE mmsi = ?
        ''', (mmsi,))
        
        result = cursor.fetchone()
        
        if result:
            return jsonify({
                'technology': result[0],
                'year': result[1],
                'type': result[2],
                'found': True
            })
        
        # Fallback to name-based table
        cursor.execute('''
            SELECT w.technology_installed, w.installation_year, w.installation_type
            FROM wind_propulsion w
            INNER JOIN vessels_static v ON UPPER(TRIM(v.name)) = UPPER(TRIM(w.vessel_name))
            WHERE v.mmsi = ?
        ''', (mmsi,))
        
        result = cursor.fetchone()
        
        if result:
            return jsonify({
                'technology': result[0],
                'year': result[1],
                'type': result[2],
                'found': True
            })
        
        return jsonify({'found': False})
        
    except Exception as e:
        print(f"Error fetching wind tech for MMSI {mmsi}: {e}")
        return jsonify({'error': str(e), 'found': False}), 500
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    # Start tracking in background
    tracking_thread = threading.Thread(target=start_tracking, daemon=True)
    tracking_thread.start()
    
    # Give tracking a moment to initialize
    time.sleep(2)
    
    print("\n" + "="*70)
    print("VESSEL TRACKER WEB INTERFACE")
    print("="*70)
    print("Open your browser and go to:")
    print("  http://localhost:5000")
    print("="*70 + "\n")
    
    # Start Flask server
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
