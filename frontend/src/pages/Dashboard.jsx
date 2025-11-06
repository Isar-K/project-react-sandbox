import { useEffect, useState } from 'react'

function App() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/api/stats')
      .then((res) => res.json())
      .then((data) => {
        setStats(data)
        setLoading(false)  // ✅ stop loading when data arrives
      })
      .catch((err) => {
        console.error('Error fetching stats:', err)
        setLoading(false)  // ✅ stop loading even if error
      })
  }, [])

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading vessel stats...</p>
  if (!stats) return <p style={{ color: 'red', textAlign: 'center' }}>Failed to load data.</p>

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 600, margin: 'auto' }}>
      <h1>🛳️ Vessel Tracker Dashboard</h1>
      <ul style={{ lineHeight: 1.8 }}>
        <li><strong>Total vessels:</strong> {stats.total_vessels}</li>
        <li><strong>Tracking active:</strong> {stats.tracking_active ? 'Yes' : 'No'}</li>
        <li><strong>Vessels with position:</strong> {stats.vessels_with_position}</li>
      </ul>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          background: '#007bff',
          border: 'none',
          borderRadius: '5px',
          color: '#fff',
          cursor: 'pointer'
        }}
      >
        Refresh Data
      </button>
    </div>
  )
}

export default App
