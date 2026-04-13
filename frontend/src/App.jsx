import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Search, LayoutDashboard, Settings, BarChart3, Lightbulb, ArrowRightLeft } from 'lucide-react';
import Preisueberwachung from './pages/Preisueberwachung';
import MarketResearch from './pages/MarketResearch';
import Dashboard from './pages/Dashboard';
import Einstellungen from './pages/Einstellungen';
import Auswertung from './pages/Auswertung';
import Empfehlungen from './pages/Empfehlungen';
import Preisaenderungen from './pages/Preisaenderungen';

function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <img src="/health-rise-logo.png" alt="Health Rise Logo" />
      </div>
      <nav className="sidebar-nav" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div>
          <NavLink to="/dashboard" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
            <LayoutDashboard /> Dashboard
          </NavLink>
          <NavLink to="/research" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
            <Search /> Market Research
          </NavLink>
          <NavLink to="/auswertung" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
            <BarChart3 /> Auswertung
          </NavLink>
          <NavLink to="/empfehlungen" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
            <Lightbulb /> Empfehlungen
          </NavLink>
          <NavLink to="/preisaenderungen" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
            <ArrowRightLeft /> Preisänderungen
          </NavLink>
        </div>
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
          <NavLink to="/einstellungen" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
            <Settings /> Einstellungen
          </NavLink>
        </div>
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
          <Route path="/" element={<Navigate to="/auswertung" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/research" element={<MarketResearch />} />
          <Route path="/auswertung" element={<Auswertung />} />
          <Route path="/empfehlungen" element={<Empfehlungen />} />
          <Route path="/preisaenderungen" element={<Preisaenderungen />} />
          <Route path="/preisueberwachung" element={<Preisueberwachung />} />
          <Route path="/einstellungen" element={<Einstellungen />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
