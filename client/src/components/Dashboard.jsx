import React, { useMemo, useState } from 'react';
import { LineChart, Line, AreaChart, Area, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Activity, DollarSign, Percent, RefreshCw } from 'lucide-react';

function Dashboard({ ticker, indicators, marketData, loading, ohlcv, error, onRefresh }) {
  const [timeRange, setTimeRange] = useState(24); // 默认显示24根K线
  // 加载中状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-primary border-t-transparent" />
        <p className="ml-4 text-dark-muted">正在获取实时数据...</p>
      </div>
    );
  }

  // 错误状态 - 显示错误但提供基础UI
  if (error || !ticker) {
    return (
      <div className="space-y-6 p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold mb-2">⚠️ 数据加载失败</h3>
              <p className="text-dark-muted text-sm mb-2">
                {error || '无法获取市场数据'}
              </p>
              <p className="text-dark-muted text-xs">
                💡 提示：请检查网络连接，或稍后重试。交易功能和AI分析不受影响。
              </p>
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="ml-4 p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
                title="刷新数据"
              >
                <RefreshCw className="w-5 h-5 text-red-400" />
              </button>
            )}
          </div>
        </div>
        
        {/* 显示基础UI框架 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-50">
          <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
            <h3 className="text-sm text-dark-muted mb-2">当前价格</h3>
            <p className="text-2xl font-bold text-white">---</p>
          </div>
          <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
            <h3 className="text-sm text-dark-muted mb-2">RSI (14)</h3>
            <p className="text-2xl font-bold text-white">---</p>
          </div>
          <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
            <h3 className="text-sm text-dark-muted mb-2">24h 交易量</h3>
            <p className="text-2xl font-bold text-white">---</p>
          </div>
        </div>
      </div>
    );
  }

  // 时间周期选项
  const timeRangeOptions = [
    { value: 12, label: '12根' },
    { value: 24, label: '24根' },
    { value: 50, label: '50根' },
    { value: 100, label: '100根' },
    { value: 200, label: '200根' },
    { value: -1, label: '全部' }
  ];

  // K线图表数据（根据选择的时间周期）
  const priceChartData = useMemo(() => {
    if (!ohlcv || ohlcv.length === 0) return [];

    const data = timeRange === -1 ? ohlcv : ohlcv.slice(-timeRange);

    return data.map((candle, index, array) => {
      const date = new Date(candle.timestamp);

      // 根据K线数量决定时间格式
      let timeLabel;
      if (array.length <= 24) {
        timeLabel = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      } else if (array.length <= 100) {
        timeLabel = `${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      } else {
        timeLabel = `${date.getDate()}日 ${date.getHours()}h`;
      }

      return {
        time: timeLabel,
        fullTime: date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        isUp: candle.close >= candle.open
      };
    });
  }, [ohlcv, timeRange]);

  // ✅ 性能优化：使用 useMemo 缓存 RSI 数据计算
  const rsiChartData = useMemo(() => {
    if (!ohlcv || ohlcv.length === 0) return [];

    return ohlcv.slice(-24).map((candle, index, arr) => {
      // 简化的RSI趋势展示
      const change = index > 0
        ? ((candle.close - arr[index-1].close) / arr[index-1].close) * 100
        : 0;
      const rsiApprox = 50 + change * 10; // 近似RSI值

      return {
        time: new Date(candle.timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        rsi: Math.max(0, Math.min(100, rsiApprox))
      };
    });
  }, [ohlcv]);

  // ✅ 统一字段映射，兼容不同API返回
  const price = ticker?.last ?? ticker?.price ?? ticker?.close ?? 0;
  const change = ticker?.percentage ?? ticker?.change24h ?? 0;
  const high = ticker?.high ?? ticker?.high24h ?? 0;
  const low = ticker?.low ?? ticker?.low24h ?? 0;
  const volume = ticker?.baseVolume ?? ticker?.volume ?? ticker?.volume24h ?? 0;

  // ✅ 性能优化：使用 useMemo 缓存统计数据
  const stats = useMemo(() => [
    {
      label: '当前价格',
      value: `$${price ? price.toFixed(2) : '---'}`,
      change: (Number(change) || 0).toFixed(2),
      icon: DollarSign,
      positive: Number(change) >= 0
    },
    {
      label: 'RSI (14)',
      value: indicators?.rsi?.toFixed(2) || '---',
      change: indicators?.rsi > 70 ? '超买' : indicators?.rsi < 30 ? '超卖' : '中性',
      icon: Activity,
      positive: indicators?.rsi >= 30 && indicators?.rsi <= 70
    },
    {
      label: '24h 涨跌',
      value: `${(Number(change) || 0).toFixed(2)}%`,
      change: volume ? `Vol: ${(volume / 1000000).toFixed(2)}M` : 'N/A',
      icon: TrendingUp,
      positive: Number(change) >= 0
    },
    {
      label: 'MACD',
      value: indicators?.macd?.MACD?.toFixed(4) || '---',
      change: indicators?.macd?.histogram >= 0 ? '多头' : '空头',
      icon: Percent,
      positive: indicators?.macd?.histogram >= 0
    }
  ], [price, change, volume, indicators]); // ✅ 依赖项：只在归一化后变化时重新计算

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="card animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-dark-muted">{stat.label}</span>
              <stat.icon className={`w-5 h-5 ${stat.positive ? 'text-accent-success' : 'text-accent-danger'}`} />
            </div>
            <div className="text-2xl font-bold font-mono mb-1">{stat.value}</div>
            <div className={`text-sm ${stat.positive ? 'text-accent-success' : 'text-accent-danger'}`}>
              {stat.change}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Price Chart - K线图 */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">价格走势（实时K线）</h3>
              <span className="text-sm text-dark-muted">
                {priceChartData.length}根
              </span>
            </div>
          </div>

          {/* 时间周期选择器 */}
          <div className="flex items-center gap-1 mb-4 flex-wrap">
            {timeRangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeRange(option.value)}
                className={`px-3 py-1.5 text-xs rounded transition-all ${
                  timeRange === option.value
                    ? 'bg-accent-primary text-white font-semibold'
                    : 'bg-dark-bg border border-dark-border text-dark-muted hover:text-dark-text hover:border-accent-primary/50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {priceChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={priceChartData.length > 100 ? 350 : 300}>
              <ComposedChart
                data={priceChartData}
                margin={{
                  top: 5,
                  right: 20,
                  left: 0,
                  bottom: priceChartData.length > 100 ? 40 : 5
                }}
                barCategoryGap="5%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f29" />
                <XAxis
                  dataKey="time"
                  stroke="#71717a"
                  style={{ fontSize: '10px' }}
                  interval={priceChartData.length > 50 ? Math.floor(priceChartData.length / 8) : 'preserveStartEnd'}
                  angle={priceChartData.length > 100 ? -45 : 0}
                  textAnchor={priceChartData.length > 100 ? 'end' : 'middle'}
                  height={priceChartData.length > 100 ? 60 : 30}
                  tick={{ fill: '#71717a' }}
                />
                <YAxis
                  stroke="#71717a"
                  style={{ fontSize: '10px' }}
                  domain={['dataMin - 10', 'dataMax + 10']}
                  tickFormatter={(value) => `$${value.toFixed(0)}`}
                  tick={{ fill: '#71717a' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#13131a',
                    border: '1px solid #1f1f29',
                    fontSize: '11px',
                    padding: '10px'
                  }}
                  labelStyle={{ color: '#a1a1aa', marginBottom: '6px', fontWeight: 'bold' }}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0] && payload[0].payload.fullTime) {
                      return `时间: ${payload[0].payload.fullTime}`;
                    }
                    return label;
                  }}
                  formatter={(value, name) => {
                    if (name === 'open') return [`$${Number(value).toFixed(2)}`, '开'];
                    if (name === 'high') return [`$${Number(value).toFixed(2)}`, '高'];
                    if (name === 'low') return [`$${Number(value).toFixed(2)}`, '低'];
                    if (name === 'close') return [`$${Number(value).toFixed(2)}`, '收'];
                    return [value, name];
                  }}
                />
                {/* 自定义K线蜡烛图 */}
                <Bar
                  dataKey="high"
                  fill="transparent"
                  shape={(props) => {
                    const { x, y, width, height, payload, index } = props;
                    if (!payload || !payload.open) return null;

                    const { open, close, high, low } = payload;
                    const isUp = close >= open;
                    const color = isUp ? '#10b981' : '#ef4444';

                    const dataMin = Math.min(...priceChartData.map(d => d.low)) - 10;
                    const dataMax = Math.max(...priceChartData.map(d => d.high)) + 10;
                    const range = dataMax - dataMin;

                    const getY = (price) => y + height - ((price - dataMin) / range) * height;

                    const highY = getY(high);
                    const lowY = getY(low);
                    const openY = getY(open);
                    const closeY = getY(close);

                    const candleWidth = Math.max(width * 0.9, 4);
                    const centerX = x + width / 2;

                    return (
                      <g key={`candle-${index}`}>
                        <line
                          x1={centerX}
                          y1={highY}
                          x2={centerX}
                          y2={Math.min(openY, closeY)}
                          stroke={color}
                          strokeWidth={1}
                        />
                        <rect
                          x={centerX - candleWidth / 2}
                          y={Math.min(openY, closeY)}
                          width={candleWidth}
                          height={Math.max(Math.abs(closeY - openY), 1)}
                          fill={color}
                          stroke={color}
                          strokeWidth={1}
                        />
                        <line
                          x1={centerX}
                          y1={Math.max(openY, closeY)}
                          x2={centerX}
                          y2={lowY}
                          stroke={color}
                          strokeWidth={1}
                        />
                      </g>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-dark-muted">
              <p>正在加载K线数据...</p>
            </div>
          )}
        </div>

        {/* Indicators Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">技术指标（RSI走势）</h3>
          {rsiChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rsiChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f29" />
              <XAxis dataKey="time" stroke="#71717a" />
              <YAxis stroke="#71717a" />
              <Tooltip contentStyle={{ backgroundColor: '#13131a', border: '1px solid #1f1f29' }} />
              <Line type="monotone" dataKey="rsi" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-dark-muted">
              <p>正在加载RSI数据...</p>
            </div>
          )}
        </div>
      </div>

      {/* Market Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h4 className="text-sm text-dark-muted mb-2">24h 最高</h4>
          <div className="text-xl font-mono font-bold text-accent-success">
            ${high ? high.toFixed(2) : '---'}
          </div>
        </div>
        <div className="card">
          <h4 className="text-sm text-dark-muted mb-2">24h 最低</h4>
          <div className="text-xl font-mono font-bold text-accent-danger">
            ${low ? low.toFixed(2) : '---'}
          </div>
        </div>
        <div className="card">
          <h4 className="text-sm text-dark-muted mb-2">24h 成交量</h4>
          <div className="text-xl font-mono font-bold">
            ${volume ? (volume / 1000000).toFixed(2) : '---'}M
          </div>
        </div>
      </div>
    </div>
  );
}

// Mock数据已删除 - 现在只使用真实K线数据

export default Dashboard;

