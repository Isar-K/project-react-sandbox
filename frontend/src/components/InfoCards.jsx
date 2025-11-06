import { motion } from 'framer-motion';
import { Ship, Wind, BarChart3 } from 'lucide-react';
import '../styles/InfoCards.css';

const cardData = [
  {
    icon: Ship,
    title: 'Real-Time Tracking',
    description: 'Monitor vessel positions and routes with live AIS data feeds, updated every few seconds for accurate maritime intelligence.'
  },
  {
    icon: Wind,
    title: 'Wind Propulsion Analysis',
    description: 'Evaluate vessels for wind-assisted propulsion compatibility. Identify optimal candidates for sail retrofitting and emissions reduction.'
  },
  {
    icon: BarChart3,
    title: 'Carbon Insights',
    description: 'Track emissions data, calculate potential savings, and generate comprehensive reports on environmental impact and efficiency gains.'
  }
];

export default function InfoCards() {
  return (
    <section className="info-cards-section">
      <div className="info-cards-container">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="info-cards-title"
        >
          Comprehensive Vessel Intelligence
        </motion.h2>

        <div className="cards-grid">
          {cardData.map((card, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              whileHover={{ y: -8, transition: { duration: 0.2 } }}
              className="info-card"
            >
              <div className="card-icon">
                <card.icon size={32} strokeWidth={1.5} />
              </div>
              <h3 className="card-title">{card.title}</h3>
              <p className="card-description">{card.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}