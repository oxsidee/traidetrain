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
    const interval = setInterval(fetchMarkets, 10000);
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

function SettingsModal({ user, onClose, onUpdate }) {
  const [activeTab, setActiveTab] = useState('display');
  const [newDisplayName, setNewDisplayName] = useState(user.display_name || user.username);
  const [newUsername, setNewUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleUpdateDisplayName = async (e) => {
    e.preventDefault();
    if (newDisplayName.length < 2) {
      setMessage({ type: 'error', text: 'Имя должно быть не менее 2 символов' });
      return;
    }
    
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await api.updateDisplayName(newDisplayName);
      setMessage({ type: 'success', text: 'Имя успешно изменено!' });
      onUpdate();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Ошибка' });
    }
    setLoading(false);
  };

  const handleUpdateUsername = async (e) => {
    e.preventDefault();
    if (newUsername === user.username) {
      setMessage({ type: 'error', text: 'Логин не изменился' });
      return;
    }
    if (newUsername.length < 3) {
      setMessage({ type: 'error', text: 'Логин должен быть не менее 3 символов' });
      return;
    }
    
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const { data } = await api.updateUsername(newUsername);
      localStorage.setItem('token', data.token);
      setMessage({ type: 'success', text: 'Логин успешно изменён!' });
      onUpdate();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Ошибка' });
    }
    setLoading(false);
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setMessage({ type: 'error', text: 'Введите текущий пароль' });
      return;
    }
    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: 'Новый пароль должен быть не менее 4 символов' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Пароли не совпадают' });
      return;
    }
    
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await api.updatePassword(currentPassword, newPassword);
      setMessage({ type: 'success', text: 'Пароль успешно изменён!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Ошибка' });
    }
    setLoading(false);
  };

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => { setActiveTab(id); setMessage({ type: '', text: '' }); }}
      style={{
        flex: 1,
        padding: '10px 8px',
        background: activeTab === id ? 'var(--accent)' : 'var(--bg-dark)',
        color: activeTab === id ? 'var(--bg-dark)' : 'var(--text)',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: activeTab === id ? '600' : '400',
        fontSize: '13px',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>⚙️ Настройки аккаунта</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-dim)' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
          <TabButton id="display" label="Имя" />
          <TabButton id="username" label="Логин" />
          <TabButton id="password" label="Пароль" />
        </div>

        {/* Message */}
        {message.text && (
          <div style={{
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
            background: message.type === 'success' ? 'rgba(0, 212, 170, 0.15)' : 'rgba(255, 71, 87, 0.15)',
            color: message.type === 'success' ? 'var(--green)' : 'var(--red)',
            border: `1px solid ${message.type === 'success' ? 'var(--green)' : 'var(--red)'}`,
          }}>
            {message.text}
          </div>
        )}

        {/* Display Name Form */}
        {activeTab === 'display' && (
          <form onSubmit={handleUpdateDisplayName}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '13px' }}>
                Отображаемое имя
              </label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Введите ваше имя"
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                Это имя будет отображаться в интерфейсе
              </p>
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Сохранение...' : 'Сохранить имя'}
            </button>
          </form>
        )}

        {/* Username Form */}
        {activeTab === 'username' && (
          <form onSubmit={handleUpdateUsername}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '13px' }}>
                Логин для входа
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Введите новый логин"
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                Используется для авторизации
              </p>
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Сохранение...' : 'Сохранить логин'}
            </button>
          </form>
        )}

        {/* Password Form */}
        {activeTab === 'password' && (
          <form onSubmit={handleUpdatePassword}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '13px' }}>
                Текущий пароль
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Введите текущий пароль"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '13px' }}>
                Новый пароль
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Введите новый пароль"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-dim)', fontSize: '13px' }}>
                Подтвердите пароль
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
                style={{ width: '100%' }}
              />
            </div>
            <button type="submit" className="btn" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Сохранение...' : 'Сохранить пароль'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Nav({ user, onLogout, onOpenSettings }) {
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
          <button
            onClick={onOpenSettings}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
          >
            <span>⚙️</span>
            {user?.display_name || user?.username}
          </button>
          <button className="btn btn-outline" onClick={onLogout}>Выйти</button>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

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
      <Nav user={user} onLogout={handleLogout} onOpenSettings={() => setShowSettings(true)} />
      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard user={user} onUpdate={fetchUser} />} />
          <Route path="/trading" element={<Trading user={user} onUpdate={fetchUser} />} />
          <Route path="/reports" element={<Reports user={user} onUpdate={fetchUser} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
      
      {showSettings && (
        <SettingsModal 
          user={user} 
          onClose={() => setShowSettings(false)} 
          onUpdate={fetchUser} 
        />
      )}
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
