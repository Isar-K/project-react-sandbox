import { useEffect, useState } from 'react'

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('https://gerritsxd.com/ships/api/companies')

      .then(res => res.json())
      .then(data => {
        setCompanies(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching companies:', err)
        setLoading(false)
      })
  }, [])

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading company data...</p>

  if (!companies.length) return <p style={{ color: 'red', textAlign: 'center' }}>No company data available.</p>

  return (
    <div style={{ padding: '2rem' }}>
      <h2>🏢 Company Overview</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Company</th>
            <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}># Vessels</th>
          </tr>
        </thead>
        <tbody>
          {companies.slice(0, 20).map((c, i) => (
            <tr key={i}>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>{c.company}</td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc', textAlign: 'center' }}>{c.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
