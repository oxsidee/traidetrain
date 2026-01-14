import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// Pure SVG Candlestick Chart with zoom
function CandlestickChart({ data }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState(null);
  const [zoom, setZoom] = useState(1); // 1 = 100%, 2 = 200%, etc.
  const [panOffset, setPanOffset] = useState(0); // Offset for panning
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Reset zoom and pan when data changes
  useEffect(() => {
    setZoom(1);
    setPanOffset(0);
  }, [data]);

  if (!data || data.length === 0) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>Нет данных</div>;
  }

  const { width, height } = dimensions;
  const margin = { top: 10, right: 60, bottom: 50, left: 10 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Calculate visible data range based on zoom and pan
  const totalItems = data.length;
  const visibleItems = Math.max(Math.floor(totalItems / zoom), 10);
  const maxOffset = Math.max(totalItems - visibleItems, 0);
  const startIndex = Math.min(Math.max(Math.floor(panOffset), 0), maxOffset);
  const endIndex = Math.min(startIndex + visibleItems, totalItems);
  const visibleData = data.slice(startIndex, endIndex);

  // Calculate price range for visible data
  const allPrices = visibleData.flatMap(d => [d.high, d.low, d.open, d.close].filter(v => v != null));
  if (allPrices.length === 0) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>Нет данных OHLC</div>;
  }
  
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;
  const pricePadding = priceRange * 0.05;
  const yMin = minPrice - pricePadding;
  const yMax = maxPrice + pricePadding;

  // Scale functions
  const scaleY = (price) => margin.top + chartHeight - ((price - yMin) / (yMax - yMin)) * chartHeight;
  const candleWidth = Math.max(chartWidth / visibleData.length - 2, 3);

  // Y-axis ticks
  const yTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const price = yMin + (yMax - yMin) * (i / tickCount);
    yTicks.push({ price, y: scaleY(price) });
  }

  // X-axis labels
  const labelInterval = Math.max(Math.ceil(visibleData.length / 8), 1);

  // Zoom handlers
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    const newZoom = Math.max(1, Math.min(zoom + delta, 10));
    setZoom(newZoom);
    
    // Adjust pan to keep center in view
    if (newZoom > zoom) {
      const newVisibleItems = Math.floor(totalItems / newZoom);
      const centerOffset = panOffset + visibleItems / 2;
      const newPanOffset = centerOffset - newVisibleItems / 2;
      setPanOffset(Math.max(0, Math.min(newPanOffset, totalItems - newVisibleItems)));
    }
  };

  // Pan handlers
  const handleMouseDown = (e) => {
    e.preventDefault(); // Prevent text selection
    setIsDragging(true);
    setDragStart(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const delta = (dragStart - e.clientX) / (chartWidth / visibleItems);
    const newOffset = Math.max(0, Math.min(panOffset + delta, maxOffset));
    setPanOffset(newOffset);
    setDragStart(e.clientX);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', userSelect: 'none' }}>
      {width > 0 && height > 0 && (
        <svg 
          width={width} 
          height={height}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        >
          {/* Y-axis */}
          <line x1={width - margin.right} y1={margin.top} x2={width - margin.right} y2={height - margin.bottom} stroke="#2a3545" />
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={width - margin.right - 4} y1={tick.y} x2={width - margin.right} y2={tick.y} stroke="#2a3545" />
              <text x={width - margin.right + 5} y={tick.y + 4} fill="#7a8599" fontSize={10}>{tick.price.toFixed(2)}</text>
            </g>
          ))}

          {/* X-axis */}
          <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke="#2a3545" />
          {visibleData.map((item, i) => {
            if (i % labelInterval !== 0) return null;
            const x = margin.left + (i + 0.5) * (chartWidth / visibleData.length);
            return (
              <text key={i} x={x} y={height - margin.bottom + 15} fill="#7a8599" fontSize={9} textAnchor="middle">
                {item.date}
              </text>
            );
          })}

          {/* Candlesticks */}
          {visibleData.map((item, i) => {
            const { open, close, high, low } = item;
            if (open == null || close == null || high == null || low == null) return null;
            
            const isGreen = close >= open;
            const color = isGreen ? '#2ed573' : '#ff4757';
            const x = margin.left + i * (chartWidth / visibleData.length) + (chartWidth / visibleData.length - candleWidth) / 2;
            const centerX = x + candleWidth / 2;
            
            const yHigh = scaleY(high);
            const yLow = scaleY(low);
            const yOpen = scaleY(open);
            const yClose = scaleY(close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);

            return (
              <g 
                key={i}
                onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, item })}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: 'crosshair' }}
              >
                {/* Wick */}
                <line x1={centerX} y1={yHigh} x2={centerX} y2={yLow} stroke={color} strokeWidth={1} />
                {/* Body */}
                <rect x={x} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} stroke={color} />
              </g>
            );
          })}
        </svg>
      )}
      
      {/* Zoom controls */}
      <div style={{ 
        position: 'absolute', 
        bottom: '5px', 
        left: '10px', 
        display: 'flex', 
        gap: '4px',
        alignItems: 'center',
        background: 'rgba(19, 26, 41, 0.9)',
        padding: '4px 8px',
        borderRadius: '4px',
      }}>
        <button 
          onClick={() => setZoom(Math.max(1, zoom - 0.5))}
          style={{ 
            width: '24px', height: '24px', 
            background: 'var(--bg-dark)', border: 'none', borderRadius: '4px',
            color: '#fff', cursor: 'pointer', fontSize: '14px'
          }}
        >−</button>
        <span style={{ color: '#7a8599', fontSize: '11px', minWidth: '40px', textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button 
          onClick={() => setZoom(Math.min(10, zoom + 0.5))}
          style={{ 
            width: '24px', height: '24px', 
            background: 'var(--bg-dark)', border: 'none', borderRadius: '4px',
            color: '#fff', cursor: 'pointer', fontSize: '14px'
          }}
        >+</button>
        {zoom > 1 && (
          <button 
            onClick={() => { setZoom(1); setPanOffset(0); }}
            style={{ 
              marginLeft: '4px', padding: '2px 6px',
              background: 'var(--bg-dark)', border: 'none', borderRadius: '4px',
              color: '#7a8599', cursor: 'pointer', fontSize: '10px'
            }}
          >Сброс</button>
        )}
      </div>
      
      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 10,
          top: tooltip.y - 80,
          background: '#131a29',
          border: '1px solid #2a3545',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '12px',
          color: '#fff',
          pointerEvents: 'none',
          zIndex: 1000,
        }}>
          <div style={{ color: '#7a8599', marginBottom: '4px' }}>{tooltip.item.date}</div>
          <div>Откр: <span style={{ color: '#00d4aa' }}>{tooltip.item.open?.toFixed(2)}</span></div>
          <div>Макс: <span style={{ color: '#00d4aa' }}>{tooltip.item.high?.toFixed(2)}</span></div>
          <div>Мин: <span style={{ color: '#00d4aa' }}>{tooltip.item.low?.toFixed(2)}</span></div>
          <div>Закр: <span style={{ color: '#00d4aa' }}>{tooltip.item.close?.toFixed(2)}</span></div>
        </div>
      )}
    </div>
  );
}

// Line Chart component with zoom
function LineChartComponent({ data, animate }) {
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);

  // Reset zoom and pan when data changes
  useEffect(() => {
    setZoom(1);
    setPanOffset(0);
  }, [data]);

  if (!data || data.length === 0) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>Нет данных</div>;
  }

  // Calculate visible data range
  const totalItems = data.length;
  const visibleItems = Math.max(Math.floor(totalItems / zoom), 10);
  const maxOffset = Math.max(totalItems - visibleItems, 0);
  const startIndex = Math.min(Math.max(Math.floor(panOffset), 0), maxOffset);
  const endIndex = Math.min(startIndex + visibleItems, totalItems);
  const visibleData = data.slice(startIndex, endIndex);

  const handleWheel = (e) => {
    if (e.shiftKey || e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      const newZoom = Math.max(1, Math.min(zoom + delta, 10));
      setZoom(newZoom);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onWheel={handleWheel}>
      <ResponsiveContainer>
        <LineChart data={visibleData} margin={{ top: 10, right: 60, bottom: 10, left: 10 }}>
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#7a8599', fontSize: 10 }}
            axisLine={{ stroke: '#2a3545' }}
            tickLine={{ stroke: '#2a3545' }}
          />
          <YAxis 
            domain={['auto', 'auto']} 
            tick={{ fill: '#7a8599', fontSize: 10 }}
            axisLine={{ stroke: '#2a3545' }}
            tickLine={{ stroke: '#2a3545' }}
            orientation="right"
          />
          <Tooltip 
            contentStyle={{ background: '#131a29', border: '1px solid #2a3545', color: '#fff' }} 
            labelStyle={{ color: '#7a8599' }}
            formatter={(value) => [value?.toFixed(2), 'Цена']}
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#00d4aa" 
            strokeWidth={2} 
            dot={false} 
            isAnimationActive={animate}
            animationDuration={800}
          />
        </LineChart>
      </ResponsiveContainer>
      
      {/* Zoom controls */}
      <div style={{ 
        position: 'absolute', 
        bottom: '5px', 
        left: '10px', 
        display: 'flex', 
        gap: '4px',
        alignItems: 'center',
        background: 'rgba(19, 26, 41, 0.9)',
        padding: '4px 8px',
        borderRadius: '4px',
      }}>
        <button 
          onClick={() => setZoom(Math.max(1, zoom - 0.5))}
          style={{ 
            width: '24px', height: '24px', 
            background: 'var(--bg-dark)', border: 'none', borderRadius: '4px',
            color: '#fff', cursor: 'pointer', fontSize: '14px'
          }}
        >−</button>
        <span style={{ color: '#7a8599', fontSize: '11px', minWidth: '40px', textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button 
          onClick={() => setZoom(Math.min(10, zoom + 0.5))}
          style={{ 
            width: '24px', height: '24px', 
            background: 'var(--bg-dark)', border: 'none', borderRadius: '4px',
            color: '#fff', cursor: 'pointer', fontSize: '14px'
          }}
        >+</button>
        {zoom > 1 && (
          <>
            <input 
              type="range" 
              min={0} 
              max={maxOffset} 
              value={panOffset}
              onChange={(e) => setPanOffset(Number(e.target.value))}
              style={{ width: '80px', marginLeft: '8px' }}
            />
            <button 
              onClick={() => { setZoom(1); setPanOffset(0); }}
              style={{ 
                marginLeft: '4px', padding: '2px 6px',
                background: 'var(--bg-dark)', border: 'none', borderRadius: '4px',
                color: '#7a8599', cursor: 'pointer', fontSize: '10px'
              }}
            >Сброс</button>
          </>
        )}
      </div>
    </div>
  );
}

// Main Chart component
function StockChart({ data, chartType }) {
  const [isFirstRender, setIsFirstRender] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsFirstRender(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const hasCandleData = data && data.length > 0 && data[0]?.open !== undefined;

  if (chartType === 'candle' && hasCandleData) {
    return <CandlestickChart data={data} />;
  }

  return <LineChartComponent data={data} animate={isFirstRender} />;
}

export default function StockModal({ symbol, onClose, user, onUpdate, isFavorite: initialFavorite, onFavoriteToggle }) {
  const { symbol: currSymbol, convertFrom } = useCurrency();
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState('1mo');
  const [chartHistory, setChartHistory] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartType, setChartType] = useState('line'); // 'line' or 'candle'
  const [quantity, setQuantity] = useState('1');
  const [isFavorite, setIsFavorite] = useState(initialFavorite || false);
  const [favLoading, setFavLoading] = useState(false);
  const isVisibleRef = useRef(true);
  
  // Sync favorite state from props
  useEffect(() => {
    setIsFavorite(initialFavorite || false);
  }, [initialFavorite]);
  
  const handleFavoriteClick = async () => {
    if (favLoading) return;
    setFavLoading(true);
    try {
      if (isFavorite) {
        await api.removeFavorite(symbol);
      } else {
        await api.addFavorite(symbol);
      }
      const newState = !isFavorite;
      setIsFavorite(newState);
      if (onFavoriteToggle) {
        onFavoriteToggle(symbol, newState);
      }
    } catch (err) {
      console.error('Favorite error:', err);
    }
    setFavLoading(false);
  };

  // Disable body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const fetchChartHistory = useCallback(async (period) => {
    setChartLoading(true);
    try {
      const { data } = await api.getStockHistory(symbol, period);
      setChartHistory(data || []);
    } catch {}
    setChartLoading(false);
  }, [symbol]);

  // Initial load - only once
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    
    api.getStock(symbol).then(({ data }) => {
      if (!mounted) return;
      setStockData(data);
      // Always fetch chart history to get OHLC data
      fetchChartHistory(chartPeriod);
      setLoading(false);
    }).catch(() => {
      if (mounted) {
        setLoading(false);
        onClose();
      }
    });

    return () => { mounted = false; };
  }, [symbol]); // Remove chartPeriod dependency to prevent re-fetching on period change

  // Price updates without affecting chart
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
  }, [symbol, stockData?.symbol]); // Only depend on symbol, not full stockData

  // Fetch chart history when period changes
  useEffect(() => {
    if (stockData && chartPeriod) {
      fetchChartHistory(chartPeriod);
    }
  }, [chartPeriod]); // Only trigger on period change

  const handleTrade = async (action) => {
    if (!user || !onUpdate) return;
    try {
      const { data } = await api.trade({ symbol, quantity: parseFloat(quantity), action });
      onUpdate();
      // data.price is already in USD from backend
      alert(`${action === 'buy' ? 'Покупка' : 'Продажа'} выполнена по цене ${currSymbol}${data.price?.toFixed(2)}`);
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка');
    }
  };

  const userPosition = user?.portfolio?.find(p => p.symbol === symbol);

  // Memoize converted values
  const convertedPrice = useMemo(() => 
    convertFrom(stockData?.price, stockData?.currency)?.toFixed(2), 
    [stockData?.price, stockData?.currency, convertFrom]
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px', width: '90vw' }}>
        {loading || !stockData ? (
          <div>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: '20px' }}>
              <div><Skeleton width="80px" height="28px" /><div style={{ marginTop: '8px' }}><Skeleton width="150px" height="16px" /></div></div>
              <div style={{ textAlign: 'right' }}><Skeleton width="100px" height="32px" /></div>
            </div>
            <Skeleton width="100%" height="280px" />
          </div>
        ) : (
          <>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <button
                  onClick={handleFavoriteClick}
                  disabled={favLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: favLoading ? 'wait' : 'pointer',
                    padding: '0',
                    opacity: favLoading ? 0.5 : 1,
                    transition: 'transform 0.2s',
                    transform: isFavorite ? 'scale(1.1)' : 'scale(1)',
                  }}
                  title={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill={isFavorite ? '#e3c77f' : 'none'} stroke="#e3c77f" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </button>
                <div>
                  <div className="stock-symbol" style={{ fontSize: '1.5rem' }}>{stockData.displaySymbol || stockData.symbol}</div>
                  <div style={{ color: 'var(--text-dim)' }}>{stockData.name}</div>
                  {stockData.exchange && (
                    <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '4px' }}>
                      {stockData.exchange} • {stockData.currency || 'USD'}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stock-price">{currSymbol}{convertedPrice}</div>
                <div className={stockData.change >= 0 ? 'change-positive' : 'change-negative'}>
                  {stockData.change >= 0 ? '+' : ''}{stockData.change?.toFixed(2)}% сегодня
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ background: 'var(--bg-dark)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-dim)' }}>Откр.</div>
                <div>{currSymbol}{convertFrom(stockData.open, stockData.currency)?.toFixed(2)}</div>
              </div>
              <div style={{ background: 'var(--bg-dark)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-dim)' }}>Макс.</div>
                <div>{currSymbol}{convertFrom(stockData.high, stockData.currency)?.toFixed(2)}</div>
              </div>
              <div style={{ background: 'var(--bg-dark)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-dim)' }}>Мин.</div>
                <div>{currSymbol}{convertFrom(stockData.low, stockData.currency)?.toFixed(2)}</div>
              </div>
              <div style={{ background: 'var(--bg-dark)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-dim)' }}>Объём</div>
                <div>{stockData.volume ? (stockData.volume / 1000000).toFixed(1) + 'M' : '-'}</div>
              </div>
            </div>

            {/* Chart controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
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
              
              {/* Chart type toggle */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setChartType('line')}
                  style={{
                    padding: '6px 12px',
                    background: chartType === 'line' ? 'var(--accent)' : 'var(--bg-dark)',
                    color: chartType === 'line' ? 'var(--bg-dark)' : 'var(--text-dim)',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                  }}
                  title="Линейный график"
                >📈</button>
                <button
                  onClick={() => setChartType('candle')}
                  style={{
                    padding: '6px 12px',
                    background: chartType === 'candle' ? 'var(--accent)' : 'var(--bg-dark)',
                    color: chartType === 'candle' ? 'var(--bg-dark)' : 'var(--text-dim)',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                  }}
                  title="Японские свечи"
                >🕯️</button>
              </div>
            </div>

            <div style={{ height: '280px', marginBottom: '20px' }}>
              {chartLoading ? (
                <Skeleton width="100%" height="280px" />
              ) : (
                <StockChart 
                  key={`${chartType}-${chartPeriod}`} 
                  data={chartHistory} 
                  chartType={chartType} 
                />
              )}
            </div>

            {user && onUpdate && (
              <>
                {userPosition && (
                  <p style={{ color: 'var(--text-dim)', marginBottom: '16px' }}>
                    У вас: {userPosition.quantity} шт. по {currSymbol}{convertFrom(userPosition.avg_price, stockData.currency)?.toFixed(2)}
                  </p>
                )}
                <div className="flex gap-2 mb-4">
                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1" placeholder="Кол-во" />
                </div>
                <p style={{ color: 'var(--text-dim)', marginBottom: '16px' }}>
                  Сумма: {currSymbol}{(convertFrom(stockData.price, stockData.currency) * parseFloat(quantity || 0))?.toFixed(2)}
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
export function StockLink({ symbol, children, user, onUpdate, isFavorite, onFavoriteToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span 
        onClick={() => setOpen(true)}
        style={{ cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline' }}
      >
        {children || symbol}
      </span>
      {open && (
        <StockModal 
          symbol={symbol} 
          onClose={() => setOpen(false)} 
          user={user} 
          onUpdate={onUpdate}
          isFavorite={isFavorite}
          onFavoriteToggle={onFavoriteToggle}
        />
      )}
    </>
  );
}
