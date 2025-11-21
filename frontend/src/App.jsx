import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import InfoCards from './components/InfoCards' 
import VesselDatabase from './components/VesselDatabase'  
import VesselMap from './pages/Map'  // Add this import
import Intelligence from './pages/Intelligence'

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
      <InfoCards />
    </>
  )
}

function DatabasePage() {
  return <VesselDatabase />
}

export default function App() {
  return (
    <div className="app-container">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<VesselMap />} />  {/* Updated this line */}
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/intelligence" element={<Intelligence />} />
      </Routes>
    </div>
  )
}