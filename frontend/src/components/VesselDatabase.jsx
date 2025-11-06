import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Ship, TrendingUp, Anchor, Wind, BarChart3, X, ChevronDown } from 'lucide-react';
import '../styles/Database.css';

export default function VesselDatabase() {
  // Get the API base URL - adjust based on your setup
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  
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
  const [apiStatus, setApiStatus] = useState({
    vessels: 'pending',
    stats: 'pending'
  });

  // Fetch data on mount
  useEffect(() => {
    fetchVessels();
  }, []);

  // Fetch stats after vessels are loaded
  useEffect(() => {
    if (vessels.length > 0) {
      fetchStats();
    }
  }, [vessels]);

  // Apply filters when they change
  useEffect(() => {
    applyFilters();
  }, [searchTerm, filters, vessels]);

  const fetchVessels = async () => {
    setApiStatus(prev => ({ ...prev, vessels: 'loading' }));
    try {
      // Use fetch with full error handling
      const response = await fetch('/ships/api/vessels/combined?limit=1000');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ Fetched vessels:', data.length);
      setVessels(data);
      setFilteredVessels(data);
      setApiStatus(prev => ({ ...prev, vessels: 'success' }));
      setLoading(false);
    } catch (error) {
      console.error('❌ Error fetching vessels:', error);
      setApiStatus(prev => ({ ...prev, vessels: 'error' }));
      // Try fallback to database API
      try {
        const response = await fetch('/ships/api/database/vessels');
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Fetched from database API:', data.length);
          setVessels(data);
          setFilteredVessels(data);
          setApiStatus(prev => ({ ...prev, vessels: 'success' }));
        }
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
      }
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    setApiStatus(prev => ({ ...prev, stats: 'loading' }));
    try {
      const responses = await Promise.allSettled([
        fetch('/ships/api/stats').then(r => r.ok ? r.json() : null),
        fetch('/ships/api/emissions/match-stats').then(r => r.ok ? r.json() : null),
        fetch('/ships/api/emissions/stats').then(r => r.ok ? r.json() : null)
      ]);
      
      const [aisStats, matchStats, emissionsStats] = responses.map(r => 
        r.status === 'fulfilled' ? r.value : null
      );
      
      console.log('📊 Stats fetched:', { aisStats, matchStats, emissionsStats });
      
      if (matchStats && emissionsStats) {
        setStats({
          total: matchStats.total_ais_vessels || 0,
          withEmissions: matchStats.matched_vessels || 0,
          totalCo2: emissionsStats.total_co2_emissions 
            ? (emissionsStats.total_co2_emissions / 1000000).toFixed(1) 
            : '0',
          avgCo2: emissionsStats.average_co2_per_vessel 
            ? Math.round(emissionsStats.average_co2_per_vessel)
            : 0
        });
        setApiStatus(prev => ({ ...prev, stats: 'success' }));
      } else {
        // Set default stats if APIs fail
        console.warn('⚠️ Using default stats due to API errors');
        setStats({
          total: vessels.length,
          withEmissions: vessels.filter(v => v.total_co2_emissions).length,
          totalCo2: '0',
          avgCo2: 0
        });
        setApiStatus(prev => ({ ...prev, stats: 'partial' }));
      }
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      setApiStatus(prev => ({ ...prev, stats: 'error' }));
      // Use vessel data as fallback
      setStats({
        total: vessels.length,
        withEmissions: vessels.filter(v => v.total_co2_emissions).length,
        totalCo2: '0',
        avgCo2: 0
      });
    }
  };

  const applyFilters = () => {
    let filtered = [...vessels];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.name?.toLowerCase().includes(term) ||
        v.mmsi?.toString().includes(term) ||
        v.imo?.toString().includes(term) ||
        v.signatory_company?.toLowerCase().includes(term)
      );
    }

    // Length filters
    if (filters.minLength) {
      filtered = filtered.filter(v => v.length >= parseInt(filters.minLength));
    }
    if (filters.maxLength) {
      filtered = filtered.filter(v => v.length <= parseInt(filters.maxLength));
    }

    // Ship type filter
    if (filters.shipType) {
      const typeNum = parseInt(filters.shipType);
      filtered = filtered.filter(v => v.ship_type >= typeNum && v.ship_type < typeNum + 10);
    }

    // Flag state filter
    if (filters.flagState) {
      filtered = filtered.filter(v => 
        v.flag_state?.toLowerCase().includes(filters.flagState.toLowerCase())
      );
    }

    // CO2 filter
    if (filters.minCo2) {
      filtered = filtered.filter(v => v.total_co2_emissions >= parseFloat(filters.minCo2));
    }

    // Show filter
    if (filters.showFilter === 'emissions') {
      filtered = filtered.filter(v => v.total_co2_emissions != null);
    } else if (filters.showFilter === 'no-emissions') {
      filtered = filtered.filter(v => v.total_co2_emissions == null);
    }

    setFilteredVessels(filtered);
  };

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

  return (
    <div className="database-container">
      {/* Hero Stats Section */}
      <motion.div 
        className="stats-grid"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div 
          className="stat-card"
          whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(0, 119, 182, 0.3)' }}
        >
          <Ship className="stat-icon" size={32} />
          <div className="stat-value">{formatNumber(stats.total)}</div>
          <div className="stat-label">Total Vessels</div>
        </motion.div>

        <motion.div 
          className="stat-card emissions"
          whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(81, 207, 102, 0.3)' }}
        >
          <Wind className="stat-icon" size={32} />
          <div className="stat-value">{formatNumber(stats.withEmissions)}</div>
          <div className="stat-label">With Emissions Data</div>
        </motion.div>

        <motion.div 
          className="stat-card co2"
          whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(255, 107, 107, 0.3)' }}
        >
          <TrendingUp className="stat-icon" size={32} />
          <div className="stat-value">{stats.totalCo2}M</div>
          <div className="stat-label">Total CO₂ (tonnes)</div>
        </motion.div>

        <motion.div 
          className="stat-card"
          whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(0, 180, 216, 0.3)' }}
        >
          <BarChart3 className="stat-icon" size={32} />
          <div className="stat-value">{formatNumber(filteredVessels.length)}</div>
          <div className="stat-label">Filtered Results</div>
        </motion.div>
      </motion.div>

      {/* Search & Filter Bar */}
      <motion.div 
        className="search-filter-bar"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
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
        </div>

        <button 
          className="filter-toggle-btn"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={18} />
          Filters
          <ChevronDown 
            size={16} 
            style={{ 
              transform: showFilters ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s'
            }}
          />
        </button>
      </motion.div>

      {/* Expandable Filters */}
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
              <div className="filter-group">
                <label>Min Length (m)</label>
                <input
                  type="number"
                  placeholder="100"
                  value={filters.minLength}
                  onChange={(e) => setFilters({...filters, minLength: e.target.value})}
                />
              </div>

              <div className="filter-group">
                <label>Max Length (m)</label>
                <input
                  type="number"
                  placeholder="400"
                  value={filters.maxLength}
                  onChange={(e) => setFilters({...filters, maxLength: e.target.value})}
                />
              </div>

              <div className="filter-group">
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
              </div>

              <div className="filter-group">
                <label>Flag State</label>
                <input
                  type="text"
                  placeholder="Netherlands"
                  value={filters.flagState}
                  onChange={(e) => setFilters({...filters, flagState: e.target.value})}
                />
              </div>

              <div className="filter-group">
                <label>Min CO₂ (tonnes)</label>
                <input
                  type="number"
                  placeholder="50000"
                  value={filters.minCo2}
                  onChange={(e) => setFilters({...filters, minCo2: e.target.value})}
                />
              </div>

              <div className="filter-group">
                <label>Show Only</label>
                <select
                  value={filters.showFilter}
                  onChange={(e) => setFilters({...filters, showFilter: e.target.value})}
                >
                  <option value="all">All Vessels</option>
                  <option value="emissions">With Emissions</option>
                  <option value="no-emissions">Without Emissions</option>
                </select>
              </div>
            </div>

            <button 
              className="clear-filters-btn"
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
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vessels Table */}
      <motion.div 
        className="table-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        {loading ? (
          <div className="loading-state">
            <motion.div
              className="loading-spinner"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Anchor size={40} />
            </motion.div>
            <p>Loading vessel data...</p>
          </div>
        ) : filteredVessels.length === 0 ? (
          <div className="empty-state">
            <Ship size={64} />
            <h3>No vessels found</h3>
            <p>Try adjusting your filters or search terms</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="vessels-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('mmsi')}>MMSI</th>
                  <th onClick={() => handleSort('name')}>Vessel Name</th>
                  <th onClick={() => handleSort('ship_type')}>Type</th>
                  <th onClick={() => handleSort('length')}>Length (m)</th>
                  <th onClick={() => handleSort('flag_state')}>Flag</th>
                  <th onClick={() => handleSort('signatory_company')}>Company</th>
                  <th onClick={() => handleSort('total_co2_emissions')}>CO₂ Emissions</th>
                  <th onClick={() => handleSort('avg_co2_per_distance')}>CO₂/Distance</th>
                  <th onClick={() => handleSort('econowind_fit_score')}>Fit Score</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredVessels.map((vessel, idx) => {
                    const typeInfo = getShipTypeBadge(vessel.ship_type);
                    const scoreInfo = getScoreBadge(vessel.econowind_fit_score);
                    const hasEmissions = vessel.total_co2_emissions != null;

                    return (
                      <motion.tr
                        key={vessel.mmsi}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: idx * 0.02 }}
                        className={hasEmissions ? 'has-emissions' : ''}
                        onClick={() => setSelectedVessel(vessel)}
                        whileHover={{ backgroundColor: 'rgba(0, 119, 182, 0.1)' }}
                      >
                        <td>{vessel.mmsi || 'N/A'}</td>
                        <td className="vessel-name">
                          <strong>{vessel.name || 'Unknown'}</strong>
                          {hasEmissions && <span className="emissions-badge">✓ CO₂</span>}
                        </td>
                        <td>
                          <span className={`type-badge ${typeInfo.class}`}>
                            {typeInfo.name}
                          </span>
                        </td>
                        <td>{vessel.length || 'N/A'}</td>
                        <td>{vessel.flag_state || 'Unknown'}</td>
                        <td>{vessel.signatory_company || vessel.mrv_company || 'Unknown'}</td>
                        <td className="co2-value">
                          {vessel.total_co2_emissions 
                            ? formatNumber(vessel.total_co2_emissions) + ' t'
                            : 'N/A'}
                        </td>
                        <td className={vessel.avg_co2_per_distance < 1000 ? 'efficiency-good' : 'efficiency-bad'}>
                          {vessel.avg_co2_per_distance 
                            ? vessel.avg_co2_per_distance.toFixed(1) + ' kg/nm'
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
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Vessel Detail Modal */}
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
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="modal-close" onClick={() => setSelectedVessel(null)}>
                <X size={24} />
              </button>
              
              <div className="modal-header">
                <h2>{selectedVessel.name || 'Unknown Vessel'}</h2>
                <p>MMSI: {selectedVessel.mmsi} | IMO: {selectedVessel.imo || 'N/A'}</p>
              </div>

              <div className="modal-body">
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Length</label>
                    <span>{selectedVessel.length || 'N/A'} m</span>
                  </div>
                  <div className="detail-item">
                    <label>Flag State</label>
                    <span>{selectedVessel.flag_state || 'Unknown'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Company</label>
                    <span>{selectedVessel.signatory_company || 'Unknown'}</span>
                  </div>
                  <div className="detail-item">
                    <label>CO₂ Emissions</label>
                    <span className="co2-value">
                      {formatNumber(selectedVessel.total_co2_emissions)} t
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Fuel Consumption</label>
                    <span>{formatNumber(selectedVessel.total_fuel_consumption)} t</span>
                  </div>
                  <div className="detail-item">
                    <label>Econowind Fit Score</label>
                    <span className={`score-badge ${getScoreBadge(selectedVessel.econowind_fit_score).class}`}>
                      {getScoreBadge(selectedVessel.econowind_fit_score).text}
                    </span>
                  </div>
                </div>

                <div className="modal-actions">
                  <a href={`/ships/?mmsi=${selectedVessel.mmsi}`} className="action-btn primary">
                    View on Map
                  </a>
                  {selectedVessel.imo && (
                    <a href={`/ships/api/emissions/vessel/${selectedVessel.imo}`} className="action-btn secondary" target="_blank">
                      Full Emissions Report
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}