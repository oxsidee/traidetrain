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

function MarketIndicator() {
  const [marketData, setMarketData] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  
  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        const { data } = await api.getMarkets();
        setMarketData(data);
      } catch {}
    };
    
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);
  
  if (!marketData) return null;
  
  const openCount = marketData.exchanges.filter(e => e.is_open).length;
  
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{ 
          background: 'transparent',
          border: 'none',
          color: marketData.any_open ? 'var(--green)' : 'var(--text-dim)', 
          padding: '12px 24px',
          borderRadius: '10px',
          fontWeight: 600,
          fontSize: '14px',
          cursor: 'pointer',
        }}
      >
        <span style={{ marginRight: '5px' }}>{marketData.any_open ? '●' : '○'}</span>
        {marketData.any_open ? `Торги идут (${openCount})` : 'Рынки закрыты'}
      </button>
      
      {showDropdown && (
        <>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
            onClick={() => setShowDropdown(false)}
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '12px 0',
            minWidth: '320px',
            zIndex: 100,
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>Статус бирж</span>
            </div>
            {marketData.exchanges.map((exchange) => (
              <div 
                key={exchange.id}
                style={{
                  padding: '10px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text)' }}>
                    {exchange.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {exchange.hours}
                  </div>
                </div>
                <span style={{
                  color: exchange.is_open ? 'var(--green)' : 'var(--red)',
                  fontWeight: 600,
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: exchange.is_open ? 'rgba(46, 213, 115, 0.15)' : 'rgba(255, 71, 87, 0.15)',
                }}>
                  {exchange.is_open ? '● Открыта' : '○ Закрыта'}
                </span>
              </div>
            ))}
            <div style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-dim)' }}>
              Обновлено: {new Date().toLocaleTimeString('ru-RU')}
            </div>
          </div>
        </>
      )}
    </div>
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
          <MarketIndicator />
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
          <Route path="/reports" element={<Reports user={user} onUpdate={fetchUser} />} />
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
