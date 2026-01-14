import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

const CurrencyContext = createContext();

const CURRENCY_SYMBOLS = {
  USD: '$',
  RUB: '₽',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
};

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(localStorage.getItem('currency') || 'USD');
  const [rates, setRates] = useState({ USD: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCurrencies().then(({ data }) => {
      setRates(data);
      setLoading(false);
    }).catch(() => setLoading(false));
    
    // Refresh rates every 5 minutes
    const interval = setInterval(() => {
      api.getCurrencies().then(({ data }) => setRates(data)).catch(() => {});
    }, 300000);
    return () => clearInterval(interval);
  }, []);

  const changeCurrency = (newCurrency) => {
    setCurrency(newCurrency);
    localStorage.setItem('currency', newCurrency);
  };

  // Convert USD to selected currency
  const convert = useCallback((usdAmount) => {
    const rate = rates[currency] || 1;
    return usdAmount * rate;
  }, [rates, currency]);

  // Convert from any currency to selected currency
  const convertFrom = useCallback((amount, fromCurrency) => {
    if (!amount || !fromCurrency) return amount;
    const from = fromCurrency.toUpperCase();
    
    // If same currency, no conversion needed
    if (from === currency) return amount;
    
    // Convert to USD first, then to target
    let usdAmount = amount;
    if (from !== 'USD') {
      const fromRate = rates[from] || 1;
      usdAmount = amount / fromRate;
    }
    
    // Convert from USD to target
    const toRate = rates[currency] || 1;
    return usdAmount * toRate;
  }, [rates, currency]);

  // Format with currency symbol (converts from USD)
  const format = useCallback((usdAmount, decimals = 2) => {
    const converted = convert(usdAmount);
    const sym = CURRENCY_SYMBOLS[currency] || currency;
    return `${sym}${converted.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }, [convert, currency]);

  // Format in native currency (no conversion, just formatting)
  const formatNative = useCallback((amount, nativeCurrency, decimals = 2) => {
    const sym = CURRENCY_SYMBOLS[nativeCurrency] || nativeCurrency || '$';
    const val = amount || 0;
    return `${sym}${val.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }, []);

  // Format with conversion from native currency to selected
  const formatConverted = useCallback((amount, fromCurrency, decimals = 2) => {
    const converted = convertFrom(amount, fromCurrency);
    const sym = CURRENCY_SYMBOLS[currency] || currency;
    return `${sym}${converted.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }, [convertFrom, currency]);

  // Get symbol for a currency
  const getSymbol = useCallback((curr) => {
    return CURRENCY_SYMBOLS[curr] || curr || '$';
  }, []);

  return (
    <CurrencyContext.Provider value={{ 
      currency, 
      setCurrency: changeCurrency, 
      rates, 
      convert,
      convertFrom,
      format,
      formatNative,
      formatConverted,
      getSymbol,
      symbol: CURRENCY_SYMBOLS[currency],
      loading,
      currencies: Object.keys(CURRENCY_SYMBOLS),
    }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
