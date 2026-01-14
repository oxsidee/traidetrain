import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useCurrency } from '../CurrencyContext';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const REFRESH_INTERVAL = 3000;
const PERIODS = [
  { value: '1d', label: '1Д' },
  { value: '5d', label: '5Д' },
  { value: '1mo', label: '1М' },
  { value: '3mo', label: '3М' },
  { value: '6mo', label: '6М' },
  { value: '1y', label: '1Г' },
  { value: '5y', label: '5Л' },
];

function AnimatedPrice({ price, prevPrice }) {
  const [flashClass, setFlashClass] = useState('');
  const prevPriceRef = useRef(price);

  useEffect(() => {
    if (prevPriceRef.current !== price && price && prevPriceRef.current) {
      if (price > prevPriceRef.current) {
        setFlashClass('price-flash-up');
      } else if (price < prevPriceRef.current) {
        setFlashClass('price-flash-down');
      }
      const timer = setTimeout(() => setFlashClass(''), 1000);
      prevPriceRef.current = price;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = price;
  }, [price]);

  return <span className={flashClass}>{price?.toFixed(2)}</span>;
}

function Skeleton({ width = '100%', height = '20px' }) {
  return <div className="skeleton" style={{ width, height }} />;
}

export default function Trading({ user, onUpdate }) {
  const { format, symbol, convert } = useCurrency();
  const [stocks, setStocks] = useState([]);
  const [prevPrices, setPrevPrices] = useState({});
  const [selected, setSelected] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [chartPeriod, setChartPeriod] = useState('1mo');
  const [chartHistory, setChartHistory] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const intervalRef = useRef(null);
  const isVisibleRef = useRef(true);

  const fetchStocks = useCallback(async () => {
    if (!isVisibleRef.current) return;
    try {
      setError(null);
      const { data } = await api.getStocks();
      const stocksArray = Array.isArray(data) ? data : [];
      setPrevPrices(prev => {
        const newPrices = {};
        stocksArray.forEach(s => { newPrices[s.symbol] = prev[s.symbol] || s.price; });
        return newPrices;
      });
      setStocks(stocksArray);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
      if (isVisibleRef.current) fetchStocks();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchStocks]);

  useEffect(() => {
    fetchStocks();
    intervalRef.current = setInterval(fetchStocks, REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchStocks]);

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.searchStocks(searchQuery);
        setSearchResults(data || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch chart history when period changes
  const fetchChartHistory = useCallback(async (sym, period) => {
    setChartLoading(true);
    try {
      const { data } = await api.getStockHistory(sym, period);
      setChartHistory(data || []);
    } catch { setChartHistory([]); }
    setChartLoading(false);
  }, []);

  useEffect(() => {
    if (selected) {
      fetchChartHistory(selected, chartPeriod);
    }
  }, [selected, chartPeriod, fetchChartHistory]);

  const openStock = async (sym) => {
    setSelected(sym);
    setStockLoading(true);
    setStockData(null);
    setChartHistory([]);
    setQuantity('1');
    setSearchQuery('');
    setSearchResults([]);
    setChartPeriod('1mo');
    try {
      const { data } = await api.getStock(sym);
      setStockData(data);
      setChartHistory(data.history || []);
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка загрузки');
      setSelected(null);
    }
    setStockLoading(false);
  };

  // Refresh selected stock
  useEffect(() => {
    if (!selected || !isVisibleRef.current) return;
    const refreshSelected = async () => {
      if (!isVisibleRef.current) return;
      try {
        const { data } = await api.getQuote(selected);
        setStockData(prev => prev ? { ...prev, price: data.price, change: data.change } : prev);
      } catch {}
    };
    const interval = setInterval(refreshSelected, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [selected]);

  const handleTrade = async (action) => {
    try {
      const { data } = await api.trade({ symbol: selected, quantity: parseFloat(quantity), action });
      onUpdate();
      alert(`${action === 'buy' ? 'Покупка' : 'Продажа'} выполнена по цене ${format(data.price)}`);
      openStock(selected);
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка');
    }
  };

  const userPosition = user.portfolio?.find(p => p.symbol === selected);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1>Торговля акциями</h1>
          <p style={{ color: 'var(--text-dim)' }}>
            Баланс: <span style={{ color: 'var(--accent)' }}>{format(user.balance)}</span>
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {lastUpdate && (
            <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
              Обновлено: {lastUpdate.toLocaleTimeString('ru-RU')}
            </p>
          )}
          <button className="btn btn-outline" onClick={fetchStocks} style={{ padding: '8px 16px', fontSize: '12px' }}>
            ↻ Обновить
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Поиск любых акций (символ или название)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: '400px' }}
        />
        {(searchResults.length > 0 || searching) && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, maxWidth: '400px',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
            marginTop: '4px', maxHeight: '300px', overflow: 'auto', zIndex: 50,
          }}>
            {searching ? (
              <div style={{ padding: '12px' }}><Skeleton height="16px" width="60%" /></div>
            ) : (
              searchResults.map((r) => (
                <div key={r.symbol} onClick={() => openStock(r.symbol)}
                  style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span className="stock-symbol">{r.symbol}</span>
                  <span style={{ color: 'var(--text-dim)', marginLeft: '12px', fontSize: '14px' }}>{r.name}</span>
                  <span style={{ color: 'var(--text-dim)', marginLeft: '8px', fontSize: '12px' }}>({r.exchange})</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(255, 71, 87, 0.2)', border: '1px solid #ff4757', borderRadius: '8px', padding: '12px', marginBottom: '20px', color: '#ff4757' }}>
          {error}
        </div>
      )}

      {/* Stocks grid */}
      {loading ? (
        <div className="stock-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="stock-card">
              <Skeleton width="60px" height="20px" />
              <div style={{ marginTop: '8px' }}><Skeleton width="120px" height="14px" /></div>
              <div style={{ marginTop: '16px' }}><Skeleton width="80px" height="28px" /></div>
              <div style={{ marginTop: '8px' }}><Skeleton width="50px" height="14px" /></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="stock-grid">
          {stocks.map((stock) => (
            <div key={stock.symbol} className="stock-card" onClick={() => openStock(stock.symbol)}>
              <div className="stock-symbol">{stock.symbol}</div>
              <div className="stock-name">{stock.name}</div>
              {stock.price !== null ? (
                <>
                  <div className="stock-price">
                    {symbol}<AnimatedPrice price={convert(stock.price)} prevPrice={convert(prevPrices[stock.symbol])} />
                  </div>
                  <div className={stock.change >= 0 ? 'change-positive' : 'change-negative'}>
                    {stock.change >= 0 ? '+' : ''}{stock.change?.toFixed(2)}% сегодня
                  </div>
                </>
              ) : (
                <div style={{ marginTop: '12px' }}><Skeleton width="80px" height="24px" /></div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            {stockLoading || !stockData ? (
              <div>
                <div className="flex" style={{ justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div><Skeleton width="80px" height="28px" /><div style={{ marginTop: '8px' }}><Skeleton width="150px" height="16px" /></div></div>
                  <div style={{ textAlign: 'right' }}><Skeleton width="100px" height="32px" /><div style={{ marginTop: '8px' }}><Skeleton width="60px" height="16px" /></div></div>
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
                    <div className="stock-price">{symbol}<AnimatedPrice price={convert(stockData.price)} /></div>
                    <div className={stockData.change >= 0 ? 'change-positive' : 'change-negative'}>
                      {stockData.change >= 0 ? '+' : ''}{stockData.change?.toFixed(2)}% сегодня
                    </div>
                    {stockData.market_state && (
                      <div style={{ 
                        color: stockData.market_state === 'REGULAR' ? 'var(--green)' : 'var(--text-dim)', 
                        fontSize: '11px',
                        marginTop: '4px'
                      }}>
                        {stockData.market_state === 'REGULAR' ? '● Рынок открыт' : '○ Рынок закрыт'}
                      </div>
                    )}
                    {stockData.last_update && (
                      <div style={{ color: 'var(--text-dim)', fontSize: '10px', marginTop: '2px' }}>
                        {new Date(stockData.last_update).toLocaleTimeString('ru-RU')}
                      </div>
                    )}
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

                {/* Period selector */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                  {PERIODS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setChartPeriod(p.value)}
                      style={{
                        padding: '6px 12px',
                        background: chartPeriod === p.value ? 'var(--accent)' : 'var(--bg-dark)',
                        color: chartPeriod === p.value ? 'var(--bg-dark)' : 'var(--text-dim)',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: chartPeriod === p.value ? '600' : '400',
                      }}
                    >
                      {p.label}
                    </button>
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
          </div>
        </div>
      )}
    </div>
  );
}
