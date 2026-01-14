import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useCurrency } from '../CurrencyContext';
import StockModal from '../components/StockModal';

const REFRESH_INTERVAL = 3000;
const PAGE_SIZE = 15;

const CATEGORIES = [
  { value: 'favorites', label: '⭐ Избранное', description: 'Ваши избранные акции' },
  { value: 'gainers', label: '🚀 Лидеры роста', description: 'Акции с наибольшим ростом' },
  { value: 'losers', label: '📉 Лидеры падения', description: 'Акции с наибольшим падением' },
  { value: 'active', label: '🔥 Самые активные', description: 'По объёму торгов' },
  { value: 'trending', label: '⚡ Трендовые', description: 'В тренде сегодня' },
];

function AnimatedPrice({ price }) {
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

function FavoriteStar({ symbol, isFavorite, onToggle }) {
  const [loading, setLoading] = useState(false);
  
  const handleClick = async (e) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      if (isFavorite) {
        await api.removeFavorite(symbol);
      } else {
        await api.addFavorite(symbol);
      }
      onToggle(symbol, !isFavorite);
    } catch (err) {
      console.error('Favorite toggle error:', err);
    }
    setLoading(false);
  };
  
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        background: 'none',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        padding: '4px',
        opacity: loading ? 0.5 : 1,
        transition: 'transform 0.2s, opacity 0.2s',
        transform: isFavorite ? 'scale(1.1)' : 'scale(1)',
      }}
      title={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill={isFavorite ? '#e3c77f' : 'none'} stroke="#e3c77f" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    </button>
  );
}

export default function Trading({ user, onUpdate }) {
  const { format, symbol, convertFrom } = useCurrency();
  const [stocks, setStocks] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [openExchanges, setOpenExchanges] = useState(new Set());
  const [category, setCategory] = useState('favorites');
  const [hasMore, setHasMore] = useState(false);
  const loadMoreRef = useRef(null);
  const isVisibleRef = useRef(true);
  const currentCategoryRef = useRef(category);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    currentCategoryRef.current = category;
  }, [category]);

  // Load user's favorites list
  const loadFavoritesList = useCallback(async () => {
    try {
      const { data } = await api.getFavorites();
      setFavorites(new Set(data || []));
    } catch (err) {
      console.error('Error loading favorites:', err);
    }
  }, []);

  // Check which exchanges are open
  const fetchMarketStatus = useCallback(async () => {
    try {
      const { data } = await api.getMarkets();
      const open = new Set(data.exchanges.filter(e => e.is_open).map(e => e.id));
      setOpenExchanges(open);
    } catch {}
  }, []);

  // Helper to check if stock's exchange is open
  const isExchangeOpen = useCallback((stock) => {
    const exchange = stock.exchange || '';
    if (exchange === 'MOEX' || stock.symbol?.includes('.ME')) return openExchanges.has('MOEX');
    if (exchange.includes('NASDAQ') || exchange === 'NMS') return openExchanges.has('NASDAQ');
    if (exchange.includes('NYSE') || exchange === 'NYQ') return openExchanges.has('NYSE');
    return openExchanges.has('NASDAQ') || openExchanges.has('NYSE');
  }, [openExchanges]);

  // Load initial stocks for category
  const loadInitialStocks = useCallback(async (cat) => {
    setLoading(true);
    setStocks([]);
    offsetRef.current = 0;
    setError(null);
    
    try {
      let data;
      if (cat === 'favorites') {
        const response = await api.getFavoriteStocks(PAGE_SIZE, 0);
        data = response.data;
      } else {
        const response = await api.getStocks(cat, PAGE_SIZE, 0);
        data = response.data;
      }
      
      const stocksArray = data.stocks || data || [];
      setStocks(stocksArray);
      setHasMore(data.has_more || false);
      offsetRef.current = stocksArray.length;
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки');
    }
    setLoading(false);
  }, []);

  // Load more stocks (append to existing)
  const loadMoreStocks = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    
    loadingRef.current = true;
    setLoadingMore(true);
    
    const cat = currentCategoryRef.current;
    const offset = offsetRef.current;
    
    try {
      let data;
      if (cat === 'favorites') {
        const response = await api.getFavoriteStocks(PAGE_SIZE, offset);
        data = response.data;
      } else {
        const response = await api.getStocks(cat, PAGE_SIZE, offset);
        data = response.data;
      }
      
      const newStocks = data.stocks || data || [];
      
      // Only append if still on same category
      if (currentCategoryRef.current === cat && newStocks.length > 0) {
        setStocks(prev => [...prev, ...newStocks]);
        setHasMore(data.has_more || false);
        offsetRef.current = offset + newStocks.length;
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('Load more error:', err);
    }
    
    loadingRef.current = false;
    setLoadingMore(false);
  }, [hasMore]);

  // Toggle favorite handler
  const handleFavoriteToggle = useCallback((stockSymbol, isFavorite) => {
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (isFavorite) {
        newSet.add(stockSymbol);
      } else {
        newSet.delete(stockSymbol);
        // If on favorites tab, remove from visible list
        if (currentCategoryRef.current === 'favorites') {
          setStocks(prevStocks => prevStocks.filter(s => s.symbol !== stockSymbol));
        }
      }
      return newSet;
    });
  }, []);

  // Refresh prices for open exchanges
  const refreshOpenStocks = useCallback(async () => {
    if (!isVisibleRef.current || stocks.length === 0) return;
    
    const symbolsToUpdate = stocks.filter(s => isExchangeOpen(s)).map(s => s.symbol);
    if (symbolsToUpdate.length === 0) return;
    
    for (const sym of symbolsToUpdate) {
      try {
        const { data } = await api.getQuote(sym);
        setStocks(prev => prev.map(s => 
          s.symbol === sym ? { ...s, price: data.price, change: data.change } : s
        ));
      } catch {}
    }
    setLastUpdate(new Date());
  }, [stocks, isExchangeOpen]);

  // Initial load
  useEffect(() => {
    loadFavoritesList();
    fetchMarketStatus();
  }, [loadFavoritesList, fetchMarketStatus]);

  // Category change
  useEffect(() => {
    loadInitialStocks(category);
  }, [category, loadInitialStocks]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (loading || !hasMore) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          loadMoreStocks();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [loading, hasMore, loadingMore, loadMoreStocks]);

  // Visibility change handler
  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
      if (isVisibleRef.current) {
        fetchMarketStatus();
        refreshOpenStocks();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchMarketStatus, refreshOpenStocks]);

  // Periodic price refresh
  useEffect(() => {
    const interval = setInterval(() => {
      if (openExchanges.size > 0) {
        refreshOpenStocks();
      }
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refreshOpenStocks, openExchanges]);

  // Refresh market status every minute
  useEffect(() => {
    const marketInterval = setInterval(fetchMarketStatus, 60000);
    return () => clearInterval(marketInterval);
  }, [fetchMarketStatus]);

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

  const openStock = (sym) => {
    setSelected(sym);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1>Торговля акциями</h1>
          <p style={{ color: 'var(--text-dim)' }}>
            Баланс: <span style={{ color: 'var(--accent)' }}>{format(user.balance)}</span>
          </p>
        </div>
        {lastUpdate && (
          <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
            Обновлено: {lastUpdate.toLocaleTimeString('ru-RU')}
          </p>
        )}
      </div>

      {/* Category tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '20px', 
        overflowX: 'auto',
        paddingBottom: '4px',
      }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            title={cat.description}
            style={{
              padding: '10px 16px',
              background: category === cat.value ? 'var(--accent)' : 'var(--bg-card)',
              color: category === cat.value ? 'var(--bg-dark)' : 'var(--text)',
              border: category === cat.value ? 'none' : '1px solid var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: category === cat.value ? '600' : '400',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {cat.label}
          </button>
        ))}
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
                  <span className="stock-symbol">{r.displaySymbol || r.symbol}</span>
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
          {[...Array(12)].map((_, i) => (
            <div key={i} className="stock-card">
              <Skeleton width="60px" height="20px" />
              <div style={{ marginTop: '8px' }}><Skeleton width="120px" height="14px" /></div>
              <div style={{ marginTop: '16px' }}><Skeleton width="80px" height="28px" /></div>
              <div style={{ marginTop: '8px' }}><Skeleton width="50px" height="14px" /></div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {category === 'favorites' && stocks.length === 0 && !loading && (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px', 
              color: 'var(--text-dim)',
              background: 'var(--bg-card)',
              borderRadius: '12px',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⭐</div>
              <h3 style={{ marginBottom: '8px', color: 'var(--text)' }}>Нет избранных акций</h3>
              <p>Добавляйте акции в избранное, нажимая на звёздочку ☆</p>
            </div>
          )}
          
          <div className="stock-grid">
            {stocks.map((stock, index) => {
              const convertedPrice = convertFrom(stock.price, stock.currency);
              const isFav = favorites.has(stock.symbol) || stock.isFavorite;
              return (
                <div 
                  key={`${stock.symbol}-${index}`} 
                  className="stock-card" 
                  onClick={() => openStock(stock.symbol)}
                  style={{ position: 'relative' }}
                >
                  <FavoriteStar 
                    symbol={stock.symbol} 
                    isFavorite={isFav} 
                    onToggle={handleFavoriteToggle}
                  />
                  <div className="stock-symbol">{stock.displaySymbol || stock.symbol}</div>
                  <div className="stock-name">{stock.name}</div>
                  {stock.price !== null ? (
                    <>
                      <div className="stock-price">
                        {symbol}<AnimatedPrice price={convertedPrice} />
                      </div>
                      <div className={stock.change >= 0 ? 'change-positive' : 'change-negative'}>
                        {stock.change >= 0 ? '+' : ''}{stock.change?.toFixed(2)}% сегодня
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: '12px' }}><Skeleton width="80px" height="24px" /></div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Load more trigger */}
          {hasMore && (
            <div 
              ref={loadMoreRef}
              style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                padding: '20px',
                marginTop: '20px',
              }}
            >
              {loadingMore ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-dim)' }}>
                  <div className="skeleton" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                  Загрузка...
                </div>
              ) : (
                <button 
                  onClick={loadMoreStocks}
                  className="btn btn-outline"
                  style={{ padding: '10px 24px' }}
                >
                  Загрузить ещё
                </button>
              )}
            </div>
          )}
          
          {!hasMore && stocks.length > 0 && category !== 'favorites' && (
            <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>
              Показаны все акции в категории
            </p>
          )}
        </>
      )}

      {/* Stock Modal */}
      {selected && (
        <StockModal 
          symbol={selected} 
          onClose={() => setSelected(null)} 
          user={user} 
          onUpdate={onUpdate}
          isFavorite={favorites.has(selected)}
          onFavoriteToggle={handleFavoriteToggle}
        />
      )}
    </div>
  );
}
