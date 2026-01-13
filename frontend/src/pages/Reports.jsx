import { useState, useEffect } from 'react';
import { api } from '../api';
import { useCurrency } from '../CurrencyContext';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#00d4aa', '#00a88a', '#007a66', '#00524a', '#ff4757', '#ff6b7a'];

function Skeleton({ width = '100%', height = '20px' }) {
  return <div className="skeleton" style={{ width, height }} />;
}

export default function Reports() {
  const { format, convert } = useCurrency();
  const [report, setReport] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getReport(),
      api.getTransactions()
    ]).then(([reportRes, txRes]) => {
      setReport(reportRes.data);
      setTransactions(txRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
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

  const pieData = report.holdings.map(h => ({
    name: h.symbol,
    value: convert(h.current)
  }));

  return (
    <div>
      <h1>Отчетность</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <div className="card">
          <p style={{ color: 'var(--text-dim)' }}>Баланс</p>
          <p style={{ fontSize: '1.5rem', color: 'var(--accent)', fontFamily: 'JetBrains Mono' }}>
            {format(report.balance)}
          </p>
        </div>
        <div className="card">
          <p style={{ color: 'var(--text-dim)' }}>Инвестировано</p>
          <p style={{ fontSize: '1.5rem', fontFamily: 'JetBrains Mono' }}>
            {format(report.total_invested)}
          </p>
        </div>
        <div className="card">
          <p style={{ color: 'var(--text-dim)' }}>Текущая стоимость</p>
          <p style={{ fontSize: '1.5rem', fontFamily: 'JetBrains Mono' }}>
            {format(report.total_current)}
          </p>
        </div>
        <div className="card">
          <p style={{ color: 'var(--text-dim)' }}>Прибыль/Убыток</p>
          <p style={{ 
            fontSize: '1.5rem', 
            fontFamily: 'JetBrains Mono',
            color: report.total_profit >= 0 ? 'var(--green)' : 'var(--red)'
          }}>
            {report.total_profit >= 0 ? '+' : ''}{format(report.total_profit)}
          </p>
        </div>
      </div>

      {report.holdings.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <h2>Состав портфеля</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
            <div style={{ height: '250px' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name }) => name}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ background: '#131a29', border: '1px solid #2a3545' }}
                    formatter={(val) => format(val)}
                  />
                </PieChart>
              </ResponsiveContainer>
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
                  <tr key={h.symbol}>
                    <td className="stock-symbol">{h.symbol}</td>
                    <td>{h.quantity}</td>
                    <td>{format(h.avg_price)}</td>
                    <td>{format(h.current_price)}</td>
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
                  <td className="stock-symbol">{t.symbol}</td>
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
    </div>
  );
}
