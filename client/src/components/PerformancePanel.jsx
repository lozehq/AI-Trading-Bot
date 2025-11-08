import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { TrendingUp, Award, BarChart3, DollarSign } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function PerformancePanel() {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformance();
    const interval = setInterval(fetchPerformance, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPerformance = async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        axios.get('/api/trading/performance'),
        axios.get('/api/trading/history?limit=20')
      ]);
      
      setStats(statsRes.data.data);
      setHistory(historyRes.data.data);
      setLoading(false);
    } catch (error) {
      console.error('获取表现数据失败:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-primary border-t-transparent" />
      </div>
    );
  }

  const performanceCards = [
    {
      label: '总交易次数',
      value: stats?.totalTrades || 0,
      icon: BarChart3,
      color: 'blue'
    },
    {
      label: '胜率',
      value: `${stats?.winRate || 0}%`,
      icon: Award,
      color: 'green'
    },
    {
      label: '总盈亏',
      value: `$${stats?.totalProfit || 0}`,
      icon: DollarSign,
      color: stats?.totalProfit >= 0 ? 'green' : 'red'
    },
    {
      label: '当前余额',
      value: `$${stats?.currentBalance || 10000}`,
      icon: TrendingUp,
      color: 'purple'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Performance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {performanceCards.map((card, index) => (
          <div key={index} className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-dark-muted">{card.label}</span>
              <card.icon className={`w-5 h-5 text-${card.color}-500`} />
            </div>
            <div className="text-2xl font-bold font-mono">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h4 className="text-sm text-dark-muted mb-2">盈利交易</h4>
          <div className="text-xl font-bold text-accent-success">{stats?.wins || 0}</div>
          <div className="text-sm text-dark-muted mt-1">
            平均盈利: ${stats?.averageWin || 0}
          </div>
        </div>
        
        <div className="card">
          <h4 className="text-sm text-dark-muted mb-2">亏损交易</h4>
          <div className="text-xl font-bold text-accent-danger">{stats?.losses || 0}</div>
          <div className="text-sm text-dark-muted mt-1">
            平均亏损: ${stats?.averageLoss || 0}
          </div>
        </div>
        
        <div className="card">
          <h4 className="text-sm text-dark-muted mb-2">当前持仓</h4>
          <div className="text-xl font-bold">{stats?.openPositions || 0}</div>
          <div className="text-sm text-dark-muted mt-1">
            活跃仓位
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">资金曲线</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={generateEquityCurve(stats?.currentBalance, history)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f29" />
            <XAxis dataKey="date" stroke="#71717a" />
            <YAxis stroke="#71717a" />
            <Tooltip
              contentStyle={{ backgroundColor: '#13131a', border: '1px solid #1f1f29' }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, '余额']}
            />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Trade History */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">交易历史</h3>
        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left py-2 px-3 text-sm text-dark-muted">时间</th>
                  <th className="text-left py-2 px-3 text-sm text-dark-muted">交易对</th>
                  <th className="text-left py-2 px-3 text-sm text-dark-muted">方向</th>
                  <th className="text-left py-2 px-3 text-sm text-dark-muted">价格</th>
                  <th className="text-left py-2 px-3 text-sm text-dark-muted">状态</th>
                </tr>
              </thead>
              <tbody>
                {history.map((trade, index) => (
                  <tr key={index} className="border-b border-dark-border hover:bg-dark-bg transition-colors">
                    <td className="py-3 px-3 text-sm">
                      {new Date(trade.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold">{trade.symbol}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        trade.side === 'BUY' 
                          ? 'bg-accent-success/20 text-accent-success'
                          : 'bg-accent-danger/20 text-accent-danger'
                      }`}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono">${trade.entryPrice?.toFixed(2)}</td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-dark-muted">{trade.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-dark-muted">
            暂无交易记录
          </div>
        )}
      </div>
    </div>
  );
}

// 生成资金曲线数据（基于历史盈亏归纳，保证最后一点等于当前余额）
function generateEquityCurve(currentBalance = 10000, history = []) {
  const DAYS = 30;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const trades = Array.isArray(history) ? history : [];
  // 仅统计已平仓且有profit的记录
  const closed = trades.filter(t => t.status === 'closed' && typeof t.profit === 'number');

  // 计算最近30天每日盈亏
  const dailyPnl = new Array(DAYS).fill(0);
  closed.forEach(t => {
    const ts = new Date(t.timestamp).getTime();
    const dayIndex = Math.floor((now - ts) / dayMs);
    if (dayIndex >= 0 && dayIndex < DAYS) {
      dailyPnl[DAYS - 1 - dayIndex] += t.profit; // 从左到右时间递增
    }
  });

  // 使曲线最后一点等于当前余额
  const totalPnl = dailyPnl.reduce((a, b) => a + b, 0);
  let balance = Number(currentBalance) - totalPnl;
  if (!isFinite(balance)) balance = 10000;

  const data = [];
  for (let i = 0; i < DAYS; i++) {
    const labelDate = new Date(now - (DAYS - 1 - i) * dayMs);
    balance += dailyPnl[i];
    data.push({
      date: `Day ${i + 1}`,
      balance: Math.max(balance, 0)
    });
  }

  // 如果历史为空，则生成恒定余额曲线
  if (closed.length === 0) {
    return new Array(DAYS).fill(0).map((_, i) => ({
      date: `Day ${i + 1}`,
      balance: Number(currentBalance) || 10000
    }));
  }

  return data;
}

export default PerformancePanel;

