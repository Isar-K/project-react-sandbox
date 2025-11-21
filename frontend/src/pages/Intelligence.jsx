import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import "../styles/Intelligence.css";

export default function Intelligence() {
  // ----------------------------
  // Placeholder-safe state
  // ----------------------------
  const [stats, setStats] = useState({
    total_companies: 0,
    total_findings: 0,
    avg_findings_per_company: 0,
    categories: {},
    top_companies: []
  });

  const [datasets, setDatasets] = useState([]);
  const [scraperStatus, setScraperStatus] = useState({
    intelligence: {
      running: false,
      current_company: "-",
      companies_processed: 0,
      total_companies: 0,
      findings_count: 0,
      progress: 0
    },
    profiler: {
      running: false,
      current_company: "-",
      companies_processed: 0,
      total_companies: 0,
      profiles_count: 0,
      progress: 0
    }
  });

  const CATEGORY_NAMES = {
    grants_subsidies: "🇩🇪 Grants & Subsidies",
    legal_violations: "⚖️ Legal Violations",
    sustainability_news: "📰 Sustainability News",
    reputation: "🏆 Reputation & Rankings",
    financial_pressure: "💰 Financial Pressure"
  };

  // ----------------------------
  // Backend calls (with fallback placeholders)
  // ----------------------------

  async function loadStats() {
    try {
      const res = await fetch("/ships/api/intelligence/stats");
      if (!res.ok) throw new Error("Backend not ready");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.log("Stats endpoint not available, using placeholders");
      setStats(prev => ({
        ...prev,
        total_companies: 0,
        total_findings: 0,
        avg_findings_per_company: 0,
        categories: {},
        top_companies: []
      }));
    }
  }

  async function loadDatasets() {
    try {
      const res = await fetch("/ships/api/intelligence/datasets");
      if (!res.ok) throw new Error("Backend not ready");
      const data = await res.json();
      setDatasets(data.datasets || []);
    } catch (err) {
      console.log("Dataset endpoint offline");
      setDatasets([]);
    }
  }

  async function loadScraperStatus() {
    try {
      const res = await fetch("/ships/api/scrapers/status");
      if (!res.ok) throw new Error("Backend not ready");
      const data = await res.json();
      setScraperStatus(data);
    } catch (err) {
      console.log("Scraper status not available");
      // Keep placeholders
    }
  }

  async function loadPage() {
    await Promise.all([loadStats(), loadDatasets(), loadScraperStatus()]);
  }

  // ----------------------------
  // Auto-refresh timers
  // ----------------------------
  useEffect(() => {
    loadPage();
    const refreshStats = setInterval(loadPage, 30000);
    const refreshScraper = setInterval(loadScraperStatus, 5000);

    return () => {
      clearInterval(refreshStats);
      clearInterval(refreshScraper);
    };
  }, []);

  return (
    <div className="intel-page">
      {/* ---------- HEADER ---------- */}
      <header className="intel-header">
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          🕵️ Company Intelligence Dashboard
        </motion.h1>
        <p className="intel-subtitle">
          High-level intelligence insights based on scraped company data.
        </p>
      </header>

      <div className="intel-container">

        {/* ---------- STATS CARDS ---------- */}

        <div className="intel-stats-grid">
          {[
            {
              label: "Total Companies",
              value: stats.total_companies,
              sub: "With intelligence data"
            },
            {
              label: "Total Findings",
              value: stats.total_findings,
              sub: "Across all categories"
            },
            {
              label: "Avg per Company",
              value: stats.avg_findings_per_company,
              sub: "Intelligence findings"
            },
            {
              label: "Datasets",
              value: datasets.length,
              sub: "Available downloads"
            }
          ].map((card, i) => (
            <motion.div
              key={i}
              className="intel-stat-card"
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              whileHover={{
                y: -4,
                boxShadow: "0 20px 45px rgba(15,23,42,0.12)"
              }}
            >
              <h3>{card.label}</h3>
              <div className="intel-stat-value">{card.value}</div>
              <div className="intel-stat-label">{card.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* ---------- SCRAPER STATUS ---------- */}

        <motion.div
          className="intel-section"
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="intel-section-title">🚀 Live Scraper Status</div>

          <div className="intel-scraper-grid">

            {/* Intelligence scraper */}
            <motion.div
              className="scraper-box"
              whileHover={{ y: -4, boxShadow: "0 16px 40px rgba(15,23,42,0.12)" }}
              transition={{ duration: 0.2 }}
            >
              <div className="scraper-header">
                <h3>🕵️ Intelligence Scraper</h3>
                <span
                  className={
                    "scraper-status " +
                    (scraperStatus.intelligence.running ? "running" : "idle")
                  }
                >
                  ●
                </span>
              </div>

              <div className="scraper-body">
                <div className="scraper-info">
                  <span>Current Company:</span>
                  <span>{scraperStatus.intelligence.current_company || "-"}</span>
                </div>

                <div className="scraper-info">
                  <span>Progress:</span>
                  <span>
                    {scraperStatus.intelligence.companies_processed} /{" "}
                    {scraperStatus.intelligence.total_companies}
                  </span>
                </div>

                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${scraperStatus.intelligence.progress || 0}%`
                    }}
                  ></div>
                </div>

                <div className="scraper-info">
                  <span>Findings:</span>
                  <span>{scraperStatus.intelligence.findings_count || 0}</span>
                </div>
              </div>
            </motion.div>

            {/* Profiler scraper */}
            <motion.div
              className="scraper-box"
              whileHover={{ y: -4, boxShadow: "0 16px 40px rgba(15,23,42,0.12)" }}
              transition={{ duration: 0.2 }}
            >
              <div className="scraper-header">
                <h3>📊 Company Profiler</h3>
                <span
                  className={
                    "scraper-status " +
                    (scraperStatus.profiler.running ? "running" : "idle")
                  }
                >
                  ●
                </span>
              </div>

              <div className="scraper-body">
                <div className="scraper-info">
                  <span>Current Company:</span>
                  <span>{scraperStatus.profiler.current_company || "-"}</span>
                </div>

                <div className="scraper-info">
                  <span>Progress:</span>
                  <span>
                    {scraperStatus.profiler.companies_processed} /{" "}
                    {scraperStatus.profiler.total_companies}
                  </span>
                </div>

                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${scraperStatus.profiler.progress || 0}%`
                    }}
                  ></div>
                </div>

                <div className="scraper-info">
                  <span>Profiles:</span>
                  <span>{scraperStatus.profiler.profiles_count || 0}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* ---------- CATEGORIES ---------- */}

        <motion.div
          className="intel-section"
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="intel-section-title">📊 Intelligence by Category</div>

          {stats.total_findings === 0 ? (
            <div className="empty-state">📭 No intelligence data</div>
          ) : (
            Object.entries(stats.categories).map(([key, count]) => {
              const pct = stats.total_findings
                ? ((count / stats.total_findings) * 100).toFixed(1)
                : 0;

              return (
                <motion.div
                  className="category-bar"
                  key={key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="category-label">
                    {CATEGORY_NAMES[key] || key}
                  </div>

                  <div className="category-progress">
                    <div
                      className="category-fill"
                      style={{ width: `${pct}%` }}
                    >
                      <span className="category-count">{count}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>

        {/* ---------- TOP COMPANIES ---------- */}

        <motion.div
          className="intel-section"
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="intel-section-title">🏆 Top Companies</div>

          {stats.top_companies.length === 0 ? (
            <div className="empty-state">No companies available</div>
          ) : (
            stats.top_companies.map((company, i) => (
              <motion.div
                className="company-row"
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <div>
                  <span className="company-rank">{i + 1}.</span>
                  <span className="company-name">{company.name}</span>
                  <span className="fleet-size">
                    ({company.fleet_size} vessels)
                  </span>
                </div>
                <span className="company-findings">
                  {company.findings} findings
                </span>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* ---------- DATASETS ---------- */}

        <motion.div
          className="intel-section"
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="intel-section-title">📥 Available Datasets</div>

          {datasets.length === 0 ? (
            <div className="empty-state">📂 No datasets available</div>
          ) : (
            datasets.map((d, i) => (
              <motion.div
                key={i}
                className="dataset-item"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                whileHover={{ scale: 1.015, y: -2 }}
              >
                <div className="dataset-info">
                  <h4>{d.filename}</h4>
                  <div className="dataset-meta">
                    <span>📅 {new Date(d.modified).toLocaleString()}</span>
                    <span>💾 {d.size_mb} MB</span>
                    <span>🏢 {d.companies} companies</span>
                    <span>🔍 {d.findings} findings</span>
                  </div>
                </div>

                <button
                  className="download-btn"
                  onClick={() =>
                    (window.location.href = `/ships/api/intelligence/download/${d.filename}`)
                  }
                >
                  📥 Download
                </button>
              </motion.div>
            ))
          )}
        </motion.div>

      </div>
    </div>
  );
}
