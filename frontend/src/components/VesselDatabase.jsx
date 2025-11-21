import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import {
  Search,
  Filter,
  Ship,
  TrendingUp,
  Anchor,
  Wind,
  BarChart3,
  X,
  ChevronDown,
  Download,
  Eye,
  Zap,
  Globe
} from 'lucide-react';
import '../styles/Database.css';

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }
};


// Animated Counter Component
function CountUp({ to, from = 0, duration = 2, suffix = '' }) {
  const nodeRef = useRef(null);
  const [displayValue, setDisplayValue] = useState(from);

  useEffect(() => {
    const controls = animate(from, to, {
      duration,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplayValue(Math.floor(latest))
    });

    return () => controls.stop();
  }, [from, to, duration]);

  return <span ref={nodeRef}>{displayValue.toLocaleString()}{suffix}</span>;
}

export default function VesselDatabase() {
  const API_BASE = import.meta.env.VITE_API_URL || '';
  
  const [vessels, setVessels] = useState([]);
  const [filteredVessels, setFilteredVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    minLength: '',
    maxLength: '',
    shipType: '',
    flagState: '',
    minCo2: '',
    showFilter: 'all'
  });
  const [stats, setStats] = useState({
    total: 0,
    withEmissions: 0,
    totalCo2: 0,
    avgCo2: 0
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [viewMode, setViewMode] = useState('table');

  useEffect(() => {
    fetchVessels();
  }, []);

  useEffect(() => {
    if (vessels.length > 0) {
      fetchStats();
    }
  }, [vessels]);

  useEffect(() => {
    if (!loading && vessels.length > 0) {
      debouncedApplyFilters();
    }
  }, [searchTerm, filters, vessels, loading]);


  const fetchVessels = async () => {
    try {
      const response = await fetch(`${API_BASE}/ships/api/vessels/combined?limit=1000`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setVessels(data);
      setFilteredVessels(data);
      setLoading(false);
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };


  const fetchStats = async () => {
    try {
      const responses = await Promise.allSettled([
        fetch(`${API_BASE}/ships/api/stats`).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE}/ships/api/emissions/match-stats`).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE}/ships/api/emissions/stats`).then(r => r.ok ? r.json() : null)
      ]);
      
      const [, matchStats, emissionsStats] = responses.map(r => 
        r.status === 'fulfilled' ? r.value : null
      );
      
      if (matchStats && emissionsStats) {
        setStats({
          total: matchStats.total_ais_vessels || 0,
          withEmissions: matchStats.matched_vessels || 0,
          totalCo2: emissionsStats.total_co2_emissions 
            ? parseFloat((emissionsStats.total_co2_emissions / 1000000).toFixed(1))
            : 0,
          avgCo2: emissionsStats.average_co2_per_vessel 
            ? Math.round(emissionsStats.average_co2_per_vessel)
            : 0
        });
      }
    } catch (error) {
      console.error('Stats error:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...vessels];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.name?.toLowerCase().includes(term) ||
        v.mmsi?.toString().includes(term) ||
        v.imo?.toString().includes(term) ||
        v.signatory_company?.toLowerCase().includes(term)
      );
    }

    if (filters.minLength) filtered = filtered.filter(v => v.length >= parseInt(filters.minLength));
    if (filters.maxLength) filtered = filtered.filter(v => v.length <= parseInt(filters.maxLength));
    
    if (filters.shipType) {
      const typeNum = parseInt(filters.shipType);
      filtered = filtered.filter(v => v.ship_type >= typeNum && v.ship_type < typeNum + 10);
    }
    
    if (filters.flagState) {
      filtered = filtered.filter(v => 
        v.flag_state?.toLowerCase().includes(filters.flagState.toLowerCase())
      );
    }
    
    if (filters.minCo2) {
      filtered = filtered.filter(v => v.total_co2_emissions >= parseFloat(filters.minCo2));
    }
    
    if (filters.showFilter === 'emissions') {
      filtered = filtered.filter(v => v.total_co2_emissions != null);
    } else if (filters.showFilter === 'no-emissions') {
      filtered = filtered.filter(v => v.total_co2_emissions == null);
    }

    setFilteredVessels(filtered);
  };

  // Debounced filtering (must be defined AFTER applyFilters)
const debouncedApplyFilters = useRef(
  debounce(() => {
    if (!loading && vessels.length > 0) applyFilters();
  }, 150)
).current;


  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    const sorted = [...filteredVessels].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return direction === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    setFilteredVessels(sorted);
  };

  const getShipTypeBadge = (shipType) => {
    if (shipType >= 60 && shipType < 70) return { name: 'Passenger', class: 'type-passenger' };
    if (shipType >= 70 && shipType < 80) return { name: 'Cargo', class: 'type-cargo' };
    if (shipType >= 80 && shipType < 90) return { name: 'Tanker', class: 'type-tanker' };
    return { name: 'Other', class: 'type-other' };
  };

  const formatNumber = (num) => {
    if (num == null) return 'N/A';
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const getScoreBadge = (score) => {
    if (score == null || score === '') return { text: 'N/A', class: 'na' };
    const numScore = Number(score);
    if (numScore >= 5) return { text: numScore, class: 'high' };
    if (numScore >= 3) return { text: numScore, class: 'medium' };
    return { text: numScore, class: 'low' };
  };

  const exportToCSV = () => {
    const headers = ['MMSI', 'Name', 'Type', 'Length', 'Flag', 'Company', 'CO2', 'Fit Score'];
    const rows = filteredVessels.map(v => [
      v.mmsi, v.name, getShipTypeBadge(v.ship_type).name, v.length, v.flag_state,
      v.signatory_company, v.total_co2_emissions, v.econowind_fit_score
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vessels.csv';
    a.click();
  };

  return (
    <div className="database-container">
      {/* Animated Stats */}
      <motion.div 
        className="stats-grid"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <motion.div 
          className="stat-card"
          whileHover={{ scale: 1.05, rotate: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
          >
            <Ship className="stat-icon" size={32} />
          </motion.div>
          <div className="stat-value">
            <CountUp to={stats.total} duration={2} />
          </div>
          <div className="stat-label">Total Vessels</div>
          <motion.div 
            className="stat-pulse"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.div>

        <motion.div 
          className="stat-card emissions"
          whileHover={{ scale: 1.05, rotate: -1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
          >
            <Wind className="stat-icon" size={32} />
          </motion.div>
          <div className="stat-value">
            <CountUp to={stats.withEmissions} duration={2.5} />
          </div>
          <div className="stat-label">With Emissions Data</div>
          <motion.div 
            className="stat-pulse emissions"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
          />
        </motion.div>

        <motion.div 
          className="stat-card co2"
          whileHover={{ scale: 1.05, rotate: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: 'spring' }}
          >
            <TrendingUp className="stat-icon" size={32} />
          </motion.div>
          <div className="stat-value">
            <CountUp to={Math.floor(stats.totalCo2)} duration={3} suffix="M" />
          </div>
          <div className="stat-label">Total CO₂ (tonnes)</div>
          <motion.div 
            className="stat-pulse co2"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
          />
        </motion.div>

        <motion.div 
          className="stat-card"
          whileHover={{ scale: 1.05, rotate: -1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: 'spring' }}
          >
            <BarChart3 className="stat-icon" size={32} />
          </motion.div>
          <div className="stat-value">
            <CountUp to={filteredVessels.length} duration={1.5} />
          </div>
          <div className="stat-label">Filtered Results</div>
          <motion.div 
            className="stat-pulse"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.9 }}
          />
        </motion.div>
      </motion.div>

      {/* Action Bar */}
      <motion.div 
        className="action-bar"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <div className="search-container">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            placeholder="Search by name, MMSI, IMO, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="search-clear"
              onClick={() => setSearchTerm('')}
            >
              <X size={16} />
            </motion.button>
          )}
        </div>

        <div className="action-buttons">
          <button 
            className="action-btn"
            onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
          >
            <Eye size={18} />
            {viewMode === 'table' ? 'Cards' : 'Table'}
          </button>

          <button 
            className="action-btn"
            onClick={exportToCSV}
            disabled={filteredVessels.length === 0}
          >
            <Download size={18} />
            Export
          </button>

          <button 
            className="filter-toggle-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            Filters
            <motion.div
              animate={{ rotate: showFilters ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <ChevronDown size={16} />
            </motion.div>
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            className="filters-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="filters-grid">
              <motion.div className="filter-group" whileHover={{ scale: 1.02 }}>
                <label>Min Length (m)</label>
                <input
                  type="number"
                  placeholder="100"
                  value={filters.minLength}
                  onChange={(e) => setFilters({...filters, minLength: e.target.value})}
                />
              </motion.div>

              <motion.div className="filter-group" whileHover={{ scale: 1.02 }}>
                <label>Max Length (m)</label>
                <input
                  type="number"
                  placeholder="400"
                  value={filters.maxLength}
                  onChange={(e) => setFilters({...filters, maxLength: e.target.value})}
                />
              </motion.div>

              <motion.div className="filter-group" whileHover={{ scale: 1.02 }}>
                <label>Ship Type</label>
                <select
                  value={filters.shipType}
                  onChange={(e) => setFilters({...filters, shipType: e.target.value})}
                >
                  <option value="">All Types</option>
                  <option value="60">Passenger</option>
                  <option value="70">Cargo</option>
                  <option value="80">Tanker</option>
                </select>
              </motion.div>

              <motion.div className="filter-group" whileHover={{ scale: 1.02 }}>
                <label>Flag State</label>
                <input
                  type="text"
                  placeholder="Netherlands"
                  value={filters.flagState}
                  onChange={(e) => setFilters({...filters, flagState: e.target.value})}
                />
              </motion.div>

              <motion.div className="filter-group" whileHover={{ scale: 1.02 }}>
                <label>Min CO₂ (tonnes)</label>
                <input
                  type="number"
                  placeholder="50000"
                  value={filters.minCo2}
                  onChange={(e) => setFilters({...filters, minCo2: e.target.value})}
                />
              </motion.div>

              <motion.div className="filter-group" whileHover={{ scale: 1.02 }}>
                <label>Show Only</label>
                <select
                  value={filters.showFilter}
                  onChange={(e) => setFilters({...filters, showFilter: e.target.value})}
                >
                  <option value="all">All Vessels</option>
                  <option value="emissions">With Emissions</option>
                  <option value="no-emissions">Without Emissions</option>
                </select>
              </motion.div>


              <div className="filters-actions" style={{ gridColumn: "1 / -1", marginTop: "10px" }}>
              <button 
                className="apply-filters-btn" 
                onClick={() => applyFilters()}
              >
                Apply Filters
              </button>

              <button 
                className="reset-filters-btn"
                onClick={() => {
                  setFilters({
                    shipType: "",
                    minLength: "",
                    maxLength: "",
                    minCo2: "",
                    showFilter: "all"
                  });
                  setSearchTerm("");
                  applyFilters();
                }}
                style={{ marginLeft: "10px" }}
              >
                Reset
              </button>
            </div>

            </div>

            <motion.button 
              className="clear-filters-btn"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setFilters({
                  minLength: '',
                  maxLength: '',
                  shipType: '',
                  flagState: '',
                  minCo2: '',
                  showFilter: 'all'
                });
                setSearchTerm('');
              }}
            >
              <X size={16} />
              Clear All Filters
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Data Display */}
      <motion.div 
        className="data-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        {loading ? (
          <div className="loading-state">
            <motion.div
              animate={{ 
                rotate: 360,
                scale: [1, 1.2, 1]
              }}
              transition={{ 
                rotate: { duration: 2, repeat: Infinity, ease: 'linear' },
                scale: { duration: 1, repeat: Infinity }
              }}
            >
              <Anchor size={48} className="loading-icon" />
            </motion.div>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              Loading vessel data...
            </motion.p>
          </div>
        ) : filteredVessels.length === 0 ? (
          <motion.div 
            className="empty-state"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Ship size={64} />
            </motion.div>
            <h3>No vessels found</h3>
            <p>Try adjusting your filters or search terms</p>
          </motion.div>
        ) : viewMode === 'cards' ? (
          <div className="cards-grid">
            {filteredVessels.slice(0, 50).map((vessel, idx) => {
              const typeInfo = getShipTypeBadge(vessel.ship_type);
              const scoreInfo = getScoreBadge(vessel.econowind_fit_score);
              const hasEmissions = vessel.total_co2_emissions != null;

              return (
                <motion.div
                  key={vessel.mmsi}
                  className={`vessel-card ${hasEmissions ? 'has-emissions' : ''}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.005, 0.2) }}
                  whileHover={{ y: -8, boxShadow: '0 12px 40px rgba(0, 119, 182, 0.2)' }}
                  onClick={() => setSelectedVessel(vessel)}
                >
                  <div className="card-header">
                    <h3>{vessel.name || 'Unknown'}</h3>
                    {hasEmissions && (
                      <motion.span 
                        className="emissions-badge"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: idx * 0.03 + 0.2 }}
                      >
                        ✓ CO₂
                      </motion.span>
                    )}
                  </div>
                  <div className="card-body">
                    <div className="card-detail">
                      <Globe size={16} />
                      <span>{vessel.flag_state || 'Unknown'}</span>
                    </div>
                    <div className="card-detail">
                      <Anchor size={16} />
                      <span>{vessel.length || 'N/A'}m</span>
                    </div>
                    <span className={`type-badge ${typeInfo.class}`}>
                      {typeInfo.name}
                    </span>
                  </div>
                  <div className="card-footer">
                    <div className="co2-display">
                      <TrendingUp size={14} />
                      <span className="co2-value">
                        {vessel.total_co2_emissions 
                          ? formatNumber(vessel.total_co2_emissions) + ' t'
                          : 'N/A'}
                      </span>
                    </div>
                    <span className={`score-badge ${scoreInfo.class}`}>
                      <Zap size={12} />
                      {scoreInfo.text}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="vessels-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('mmsi')}>MMSI</th>
                  <th onClick={() => handleSort('name')}>Vessel Name</th>
                  <th onClick={() => handleSort('ship_type')}>Type</th>
                  <th onClick={() => handleSort('length')}>Length</th>
                  <th onClick={() => handleSort('flag_state')}>Flag</th>
                  <th onClick={() => handleSort('signatory_company')}>Company</th>
                  <th onClick={() => handleSort('total_co2_emissions')}>CO₂</th>
                  <th onClick={() => handleSort('avg_co2_per_distance')}>CO₂/nm</th>
                  <th onClick={() => handleSort('econowind_fit_score')}>Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredVessels.map((vessel, idx) => {
                  const typeInfo = getShipTypeBadge(vessel.ship_type);
                  const scoreInfo = getScoreBadge(vessel.econowind_fit_score);
                  const hasEmissions = vessel.total_co2_emissions != null;

                  return (
                    <motion.tr
                      key={vessel.mmsi}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 1) }}
                      className={hasEmissions ? 'has-emissions' : ''}
                      onClick={() => setSelectedVessel(vessel)}
                      whileHover={{ backgroundColor: 'rgba(0, 119, 182, 0.08)', scale: 1.01 }}
                    >
                      <td>{vessel.mmsi || 'N/A'}</td>
                      <td className="vessel-name">
                        <strong>{vessel.name || 'Unknown'}</strong>
                        {hasEmissions && <span className="emissions-badge">✓</span>}
                      </td>
                      <td>
                        <span className={`type-badge ${typeInfo.class}`}>
                          {typeInfo.name}
                        </span>
                      </td>
                      <td>{vessel.length || 'N/A'}</td>
                      <td>{vessel.flag_state || 'Unknown'}</td>
                      <td>{vessel.signatory_company || 'Unknown'}</td>
                      <td className="co2-value">
                        {vessel.total_co2_emissions 
                          ? formatNumber(vessel.total_co2_emissions) + ' t'
                          : 'N/A'}
                      </td>
                      <td className={vessel.avg_co2_per_distance < 1000 ? 'efficiency-good' : 'efficiency-bad'}>
                        {vessel.avg_co2_per_distance 
                          ? vessel.avg_co2_per_distance.toFixed(1)
                          : 'N/A'}
                      </td>
                      <td>
                        <span className={`score-badge ${scoreInfo.class}`}>
                          {scoreInfo.text}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Modal */}
      <AnimatePresence>
        {selectedVessel && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedVessel(null)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.8, y: 50, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: 50, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="modal-close" onClick={() => setSelectedVessel(null)}>
                <X size={24} />
              </button>
              
              <div className="modal-header">
                <motion.h2
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  {selectedVessel.name || 'Unknown Vessel'}
                </motion.h2>
                <motion.p
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  MMSI: {selectedVessel.mmsi} | IMO: {selectedVessel.imo || 'N/A'}
                </motion.p>
              </div>

              <div className="modal-body">
                <div className="detail-grid">
                  {[
                    { label: 'Length', value: `${selectedVessel.length || 'N/A'} m` },
                    { label: 'Flag State', value: selectedVessel.flag_state || 'Unknown' },
                    { label: 'Company', value: selectedVessel.signatory_company || 'Unknown' },
                    { label: 'CO₂ Emissions', value: formatNumber(selectedVessel.total_co2_emissions) + ' t', highlight: true },
                    { label: 'Fuel Consumption', value: formatNumber(selectedVessel.total_fuel_consumption) + ' t' },
                    { label: 'Fit Score', value: getScoreBadge(selectedVessel.econowind_fit_score).text, score: true }
                  ].map((item, idx) => (
                    <motion.div
                      key={item.label}
                      className="detail-item"
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.1 + idx * 0.05 }}
                    >
                      <label>{item.label}</label>
                      <span className={item.highlight ? 'co2-value' : ''}>
                        {item.score ? (
                          <span className={`score-badge ${getScoreBadge(selectedVessel.econowind_fit_score).class}`}>
                            {item.value}
                          </span>
                        ) : item.value}
                      </span>
                    </motion.div>
                  ))}
                </div>

                <motion.div 
                  className="modal-actions"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                <motion.button
                  className="action-btn primary"
                  onClick={() => window.location.href = `/map?mmsi=${selectedVessel.mmsi}`}
                >
                  <Globe size={18} />
                  View on Map
                </motion.button>

                  {selectedVessel.imo && (
                    <motion.a 
                      href={`/ships/api/emissions/vessel/${selectedVessel.imo}`}
                      className="action-btn secondary" 
                      target="_blank"
                      rel="noreferrer"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <BarChart3 size={18} />
                      Full Report
                    </motion.a>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}