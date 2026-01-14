import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useCurrency } from '../CurrencyContext';
import { StockLink } from '../components/StockModal';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from 'recharts';

const COLORS = ['#00d4aa', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function Skeleton({ width = '100%', height = '20px' }) {
  return <div className="skeleton" style={{ width, height, borderRadius: '4px' }} />;
}

function StatCard({ title, value, subValue, trend, icon, color }) {
  return (
    <div className="card" style={{ 
      background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(0,212,170,0.05) 100%)',
      border: '1px solid var(--border)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ 
        position: 'absolute', 
        top: '-20px', 
        right: '-20px', 
        fontSize: '80px', 
        opacity: 0.05,
      }}>{icon}</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '13px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        {title}
      </div>
      <div style={{ 
        fontSize: '1.8rem', 
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: '600',
        color: color || 'var(--text)',
      }}>
        {value}
      </div>
      {subValue && (
        <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>
          {subValue}
        </div>
      )}
      {trend !== undefined && (
        <div style={{ 
          fontSize: '13px', 
          marginTop: '8px',
          color: trend >= 0 ? 'var(--green)' : 'var(--red)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span>{trend >= 0 ? '↑' : '↓'}</span>
          {Math.abs(trend).toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function IndexCard({ index }) {
  if (!index.price) return null;
  return (
    <div style={{ 
      background: 'var(--bg-card)', 
      padding: '12px 16px', 
      borderRadius: '10px',
      border: '1px solid var(--border)',
      minWidth: '140px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>{index.name}</div>
      <div style={{ fontSize: '16px', fontFamily: 'JetBrains Mono', fontWeight: '600' }}>
        {index.price?.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
      </div>
      <div style={{ 
        fontSize: '12px', 
        color: index.change >= 0 ? 'var(--green)' : 'var(--red)',
      }}>
        {index.change >= 0 ? '+' : ''}{index.change?.toFixed(2)}%
      </div>
    </div>
  );
}

export default function Dashboard({ user, onUpdate }) {
  const [amount, setAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [indices, setIndices] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const { format, convert, rates, currencies, symbol } = useCurrency();

  const fetchData = useCallback(async () => {
    try {
      const [reportRes, txRes, indicesRes] = await Promise.all([
        api.getReport(),
        api.getTransactions(),
        api.getIndices(),
      ]);
      setReport(reportRes.data);
      setTransactions(txRes.data?.slice(0, 5) || []);
      setIndices(indicesRes.data || []);
    } catch (err) {
      console.error('Dashboard data error:', err);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) === 0) return;
    setLoading(true);
    try {
      let usdAmount = parseFloat(amount);
      if (depositCurrency !== 'USD' && rates[depositCurrency]) {
        usdAmount = parseFloat(amount) / rates[depositCurrency];
      }
      await api.deposit(usdAmount);
      setAmount('');
      onUpdate();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Ошибка');
    }
    setLoading(false);
  };

  // Calculate metrics
  const totalPortfolioValue = (report?.total_current || 0) + user.balance;
  const totalProfit = report?.total_profit || 0;
  const profitPercent = report?.total_invested > 0 ? (totalProfit / report.total_invested * 100) : 0;
  
  // Best and worst performers
  const sortedHoldings = [...(report?.holdings || [])].sort((a, b) => b.profit_percent - a.profit_percent);
  const bestPerformer = sortedHoldings[0];
  const worstPerformer = sortedHoldings[sortedHoldings.length - 1];

  // Pie chart data
  const pieData = report?.holdings?.map(h => ({
    name: h.displaySymbol,
    value: h.current,
  })) || [];

  if (pieData.length > 0) {
    pieData.push({ name: 'Кэш', value: user.balance });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '4px' }}>Добро пожаловать, {user.display_name || user.username}!</h1>
        <p style={{ color: 'var(--text-dim)' }}>Обзор вашего инвестиционного портфеля</p>
      </div>

      {/* Market Indices Ticker */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '24px', 
        overflowX: 'auto',
        paddingBottom: '4px',
      }}>
        {dataLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} style={{ minWidth: '140px' }}>
              <Skeleton width="140px" height="70px" />
            </div>
          ))
        ) : (
          indices.map(idx => <IndexCard key={idx.symbol} index={idx} />)
        )}
      </div>

      {/* Main Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
        gap: '16px',
        marginBottom: '24px',
      }}>
        {dataLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="card">
              <Skeleton width="100px" height="14px" />
              <div style={{ marginTop: '12px' }}><Skeleton width="150px" height="32px" /></div>
              <div style={{ marginTop: '8px' }}><Skeleton width="80px" height="14px" /></div>
            </div>
          ))
        ) : (
          <>
            <StatCard 
              title="Общая стоимость" 
              value={format(totalPortfolioValue)}
              subValue={`Портфель: ${format(report?.total_current || 0)}`}
              icon="💼"
              color="var(--accent)"
            />
            <StatCard 
              title="Свободные средства" 
              value={format(user.balance)}
              subValue={`${totalPortfolioValue > 0 ? ((user.balance / totalPortfolioValue) * 100).toFixed(1) : 0}% от общей стоимости`}
              icon="💰"
            />
            <StatCard 
              title="Нереализованная P&L" 
              value={format(totalProfit)}
              trend={profitPercent}
              icon={totalProfit >= 0 ? '📈' : '📉'}
              color={totalProfit >= 0 ? 'var(--green)' : 'var(--red)'}
            />
            <StatCard 
              title="Инвестировано" 
              value={format(report?.total_invested || 0)}
              subValue={`${report?.holdings?.length || 0} позиций`}
              icon="🎯"
            />
          </>
        )}
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        
        {/* Portfolio Allocation */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🥧</span> Распределение активов
          </h3>
          {dataLoading ? (
            <Skeleton width="100%" height="200px" />
          ) : pieData.length > 0 ? (
            <div style={{ height: '220px' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ background: '#131a29', border: '1px solid #2a3545', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(val) => format(val)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
                {pieData.map((item, i) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: COLORS[i % COLORS.length] }} />
                    <span style={{ color: 'var(--text-dim)' }}>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>📊</div>
              <p>Портфель пуст</p>
            </div>
          )}
        </div>

        {/* Best/Worst Performers */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏆</span> Лидеры портфеля
          </h3>
          {dataLoading ? (
            <div>
              <Skeleton width="100%" height="60px" />
              <div style={{ marginTop: '12px' }}><Skeleton width="100%" height="60px" /></div>
            </div>
          ) : bestPerformer ? (
            <div>
              <div style={{ 
                background: 'rgba(0, 212, 170, 0.1)', 
                border: '1px solid rgba(0, 212, 170, 0.2)',
                borderRadius: '10px', 
                padding: '14px',
                marginBottom: '12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--green)', marginBottom: '4px' }}>🚀 Лучшая позиция</div>
                    <StockLink symbol={bestPerformer.symbol} user={user} onUpdate={onUpdate}>
                      <span style={{ fontSize: '18px', fontWeight: '600' }}>{bestPerformer.displaySymbol}</span>
                    </StockLink>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--green)', fontSize: '18px', fontWeight: '600' }}>
                      +{bestPerformer.profit_percent.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      {format(bestPerformer.profit)}
                    </div>
                  </div>
                </div>
              </div>
              
              {worstPerformer && worstPerformer.symbol !== bestPerformer.symbol && (
                <div style={{ 
                  background: 'rgba(255, 71, 87, 0.1)', 
                  border: '1px solid rgba(255, 71, 87, 0.2)',
                  borderRadius: '10px', 
                  padding: '14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '4px' }}>📉 Худшая позиция</div>
                      <StockLink symbol={worstPerformer.symbol} user={user} onUpdate={onUpdate}>
                        <span style={{ fontSize: '18px', fontWeight: '600' }}>{worstPerformer.displaySymbol}</span>
                      </StockLink>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--red)', fontSize: '18px', fontWeight: '600' }}>
                        {worstPerformer.profit_percent.toFixed(2)}%
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                        {format(worstPerformer.profit)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>🏁</div>
              <p>Нет позиций для анализа</p>
            </div>
          )}
        </div>
      </div>

      {/* Deposit & Recent Transactions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Quick Deposit */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💳</span> Пополнение счёта
          </h3>
          <div className="flex gap-2" style={{ marginBottom: '12px' }}>
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
              {loading ? '...' : 'Внести'}
            </button>
          </div>
          {amount && depositCurrency !== 'USD' && rates[depositCurrency] && (
            <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
              ≈ ${(parseFloat(amount) / rates[depositCurrency]).toFixed(2)} USD
            </p>
          )}
          
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[100, 500, 1000, 5000].map(val => (
                <button
                  key={val}
                  onClick={() => setAmount(String(val))}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  +{val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📜</span> Последние операции
          </h3>
          {dataLoading ? (
            <div>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ marginBottom: '12px' }}><Skeleton width="100%" height="40px" /></div>
              ))}
            </div>
          ) : transactions.length > 0 ? (
            <div>
              {transactions.map((tx, i) => (
                <div key={i} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: i < transactions.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: tx.action === 'buy' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(255, 71, 87, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                    }}>
                      {tx.action === 'buy' ? '📥' : '📤'}
                    </div>
                    <div>
                      <div style={{ fontWeight: '500' }}>{tx.displaySymbol}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                        {tx.quantity} шт. × {format(tx.price)}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      fontWeight: '500',
                      color: tx.action === 'buy' ? 'var(--red)' : 'var(--green)',
                    }}>
                      {tx.action === 'buy' ? '-' : '+'}{format(tx.total)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      {new Date(tx.date).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '30px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>📋</div>
              <p>Операций пока нет</p>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Holdings Table */}
      {report?.holdings?.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋</span> Состав портфеля
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Актив</th>
                  <th>Кол-во</th>
                  <th>Ср. цена</th>
                  <th>Текущая</th>
                  <th>Стоимость</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {report.holdings.map((h) => (
                  <tr key={h.symbol}>
                    <td>
                      <StockLink symbol={h.symbol} user={user} onUpdate={onUpdate}>
                        <span style={{ fontWeight: '500' }}>{h.displaySymbol}</span>
                      </StockLink>
                    </td>
                    <td>{h.quantity}</td>
                    <td>{format(h.avg_price)}</td>
                    <td>{format(h.current_price)}</td>
                    <td>{format(h.current)}</td>
                    <td className={h.profit >= 0 ? 'change-positive' : 'change-negative'}>
                      {h.profit >= 0 ? '+' : ''}{format(h.profit)} ({h.profit_percent.toFixed(1)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
