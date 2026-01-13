import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { getToken, api } from './api';
import { CurrencyProvider, useCurrency } from './CurrencyContext';
import Dashboard from './pages/Dashboard';
import Trading from './pages/Trading';
import Reports from './pages/Reports';
import Auth from './pages/Auth';

function CurrencySelector() {
  const { currency, setCurrency, currencies } = useCurrency();
  return (
    <select
      value={currency}
      onChange={(e) => setCurrency(e.target.value)}
      style={{
        background: 'var(--bg-dark)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        padding: '6px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        cursor: 'pointer',
      }}
    >
      {currencies.map(c => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

function Nav({ user, onLogout }) {
  const location = useLocation();
  
  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex gap-4" style={{ alignItems: 'center' }}>
          <span className="logo">TradeTrain</span>
          <nav className="nav" style={{ border: 'none', margin: 0, padding: 0 }}>
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Кабинет</Link>
            <Link to="/trading" className={location.pathname === '/trading' ? 'active' : ''}>Торговля</Link>
            <Link to="/reports" className={location.pathname === '/reports' ? 'active' : ''}>Отчеты</Link>
          </nav>
        </div>
        <div className="flex gap-4" style={{ alignItems: 'center' }}>
          <CurrencySelector />
          <span style={{ color: 'var(--text-dim)' }}>{user?.username}</span>
          <button className="btn btn-outline" onClick={onLogout}>Выйти</button>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    if (getToken()) {
      try {
        const { data } = await api.getMe();
        setUser(data);
      } catch {
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleLogin = (token, username) => {
    localStorage.setItem('token', token);
    fetchUser();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (loading) return <div className="container text-center" style={{ paddingTop: '100px' }}>Загрузка...</div>;

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Nav user={user} onLogout={handleLogout} />
      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard user={user} onUpdate={fetchUser} />} />
          <Route path="/trading" element={<Trading user={user} onUpdate={fetchUser} />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <CurrencyProvider>
      <AppContent />
    </CurrencyProvider>
  );
}
