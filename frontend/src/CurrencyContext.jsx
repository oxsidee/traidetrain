import { createContext, useContext, useState, useEffect } from 'react';
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
  const convert = (usdAmount) => {
    const rate = rates[currency] || 1;
    return usdAmount * rate;
  };

  // Format with currency symbol
  const format = (usdAmount, decimals = 2) => {
    const converted = convert(usdAmount);
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${converted.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };

  return (
    <CurrencyContext.Provider value={{ 
      currency, 
      setCurrency: changeCurrency, 
      rates, 
      convert, 
      format,
      symbol: CURRENCY_SYMBOLS[currency],
      loading,
      currencies: Object.keys(CURRENCY_SYMBOLS),
    }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
