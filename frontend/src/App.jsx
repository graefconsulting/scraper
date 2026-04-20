import React from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { Search, LayoutDashboard, Settings, BarChart3, Lightbulb, ArrowRightLeft, Tag, ShoppingCart, TrendingUp, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Preisueberwachung from './pages/Preisueberwachung';
import MarketResearch from './pages/MarketResearch';
import Dashboard from './pages/Dashboard';
import Einstellungen from './pages/Einstellungen';
import Auswertung from './pages/Auswertung';
import Empfehlungen from './pages/Empfehlungen';
import Preisaenderungen from './pages/Preisaenderungen';
import Rabattaktion from './pages/Rabattaktion';
import Warenkorbanalyse from './pages/Warenkorbanalyse';
import LoginPage from './pages/LoginPage';
import MarketingTabelle from './pages/MarketingTabelle';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isMarketing = user?.role === 'marketing';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <img src="/health-rise-logo.png" alt="Health Rise Logo" />
      </div>
      <nav className="sidebar-nav" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div>
          {isMarketing ? (
            <NavLink to="/marketing" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
              <TrendingUp /> Marketing
            </NavLink>
          ) : (
            <>
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
              <NavLink to="/rabattaktion" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
                <Tag /> Rabattaktion
              </NavLink>
              <NavLink to="/warenkorb" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
                <ShoppingCart /> Warenkorbanalyse
              </NavLink>
              <NavLink to="/marketing" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
                <TrendingUp /> Marketing
              </NavLink>
            </>
          )}
        </div>
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
          {!isMarketing && (
            <NavLink to="/einstellungen" className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}>
              <Settings /> Einstellungen
            </NavLink>
          )}
          <div style={{ padding: '0.6rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', marginTop: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-color-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary-color)' }}>
                  {user?.username?.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.username}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {user?.role === 'marketing' ? 'Marketing' : 'Admin'}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Abmelden"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}

function AuthenticatedLayout() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/auswertung" replace />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/research" element={<ProtectedRoute><MarketResearch /></ProtectedRoute>} />
          <Route path="/auswertung" element={<ProtectedRoute><Auswertung /></ProtectedRoute>} />
          <Route path="/empfehlungen" element={<ProtectedRoute><Empfehlungen /></ProtectedRoute>} />
          <Route path="/preisaenderungen" element={<ProtectedRoute><Preisaenderungen /></ProtectedRoute>} />
          <Route path="/rabattaktion" element={<ProtectedRoute><Rabattaktion /></ProtectedRoute>} />
          <Route path="/preisueberwachung" element={<ProtectedRoute><Preisueberwachung /></ProtectedRoute>} />
          <Route path="/warenkorb" element={<ProtectedRoute><Warenkorbanalyse /></ProtectedRoute>} />
          <Route path="/einstellungen" element={<ProtectedRoute><Einstellungen /></ProtectedRoute>} />
          <Route path="/marketing" element={<ProtectedRoute><MarketingTabelle /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<AuthenticatedLayout />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
