import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useCurrency } from '../CurrencyContext';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const PERIODS = [
  { value: '1d', label: '1Д' },
  { value: '5d', label: '5Д' },
  { value: '1mo', label: '1М' },
  { value: '3mo', label: '3М' },
  { value: '6mo', label: '6М' },
  { value: '1y', label: '1Г' },
  { value: '5y', label: '5Л' },
];

function Skeleton({ width = '100%', height = '20px' }) {
  return <div className="skeleton" style={{ width, height }} />;
}

export default function StockModal({ symbol, onClose, user, onUpdate }) {
  const { format, symbol: currSymbol, convert } = useCurrency();
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState('1mo');
  const [chartHistory, setChartHistory] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const isVisibleRef = useRef(true);

  // Initial load only
  useEffect(() => {
    setLoading(true);
    api.getStock(symbol).then(({ data }) => {
      setStockData(data);
      setChartHistory(data.history || []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      onClose();
    });
  }, [symbol, onClose]);

  // Price updates without loading state
  useEffect(() => {
    if (!stockData) return;
    
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    const updatePrice = async () => {
      if (!isVisibleRef.current) return;
      try {
        const { data } = await api.getQuote(symbol);
        setStockData(prev => prev ? { ...prev, price: data.price, change: data.change } : prev);
      } catch {}
    };
    
    const interval = setInterval(updatePrice, 3000);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [symbol, stockData]);

  const fetchChartHistory = useCallback(async (period) => {
    setChartLoading(true);
    try {
      const { data } = await api.getStockHistory(symbol, period);
      setChartHistory(data || []);
    } catch {}
    setChartLoading(false);
  }, [symbol]);

  useEffect(() => {
    if (chartPeriod !== '1mo') {
      fetchChartHistory(chartPeriod);
    }
  }, [chartPeriod, fetchChartHistory]);

  const handleTrade = async (action) => {
    if (!user || !onUpdate) return;
    try {
      const { data } = await api.trade({ symbol, quantity: parseFloat(quantity), action });
      onUpdate();
      alert(`${action === 'buy' ? 'Покупка' : 'Продажа'} выполнена по цене ${format(data.price)}`);
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка');
    }
  };

  const userPosition = user?.portfolio?.find(p => p.symbol === symbol);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        {loading || !stockData ? (
          <div>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: '20px' }}>
              <div><Skeleton width="80px" height="28px" /><div style={{ marginTop: '8px' }}><Skeleton width="150px" height="16px" /></div></div>
              <div style={{ textAlign: 'right' }}><Skeleton width="100px" height="32px" /></div>
            </div>
            <Skeleton width="100%" height="200px" />
          </div>
        ) : (
          <>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div className="stock-symbol" style={{ fontSize: '1.5rem' }}>{stockData.symbol}</div>
                <div style={{ color: 'var(--text-dim)' }}>{stockData.name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stock-price">{currSymbol}{convert(stockData.price).toFixed(2)}</div>
                <div className={stockData.change >= 0 ? 'change-positive' : 'change-negative'}>
                  {stockData.change >= 0 ? '+' : ''}{stockData.change?.toFixed(2)}% сегодня
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ background: 'var(--bg-dark)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-dim)' }}>Откр.</div>
                <div>{format(stockData.open)}</div>
              </div>
              <div style={{ background: 'var(--bg-dark)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-dim)' }}>Макс.</div>
                <div>{format(stockData.high)}</div>
              </div>
              <div style={{ background: 'var(--bg-dark)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-dim)' }}>Мин.</div>
                <div>{format(stockData.low)}</div>
              </div>
              <div style={{ background: 'var(--bg-dark)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-dim)' }}>Объём</div>
                <div>{stockData.volume ? (stockData.volume / 1000000).toFixed(1) + 'M' : '-'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setChartPeriod(p.value)}
                  style={{
                    padding: '6px 12px',
                    background: chartPeriod === p.value ? 'var(--accent)' : 'var(--bg-dark)',
                    color: chartPeriod === p.value ? 'var(--bg-dark)' : 'var(--text-dim)',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                    fontWeight: chartPeriod === p.value ? '600' : '400',
                  }}
                >{p.label}</button>
              ))}
            </div>

            <div style={{ height: '200px', marginBottom: '20px' }}>
              {chartLoading ? (
                <Skeleton width="100%" height="200px" />
              ) : (
                <ResponsiveContainer>
                  <LineChart data={chartHistory}>
                    <XAxis dataKey="date" tick={{ fill: '#7a8599', fontSize: 10 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: '#7a8599', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#131a29', border: '1px solid #2a3545' }} labelStyle={{ color: '#7a8599' }} />
                    <Line type="monotone" dataKey="price" stroke="#00d4aa" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {user && onUpdate && (
              <>
                {userPosition && (
                  <p style={{ color: 'var(--text-dim)', marginBottom: '16px' }}>
                    У вас: {userPosition.quantity} шт. по {format(userPosition.avg_price)}
                  </p>
                )}
                <div className="flex gap-2 mb-4">
                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" placeholder="Кол-во" />
                </div>
                <p style={{ color: 'var(--text-dim)', marginBottom: '16px' }}>
                  Сумма: {format(stockData.price * parseFloat(quantity || 0))}
                </p>
                <div className="flex gap-2">
                  <button className="btn" style={{ flex: 1 }} onClick={() => handleTrade('buy')}>Купить</button>
                  <button className="btn btn-red" style={{ flex: 1 }} onClick={() => handleTrade('sell')}>Продать</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Clickable stock symbol component
export function StockLink({ symbol, children, user, onUpdate }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span 
        onClick={() => setOpen(true)}
        style={{ cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline' }}
      >
        {children || symbol}
      </span>
      {open && <StockModal symbol={symbol} onClose={() => setOpen(false)} user={user} onUpdate={onUpdate} />}
    </>
  );
}
