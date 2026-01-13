import { useState } from 'react';
import { api } from '../api';
import { useCurrency } from '../CurrencyContext';
import { StockLink } from '../components/StockModal';

export default function Dashboard({ user, onUpdate }) {
  const [amount, setAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const { format, convert, rates, currencies, symbol } = useCurrency();

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) === 0) return;
    setLoading(true);
    try {
      // Convert deposit amount to USD (internal storage)
      let usdAmount = parseFloat(amount);
      if (depositCurrency !== 'USD' && rates[depositCurrency]) {
        usdAmount = parseFloat(amount) / rates[depositCurrency];
      }
      await api.deposit(usdAmount);
      setAmount('');
      onUpdate();
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка');
    }
    setLoading(false);
  };

  const totalInvested = user.portfolio?.reduce((sum, p) => sum + p.avg_price * p.quantity, 0) || 0;

  const depositSymbols = { USD: '$', RUB: '₽', EUR: '€', GBP: '£', CNY: '¥' };

  return (
    <div>
      <h1>Личный кабинет</h1>
      
      <div className="card" style={{ marginTop: '20px' }}>
        <p style={{ color: 'var(--text-dim)', marginBottom: '8px' }}>Ваш баланс</p>
        <div className="balance">{format(user.balance)}</div>
        <p style={{ color: 'var(--text-dim)', fontSize: '14px', marginTop: '4px' }}>
          ≈ ${user.balance.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} USD
        </p>
        
        <div style={{ marginTop: '24px' }}>
          <p style={{ color: 'var(--text-dim)', marginBottom: '8px', fontSize: '14px' }}>Пополнить баланс</p>
          <div className="flex gap-2" style={{ maxWidth: '500px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="number"
                placeholder="Сумма (+ или -)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ paddingRight: '60px' }}
              />
              <select
                value={depositCurrency}
                onChange={(e) => setDepositCurrency(e.target.value)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'var(--bg-hover)',
                  border: 'none',
                  color: 'var(--text)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {currencies.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button className="btn" onClick={handleDeposit} disabled={loading}>
              {loading ? '...' : 'Пополнить'}
            </button>
          </div>
          {amount && depositCurrency !== 'USD' && rates[depositCurrency] && (
            <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginTop: '8px' }}>
              ≈ ${(parseFloat(amount) / rates[depositCurrency]).toFixed(2)} USD по курсу {rates[depositCurrency]} {depositCurrency}/USD
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Ваш портфель</h2>
        {user.portfolio?.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Тикер</th>
                <th>Кол-во</th>
                <th>Ср. цена</th>
                <th>Всего</th>
              </tr>
            </thead>
            <tbody>
              {user.portfolio.map((p) => (
                <tr key={p.symbol}>
                  <td><StockLink symbol={p.symbol} user={user} onUpdate={onUpdate}>{p.symbol}</StockLink></td>
                  <td>{p.quantity}</td>
                  <td>{format(p.avg_price)}</td>
                  <td>{format(p.avg_price * p.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--text-dim)' }}>Портфель пуст. Купите акции на странице "Торговля"</p>
        )}
        
        {totalInvested > 0 && (
          <p style={{ marginTop: '16px', color: 'var(--text-dim)' }}>
            Всего инвестировано: <span style={{ color: 'var(--accent)' }}>{format(totalInvested)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
