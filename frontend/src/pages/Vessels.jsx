import { useEffect, useState } from 'react'

export default function Vessels() {
  const [vessels, setVessels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
  fetch('http://localhost:5000/ships/api/database/vessels')
    .then(res => res.json())
    .then(data => {
      console.log('Fetched vessels:', data)
      setVessels(data)
      setLoading(false)
    })
    .catch(err => {
      console.error('Error fetching vessels:', err)
      setLoading(false)
    })
  }, [])

  if (loading)
    return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading vessel data...</p>

  if (!vessels.length)
    return <p style={{ color: 'red', textAlign: 'center' }}>No vessels available.</p>

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h2>🚢 Live Vessel Data</h2>
      <p>Showing {vessels.length} vessels (live from backend)</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>MMSI</th>
            <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
            <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Type</th>
            <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Flag</th>
            <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Length</th>
            <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Company</th>
          </tr>
        </thead>
        <tbody>
          {vessels.slice(0, 50).map((v) => (
            <tr key={v.mmsi}>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{v.mmsi}</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{v.name || '—'}</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{v.ship_type || '—'}</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{v.flag_state || '—'}</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{v.length || '—'}</td>
              <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{v.signatory_company || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
