// Hero.jsx - Updated
import { motion } from 'framer-motion';
import WaterCanvas from './WaterCanvas';
import '../styles/Hero.css';

export default function Hero() {
  return (
    <section className="hero">
      <WaterCanvas />
      
      <div className="hero-content">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          Tracking Carbon at Sea 
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 1 }}
        >
          Real-time vessel emissions and wind propulsion insights, powered by live AIS data.
        </motion.p>
      </div>

      <div className="hero-fade" />
    </section>
  );
}