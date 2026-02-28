import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Activity, LineChart, Search, LayoutDashboard } from 'lucide-react';
import Preisueberwachung from './pages/Preisueberwachung';
import MarketResearch from './pages/MarketResearch';

function ComingSoon({ title }) {
  return (
    <div className="coming-soon">
      <img src="/health-rise-logo.png" alt="Health Rise" style={{ maxWidth: '200px', marginBottom: '2rem', opacity: 0.5 }} />
      <h2>{title}</h2>
      <p>Diese Funktion wird in Kürze verfügbar sein.</p>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <img src="/health-rise-logo.png" alt="Health Rise Logo" />
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
          <LayoutDashboard /> Dashboard (Coming Soon)
        </NavLink>
        <NavLink to="/research" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
          <Search /> Market Research
        </NavLink>
        <NavLink to="/preisueberwachung" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
          <LineChart /> Preisüberwachung
        </NavLink>
        <NavLink to="/bewegungsanalyse" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
          <Activity /> Bewegungsanalyse (Coming Soon)
        </NavLink>
      </nav>
    </div>
  );
}

function App() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/preisueberwachung" replace />} />
          <Route path="/dashboard" element={<ComingSoon title="Dashboard" />} />
          <Route path="/research" element={<MarketResearch />} />
          <Route path="/preisueberwachung" element={<Preisueberwachung />} />
          <Route path="/bewegungsanalyse" element={<ComingSoon title="Bewegungsanalyse" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
