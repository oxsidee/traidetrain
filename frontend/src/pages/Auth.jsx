import { useState } from 'react';
import { api } from '../api';

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        const { data } = await api.login({ username, password });
        onLogin(data.token, data.username);
      } else {
        await api.register({ username, password });
        const { data } = await api.login({ username, password });
        onLogin(data.token, data.username);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка');
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #131a29 0%, #0a0e17 100%)'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="text-center mb-4">
          <span className="logo" style={{ fontSize: '2rem' }}>TradeTrain</span>
          <p style={{ color: 'var(--text-dim)', marginTop: '8px' }}>Тренажер трейдинга</p>
        </div>
        
        <div className="flex mb-4" style={{ background: 'var(--bg-dark)', borderRadius: '10px', padding: '4px' }}>
          <button 
            className={`btn ${isLogin ? '' : 'btn-outline'}`}
            style={{ flex: 1, border: 'none' }}
            onClick={() => setIsLogin(true)}
          >Вход</button>
          <button 
            className={`btn ${!isLogin ? '' : 'btn-outline'}`}
            style={{ flex: 1, border: 'none' }}
            onClick={() => setIsLogin(false)}
          >Регистрация</button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Логин"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-4"
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4"
          />
          {error && <p style={{ color: 'var(--red)', marginBottom: '16px' }}>{error}</p>}
          <button type="submit" className="btn" style={{ width: '100%' }}>
            {isLogin ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
      </div>
    </div>
  );
}
