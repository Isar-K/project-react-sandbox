import { useState, useEffect, useRef, useMemo } from 'react';
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
  Sparkles,
  Activity
} from 'lucide-react';
import '../styles/Database.css';

const AnimatedNumber = ({
  value = 0,
  decimals = 0,
  suffix = '',
  loading = false,
  placeholderRange = [0, 100]
}) => {
  const [rangeStart = 0, rangeEnd = 100] = placeholderRange;
  const count = useMotionValue(rangeStart);
  const [displayValue, setDisplayValue] = useState(rangeStart);
  const placeholderFrame = useRef(null);
  const placeholderStart = useRef(null);
  const liveAnimation = useRef(null);
  const previousValue = useRef(value ?? rangeStart);

  useEffect(() => {
    const unsubscribe = count.on('change', latest => {
      previousValue.current = latest;
      setDisplayValue(latest);
    });

    return () => unsubscribe();
  }, [count]);

  useEffect(() => {
    const cancelPlaceholder = () => {
      if (placeholderFrame.current) {
        cancelAnimationFrame(placeholderFrame.current);
        placeholderFrame.current = null;
      }
      placeholderStart.current = null;
    };

    if (loading) {
      liveAnimation.current?.stop?.();
      cancelPlaceholder();
      count.set(rangeStart);
      previousValue.current = rangeStart;
      const span = rangeEnd - rangeStart || 120;
      const duration = Math.max(1800, Math.abs(span) * 20);

      const step = (timestamp) => {
        if (!placeholderStart.current) {
          placeholderStart.current = timestamp;
        }
        const elapsed = (timestamp - placeholderStart.current) % duration;
        const progress = elapsed / duration;
        const smoothProgress = progress * progress * (3 - 2 * progress);
        const nextValue = rangeStart + smoothProgress * span;
        count.set(nextValue);
        placeholderFrame.current = requestAnimationFrame(step);
      };

      placeholderFrame.current = requestAnimationFrame(step);

      return () => {
        cancelPlaceholder();
      };
    }

    cancelPlaceholder();

    const numericValue = Number(value ?? 0);
    if (!Number.isFinite(numericValue)) {
      return undefined;
    }

    if (Math.abs(numericValue - previousValue.current) < 1 / Math.pow(10, decimals + 2)) {
      count.set(numericValue);
      return undefined;
    }

    liveAnimation.current?.stop?.();
    liveAnimation.current = animate(count, numericValue, {
      duration: 1.15,
      ease: [0.16, 1, 0.3, 1]
    });

    return () => liveAnimation.current?.stop?.();
  }, [count, decimals, loading, rangeEnd, rangeStart, value]);

  return (
    <span>
      {Number(displayValue).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })}
      {suffix}
    </span>
  );
};

const PLACEHOLDER_STATS = {
  total: 1840,
  withEmissions: 1240,
  totalCo2: 12.4,
  avgCo2: 28
};
const PLACEHOLDER_MATCH = (PLACEHOLDER_STATS.withEmissions / PLACEHOLDER_STATS.total) * 100;

export default function VesselDatabase() {

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
  const [stats, setStats] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [apiStatus, setApiStatus] = useState({
    vessels: 'pending',
    stats: 'pending'
  });
  const [tableMode, setTableMode] = useState('compact');

  const tableColumns = useMemo(() => ([
    { key: 'mmsi', label: 'MMSI', sortable: true },
    { key: 'name', label: 'Vessel Name', sortable: true },
    { key: 'ship_type', label: 'Type', sortable: true },
    { key: 'length', label: 'Length (m)', sortable: true },
    { key: 'flag_state', label: 'Flag', sortable: true },
    { key: 'signatory_company', label: 'Company', sortable: true },
    { key: 'total_co2_emissions', label: 'CO₂ Emissions', sortable: true },
    { key: 'avg_co2_per_distance', label: 'CO₂/Distance', sortable: true },
    { key: 'econowind_fit_score', label: 'Fit Score', sortable: true },
    { key: 'pulse', label: 'CO₂ Pulse', sortable: false }
  ]), []);

  const statsReady = Boolean(stats);
  const displayStats = stats ?? PLACEHOLDER_STATS;
  const statsLoading = !statsReady || apiStatus.stats === 'loading';

  const matchPercentage = statsReady && stats.total
    ? (stats.withEmissions / stats.total) * 100
    : PLACEHOLDER_MATCH;

  const renderTableHead = () => (
    <thead>
      <tr>
        {tableColumns.map(column => (
          <th
            key={column.key}
            onClick={column.sortable ? () => handleSort(column.key) : undefined}
            className={column.sortable ? 'sortable' : 'static'}
          >
            {column.label}
          </th>
        ))}
      </tr>
    </thead>
  );

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
            ? Number((emissionsStats.total_co2_emissions / 1000000).toFixed(1))
            : 0,
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
          totalCo2: 0,
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
        totalCo2: 0,
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
    const sortableColumn = tableColumns.find(column => column.key === key && column.sortable);
    if (!sortableColumn) return;

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

  const getStatusConfig = status => {
    switch (status) {
      case 'success':
        return { label: 'Live', className: 'success', description: 'Streaming fresh insights' };
      case 'loading':
        return { label: 'Syncing', className: 'loading', description: 'Fetching the latest fleet data' };
      case 'error':
        return { label: 'Offline', className: 'error', description: 'Unable to reach service' };
      case 'partial':
        return { label: 'Partial', className: 'warning', description: 'Using blended data sources' };
      default:
        return { label: 'Pending', className: 'pending', description: 'Awaiting kickoff' };
    }
  };

  return (
    <div className="database-container">
      <motion.div
        className="database-header"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="header-left">
          <div className="header-icon">
            <Sparkles size={28} />
          </div>
          <div>
            <h1>Vessel Intelligence Hub</h1>
            <p>
              Dive into the global fleet with tactile filters, animated metrics, and a playful data
              experience tailor-made for maritime exploration.
            </p>
          </div>
        </div>
        <div className="header-right">
          <div className="header-metric">
            <span className="metric-label">Experience Mode</span>
            <span className="metric-value">Explorer</span>
          </div>
          <div className="header-metric">
            <span className="metric-label">Data Freshness</span>
            <span className="metric-value">Live Sync</span>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="status-strip"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6 }}
      >
        {[{
          key: 'vessels',
          label: 'Vessel API',
          icon: <Anchor size={18} />
        }, {
          key: 'stats',
          label: 'Emissions API',
          icon: <Activity size={18} />
        }].map(item => {
          const config = getStatusConfig(apiStatus[item.key]);
          return (
            <motion.div
              key={item.key}
              className={`status-pill ${config.className}`}
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <span className="pill-icon">{item.icon}</span>
              <div>
                <strong>{item.label}</strong>
                <p>{config.description}</p>
              </div>
              <span className="pill-status">{config.label}</span>
            </motion.div>
          );
        })}
      </motion.div>

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
          <div className="stat-value">
            <AnimatedNumber
              value={displayStats.total}
              loading={statsLoading}
              placeholderRange={[620, 2200]}
            />
          </div>
          <div className="stat-label">Total Vessels</div>
        </motion.div>

        <motion.div
          className="stat-card emissions"
          whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(81, 207, 102, 0.3)' }}
        >
          <Wind className="stat-icon" size={32} />
          <div className="stat-value">
            <AnimatedNumber
              value={displayStats.withEmissions}
              loading={statsLoading}
              placeholderRange={[320, 1600]}
            />
          </div>
          <div className="stat-label">With Emissions Data</div>
        </motion.div>

        <motion.div
          className="stat-card co2"
          whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(255, 107, 107, 0.3)' }}
        >
          <TrendingUp className="stat-icon" size={32} />
          <div className="stat-value">
            <AnimatedNumber
              value={displayStats.totalCo2}
              decimals={1}
              suffix="M"
              loading={statsLoading}
              placeholderRange={[4, 14]}
            />
          </div>
          <div className="stat-label">Total CO₂ (tonnes)</div>
        </motion.div>

        <motion.div
          className="stat-card"
          whileHover={{ y: -5, boxShadow: '0 8px 30px rgba(0, 180, 216, 0.3)' }}
        >
          <BarChart3 className="stat-icon" size={32} />
          <div className="stat-value">
            <AnimatedNumber
              value={filteredVessels.length}
              loading={loading}
              placeholderRange={[120, 480]}
            />
          </div>
          <div className="stat-label">Filtered Results</div>
        </motion.div>
      </motion.div>

      <motion.div
        className="insights-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.6 }}
      >
        <div className="insight-card">
          <div className="insight-icon">
            <Activity size={22} />
          </div>
          <div>
            <p className="insight-label">Emission Coverage</p>
            <h3>
              <AnimatedNumber
                value={matchPercentage}
                decimals={1}
                suffix="%"
                loading={statsLoading}
                placeholderRange={[48, 72]}
              />
            </h3>
            <span className="insight-subtext">of tracked vessels include CO₂ insights</span>
          </div>
        </div>
        <div className="insight-card">
          <div className="insight-icon">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="insight-label">Average CO₂ per Vessel</p>
            <h3>
              <AnimatedNumber
                value={displayStats.avgCo2}
                suffix=" t"
                loading={statsLoading}
                placeholderRange={[12, 38]}
              />
            </h3>
            <span className="insight-subtext">tonnes emitted annually by each recorded vessel</span>
          </div>
        </div>
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
        className={`table-container ${tableMode}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        <div className="table-toolbar">
          <div className="toolbar-title">
            <div className="toolbar-icon">
              <Sparkles size={16} />
            </div>
            <span>Fleet Matrix</span>
          </div>
          <div className="toolbar-modes">
            {[{ key: 'compact', label: 'Compact Grid' }, { key: 'immersive', label: 'Immersive Flow' }].map(mode => (
              <button
                key={mode.key}
                type="button"
                className={`toolbar-pill ${tableMode === mode.key ? 'active' : ''}`}
                onClick={() => setTableMode(mode.key)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="toolbar-hint">Tap a row to open the vessel hologram</p>
        </div>

        <div className="pulse-legend">
          <div className="legend-wave" aria-hidden="true">
            <span></span>
          </div>
          <div>
            <strong>CO₂ Pulse</strong>
            <p>
              Relative emission intensity per nautical mile compared to a 1,500&nbsp;kg/nm baseline.
              Watch it swell as vessels grow more carbon hungry.
            </p>
          </div>
        </div>

        {loading ? (
          <div className={`table-scroll ${tableMode} loading`}>
            <table className="vessels-table">
              {renderTableHead()}
              <tbody>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <tr className="placeholder-row" key={`placeholder-${idx}`}>
                    {tableColumns.map(column => {
                      const placeholderClass =
                        column.key === 'name'
                          ? 'wide'
                          : column.key === 'signatory_company'
                          ? 'medium'
                          : column.key === 'pulse'
                          ? 'pulse'
                          : '';
                      return (
                        <td key={`${column.key}-${idx}`}>
                          <span className={`placeholder-blob ${placeholderClass}`}></span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-loading-overlay">
              <motion.div
                className="loading-spinner"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              >
                <Anchor size={32} />
              </motion.div>
              <span>Syncing with fleet services…</span>
            </div>
          </div>
        ) : filteredVessels.length === 0 ? (
          <div className="empty-state">
            <Ship size={64} />
            <h3>No vessels found</h3>
            <p>Try adjusting your filters or search terms</p>
          </div>
        ) : (
          <div className={`table-scroll ${tableMode}`}>
            <table className="vessels-table">
              {renderTableHead()}
              <tbody>
                <AnimatePresence>
                  {filteredVessels.map((vessel, idx) => {
                    const typeInfo = getShipTypeBadge(vessel.ship_type);
                    const scoreInfo = getScoreBadge(vessel.econowind_fit_score);
                    const hasEmissions = vessel.total_co2_emissions != null;
                    const intensityRatio = vessel.avg_co2_per_distance
                      ? Math.min(2.4, vessel.avg_co2_per_distance / 1200)
                      : null;
                    const pulseIntensity = intensityRatio != null
                      ? Math.max(8, Math.min(100, Math.round(Math.pow(intensityRatio, 0.65) * 62)))
                      : hasEmissions
                      ? 32
                      : null;
                    const pulseTone = pulseIntensity != null
                      ? pulseIntensity >= 75
                        ? '#ff6b6b'
                        : pulseIntensity >= 48
                        ? '#ffd43b'
                        : '#51cf66'
                      : '#00b4d8';

                    return (
                      <motion.tr
                        key={vessel.mmsi}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: idx * 0.02 }}
                        className={hasEmissions ? 'has-emissions' : ''}
                        onClick={() => setSelectedVessel(vessel)}
                        whileHover={{ backgroundColor: 'rgba(0, 119, 182, 0.08)' }}
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
                        <td>
                          {vessel.length ? (
                            <AnimatedNumber value={vessel.length} />
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td>{vessel.flag_state || 'Unknown'}</td>
                        <td>{vessel.signatory_company || vessel.mrv_company || 'Unknown'}</td>
                        <td className="co2-value">
                          {vessel.total_co2_emissions ? (
                            <AnimatedNumber value={vessel.total_co2_emissions} suffix=" t" />
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td className={vessel.avg_co2_per_distance < 1000 ? 'efficiency-good' : 'efficiency-bad'}>
                          {vessel.avg_co2_per_distance ? (
                            <AnimatedNumber
                              value={Number(vessel.avg_co2_per_distance.toFixed(1))}
                              decimals={1}
                              suffix=" kg/nm"
                            />
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td>
                          <span className={`score-badge ${scoreInfo.class}`}>
                            {scoreInfo.text}
                          </span>
                        </td>
                        <td className="pulse-cell">
                          {pulseIntensity != null ? (
                            <div
                              className="pulse-bar"
                              title="Normalized CO₂ pulse against an efficient voyage baseline"
                            >
                              <span
                                style={{
                                  width: `${pulseIntensity}%`,
                                  background: `linear-gradient(90deg, ${pulseTone}, rgba(0, 180, 216, 0.9))`
                                }}
                                data-intensity={pulseIntensity}
                              ></span>
                              <small>{pulseIntensity}%</small>
                            </div>
                          ) : (
                            <span className="pulse-empty">--</span>
                          )}
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
                    <a
                      href={`/ships/api/emissions/vessel/${selectedVessel.imo}`}
                      className="action-btn secondary"
                      target="_blank"
                      rel="noreferrer"
                    >
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
