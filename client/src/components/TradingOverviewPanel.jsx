import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  TrendingUp, TrendingDown, Award, BarChart3, DollarSign, 
  Clock, X, Activity, Target, AlertCircle 
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function TradingOverviewPanel() {
  const [positions, setPositions] = useState([]);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, positions, history
  const [tradingMode, setTradingMode] = useState(() => {
    return localStorage.getItem('tradingMode') || 'paper';
  });
  const [okxBalance, setOkxBalance] = useState(null);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 10000);
    
    // 监听交易模式切换
    const handleModeChange = (e) => {
      setTradingMode(e.detail.mode);
      fetchAllData(); // 重新获取数据
    };
    window.addEventListener('tradingModeChanged', handleModeChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('tradingModeChanged', handleModeChange);
    };
  }, []);

  const fetchAllData = async () => {
    try {
      if (tradingMode === 'paper') {
        // Paper模式：使用原有模拟数据
        const [positionsRes, statsRes, historyRes] = await Promise.all([
          axios.get('/api/trading/positions'),
          axios.get('/api/trading/performance'),
          axios.get('/api/trading/history?limit=20')
        ]);
        setPositions(positionsRes.data.data || []);
        setStats(statsRes.data.data);
        setHistory(historyRes.data.data || []);
        setOkxBalance(null);
      } else {
        // Demo/Live模式：获取真实OKX数据
        const [balanceRes, openOrdersRes, historyRes] = await Promise.all([
          axios.get(`/api/okx/trade/balance?mode=${tradingMode}`).catch(err => {
          console.warn('获取余额失败:', err.response?.data?.error || err.message);
          return { data: { data: { paper: false, total: {}, free: {}, used: {} } } };
          }),
          axios.get(`/api/okx/trade/open-orders?mode=${tradingMode}`).catch(err => {
          console.warn('获取未成交订单失败:', err.response?.data?.error || err.message);
          return { data: { data: [] } };
          }),
          axios.get(`/api/okx/trade/closed-orders?limit=20&mode=${tradingMode}`).catch(err => {
          console.warn('获取历史订单失败:', err.response?.data?.error || err.message);
          return { data: { data: [] } };
          })
        ]);
        
        const balance = balanceRes.data.data;
        setOkxBalance(balance);
        
        // 转换OKX订单格式为positions
        const orders = openOrdersRes.data.data || [];
        setPositions(orders.map(o => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          entryPrice: o.price,
          amount: o.amount,
          timestamp: o.timestamp,
          status: o.status
        })));
        
        // 计算统计
        const closedOrders = historyRes.data.data || [];
        setHistory(closedOrders);
        
        // 简单统计（可优化）
        const totalBalance = Object.values(balance.total || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
        setStats({
          totalTrades: closedOrders.length,
          wins: 0,
          losses: 0,
          winRate: 0,
          totalProfit: 0,
          currentBalance: totalBalance,
          openPositions: orders.length
        });
      }
      setLoading(false);
    } catch (error) {
      console.error('获取交易数据失败:', error);
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

  // 安全地转换数值
  const totalProfit = Number(stats?.totalProfit) || 0;
  const currentBalance = Number(stats?.currentBalance) || 10000;
  const winRate = Number(stats?.winRate) || 0;

  const performanceCards = [
    {
      label: '当前持仓',
      value: positions.length,
      icon: Activity,
      color: 'blue',
      subtext: `${stats?.openPositions || 0} 个活跃仓位`
    },
    {
      label: '总交易次数',
      value: stats?.totalTrades || 0,
      icon: BarChart3,
      color: 'purple',
      subtext: `胜率 ${winRate.toFixed(1)}%`
    },
    {
      label: '总盈亏',
      value: `$${totalProfit.toFixed(2)}`,
      icon: DollarSign,
      color: totalProfit >= 0 ? 'green' : 'red',
      subtext: totalProfit >= 0 ? '盈利中' : '亏损中'
    },
    {
      label: '当前余额',
      value: `$${currentBalance.toFixed(2)}`,
      icon: TrendingUp,
      color: 'green',
      subtext: '账户总额'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex space-x-2 border-b border-dark-border">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-dark-muted hover:text-white'
          }`}
        >
          📊 总览
        </button>
        <button
          onClick={() => setActiveTab('positions')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'positions'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-dark-muted hover:text-white'
          }`}
        >
          💼 持仓 {positions.length > 0 && `(${positions.length})`}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-accent-primary border-b-2 border-accent-primary'
              : 'text-dark-muted hover:text-white'
          }`}
        >
          📜 历史
        </button>
      </div>

      {/* Performance Stats - Always Visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {performanceCards.map((card, index) => (
          <div key={index} className="card hover:border-accent-primary/50 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-dark-muted">{card.label}</span>
              <card.icon className={`w-5 h-5 text-${card.color}-500`} />
            </div>
            <div className="text-2xl font-bold font-mono mb-1">{card.value}</div>
            <div className="text-xs text-dark-muted">{card.subtext}</div>
          </div>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Current Positions Summary */}
          {positions.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-accent-primary" />
                当前持仓
              </h3>
              <div className="space-y-3">
                {positions.slice(0, 3).map((position) => (
                  <div key={position.id} className="flex items-center justify-between p-3 bg-dark-bg rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded flex items-center justify-center ${
                        position.side === 'BUY' ? 'bg-accent-success/20' : 'bg-accent-danger/20'
                      }`}>
                        {position.side === 'BUY' ? (
                          <TrendingUp className="w-4 h-4 text-accent-success" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-accent-danger" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold">{position.symbol}</div>
                        <div className="text-xs text-dark-muted">
                          入场: ${Number(position.entryPrice || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono">{Number(position.amount || 0).toFixed(4)}</div>
                      <div className="text-xs text-dark-muted">置信度: {position.confidence}%</div>
                    </div>
                  </div>
                ))}
                {positions.length > 3 && (
                  <button
                    onClick={() => setActiveTab('positions')}
                    className="w-full text-center text-sm text-accent-primary hover:text-accent-primary/80 py-2"
                  >
                    查看全部 {positions.length} 个持仓 →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Detailed Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <h4 className="text-sm text-dark-muted mb-2 flex items-center">
                <Award className="w-4 h-4 mr-1" />
                盈利交易
              </h4>
              <div className="text-xl font-bold text-accent-success">{stats?.wins || 0}</div>
              <div className="text-sm text-dark-muted mt-1">
                平均盈利: ${Number(stats?.averageWin || 0).toFixed(2)}
              </div>
            </div>

            <div className="card">
              <h4 className="text-sm text-dark-muted mb-2 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                亏损交易
              </h4>
              <div className="text-xl font-bold text-accent-danger">{stats?.losses || 0}</div>
              <div className="text-sm text-dark-muted mt-1">
                平均亏损: ${Number(stats?.averageLoss || 0).toFixed(2)}
              </div>
            </div>

            <div className="card">
              <h4 className="text-sm text-dark-muted mb-2 flex items-center">
                <Target className="w-4 h-4 mr-1" />
                盈亏比
              </h4>
              <div className="text-xl font-bold">
                {stats?.averageWin && stats?.averageLoss
                  ? (Math.abs(Number(stats.averageWin) / Number(stats.averageLoss))).toFixed(2)
                  : 'N/A'}
              </div>
              <div className="text-sm text-dark-muted mt-1">
                风险回报比
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
        </div>
      )}

      {activeTab === 'positions' && (
        <div className="space-y-4">
          {positions.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">暂无持仓</h3>
              <p className="text-dark-muted">开启自动交易或手动执行交易后，持仓将显示在这里</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {positions.map((position) => (
                <div key={position.id} className="card hover:border-accent-primary transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        position.side === 'BUY' ? 'bg-accent-success/20' : 'bg-accent-danger/20'
                      }`}>
                        {position.side === 'BUY' ? (
                          <TrendingUp className="w-5 h-5 text-accent-success" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-accent-danger" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-lg">{position.symbol}</div>
                        <div className="text-sm text-dark-muted flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(position.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <button className="text-dark-muted hover:text-accent-danger transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-dark-muted mb-1">入场价</div>
                      <div className="font-mono font-bold">${Number(position.entryPrice || 0).toFixed(2)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-dark-muted mb-1">数量</div>
                      <div className="font-mono font-bold">{Number(position.amount || 0).toFixed(4)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-dark-muted mb-1">止损</div>
                      <div className="font-mono font-bold text-accent-danger">
                        {position.stopLoss ? `$${Number(position.stopLoss).toFixed(2)}` : 'N/A'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-dark-muted mb-1">止盈</div>
                      <div className="font-mono font-bold text-accent-success">
                        {position.takeProfit ? `$${Number(position.takeProfit).toFixed(2)}` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-dark-border">
                    <div className="text-xs text-dark-muted mb-2">置信度: {position.confidence}%</div>
                    <div className="text-sm text-dark-muted">{position.reasoning}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
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
                      <td className="py-3 px-3 font-mono">${Number(trade.entryPrice || 0).toFixed(2)}</td>
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
      )}
    </div>
  );
}

// 生成资金曲线数据
function generateEquityCurve(currentBalance = 10000, history = []) {
  const DAYS = 30;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const trades = Array.isArray(history) ? history : [];
  const closed = trades.filter(t => t.status === 'closed' && typeof t.profit === 'number');

  const dailyPnl = new Array(DAYS).fill(0);
  closed.forEach(t => {
    const ts = new Date(t.timestamp).getTime();
    const dayIndex = Math.floor((now - ts) / dayMs);
    if (dayIndex >= 0 && dayIndex < DAYS) {
      dailyPnl[DAYS - 1 - dayIndex] += t.profit;
    }
  });

  const totalPnl = dailyPnl.reduce((a, b) => a + b, 0);
  let balance = Number(currentBalance) - totalPnl;
  if (!isFinite(balance)) balance = 10000;

  const data = [];
  for (let i = 0; i < DAYS; i++) {
    balance += dailyPnl[i];
    data.push({
      date: `Day ${i + 1}`,
      balance: Math.max(balance, 0)
    });
  }

  if (closed.length === 0) {
    return new Array(DAYS).fill(0).map((_, i) => ({
      date: `Day ${i + 1}`,
      balance: Number(currentBalance) || 10000
    }));
  }

  return data;
}

export default TradingOverviewPanel;

