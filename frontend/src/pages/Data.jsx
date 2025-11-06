import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import '../styles/Data.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')

const fallbackRows = [
  {
    mmsi: '256781000',
    imo: '9733307',
    name: 'ORION ESPERANZA',
    ship_type: 'General Cargo',
    length: 179,
    beam: 28,
    flag_state: 'MT',
    signatory_company: 'Orion Maritime',
    total_co2_emissions: 42150,
    total_fuel_consumption: 13240,
    total_distance_travelled: 74325,
    avg_co2_per_distance: 0.57,
    econowind_fit_score: 78,
    destination: 'Rotterdam',
    draught: 9.1,
    last_updated: '2024-02-05T14:12:00Z',
  },
  {
    mmsi: '219018271',
    imo: '9693007',
    name: 'MAERSK GREENLAND',
    ship_type: 'Container Ship',
    length: 200,
    beam: 32,
    flag_state: 'DK',
    signatory_company: 'Maersk',
    total_co2_emissions: 51280,
    total_fuel_consumption: 18410,
    total_distance_travelled: 84310,
    avg_co2_per_distance: 0.61,
    econowind_fit_score: 64,
    destination: 'Hamburg',
    draught: 10.6,
    last_updated: '2024-01-28T08:40:00Z',
  },
  {
    mmsi: '241865000',
    imo: '9725243',
    name: 'AEGEAN HARMONY',
    ship_type: 'Bulk Carrier',
    length: 229,
    beam: 36,
    flag_state: 'GR',
    signatory_company: 'Aegean Bulk',
    total_co2_emissions: 47890,
    total_fuel_consumption: 16540,
    total_distance_travelled: 76810,
    avg_co2_per_distance: 0.62,
    econowind_fit_score: 71,
    destination: 'Antwerp',
    draught: 11.2,
    last_updated: '2024-02-11T19:26:00Z',
  },
  {
    mmsi: '257003000',
    imo: '9770612',
    name: 'NORDIC BREEZE',
    ship_type: 'Oil/Chemical Tanker',
    length: 182,
    beam: 30,
    flag_state: 'NO',
    signatory_company: 'Nordic Tankers',
    total_co2_emissions: 39540,
    total_fuel_consumption: 14210,
    total_distance_travelled: 69325,
    avg_co2_per_distance: 0.57,
    econowind_fit_score: 82,
    destination: 'Oslo',
    draught: 8.7,
    last_updated: '2024-02-09T05:32:00Z',
  },
  {
    mmsi: '538004123',
    imo: '9744004',
    name: 'PACIFIC VOYAGER',
    ship_type: 'LNG Tanker',
    length: 295,
    beam: 48,
    flag_state: 'MH',
    signatory_company: 'Pacific LNG Carriers',
    total_co2_emissions: 68950,
    total_fuel_consumption: 24100,
    total_distance_travelled: 102410,
    avg_co2_per_distance: 0.67,
    econowind_fit_score: 58,
    destination: 'Singapore',
    draught: 12.4,
    last_updated: '2024-02-01T22:10:00Z',
  },
]

const columns = [
  { key: 'mmsi', label: 'MMSI' },
  { key: 'imo', label: 'IMO' },
  { key: 'name', label: 'Name' },
  { key: 'ship_type', label: 'Type' },
  { key: 'length', label: 'Length (m)', isNumeric: true },
  { key: 'beam', label: 'Beam (m)', isNumeric: true },
  { key: 'flag_state', label: 'Flag' },
  {
    key: 'signatory_company',
    label: 'Company',
    accessor: (row) => row.signatory_company || row.mrv_company,
  },
  { key: 'total_co2_emissions', label: 'CO₂ Emissions', isNumeric: true },
  { key: 'total_fuel_consumption', label: 'Fuel (t)', isNumeric: true },
  { key: 'avg_co2_per_distance', label: 'CO₂ / Distance', isNumeric: true },
  { key: 'econowind_fit_score', label: 'Econowind Fit', isNumeric: true },
  { key: 'destination', label: 'Destination' },
  { key: 'draught', label: 'Draught (m)', isNumeric: true },
  {
    key: 'actions',
    label: 'Actions',
    sortable: false,
    render: (row) => (
      <div className="actions-cell">
        {row.mmsi && (
          <a
            className="pill-link"
            href={`${API_BASE}/ships/?mmsi=${row.mmsi}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Map
          </a>
        )}
        {row.imo && (
          <a
            className="pill-link"
            href={`${API_BASE}/ships/api/emissions/vessel/${row.imo}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Emissions
          </a>
        )}
      </div>
    ),
  },
  {
    key: 'last_updated',
    label: 'Last Updated',
    accessor: (row) => row.last_updated || row.ais_last_updated || row.reporting_period,
  },
]

const numberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const integerFormat = new Intl.NumberFormat('en-US')

function formatValue(key, value) {
  if (value == null || value === '') return '—'

  if (['length', 'beam', 'draught'].includes(key)) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? `${numberFormat.format(numeric)} m` : value
  }

  if (key === 'total_co2_emissions') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? `${integerFormat.format(numeric)} t` : value
  }

  if (key === 'total_fuel_consumption') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? `${integerFormat.format(numeric)} t` : value
  }

  if (key === 'avg_co2_per_distance') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? `${numberFormat.format(numeric)} kg/nm` : value
  }

  if (key === 'last_updated') {
    if (typeof value === 'string' && /^\d{4}$/.test(value.trim())) {
      return value
    }
    try {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      }
    } catch (error) {
      return value
    }
    return value
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value) && Math.abs(value) >= 1000) {
      return integerFormat.format(value)
    }
    return numberFormat.format(value)
  }

  return value
}

export default function Data() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [matchStats, setMatchStats] = useState(null)
  const [emissionStats, setEmissionStats] = useState(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [flagFilter, setFlagFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [emissionFilter, setEmissionFilter] = useState('all')
  const [windReadyOnly, setWindReadyOnly] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: 'total_co2_emissions', direction: 'desc' })
  const [page, setPage] = useState(1)

  const pageSize = 20

  useEffect(() => {
    let ignore = false

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [vesselsRes, statsRes, matchRes, emissionsRes] = await Promise.all([
          fetch(`${API_BASE}/ships/api/vessels/combined?limit=1000`),
          fetch(`${API_BASE}/ships/api/stats`),
          fetch(`${API_BASE}/ships/api/emissions/match-stats`),
          fetch(`${API_BASE}/ships/api/emissions/stats`),
        ])

        if (!vesselsRes.ok) throw new Error('Unable to load vessel data')
        const vesselData = await vesselsRes.json()

        const statsPayload = statsRes.ok ? await statsRes.json() : null
        const matchPayload = matchRes.ok ? await matchRes.json() : null
        const emissionPayload = emissionsRes.ok ? await emissionsRes.json() : null

        if (!ignore) {
          setRows(Array.isArray(vesselData) && vesselData.length ? vesselData : fallbackRows)
          setStats(statsPayload)
          setMatchStats(matchPayload)
          setEmissionStats(emissionPayload)
        }
      } catch (err) {
        console.error('Failed to load dataset', err)
        if (!ignore) {
          setError('Live vessel data is temporarily unavailable. Showing a curated snapshot instead.')
          setRows(fallbackRows)
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [searchTerm, flagFilter, typeFilter, emissionFilter, windReadyOnly])

  const options = useMemo(() => {
    const uniqueFlags = new Set()
    const uniqueTypes = new Set()

    rows.forEach((row) => {
      if (row.flag_state) uniqueFlags.add(row.flag_state)
      if (row.ship_type) uniqueTypes.add(row.ship_type)
    })

    return {
      flags: Array.from(uniqueFlags).sort(),
      types: Array.from(uniqueTypes).sort(),
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    let working = rows.filter((row) => {
      if (!term) return true

      const haystack = [row.name, row.mmsi, row.imo, row.signatory_company, row.mrv_company, row.flag_state]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .join(' ')

      return haystack.includes(term)
    })

    if (flagFilter !== 'all') {
      working = working.filter((row) => row.flag_state === flagFilter)
    }

    if (typeFilter !== 'all') {
      working = working.filter((row) => row.ship_type === typeFilter)
    }

    if (emissionFilter === 'high') {
      working = working.filter((row) => (row.total_co2_emissions || 0) >= 50000)
    } else if (emissionFilter === 'low') {
      working = working.filter((row) => (row.total_co2_emissions || 0) < 20000)
    }

    if (windReadyOnly) {
      working = working.filter((row) => (row.econowind_fit_score || 0) >= 70)
    }

    const { key, direction } = sortConfig
    if (key) {
      working = [...working].sort((a, b) => {
        const aVal = a[key]
        const bVal = b[key]

        if (aVal == null && bVal == null) return 0
        if (aVal == null) return direction === 'asc' ? -1 : 1
        if (bVal == null) return direction === 'asc' ? 1 : -1

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return direction === 'asc' ? aVal - bVal : bVal - aVal
        }

        return direction === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal))
      })
    }

    return working
  }, [rows, searchTerm, flagFilter, typeFilter, emissionFilter, windReadyOnly, sortConfig])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const highlight = useMemo(() => {
    if (!filteredRows.length) return null

    const highestCo2 = [...filteredRows].sort((a, b) => (b.total_co2_emissions || 0) - (a.total_co2_emissions || 0))[0]
    const bestWind = [...filteredRows].sort((a, b) => (b.econowind_fit_score || 0) - (a.econowind_fit_score || 0))[0]

    return { highestCo2, bestWind }
  }, [filteredRows])

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        const nextDirection = prev.direction === 'asc' ? 'desc' : prev.direction === 'desc' ? null : 'asc'
        return nextDirection ? { key, direction: nextDirection } : { key: null, direction: 'asc' }
      }
      return { key, direction: 'desc' }
    })
  }

  const renderStatValue = (value, fallback = '—') => {
    if (value == null) return fallback
    if (typeof value === 'number') return numberFormat.format(value)
    return value
  }

  return (
    <div className="data-page">
      <div className="data-hero">
        <div className="data-hero__left">
          <h1>Vessel Intelligence Hub</h1>
          <p>
            Explore our combined AIS and EU MRV dataset. Filter by flag, vessel type, emissions intensity, and
            wind-assist readiness to surface the fleets that matter most.
          </p>
          <div className="data-hero__badges">
            <span className="badge">Live data bridge</span>
            <span className="badge">Glass dashboard</span>
            <span className="badge">Interactive analytics</span>
          </div>
        </div>
        {highlight && (
          <motion.div
            className="data-spotlight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h2>Spotlight</h2>
            <div className="spotlight-card">
              <span className="spotlight-label">Top emitter</span>
              <strong>{highlight.highestCo2?.name ?? '—'}</strong>
              <p>{formatValue('total_co2_emissions', highlight.highestCo2?.total_co2_emissions)} tonnes CO₂</p>
            </div>
            <div className="spotlight-card">
              <span className="spotlight-label">Wind-ready leader</span>
              <strong>{highlight.bestWind?.name ?? '—'}</strong>
              <p>{formatValue('econowind_fit_score', highlight.bestWind?.econowind_fit_score)} fit score</p>
            </div>
          </motion.div>
        )}
      </div>

      <section className="data-stats">
        <StatCard
          title="Tracked vessels"
          primary={renderStatValue(stats?.total_vessels, rows.length)}
          secondary={`Active AIS identities: ${renderStatValue(stats?.unique_mmsi, rows.length)}`}
        />
        <StatCard
          title="MRV coverage"
          primary={renderStatValue(matchStats?.matched_vessels)}
          secondary={`Coverage rate: ${renderStatValue(matchStats?.match_rate_percent)}%`}
        />
        <StatCard
          title="Reported CO₂"
          primary={`${renderStatValue(emissionStats?.total_co2, '--')} t`}
          secondary={`Avg per vessel: ${renderStatValue(emissionStats?.average_co2_per_vessel, '--')} t`}
        />
        <StatCard
          title="Fuel intensity"
          primary={`${renderStatValue(emissionStats?.average_fuel_per_distance, '--')} t / nm`}
          secondary="Across reported voyages"
        />
      </section>

      <section className="data-controls">
        <div className="control search">
          <label htmlFor="vessel-search">Search</label>
          <input
            id="vessel-search"
            type="search"
            placeholder="Search name, MMSI, IMO, company or flag"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="control select">
          <label htmlFor="flag-filter">Flag</label>
          <select id="flag-filter" value={flagFilter} onChange={(event) => setFlagFilter(event.target.value)}>
            <option value="all">All flags</option>
            {options.flags.map((flag) => (
              <option key={flag} value={flag}>
                {flag}
              </option>
            ))}
          </select>
        </div>

        <div className="control select">
          <label htmlFor="type-filter">Vessel type</label>
          <select id="type-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            {options.types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="control select">
          <label htmlFor="emission-filter">Emissions</label>
          <select id="emission-filter" value={emissionFilter} onChange={(event) => setEmissionFilter(event.target.value)}>
            <option value="all">All bands</option>
            <option value="high">High (&ge; 50k t)</option>
            <option value="low">Low (&lt; 20k t)</option>
          </select>
        </div>

        <div className="control toggle">
          <label htmlFor="wind-ready">Wind ready &ge; 70</label>
          <button
            id="wind-ready"
            className={windReadyOnly ? 'toggle-button active' : 'toggle-button'}
            type="button"
            onClick={() => setWindReadyOnly((value) => !value)}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
      </section>

      <section className="data-table__wrap">
        <div className="table-meta">
          <p>
            Showing <strong>{paginatedRows.length}</strong> of <strong>{filteredRows.length}</strong> vessels
            {searchTerm ? ` for "${searchTerm}"` : ''}.
          </p>
          <div className="chips">
            <button type="button" className="chip" onClick={() => setSortConfig({ key: 'total_co2_emissions', direction: 'desc' })}>
              Peak CO₂
            </button>
            <button type="button" className="chip" onClick={() => setSortConfig({ key: 'avg_co2_per_distance', direction: 'asc' })}>
              Efficient first
            </button>
            <button type="button" className="chip" onClick={() => setWindReadyOnly(true)}>
              Wind-ready fleet
            </button>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((column) => {
                  const sortable = column.sortable !== false
                  const isActive = sortConfig.key === column.key
                  const direction = isActive ? sortConfig.direction : null

                  return (
                    <th
                      key={column.key}
                      onClick={sortable ? () => handleSort(column.key) : undefined}
                      className={`${column.isNumeric ? 'numeric' : ''} ${isActive ? `sorted-${direction}` : ''} ${
                        sortable ? 'sortable' : 'non-sortable'
                      }`}
                      scope="col"
                    >
                      <span>{column.label}</span>
                      {sortable && (
                        <span className="sort-indicator" aria-hidden>
                          {isActive ? (direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="skeleton-row">
                  <td colSpan={columns.length}>Loading fleet intelligence…</td>
                </tr>
              )}

              {!loading && !paginatedRows.length && (
                <tr className="empty-row">
                  <td colSpan={columns.length}>No vessels matched your filters. Try widening your search.</td>
                </tr>
              )}

              {paginatedRows.map((row) => (
                <tr key={row.mmsi || row.imo}>
                  {columns.map((column) => {
                    const rawValue = column.accessor ? column.accessor(row) : row[column.key]
                    const content = column.render ? column.render(row) : formatValue(column.key, rawValue)

                    return (
                      <td key={column.key} className={column.isNumeric ? 'numeric' : ''}>
                        {content}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="table-footer">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
            Prev
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </footer>

        {error && <p className="inline-error">{error}</p>}
      </section>
    </div>
  )
}

function StatCard({ title, primary, secondary }) {
  return (
    <motion.article
      className="stat-card"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      viewport={{ once: true }}
    >
      <h3>{title}</h3>
      <div className="stat-primary">{primary}</div>
      <p>{secondary}</p>
    </motion.article>
  )
}
