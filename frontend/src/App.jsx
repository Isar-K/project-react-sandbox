import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import InfoCards from './components/InfoCards'  // Add this

// TEMP pages so routes don't break
function MapPage() { 
  return <div style={{ padding: '2rem', color: '#0b2545' }}>Map</div> 
}
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

export default function App() {
  return (
    <div className="app-container">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </div>
  )
}