import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Polyline } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpring, animated } from '@react-spring/web';
import L from 'leaflet';
import io from 'socket.io-client';
import 'leaflet/dist/leaflet.css';
import '../styles/Map.css';
import VesselSidebar from '../components/VesselSidebar.jsx';

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
function MapBounds({ markers, disabled }) {
  const map = useMap();

  useEffect(() => {
    if (disabled) return;
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lon]));
      map.flyToBounds(bounds, {
        padding: [50, 50],
        duration: 2,
        easeLinearity: 0.25
      });
    }
  }, [markers, map, disabled]);

  return null;
}



// Wind Layer Component
// Windy API Overlay for Leaflet (no iframe)




export default function VesselMap() {
  // ---- STATE ----
  const [vessels, setVessels] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [filteredVessels, setFilteredVessels] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stats, setStats] = useState({
  total: 0,
  active: 0,
  withGT: 0,
  wasp: 0
  });

  const [filters, setFilters] = useState({
  type: 'all',
  detailedType: 'all',
  size: 'all',
  gtCategory: 'all',
  lengthMin: 0,
  lengthMax: 400,
  beamMin: 0,
  beamMax: 100,
  gtMin: 0,
  gtMax: 300000,
  speedMin: 0,
  speedMax: 40,
  hasIMO: false,
  hasGT: false
});
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showRipples, setShowRipples] = useState(true);
  const [hoveredVessel, setHoveredVessel] = useState(null);
  const [showWindLayer, setShowWindLayer] = useState(false);
  const [windOpacity, setWindOpacity] = useState(50);
  const [waspFilterActive, setWaspFilterActive] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeHours, setRouteHours] = useState(6); 


  // ---- REFS ----
  const socketRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  // Ship type configuration with ocean colors
  const detailedShipTypeColors = {
    'Bulk carrier':        { color: '#8B4513', icon: '⚓' },
    'Container ship':      { color: '#FF4500', icon: '📦' },
    'Container/ro-ro cargo ship': { color: '#FF6347', icon: '🚢' },
    'General cargo ship':  { color: '#32CD32', icon: '📗' },
    'Oil tanker':          { color: '#DC143C', icon: '🛢️' },
    'Chemical tanker':     { color: '#FF1493', icon: '⚗️' },
    'LNG carrier':         { color: '#9370DB', icon: '🔥' },
    'Gas carrier':         { color: '#BA55D3', icon: '💨' },
    'Vehicle carrier':     { color: '#FFD700', icon: '🚗' },
    'Ro-ro ship':          { color: '#FFA500', icon: '🚛' },
    'Ro-pax ship':         { color: '#FF8C00', icon: '🛳️' },
    'Refrigerated cargo carrier': { color: '#00CED1', icon: '❄️' },
    'Passenger ship':      { color: '#1E90FF', icon: '🛳️' },
    'Passenger ship (Cruise Passenger ship)': { color: '#4169E1', icon: '🛳️' },
    'Combination carrier': { color: '#20B2AA', icon: '🚢' },
    'Other ship types':    { color: '#808080', icon: '⛵' },
    'Other ship types (Offshore)': { color: '#696969', icon: '🏗️' }
  };

  const getShipTypeInfo = (vessel) => {
    // Prefer detailed EU MRV ship type
    if (vessel.detailed_ship_type && detailedShipTypeColors[vessel.detailed_ship_type]) {
      const entry = detailedShipTypeColors[vessel.detailed_ship_type];
      return {
        color: entry.color,
        name: vessel.detailed_ship_type,
        icon: entry.icon,
        accent: entry.color + 'AA'
      };
    }

    // Fallback to AIS ship_type legacy logic
    const shipType = vessel.ship_type;
    if (shipType >= 70 && shipType < 80)
      return { color: '#10b981', name: 'Cargo', icon: '📦', accent: '#34d399' };
    if (shipType >= 80 && shipType < 90)
      return { color: '#f59e0b', name: 'Tanker', icon: '🛢️', accent: '#fbbf24' };

    // Default fallback
    return { color: '#06b6d4', name: 'Other', icon: '⛵', accent: '#22d3ee' };
};


  // Create custom animated marker icon
  const createVesselIcon = (vessel, isSelected) => {
    const isLarge = vessel.length >= 200;
    const typeInfo = getShipTypeInfo(vessel);
    const size = isLarge ? 18 : 14;
    const pulseSize = isSelected ? size + 6 : size;
    const isWindAssisted = vessel.wind_assisted === 1;

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
            border: ${isWindAssisted ? '3px solid #00ff00' : '2px solid rgba(255,255,255,0.8)'};
            box-shadow: 0 0 ${isLarge ? 20 : 15}px ${typeInfo.color},
                        0 0 ${isLarge ? 40 : 30}px ${typeInfo.accent};
          ">
            <span class="vessel-icon">${typeInfo.icon}</span>
          </div>
          ${isWindAssisted ? `
            <div style="
              position: absolute;
              top: -8px;
              right: -8px;
              font-size: 16px;
              filter: drop-shadow(0 0 3px #000);
            ">🌬️</div>
          ` : ''}
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  };

  useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const mmsiParam = urlParams.get("mmsi");

  if (mmsiParam && vessels.length > 0) {
    const target = vessels.find(v => v.mmsi == mmsiParam);
    if (target) {
      setSelectedVessel(target.mmsi);
      // Fit to vessel
      if (mapRef.current) {
        mapRef.current.flyTo([target.lat, target.lon], 12);
      }
    }
  }
}, [vessels]);

  // ---- FILTERING ----
  const applyFilters = (vesselList) => {
    return vesselList.filter(vessel => {
      // Must have a position to be drawn on the map
      if (!vessel.lat || !vessel.lon) return false;

      // WASP filter - show only wind-assisted vessels
      if (waspFilterActive && vessel.wind_assisted !== 1) {
        return false;
      }

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

      // Detailed MRV type filter
      if (filters.detailedType !== 'all') {
        if (!vessel.detailed_ship_type || vessel.detailed_ship_type !== filters.detailedType) {
          return false;
        }
      }


      // Size filter
      if (filters.size !== 'all') {
        if (filters.size === 'large' && vessel.length < 200) return false;
        if (filters.size === 'medium' && (vessel.length < 100 || vessel.length >= 200)) return false;
      }

      // Advanced filters
      if (vessel.length) {
        if (vessel.length < filters.lengthMin || vessel.length > filters.lengthMax)
          return false;
      }

      if (vessel.beam) {
        if (vessel.beam < filters.beamMin || vessel.beam > filters.beamMax)
          return false;
      }

      if (vessel.gross_tonnage != null) {
        if (vessel.gross_tonnage < filters.gtMin || vessel.gross_tonnage > filters.gtMax)
          return false;
      }

      if (vessel.sog != null) {
        if (vessel.sog < filters.speedMin || vessel.sog > filters.speedMax)
          return false;
      }

      if (filters.hasIMO && !vessel.imo) return false;
      if (filters.hasGT && !vessel.gross_tonnage) return false;


      // GT category filter
      if (filters.gtCategory !== 'all') {
        const gt = vessel.gross_tonnage || 0;

        switch (filters.gtCategory) {
          case 'le100':
            if (gt > 100) return false;
            break;

          case 'gt100':
            if (gt <= 100) return false;
            break;

          case 'gt1000':
            if (gt <= 1000) return false;
            break;

          case 'gt5000':
            if (gt <= 5000) return false;
            break;

          default:
            break;
        }
      }
      return true;
    });
  };

  // ---- INITIAL LOAD ----
  useEffect(() => {
    fetch('/ships/api/vessels')
      .then(res => res.json())
      .then(data => {
        setVessels(data);
        setStats(prev => ({
          ...prev,
          total: data.length,
          withGT: data.filter(v => v.gross_tonnage > 0).length,
          wasp: data.filter(v => v.wind_assisted === 1).length
        }));
      });
  }, []);  // <-- THIS was missing



  // ---- APPLY FILTERS WHEN VESSELS OR FILTERS CHANGE ----
  useEffect(() => {
  const filtered = applyFilters(vessels);
  const gtCount = vessels.filter(v => v.gross_tonnage > 0).length;
  const waspCount = vessels.filter(v => v.wind_assisted === 1).length;

  setFilteredVessels(filtered);
  setStats(prev => ({
    ...prev,
    active: filtered.length,
    withGT: gtCount,
    wasp: waspCount
  }));

  }, [vessels, filters, waspFilterActive]);


  // ---- WEBSOCKET CONNECTION (LIVE UPDATES) ----
useEffect(() => {
  try {
    // --- DIRECT SOCKET INITIALIZATION (no fetch!) ---
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
      console.log('Socket connection error (normal if backend is not running)');
      setIsConnected(false);
    });

    socketRef.current.on('initial_data', (data) => {
      console.log('📡 initial_data from server:', data);
    });

    socketRef.current.on('vessel_update', (data) => {
      const { mmsi, position } = data;

      setVessels(prev => {
        const index = prev.findIndex(v => v.mmsi === mmsi);

        if (index >= 0) {
          const updated = [...prev];
          const oldVessel = updated[index];
          updated[index] = { ...oldVessel, ...position };


          return updated;
        } else {
          // New vessel received live
          return [...prev, { mmsi, ...position }];
        }
      });
    });

  } catch (error) {
    console.log('Socket initialization error:', error);
  }

  // --- Cleanup ---
  return () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };
}, []);  // <-- VERY IMPORTANT (runs once)



function WindyEmbed({ opacity }) {
  return (
    <iframe
      title="Windy Wind Layer"
      src="https://embed.windy.com/embed2.html?lat=50.4&lon=3.8&detailLat=51.5&detailLon=2.3&zoom=4&level=surface&overlay=wind&product=ecmwf&type=map&metricWind=default&metricTemp=default"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        opacity: opacity / 100,
        pointerEvents: "none",
        border: "none",
        zIndex: 9999,  // <-- THIS IS THE FIX
      }}
    />
  );
}



  // ---- PERIODIC STATS REFRESH ----
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/ships/api/stats')
        .then(res => res.json())
    .then(data => setStats(prev => ({
    ...prev,
    total: data.total_vessels,
  withGT: vessels.filter(v => v.gross_tonnage > 0).length
})))

        .catch(err => console.error('Error loading stats:', err));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`vessel-map-page ${darkMode ? 'dark-mode' : ''}`}>
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
              whileHover={{ y: -5, boxShadow: '0 10px 30px rgba(255, 165, 0, 0.3)' }}
            >
              <div className="stat-icon">⚖️</div>
              <div className="stat-content">
                <div className="stat-value">
                  <AnimatedNumber value={stats.withGT} />
                </div>
                <div className="stat-label">With GT Data</div>
              </div>
            </motion.div>

            <motion.div
            className="stat-card"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.6 }}
            whileHover={{ y: -5, boxShadow: '0 10px 30px rgba(34, 197, 94, 0.3)' }}
          >
            <div className="stat-icon">🌬️</div>
            <div className="stat-content">
              <div className="stat-value">
                <AnimatedNumber value={stats.wasp} />
              </div>
              <div className="stat-label">Wind-Assisted</div>
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
          <label>🧬 Detailed Type</label>
          <select
            value={filters.detailedType}
            onChange={(e) =>
              setFilters(prev => ({ ...prev, detailedType: e.target.value }))
            }
          >
            <option value="all">All detailed types</option>
            <option value="Bulk carrier">Bulk carrier</option>
            <option value="Container ship">Container ship</option>
            <option value="General cargo ship">General cargo ship</option>
            <option value="Oil tanker">Oil tanker</option>
            <option value="Chemical tanker">Chemical tanker</option>
            <option value="LNG carrier">LNG carrier</option>
            <option value="Gas carrier">Gas carrier</option>
            <option value="Vehicle carrier">Vehicle carrier</option>
            <option value="Ro-ro ship">Ro-ro ship</option>
            <option value="Refrigerated cargo carrier">Reefer</option>
            <option value="Passenger ship">Passenger ship</option>
            <option value="Other ship types">Other ship types</option>
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

          <motion.div
            className="filter-wrapper"
            whileHover={{ scale: 1.02 }}
          >
            <label>⚖️ Gross Tonnage</label>
            <select
              value={filters.gtCategory}
              onChange={(e) => setFilters(prev => ({ ...prev, gtCategory: e.target.value }))}
            >
              <option value="all">All GT</option>
              <option value="le100">≤ 100 GT</option>
              <option value="gt100">{'>'} 100 GT</option>
              <option value="gt1000">{'>'} 1,000 GT</option>
              <option value="gt5000">{'>'} 5,000 GT</option>
            </select>
          </motion.div>


          <motion.button
            className="wasp-toggle"
            onClick={() => setWaspFilterActive(!waspFilterActive)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              background: waspFilterActive 
                ? 'linear-gradient(135deg, #ff00ff 0%, #cc00cc 100%)'
                : 'linear-gradient(135deg, #00ff00 0%, #00cc00 100%)',
              border: waspFilterActive ? '3px solid #ff00ff' : '3px solid #00ff00',
              boxShadow: waspFilterActive 
                ? '0 0 20px rgba(255, 0, 255, 0.5)'
                : '0 0 20px rgba(0, 255, 0, 0.5)',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🌬️ {waspFilterActive ? 'SHOW ALL VESSELS' : 'WIND-ASSISTED ONLY'}
          </motion.button>

          <motion.button
          className="darkmode-toggle"
          onClick={() => setDarkMode(prev => !prev)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            background: darkMode
              ? 'linear-gradient(135deg, #222 0%, #000 100%)'
              : 'linear-gradient(135deg, #ffffff 0%, #dddddd 100%)',
            border: darkMode ? '3px solid #555' : '3px solid #ccc',
            color: darkMode ? '#fff' : '#000',
            boxShadow: darkMode
              ? '0 0 20px rgba(255,255,255,0.15)'
              : '0 0 20px rgba(0,0,0,0.15)',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {darkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </motion.button>


          <motion.button
            className="wind-toggle"
            onClick={() => setShowWindLayer(!showWindLayer)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              background: showWindLayer 
                ? 'linear-gradient(135deg, #ff6600 0%, #cc5200 100%)'
                : 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
              border: showWindLayer ? '3px solid #ff6600' : '3px solid #00d4ff',
              boxShadow: showWindLayer 
                ? '0 0 20px rgba(255, 102, 0, 0.5)'
                : '0 0 20px rgba(0, 212, 255, 0.5)',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            💨 {showWindLayer ? 'HIDE WIND DATA' : 'SHOW WIND DATA'}
          </motion.button>

          <motion.button
          className="advanced-filter-toggle"
          onClick={() => setShowAdvanced(prev => !prev)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            background: showAdvanced
              ? 'linear-gradient(135deg, #ff6600, #cc5200)'
              : 'linear-gradient(135deg, #555, #333)',
            color: '#fff',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          ⚙️ Advanced Filters
        </motion.button>

        <div className="route-selector">
        <label>Route History:</label>
        <select
          value={routeHours}
          onChange={(e) => setRouteHours(parseInt(e.target.value))}
        >
          <option value={6}>Last 6h</option>
          <option value={12}>Last 12h</option>
          <option value={24}>Last 24h</option>
          <option value={48}>Last 48h</option>
          <option value={72}>Last 72h</option>
        </select>
        </div>


          {showWindLayer && (
            <motion.div
              className="wind-opacity-control"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <label style={{ fontSize: '0.9rem', color: '#aaa' }}>Wind Opacity:</label>
              <input
                type="range"
                min="0"
                max="100"
                value={windOpacity}
                onChange={(e) => setWindOpacity(parseInt(e.target.value))}
                style={{ width: '120px', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 'bold', color: '#00d4ff', minWidth: '45px' }}>
                {windOpacity}%
              </span>
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showAdvanced && (
        <motion.div
              className="advanced-filters-panel"
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                position: 'absolute',
                top: '120px',     // adjust if needed
                right: '20px',
                width: '300px',
                maxHeight: '80vh',
                overflowY: 'auto',
                zIndex: 2000,
                background: 'rgba(0,0,0,0.85)',
                borderRadius: '12px',
                padding: '20px',
                color: '#fff',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 0 20px rgba(0,0,0,0.5)',
              }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>Advanced Filters</h3>
            <button
              onClick={() => setShowAdvanced(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '18px',
                cursor: 'pointer'
              }}
            >
              ✖
            </button>
          </div>

          <p style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '10px' }}>
            Showing <strong>{filteredVessels.length}</strong> of <strong>{vessels.length}</strong> vessels
          </p>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.2)', marginBottom: '12px' }}></div>

            {/* Length */}
            <label>Length (m)</label>
            <input
              type="range"
              min="0"
              max="400"
              value={filters.lengthMax}
              onChange={(e) =>
                setFilters(prev => ({ ...prev, lengthMax: parseInt(e.target.value) }))
              }
            />
            <div>{filters.lengthMin} – {filters.lengthMax} m</div>

            {/* Beam */}
            <label>Beam (m)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={filters.beamMax}
              onChange={(e) =>
                setFilters(prev => ({ ...prev, beamMax: parseInt(e.target.value) }))
              }
            />
            <div>{filters.beamMin} – {filters.beamMax} m</div>

            {/* GT Range */}
            <label>Gross Tonnage (GT)</label>
            <input
              type="range"
              min="0"
              max="300000"
              value={filters.gtMax}
              onChange={(e) =>
                setFilters(prev => ({ ...prev, gtMax: parseInt(e.target.value) }))
              }
            />
            <div>{filters.gtMin} – {filters.gtMax} GT</div>

            {/* Speed */}
            <label>Speed (knots)</label>
            <input
              type="range"
              min="0"
              max="40"
              value={filters.speedMax}
              onChange={(e) =>
                setFilters(prev => ({ ...prev, speedMax: parseInt(e.target.value) }))
              }
            />
            <div>{filters.speedMin} – {filters.speedMax} kn</div>

            {/* Checkboxes */}
            <div style={{ marginTop: '15px' }}>
              <label>
                <input
                  type="checkbox"
                  checked={filters.hasIMO}
                  onChange={(e) =>
                    setFilters(prev => ({ ...prev, hasIMO: e.target.checked }))
                  }
                />{' '}
                Has IMO Number
              </label>
            </div>

            <div>
              <label>
                <input
                  type="checkbox"
                  checked={filters.hasGT}
                  onChange={(e) =>
                    setFilters(prev => ({ ...prev, hasGT: e.target.checked }))
                  }
                />{' '}
                Has GT Data
              </label>
            </div>

            {/* Reset */}
            <motion.button
              onClick={() =>
                setFilters(prev => ({
                  ...prev,
                  lengthMin: 0,
                  lengthMax: 400,
                  beamMin: 0,
                  beamMax: 100,
                  gtMin: 0,
                  gtMax: 300000,
                  speedMin: 0,
                  speedMax: 40,
                  hasIMO: false,
                  hasGT: false
                }))
              }
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                background: '#ff4444',
                color: '#fff',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Reset Advanced Filters
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Container */}
      <motion.div
        className="map-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        style={{ position: 'relative' }}
      >
        {/* Wind Layer Iframe */}
        <MapContainer
          center={[51.5, 2]}
          zoom={7}
          className="leaflet-map"
          zoomControl={true}
        >
        {darkMode ? (
          <TileLayer
            attribution="© OpenStreetMap, © CartoDB"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution="© OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        {/* ========================  
            ROUTE HISTORY RENDERING  
          ======================== */}
        {routeData && routeData.length > 1 && (
          <>
            <Polyline
              positions={routeData.map(p => [p.lat, p.lon])}
              pathOptions={{
                color: "#00eaff",
                weight: 4,
                opacity: 0.9,
                dashArray: "4 6",
              }}
            />

            {/* Start Marker */}
            <Marker
              position={[routeData[0].lat, routeData[0].lon]}
              icon={L.divIcon({
                className: "route-start-icon",
                html: `<div class="route-marker route-start"></div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            />

            {/* End Marker */}
            <Marker
              position={[
                routeData[routeData.length - 1].lat,
                routeData[routeData.length - 1].lon
              ]}
              icon={L.divIcon({
                className: "route-end-icon",
                html: `<div class="route-marker route-end"></div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            />
          </>
        )}





          {filteredVessels.map(vessel => {
            const typeInfo = getShipTypeInfo(vessel);

            return (
              <React.Fragment key={vessel.mmsi}>
                
                {/* Vessel Marker */}
                <Marker
                  position={[vessel.lat, vessel.lon]}
                  icon={createVesselIcon(vessel, selectedVessel === vessel.mmsi)}
                  eventHandlers={{
                  click: () => {
                    setSelectedVessel(vessel.mmsi);
                    setRouteLoading(true);
                    setRouteData(null);

                    fetch(`/ships/api/vessel/${vessel.mmsi}/route?hours=${routeHours}`)
                      .then(res => res.json())
                      .then(data => {
                        setRouteLoading(false);

                        if (data && data.length > 1) {
                          setRouteData(data);

                          // auto-fit route
                          if (mapRef.current) {
                            const bounds = L.latLngBounds(data.map(p => [p.lat, p.lon]));
                            mapRef.current.fitBounds(bounds, { padding: [50, 50] });
                          }
                        } else {
                          setRouteData([]);
                        }
                      })
                      .catch(() => {
                        setRouteLoading(false);
                        setRouteData([]);
                      });
                  },

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

          <MapBounds
          markers={filteredVessels}
          disabled={routeData && routeData.length > 1}
          />


                  {/* Route History Line */}
        {routeData && routeData.length > 1 && (
          <>
            <Polyline
              positions={routeData.map(p => [p.lat, p.lon])}
              pathOptions={{
                color: "#00eaff",
                weight: 3,
                opacity: 0.8,
              }}
            />
            
            {/* Start Marker (oldest point) */}
            <Marker
              position={[routeData[0].lat, routeData[0].lon]}
              icon={L.divIcon({
                className: "route-start",
                html: `<div class="route-marker route-start"></div>`,
                iconSize: [16, 16]
              })}
            />

            {/* End Marker (latest point) */}
            <Marker
              position={[routeData[routeData.length - 1].lat, routeData[routeData.length - 1].lon]}
              icon={L.divIcon({
                className: "route-end",
                html: `<div class="route-marker route-end"></div>`,
                iconSize: [16, 16]
              })}
            />
          </>
        )}

        </MapContainer>

        {/* Windy Overlay on Top */}
        {showWindLayer && <WindyEmbed opacity={windOpacity} />}
        <VesselSidebar
        vessel={vessels.find(v => v.mmsi === selectedVessel)}
        getShipTypeInfo={getShipTypeInfo}   // <-- add this line
        onClose={() => {
          setSelectedVessel(null);
          setRouteData(null);
        }}
        darkMode={darkMode}
      />

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
                  {getShipTypeInfo(hoveredVessel).icon}
                </span>
                <div>
                  <h4 className="hover-card-name">{hoveredVessel.name || 'Unknown'}</h4>
                  <p className="hover-card-type">
                    {getShipTypeInfo(hoveredVessel).name}
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
              {hoveredVessel.wind_assisted === 1 && (
                <div style={{ 
                  marginTop: '10px', 
                  padding: '8px', 
                  background: 'rgba(0, 255, 0, 0.1)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#00ff00',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}>
                  🌬️ Wind-Assisted
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

    {/* Animated Legend */}
    {/* LEGACY-STYLE SHIP TYPE LEGEND */}

    {routeLoading && (
      <div className="route-loading">
        Fetching route…
      </div>
    )}

      <motion.div
        className="map-legend"
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        style={{ maxHeight: "45vh", overflowY: "auto" }}   // <-- prevents huge legend
      >
        <h3 className="legend-title">
          <motion.span
            animate={{ rotate: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ⚓
          </motion.span>{" "}
          Legend
        </h3>

        {[
          ['Bulk carrier', '#8B4513'],
          ['Container ship', '#FF4500'],
          ['General cargo', '#32CD32'],
          ['Oil tanker', '#DC143C'],
          ['Chemical tanker', '#FF1493'],
          ['LNG carrier', '#9370DB'],
          ['Gas carrier', '#BA55D3'],
          ['Vehicle carrier', '#FFD700'],
          ['Ro-ro ship', '#FFA500'],
          ['Refrigerated cargo', '#00CED1'],
          ['Passenger ship', '#1E90FF'],
          ['Other', '#808080'],
        ].map(([name, color], idx) => (
          <motion.div
            key={name}
            className="legend-item"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.9 + idx * 0.1 }}
            whileHover={{ x: 5, scale: 1.05 }}
          >
            <div
              className="legend-dot"
              style={{
                background: color,
                boxShadow: `0 0 12px ${color}`
              }}
            ></div>
            <span>{name}</span>
          </motion.div>
        ))}

        <motion.div
          className="legend-info"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <div className="legend-divider"></div>
          <p><strong>Size Guide:</strong></p>
          <p>• Large = ≥200m</p>
          <p>• Medium = 100–200m</p>
          <div className="legend-divider"></div>
          <p><strong>Wind-Assisted:</strong></p>
          <p>🌬️ = Wind propulsion</p>
          <p style={{ color: '#00ff00' }}>Green border</p>
        </motion.div>
      </motion.div>

      </motion.div>
    </div>
  );
}

// Enhanced Vessel Popup
function VesselPopup({ vessel, getShipTypeInfo }) {
  const info = getShipTypeInfo(vessel);
  const [windTechDetails, setWindTechDetails] = useState(null);

  // Fetch wind technology details if vessel has wind propulsion
  useEffect(() => {
    if (vessel.wind_assisted === 1) {
      fetch(`/ships/api/vessel/${vessel.mmsi}/wind-tech`)
        .then(response => response.json())
        .then(data => {
          if (data.found) {
            setWindTechDetails(data);
          }
        })
        .catch(error => console.error('Error loading wind tech:', error));
    }
  }, [vessel.mmsi, vessel.wind_assisted]);

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
        
        {/* Wind-Assisted Indicator */}
        {vessel.wind_assisted === 1 && (
          <div style={{ 
            marginTop: '8px', 
            padding: '6px 12px', 
            background: 'linear-gradient(135deg, #1a3a1a 0%, #2d5a2d 100%)',
            border: '2px solid #00ff00',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 'bold',
            color: '#00ff00',
            textAlign: 'center'
          }}>
            🌬️ Wind-Assisted Propulsion
          </div>
        )}
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
        
        {/* Wind Technology Details */}
        {windTechDetails && (
          <>
            <div className="detail-divider"></div>
            <div className="detail-row">
              <span className="detail-label">Wind Tech</span>
              <span className="detail-value" style={{ color: '#00ff00' }}>
                {windTechDetails.technology}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Installed</span>
              <span className="detail-value">
                {windTechDetails.year} ({windTechDetails.type})
              </span>
            </div>
          </>
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


