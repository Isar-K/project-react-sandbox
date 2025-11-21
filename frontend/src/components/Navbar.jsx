// src/components/Navbar.jsx
import { Link, NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import '../styles/Navbar.css'

export default function Navbar() {
  const links = [
    { to: '/', label: 'Home' },
    { to: '/map', label: 'Map' },
    { to: '/database', label: 'Data' },
    { to: '/intelligence', label: 'Intelligence' },
    { to: '/about', label: 'About' },
  ]

  return (
    <motion.header
      className="nv-wrap"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="nv">
        <Link to="/" className="nv-logo">
          {/* swap for your logo if you have one */}
          <span>⛵ AIS</span>
        </Link>

        <nav className="nv-links">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nv-link ${isActive ? 'active' : ''}`}
            >
              <span className="nv-label">{label}</span>
              {/* animated underline */}
              <motion.span
                className="nv-underline"
                layoutId="nv-underline" // shared underline animation
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </NavLink>
          ))}
        </nav>
      </div>
    </motion.header>
  )
}
