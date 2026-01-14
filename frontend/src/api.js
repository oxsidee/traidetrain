import axios from 'axios';

const API = axios.create({ baseURL: '/api' });

export const getToken = () => localStorage.getItem('token');

export const api = {
  register: (data) => API.post('/register', data),
  login: (data) => API.post('/login', data),
  getMe: () => API.get(`/me?token=${getToken()}`),
  deposit: (amount) => API.post(`/deposit?token=${getToken()}`, { amount }),
  getStocks: (category = 'default', limit = 15, offset = 0) => API.get(`/stocks?category=${category}&limit=${limit}&offset=${offset}`),
  getStock: (symbol) => API.get(`/stock/${symbol}`),
  getStockHistory: (symbol, period) => API.get(`/stock/${symbol}/history?period=${period}`),
  getQuote: (symbol) => API.get(`/quote/${symbol}`),
  searchStocks: (q) => API.get(`/search?q=${encodeURIComponent(q)}`),
  getCurrencies: () => API.get('/currencies'),
  getMarkets: () => API.get('/markets'),
  trade: (data) => API.post(`/trade?token=${getToken()}`, data),
  getTransactions: () => API.get(`/transactions?token=${getToken()}`),
  getReport: () => API.get(`/report?token=${getToken()}`),
  getIndices: () => API.get('/indices'),
  // Account
  updateUsername: (new_username) => API.put(`/account/username?token=${getToken()}`, { new_username }),
  updatePassword: (current_password, new_password) => API.put(`/account/password?token=${getToken()}`, { current_password, new_password }),
  updateDisplayName: (display_name) => API.put(`/account/display_name?token=${getToken()}`, { display_name }),
  // Favorites
  getFavorites: () => API.get(`/favorites?token=${getToken()}`),
  getFavoriteStocks: (limit = 15, offset = 0) => API.get(`/favorites/stocks?token=${getToken()}&limit=${limit}&offset=${offset}`),
  addFavorite: (symbol) => API.post(`/favorites?token=${getToken()}`, { symbol }),
  removeFavorite: (symbol) => API.delete(`/favorites/${encodeURIComponent(symbol)}?token=${getToken()}`),
};
