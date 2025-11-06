import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import InfoCards from './components/InfoCards'  // Add this
import Map from './pages/Map'
import Data from './pages/Data'
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
        <Route path="/map" element={<Map />} />
        <Route path="/data" element={<Data />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </div>
  )
}