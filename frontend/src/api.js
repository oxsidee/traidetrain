import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

export const getToken = () => localStorage.getItem('token');

export const api = {
  register: (data) => API.post('/register', data),
  login: (data) => API.post('/login', data),
  getMe: () => API.get(`/me?token=${getToken()}`),
  deposit: (amount) => API.post(`/deposit?token=${getToken()}`, { amount }),
  getStocks: () => API.get('/stocks'),
  getStock: (symbol) => API.get(`/stock/${symbol}`),
  getStockHistory: (symbol, period) => API.get(`/stock/${symbol}/history?period=${period}`),
  getQuote: (symbol) => API.get(`/quote/${symbol}`),
  searchStocks: (q) => API.get(`/search?q=${encodeURIComponent(q)}`),
  getCurrencies: () => API.get('/currencies'),
  getMarkets: () => API.get('/markets'),
  trade: (data) => API.post(`/trade?token=${getToken()}`, data),
  getTransactions: () => API.get(`/transactions?token=${getToken()}`),
  getReport: () => API.get(`/report?token=${getToken()}`),
};
