import { useEffect, useMemo, useState } from 'react'
import '../styles/Map.css'

const FEATURED_ROUTES = [
  {
    id: 'atlantic-corridor',
    label: 'North Atlantic Corridor',
    from: { name: 'Rotterdam', lat: 51.94, lon: 4.49 },
    to: { name: 'New York', lat: 40.71, lon: -74.01 },
    eta: '5d 12h',
    carbonDelta: '-12%'
  },
  {
    id: 'baltic-green',
    label: 'Baltic Green Lane',
    from: { name: 'Gdańsk', lat: 54.35, lon: 18.64 },
    to: { name: 'Oslo', lat: 59.91, lon: 10.75 },
    eta: '1d 7h',
    carbonDelta: '-8%'
  },
  {
    id: 'pacific-horizon',
    label: 'Pacific Horizon',
    from: { name: 'Yokohama', lat: 35.45, lon: 139.64 },
    to: { name: 'Los Angeles', lat: 33.74, lon: -118.27 },
    eta: '9d 4h',
    carbonDelta: '-15%'
  },
  {
    id: 'equatorial',
    label: 'Equatorial Stream',
    from: { name: 'Singapore', lat: 1.29, lon: 103.85 },
    to: { name: 'Dar es Salaam', lat: -6.80, lon: 39.28 },
    eta: '6d 3h',
    carbonDelta: '-6%'
  }
]

const KEY_PORTS = [
  { id: 'rotterdam', name: 'Rotterdam', lat: 51.94, lon: 4.49 },
  { id: 'new-york', name: 'New York', lat: 40.71, lon: -74.01 },
  { id: 'singapore', name: 'Singapore', lat: 1.29, lon: 103.85 },
  { id: 'cape-town', name: 'Cape Town', lat: -33.92, lon: 18.42 },
  { id: 'shanghai', name: 'Shanghai', lat: 31.23, lon: 121.47 }
]

const FALLBACK_VESSELS = [
  { name: 'Aurora Wind', lat: 48.2, lon: -3.2, status: 'Eco-routing', speed: 14.2 },
  { name: 'Blue Horizon', lat: 36.12, lon: -5.35, status: 'Port approach', speed: 9.3 },
  { name: 'Celestial Tide', lat: 19.67, lon: 72.95, status: 'On schedule', speed: 15.1 },
  { name: 'Emerald Crest', lat: 1.9, lon: 103.74, status: 'Holding pattern', speed: 4.8 },
  { name: 'Northern Pulse', lat: 54.7, lon: 9.42, status: 'Wind assist', speed: 12.4 },
  { name: 'Pacific Arc', lat: 34.0, lon: 147.28, status: 'Fuel-optimized', speed: 16.7 },
  { name: 'Sapphire Line', lat: -22.95, lon: -43.17, status: 'Berthing prep', speed: 7.1 },
  { name: 'Solstice Runner', lat: -12.05, lon: 130.85, status: 'Trade winds', speed: 13.6 }
]

const projectToPercent = (lat, lon) => ({
  x: ((lon + 180) / 360) * 100,
  y: (1 - (lat + 90) / 180) * 100
})

const buildFallbackMarkers = () =>
  FALLBACK_VESSELS.map((v, index) => ({
    id: `${v.name}-${index}`,
    ...v,
    ...projectToPercent(v.lat, v.lon)
  }))

const pseudoPositionFromMmsi = (mmsi, index = 0) => {
  const numeric = String(mmsi ?? '')
    .replace(/\D/g, '')
  const base = parseInt(numeric.slice(-6) || '0', 10) + index * 97
  const lat = ((base % 1800) / 10) - 90
  const lonSeed = Math.floor(base / 1800) + index * 17
  const lon = ((lonSeed % 3600) / 10) - 180
  const { x, y } = projectToPercent(lat, lon)

  return { lat, lon, x, y }
}

const formatSpeed = (value) =>
  value ? `${value.toFixed(1)} kn` : '—'

export default function Map() {
  const [vessels, setVessels] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let isMounted = true

    fetch('http://localhost:5000/ships/api/database/vessels', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load vessel feed')
        return res.json()
      })
      .then((data) => {
        if (!isMounted) return
        if (!Array.isArray(data)) throw new Error('Unexpected response')

        const enriched = data.slice(0, 60).map((v, index) => ({
          id: v.mmsi ?? index,
          name: v.name || `MMSI ${v.mmsi}`,
          status: v.destination ? `→ ${v.destination}` : 'En route',
          speed: v.speed_over_ground || v.sog || null,
          ...pseudoPositionFromMmsi(v.mmsi, index)
        }))

        setVessels(enriched)
        setIsLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        console.warn('Using illustrative vessel positions:', err)
        setError(err.message)
        setIsLoading(false)
      })

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [])

  const projectedPorts = useMemo(
    () =>
      KEY_PORTS.map((port) => ({
        ...port,
        ...projectToPercent(port.lat, port.lon)
      })),
    []
  )

  const fallbackMarkers = useMemo(() => buildFallbackMarkers(), [])

  const vesselMarkers = useMemo(() => {
    if (!isLoading && vessels.length) return vessels
    return fallbackMarkers
  }, [fallbackMarkers, isLoading, vessels])

  const statusLabel = error
    ? 'Illustrative fleet rendering — live feed unavailable'
    : isLoading
      ? 'Syncing live vessel telemetry…'
      : `Tracking ${vesselMarkers.length} vessels`

  const projectedRoutes = useMemo(
    () =>
      FEATURED_ROUTES.map((route) => {
        const start = projectToPercent(route.from.lat, route.from.lon)
        const end = projectToPercent(route.to.lat, route.to.lon)
        const curveHeight = Math.min(Math.abs(start.x - end.x) * 0.3 + 5, 35)
        const controlX = (start.x + end.x) / 2
        const controlY = Math.min(start.y, end.y) - curveHeight

        return {
          ...route,
          path: `M ${start.x},${start.y} Q ${controlX},${controlY} ${end.x},${end.y}`,
          start,
          end
        }
      }),
    []
  )

  const highlightedVessels = vesselMarkers.slice(0, 5)

  return (
    <div className="map-page">
      <section className="map-hero">
        <p className="map-eyebrow">Operational intelligence</p>
        <h1>Global voyage map</h1>
        <p className="map-subtitle">
          A real-time layer blending AIS telemetry, decarbonisation analytics, and wind-assist
          performance to keep every corridor efficient.
        </p>
        <div className="map-hero__meta">
          <div className="map-hero__stat">
            <span>Active corridors</span>
            <strong>{FEATURED_ROUTES.length}</strong>
          </div>
          <div className="map-hero__stat">
            <span>Fleet coverage</span>
            <strong>{vesselMarkers.length} vessels</strong>
          </div>
          <div className="map-hero__stat">
            <span>Carbon intensity</span>
            <strong>↓ 11.8%</strong>
          </div>
        </div>
      </section>

      <section className="map-grid">
        <div className="map-visual">
          <div className="map-visual__chrome">
            <div className="map-visual__header">
              <div>
                <h2>Fleet coverage</h2>
                <span>{statusLabel}</span>
              </div>
              <div className="map-visual__timestamp">
                <span>Last sync</span>
                <strong>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
              </div>
            </div>

            <div className="map-canvas">
              <div className="map-canvas__ocean" />
              <div className="map-canvas__grid" />

              <svg className="map-canvas__routes" viewBox="0 0 100 100" preserveAspectRatio="none">
                {projectedRoutes.map((route) => (
                  <path key={route.id} d={route.path} />
                ))}
              </svg>

              {projectedRoutes.map((route) => (
                <div key={`${route.id}-start`} className="map-canvas__route-node" style={{ left: `${route.start.x}%`, top: `${route.start.y}%` }}>
                  <span>{route.from.name}</span>
                </div>
              ))}

              {projectedRoutes.map((route) => (
                <div key={`${route.id}-end`} className="map-canvas__route-node" style={{ left: `${route.end.x}%`, top: `${route.end.y}%` }}>
                  <span>{route.to.name}</span>
                </div>
              ))}

              {projectedPorts.map((port) => (
                <div
                  key={port.id}
                  className="map-canvas__port"
                  style={{ left: `${port.x}%`, top: `${port.y}%` }}
                >
                  <span>{port.name}</span>
                </div>
              ))}

              {vesselMarkers.map((vessel, index) => (
                <button
                  key={vessel.id || index}
                  className="map-canvas__marker"
                  style={{ left: `${vessel.x}%`, top: `${vessel.y}%` }}
                  type="button"
                  title={`${vessel.name} — ${vessel.status}`}
                >
                  <span className="map-canvas__marker-label">
                    <strong>{vessel.name}</strong>
                    <span>{vessel.status}</span>
                    <span>{formatSpeed(vessel.speed)}</span>
                  </span>
                </button>
              ))}
            </div>

            <footer className="map-visual__footer">
              <div className="map-legend">
                <div className="map-legend__item">
                  <span className="map-legend__dot map-legend__dot--vessel" />
                  Vessel position
                </div>
                <div className="map-legend__item">
                  <span className="map-legend__dot map-legend__dot--port" />
                  Strategic port
                </div>
                <div className="map-legend__item">
                  <span className="map-legend__line" />
                  Efficiency corridor
                </div>
              </div>
              <span className="map-visual__hint">Positions are illustrative when live data is offline.</span>
            </footer>
          </div>
        </div>

        <aside className="map-side">
          <div className="map-card map-card--highlight">
            <h3>Signal intelligence</h3>
            <ul className="map-insights">
              <li>
                North Atlantic fleet saved <strong>18.4%</strong> fuel this week through dynamic wind routing.
              </li>
              <li>
                Shore teams highlighted <strong>9</strong> voyages ready for slow steaming adoption.
              </li>
              <li>
                Satellite gap bridging reduced blackouts across key trade lanes to <strong>4 minutes</strong> average.
              </li>
            </ul>
          </div>

          <div className="map-card map-card--metrics">
            <div className="map-metric">
              <span>Weather-adjusted ETA</span>
              <strong>+12m</strong>
              <small>vs last update</small>
            </div>
            <div className="map-metric">
              <span>Wind-assist uptime</span>
              <strong>92%</strong>
              <small>fleet average</small>
            </div>
            <div className="map-metric">
              <span>Low-carbon fuel blend</span>
              <strong>38%</strong>
              <small>premium deployments</small>
            </div>
          </div>

          <div className="map-card">
            <h3>Featured corridors</h3>
            <div className="map-routes">
              {projectedRoutes.map((route) => (
                <div key={route.id} className="map-route">
                  <div>
                    <strong>{route.label}</strong>
                    <span>{route.from.name} → {route.to.name}</span>
                  </div>
                  <div className="map-route__meta">
                    <span>{route.eta}</span>
                    <span className="map-route__delta">{route.carbonDelta}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="map-card map-card--list">
            <h3>Spotlight vessels</h3>
            <ul>
              {highlightedVessels.map((vessel, index) => (
                <li key={vessel.id || index}>
                  <div>
                    <strong>{vessel.name}</strong>
                    <span>{vessel.status}</span>
                  </div>
                  <span>{formatSpeed(vessel.speed)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </div>
  )
}
