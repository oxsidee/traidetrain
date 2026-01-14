import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { api } from '../api';
import { useCurrency } from '../CurrencyContext';
import StockModal from '../components/StockModal';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#00d4aa', '#00a88a', '#007a66', '#00524a', '#ff4757', '#ff6b7a'];
const REFRESH_INTERVAL = 3000;

function Skeleton({ width = '100%', height = '20px' }) {
  return <div className="skeleton" style={{ width, height }} />;
}

// Clickable symbol - just a styled span, no modal inside
function SymbolLink({ symbol, displaySymbol, onClick }) {
  const display = displaySymbol || symbol?.replace('.ME', '') || symbol;
  return (
    <span 
      onClick={() => onClick(symbol)}
      style={{ cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline' }}
    >
      {display}
    </span>
  );
}

// Self-updating holding row
function HoldingRow({ holding, onSymbolClick, onPriceUpdate }) {
  const { format } = useCurrency();
  const [currentPrice, setCurrentPrice] = useState(holding.current_price);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const updatePrice = async () => {
      if (!isVisibleRef.current) return;
      try {
        const { data } = await api.getQuote(holding.symbol);
        setCurrentPrice(data.price);
        onPriceUpdate(holding.symbol, data.price);
      } catch {}
    };
    
    const interval = setInterval(updatePrice, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [holding.symbol, onPriceUpdate]);

  const current = currentPrice * holding.quantity;
  const invested = holding.avg_price * holding.quantity;
  const profit = current - invested;
  const profitPercent = invested > 0 ? (profit / invested * 100) : 0;

  return (
    <tr>
      <td><SymbolLink symbol={holding.symbol} displaySymbol={holding.displaySymbol} onClick={onSymbolClick} /></td>
      <td>{holding.quantity}</td>
      <td>{format(holding.avg_price)}</td>
      <td>{format(currentPrice)}</td>
      <td className={profit >= 0 ? 'change-positive' : 'change-negative'}>
        {profit >= 0 ? '+' : ''}{format(profit)} ({profitPercent.toFixed(1)}%)
      </td>
    </tr>
  );
}

// Self-updating stat display
function LiveStat({ label, getValue, color }) {
  const { format } = useCurrency();
  const [value, setValue] = useState(getValue());

  useEffect(() => {
    const interval = setInterval(() => {
      setValue(getValue());
    }, 500);
    return () => clearInterval(interval);
  }, [getValue]);

  return (
    <div className="card">
      <p style={{ color: 'var(--text-dim)' }}>{label}</p>
      <p style={{ fontSize: '1.5rem', fontFamily: 'JetBrains Mono', color: color || 'var(--text)' }}>
        {typeof value === 'number' ? format(value) : value}
      </p>
    </div>
  );
}

// Memoized pie chart
const PortfolioPieChart = memo(function PortfolioPieChart({ holdings, format, convert }) {
  const data = holdings.map(h => ({
    name: h.symbol,
    value: convert(h.current_price * h.quantity)
  }));

  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={90}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ stroke: '#7a8599' }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip 
          contentStyle={{ background: '#131a29', border: '1px solid #2a3545', color: '#fff' }}
          itemStyle={{ color: '#fff' }}
          formatter={(val) => format(val)}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}, (prev, next) => prev.holdings.length === next.holdings.length);

export default function Reports({ user, onUpdate }) {
  const { format, convert } = useCurrency();
  const [report, setReport] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [favorites, setFavorites] = useState(new Set());
  const pricesRef = useRef({});

  const fetchInitialData = useCallback(async () => {
    try {
      const [reportRes, txRes, favsRes] = await Promise.all([
        api.getReport(),
        api.getTransactions(),
        api.getFavorites()
      ]);
      setReport(reportRes.data);
      setTransactions(txRes.data);
      setFavorites(new Set(favsRes.data || []));
      
      reportRes.data.holdings.forEach(h => {
        pricesRef.current[h.symbol] = h.current_price;
      });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  const handleFavoriteToggle = useCallback((symbol, isFavorite) => {
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (isFavorite) {
        newSet.add(symbol);
      } else {
        newSet.delete(symbol);
      }
      return newSet;
    });
  }, []);

  const handlePriceUpdate = useCallback((symbol, price) => {
    pricesRef.current[symbol] = price;
  }, []);

  const openSymbol = useCallback((symbol) => {
    setSelectedSymbol(symbol);
  }, []);

  const closeModal = useCallback(() => {
    setSelectedSymbol(null);
  }, []);

  if (loading) {
    return (
      <div>
        <h1>Отчетность</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card">
              <Skeleton width="80px" height="14px" />
              <div style={{ marginTop: '8px' }}><Skeleton width="120px" height="28px" /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) return <p>Ошибка загрузки</p>;

  const getTotalInvested = () => report.holdings.reduce((sum, h) => sum + h.avg_price * h.quantity, 0);
  const getTotalCurrent = () => report.holdings.reduce((sum, h) => sum + (pricesRef.current[h.symbol] || h.current_price) * h.quantity, 0);
  const getTotalProfit = () => getTotalCurrent() - getTotalInvested();

  return (
    <div>
      <h1>Отчетность</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <div className="card">
          <p style={{ color: 'var(--text-dim)' }}>Баланс</p>
          <p style={{ fontSize: '1.5rem', fontFamily: 'JetBrains Mono', color: 'var(--accent)' }}>
            {format(report.balance)}
          </p>
        </div>
        <LiveStat label="Инвестировано" getValue={getTotalInvested} />
        <LiveStat label="Текущая стоимость" getValue={getTotalCurrent} />
        <LiveStat 
          label="Прибыль/Убыток" 
          getValue={() => {
            const profit = getTotalProfit();
            return `${profit >= 0 ? '+' : ''}${format(profit)}`;
          }}
          color={getTotalProfit() >= 0 ? 'var(--green)' : 'var(--red)'}
        />
      </div>

      {report.holdings.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h2>Состав портфеля</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
            <div style={{ height: '280px' }}>
              <PortfolioPieChart holdings={report.holdings} format={format} convert={convert} />
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Тикер</th>
                  <th>Кол-во</th>
                  <th>Ср. цена</th>
                  <th>Текущая</th>
                  <th>Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {report.holdings.map((h) => (
                  <HoldingRow 
                    key={h.symbol} 
                    holding={h}
                    onSymbolClick={openSymbol}
                    onPriceUpdate={handlePriceUpdate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '20px' }}>
        <h2>История операций</h2>
        {transactions.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тикер</th>
                <th>Операция</th>
                <th>Кол-во</th>
                <th>Цена</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-dim)' }}>{new Date(t.date).toLocaleDateString('ru-RU')}</td>
                  <td><SymbolLink symbol={t.symbol} displaySymbol={t.displaySymbol} onClick={openSymbol} /></td>
                  <td className={t.action === 'buy' ? 'change-positive' : 'change-negative'}>
                    {t.action === 'buy' ? 'Покупка' : 'Продажа'}
                  </td>
                  <td>{t.quantity}</td>
                  <td>{format(t.price)}</td>
                  <td>{format(t.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--text-dim)' }}>Операций пока нет</p>
        )}
      </div>

      {/* Modal rendered at top level - not affected by HoldingRow updates */}
      {selectedSymbol && (
        <StockModal 
          symbol={selectedSymbol} 
          onClose={closeModal} 
          user={user} 
          onUpdate={onUpdate}
          isFavorite={favorites.has(selectedSymbol)}
          onFavoriteToggle={handleFavoriteToggle}
        />
      )}
    </div>
  );
}
