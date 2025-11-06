import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import Vessels from './pages/Vessels'   // ✅ new
import { useState } from 'react'

export default function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <div>
      <nav style={{ display: 'flex', gap: '1rem', padding: '1rem', background: '#eee' }}>
        <button onClick={() => setPage('dashboard')}>Dashboard</button>
        <button onClick={() => setPage('companies')}>Companies</button>
        <button onClick={() => setPage('vessels')}>Vessels</button> {/* ✅ new */}
      </nav>

      {page === 'dashboard' && <Dashboard />}
      {page === 'companies' && <Companies />}
      {page === 'vessels' && <Vessels />}
    </div>
  )
}
