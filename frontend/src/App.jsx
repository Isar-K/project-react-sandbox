import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import InfoCards from './components/InfoCards' 
import VesselDatabase from './components/VesselDatabase'  
import Map from './pages/Map'

function DataPage() {
  return <div style={{ padding: '2rem', color: '#0b2545' }}>Data</div>
}
function AboutPage() {
  return <div style={{ padding: '2rem', color: '#0b2545' }}>About</div>
}

function Home() {
  return (
    <>
      <Hero />
      <InfoCards />  {/* Add this */}
    </>
  )
}

function DatabasePage() {  // Add this
  return <VesselDatabase />
}

export default function App() {
  return (
    <div className="app-container">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<Map />} />
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </div>
  )
}



