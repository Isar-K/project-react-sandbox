import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Polyline } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpring, animated } from '@react-spring/web';
import L from 'leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import '../styles/Map.css';

// Animated Number Component
function AnimatedNumber({ value }) {
  const { number } = useSpring({
    from: { number: 0 },
    number: value,
    delay: 200,
    config: { mass: 1, tension: 20, friction: 10 }
  });
  return <animated.span>{number.to(n => n.toFixed(0))}</animated.span>;
}

// Custom hook to fit bounds with animation
function MapBounds({ markers }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lon]));
      map.flyToBounds(bounds, {
        padding: [50, 50],
        duration: 2,
        easeLinearity: 0.25
      });
    }
  }, [markers, map]);

  return null;
}

// Ripple effect component for active vessels (currently unused but kept for styling)
function VesselRipple({ position, color }) {
  return (
    <Circle
      center={position}
      radius={5000}
      pathOptions={{
        fillColor: color,
        fillOpacity: 0,
        color: color,
        weight: 2,
        opacity: 0.6
      }}
      className="vessel-ripple"
    />
  );
}

export default function VesselMap() {
  // ---- STATE ----
  const [vessels, setVessels] = useState([]);            // All vessels (DB + live)
  const [filteredVessels, setFilteredVessels] = useState([]); // Vessels after filters
  const [stats, setStats] = useState({ total: 0, active: 0 });
  const [filters, setFilters] = useState({ type: 'all', size: 'all' });
  const [isConnected, setIsConnected] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [showRipples, setShowRipples] = useState(true);
  const [showTrails, setShowTrails] = useState(false);
  const [hoveredVessel, setHoveredVessel] = useState(null);
  const [vesselTrails, setVesselTrails] = useState({});  // mmsi -> [{lat, lon}, ...]

  // ---- REFS ----
  const socketRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  // Ship type configuration with ocean colors
  const shipTypeInfo = {
    60: { color: '#8b5cf6', name: 'Passenger', icon: '🛳️', accent: '#a78bfa' },
    70: { color: '#10b981', name: 'Cargo', icon: '📦', accent: '#34d399' },
    80: { color: '#f59e0b', name: 'Tanker', icon: '🛢️', accent: '#fbbf24' },
    default: { color: '#06b6d4', name: 'Other', icon: '⛵', accent: '#22d3ee' }
  };

  const getShipTypeInfo = (shipType) => {
    if (shipType >= 60 && shipType < 70) return shipTypeInfo[60];
    if (shipType >= 70 && shipType < 80) return shipTypeInfo[70];
    if (shipType >= 80 && shipType < 90) return shipTypeInfo[80];
    return shipTypeInfo.default;
  };

  // Create custom animated marker icon
  const createVesselIcon = (vessel, isSelected) => {
    const isLarge = vessel.length >= 200;
    const typeInfo = getShipTypeInfo(vessel.ship_type);
    const size = isLarge ? 18 : 14;
    const pulseSize = isSelected ? size + 6 : size;

    return L.divIcon({
      className: 'custom-vessel-marker',
      html: `
        <div class="vessel-marker-container ${isSelected ? 'selected' : ''}">
          <div class="vessel-marker-pulse" style="
            width: ${pulseSize}px;
            height: ${pulseSize}px;
            background: ${typeInfo.color};
            opacity: 0.3;
          "></div>
          <div class="vessel-marker-dot" style="
            background: ${typeInfo.color};
            width: ${size}px;
            height: ${size}px;
            box-shadow: 0 0 ${isLarge ? 20 : 15}px ${typeInfo.color},
                        0 0 ${isLarge ? 40 : 30}px ${typeInfo.accent};
          ">
            <span class="vessel-icon">${typeInfo.icon}</span>
          </div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  };

  // ---- FILTERING ----
  const applyFilters = (vesselList) => {
    return vesselList.filter(vessel => {
      // Must have a position to be drawn on the map
      if (!vessel.lat || !vessel.lon) return false;

      // Type filter
      if (filters.type !== 'all') {
        if (filters.type === 'other') {
          if (vessel.ship_type >= 60 && vessel.ship_type < 90) return false;
        } else {
          const typeNum = parseInt(filters.type, 10);
          if (!vessel.ship_type || vessel.ship_type < typeNum || vessel.ship_type >= typeNum + 10) {
            return false;
          }
        }
      }

      // Size filter
      if (filters.size !== 'all') {
        if (filters.size === 'large' && vessel.length < 200) return false;
        if (filters.size === 'medium' && (vessel.length < 100 || vessel.length >= 200)) return false;
      }

      return true;
    });
  };

  // ---- INITIAL LOAD ----
  useEffect(() => {
    // Same endpoint as old HTML map: gives static vessels + any current positions
    fetch('/ships/api/vessels')
      .then(res => res.json())
      .then(data => {
        // Keep all vessels (even those without positions) for stats & future updates
        setVessels(data);
        setStats(prev => ({ ...prev, total: data.length }));
      })
      .catch(err => console.error('Error loading vessels:', err));
  }, []);

  // ---- APPLY FILTERS WHEN VESSELS OR FILTERS CHANGE ----
  useEffect(() => {
    const filtered = applyFilters(vessels);
    setFilteredVessels(filtered);
    setStats(prev => ({ ...prev, active: filtered.length }));
  }, [vessels, filters]);

  // ---- WEBSOCKET CONNECTION (LIVE UPDATES) ----
  useEffect(() => {
    try {
      // Check if backend is running before attempting connection
      fetch('/ships/api/vessels')
        .then(() => {
          // Only connect to socket if API is available
          socketRef.current = io({
            path: '/ships/socket.io',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
          });

          socketRef.current.on('connect', () => {
            setIsConnected(true);
            console.log('✅ Connected to live vessel tracking');
          });

          socketRef.current.on('disconnect', () => {
            setIsConnected(false);
            console.log('⚠️ Disconnected from vessel tracking');
          });

          socketRef.current.on('connect_error', () => {
            console.log('Socket connection error (this is normal if backend is not running)');
            setIsConnected(false);
          });

          // Optional: debug initial payload
          socketRef.current.on('initial_data', (data) => {
            console.log('📡 initial_data from server:', data);
          });

          // LIVE POSITION UPDATES
          socketRef.current.on('vessel_update', (data) => {
            const { mmsi, position } = data;

            setVessels(prev => {
              const index = prev.findIndex(v => v.mmsi === mmsi);

              if (index >= 0) {
                const updated = [...prev];
                const oldVessel = updated[index];

                // Update static + dynamic data
                updated[index] = { ...oldVessel, ...position };

                // Always keep trails in sync (toggle only affects rendering)
                if (oldVessel.lat && oldVessel.lon) {
                  setVesselTrails(trails => ({
                    ...trails,
                    [mmsi]: [
                      ...(trails[mmsi] || []).slice(-10), // Keep last 10 positions
                      { lat: oldVessel.lat, lon: oldVessel.lon }
                    ]
                  }));
                }

                return updated;
              } else {
                // New vessel not in initial list yet
                const newVessel = { mmsi, ...position };
                return [...prev, newVessel];
              }
            });
          });
        })
        .catch(err => {
          console.log('Backend not available - running in demo mode');
          setIsConnected(false);
        });
    } catch (error) {
      console.log('Socket initialization error:', error);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // ---- PERIODIC STATS REFRESH (TOTAL FROM BACKEND) ----
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/ships/api/stats')
        .then(res => res.json())
        .then(data => setStats(prev => ({ ...prev, total: data.total_vessels })))
        .catch(err => console.error('Error loading stats:', err));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="vessel-map-page">
      {/* Animated Background Elements */}
      <div className="map-bg-waves">
        <div className="wave wave1"></div>
        <div className="wave wave2"></div>
        <div className="wave wave3"></div>
      </div>

      {/* Header */}
      <motion.div
        className="map-header"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <div className="map-header-content">
          <motion.div
            className="map-title-section"
            initial={{ x: -30 }}
            animate={{ x: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <h1 className="map-main-title">Live Vessel Tracking</h1>
            <p className="map-subtitle">Real-time maritime traffic monitoring</p>
          </motion.div>

          {/* Animated Stats Cards */}
          <div className="stats-cards">
            <motion.div
              className="stat-card"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              whileHover={{ y: -5, boxShadow: '0 10px 30px rgba(0, 119, 182, 0.3)' }}
            >
              <div className="stat-icon">🚢</div>
              <div className="stat-content">
                <div className="stat-value">
                  <AnimatedNumber value={stats.total} />
                </div>
                <div className="stat-label">Total Vessels</div>
              </div>
            </motion.div>

            <motion.div
              className="stat-card"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              whileHover={{ y: -5, boxShadow: '0 10px 30px rgba(0, 180, 216, 0.3)' }}
            >
              <div className="stat-icon">📍</div>
              <div className="stat-content">
                <div className="stat-value">
                  <AnimatedNumber value={stats.active} />
                </div>
                <div className="stat-label">Active Now</div>
              </div>
            </motion.div>

            <motion.div
              className="stat-card"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              whileHover={{ y: -5, boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)' }}
            >
              <div className="stat-icon">
                <motion.div
                  animate={isConnected ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {isConnected ? '📡' : '⏸️'}
                </motion.div>
              </div>
              <div className="stat-content">
                <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                  {isConnected ? 'LIVE' : 'Offline'}
                </div>
                <div className="stat-label">Connection Status</div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Filters */}
        <motion.div
          className="map-filters"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <motion.div
            className="filter-wrapper"
            whileHover={{ scale: 1.02 }}
          >
            <label>🎯 Vessel Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
            >
              <option value="all">All Types</option>
              <option value="60">🛳️ Passenger</option>
              <option value="70">📦 Cargo</option>
              <option value="80">🛢️ Tanker</option>
              <option value="other">⛵ Other</option>
            </select>
          </motion.div>

          <motion.div
            className="filter-wrapper"
            whileHover={{ scale: 1.02 }}
          >
            <label>📏 Vessel Size</label>
            <select
              value={filters.size}
              onChange={(e) => setFilters(prev => ({ ...prev, size: e.target.value }))}
            >
              <option value="all">All Sizes</option>
              <option value="large">Large (≥200m)</option>
              <option value="medium">Medium (100-200m)</option>
            </select>
          </motion.div>

          <motion.button
            className="ripple-toggle"
            onClick={() => setShowRipples(!showRipples)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {showRipples ? '🌊 Ripples ON' : '🌊 Ripples OFF'}
          </motion.button>

          <motion.button
            className="trail-toggle"
            onClick={() => setShowTrails(!showTrails)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {showTrails ? '✨ Trails ON' : '✨ Trails OFF'}
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Map Container */}
      <motion.div
        className="map-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
      >
        <MapContainer
          center={[51.5, 2]}
          zoom={7}
          className="leaflet-map"
          zoomControl={true}
        >
          <TileLayer
            attribution="© OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredVessels.map(vessel => {
            const typeInfo = getShipTypeInfo(vessel.ship_type);
            const trail = vesselTrails[vessel.mmsi] || [];

            return (
              <React.Fragment key={vessel.mmsi}>
                {/* Vessel Trail */}
                {showTrails && trail.length > 1 && (
                  <Polyline
                    positions={[...trail.map(t => [t.lat, t.lon]), [vessel.lat, vessel.lon]]}
                    pathOptions={{
                      color: typeInfo.color,
                      weight: 3,
                      opacity: 0.6,
                      dashArray: '10, 10',
                      lineCap: 'round'
                    }}
                    className="vessel-trail"
                  />
                )}

                {/* Ripple Effects */}
                {showRipples && (
                  <>
                    <Circle
                      center={[vessel.lat, vessel.lon]}
                      radius={500}
                      pathOptions={{
                        fillColor: typeInfo.color,
                        fillOpacity: 0.1,
                        color: typeInfo.color,
                        weight: 2,
                        opacity: 0.6
                      }}
                      className="vessel-ripple-1"
                    />
                    <Circle
                      center={[vessel.lat, vessel.lon]}
                      radius={1000}
                      pathOptions={{
                        fillColor: typeInfo.color,
                        fillOpacity: 0.05,
                        color: typeInfo.color,
                        weight: 1,
                        opacity: 0.3
                      }}
                      className="vessel-ripple-2"
                    />
                  </>
                )}

                {/* Vessel Marker */}
                <Marker
                  position={[vessel.lat, vessel.lon]}
                  icon={createVesselIcon(vessel, selectedVessel === vessel.mmsi)}
                  eventHandlers={{
                    click: () => setSelectedVessel(vessel.mmsi),
                    mouseover: () => {
                      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                      hoverTimeoutRef.current = setTimeout(() => {
                        setHoveredVessel(vessel);
                      }, 200);
                    },
                    mouseout: () => {
                      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                      hoverTimeoutRef.current = setTimeout(() => {
                        setHoveredVessel(null);
                      }, 200);
                    }
                  }}
                >
                  <Popup>
                    <VesselPopup vessel={vessel} getShipTypeInfo={getShipTypeInfo} />
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}

          <MapBounds markers={filteredVessels} />
        </MapContainer>

        {/* Hover Info Card */}
        <AnimatePresence>
          {hoveredVessel && (
            <motion.div
              className="vessel-hover-card"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <div className="hover-card-header">
                <span className="hover-card-icon">
                  {getShipTypeInfo(hoveredVessel.ship_type).icon}
                </span>
                <div>
                  <h4 className="hover-card-name">{hoveredVessel.name || 'Unknown'}</h4>
                  <p className="hover-card-type">
                    {getShipTypeInfo(hoveredVessel.ship_type).name}
                  </p>
                </div>
              </div>
              <div className="hover-card-stats">
                <div className="hover-stat">
                  <span className="hover-stat-label">Speed</span>
                  <span className="hover-stat-value">
                    {hoveredVessel.sog != null ? `${hoveredVessel.sog} kn` : 'N/A'}
                  </span>
                </div>
                <div className="hover-stat">
                  <span className="hover-stat-label">Course</span>
                  <span className="hover-stat-value">
                    {hoveredVessel.cog != null ? `${hoveredVessel.cog}°` : 'N/A'}
                  </span>
                </div>
                <div className="hover-stat">
                  <span className="hover-stat-label">Length</span>
                  <span className="hover-stat-value">
                    {hoveredVessel.length != null ? `${hoveredVessel.length}m` : 'N/A'}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Animated Legend */}
        <motion.div
          className="map-legend"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <h3 className="legend-title">
            <motion.span
              animate={{ rotate: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              ⚓
            </motion.span>{' '}
            Legend
          </h3>

          {Object.values(shipTypeInfo).map((type, idx) => (
            <motion.div
              key={idx}
              className="legend-item"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.9 + idx * 0.1 }}
              whileHover={{ x: 5, scale: 1.05 }}
            >
              <div
                className="legend-dot"
                style={{
                  background: type.color,
                  boxShadow: `0 0 15px ${type.color}`
                }}
              >
                <span className="legend-icon">{type.icon}</span>
              </div>
              <span>{type.name}</span>
            </motion.div>
          ))}

          <motion.div
            className="legend-info"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            <div className="legend-divider"></div>
            <p>
              <strong>Size Guide:</strong>
            </p>
            <p>• Large = ≥200m</p>
            <p>• Medium = 100-200m</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// Enhanced Vessel Popup
function VesselPopup({ vessel, getShipTypeInfo }) {
  const info = getShipTypeInfo(vessel.ship_type);

  return (
    <motion.div
      className="vessel-popup-content"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="popup-header">
        <motion.div
          className="popup-icon-large"
          animate={{
            rotate: [0, 5, -5, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          {info.icon}
        </motion.div>
        <h3 className="popup-vessel-name">{vessel.name || 'Unknown'}</h3>
        <span className="popup-badge" style={{ background: info.color }}>
          {info.name}
        </span>
      </div>

      <div className="popup-details">
        <div className="detail-row">
          <span className="detail-label">MMSI</span>
          <span className="detail-value">{vessel.mmsi}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Flag</span>
          <span className="detail-value">{vessel.flag_state || 'Unknown'}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Length</span>
          <span className="detail-value">
            {vessel.length != null ? `${vessel.length}m` : 'N/A'}
          </span>
        </div>
        {vessel.imo && (
          <div className="detail-row">
            <span className="detail-label">IMO</span>
            <span className="detail-value">{vessel.imo}</span>
          </div>
        )}
        <div className="detail-divider"></div>
        {vessel.lat != null && vessel.lon != null && (
          <>
            <div className="detail-row">
              <span className="detail-label">Position</span>
              <span className="detail-value">
                {vessel.lat.toFixed(4)}°N, {vessel.lon.toFixed(4)}°E
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Speed</span>
              <span className="detail-value">
                {vessel.sog != null ? `${vessel.sog} knots` : 'N/A'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Course</span>
              <span className="detail-value">
                {vessel.cog != null ? `${vessel.cog}°` : 'N/A'}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Last Update</span>
              <span className="detail-value">
                {vessel.timestamp
                  ? new Date(vessel.timestamp).toLocaleTimeString()
                  : 'N/A'}
              </span>
            </div>
          </>
        )}
        {vessel.lat == null && (
          <div className="detail-row">
            <span className="detail-label">Position</span>
            <span className="detail-value">
              <em>Waiting for live position…</em>
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
