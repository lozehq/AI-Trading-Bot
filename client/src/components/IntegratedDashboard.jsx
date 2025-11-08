import React, { useState } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar } from 'recharts';
import { TrendingUp, Activity, DollarSign, Percent, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * 整合式仪表盘 - 左侧栏组件
 * 显示关键市场数据和图表
 */
function IntegratedDashboard({ ticker, indicators, ohlcv, loading, error, onRefresh }) {
  const [expanded, setExpanded] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [timeRange, setTimeRange] = useState(24); // 默认显示24根K线

  // 加载中状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent-primary border-t-transparent" />
      </div>
    );
  }

  // 错误状态
  if (error || !ticker) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-red-400 font-semibold text-sm mb-1">⚠️ 数据加载失败</h3>
            <p className="text-dark-muted text-xs">{error || '无法获取市场数据'}</p>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="ml-2 p-1 bg-red-500/20 hover:bg-red-500/30 rounded transition-colors"
              title="刷新数据"
            >
              <RefreshCw className="w-4 h-4 text-red-400" />
            </button>
          )}
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
  const candleChartData = ohlcv && ohlcv.length > 0
    ? (timeRange === -1 ? ohlcv : ohlcv.slice(-timeRange)).map((candle, index, array) => {
        const date = new Date(candle.timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        // 根据K线数量决定时间格式
        let timeLabel;
        if (array.length <= 24) {
          // 少量K线：显示完整时间（月/日 时:分）
          timeLabel = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        } else if (array.length <= 100) {
          // 中等K线：显示日期和小时（日 时:分）
          timeLabel = `${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        } else {
          // 大量K线：只显示日期和小时（日 时h）
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
          // 计算涨跌（用于颜色）
          isUp: candle.close >= candle.open
        };
      })
    : [];

  // 处理API返回的字段名：last/price, percentage/change24h
  const price = ticker?.last || ticker?.price || 0;
  const change = ticker?.percentage || ticker?.change24h || 0;
  const high = ticker?.high || ticker?.high24h || 0;
  const low = ticker?.low || ticker?.low24h || 0;
  const volume = ticker?.baseVolume || ticker?.volume24h || 0;

  const stats = [
    {
      label: '价格',
      value: `$${price?.toFixed(2) || '---'}`,
      change: change?.toFixed(2) || '0.00',
      icon: DollarSign,
      positive: change >= 0
    },
    {
      label: 'RSI',
      value: indicators?.rsi?.toFixed(1) || '---',
      change: indicators?.rsi > 70 ? '超买' : indicators?.rsi < 30 ? '超卖' : '中性',
      icon: Activity,
      positive: indicators?.rsi >= 30 && indicators?.rsi <= 70
    },
    {
      label: '24h涨跌',
      value: `${change?.toFixed(2) || '0.00'}%`,
      icon: TrendingUp,
      positive: change >= 0
    },
    {
      label: 'MACD',
      value: indicators?.macd?.MACD?.toFixed(4) || '---',
      change: indicators?.macd?.histogram >= 0 ? '多头' : '空头',
      icon: Percent,
      positive: indicators?.macd?.histogram >= 0
    }
  ];

  return (
    <div className="space-y-3">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📊 市场仪表盘</h2>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-dark-border rounded transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <>
          {/* 关键指标网格 */}
          <div className="grid grid-cols-2 gap-2">
            {stats.map((stat, index) => (
              <div key={index} className="bg-dark-card border border-dark-border rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-dark-muted">{stat.label}</span>
                  <stat.icon className={`w-3 h-3 ${stat.positive ? 'text-accent-success' : 'text-accent-danger'}`} />
                </div>
                <div className="text-base font-bold font-mono">{stat.value}</div>
                {stat.change && (
                  <div className={`text-xs ${stat.positive ? 'text-accent-success' : 'text-accent-danger'}`}>
                    {stat.change}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* K线图表 - 可折叠 */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">价格走势 (K线)</h3>
                <span className="text-xs text-dark-muted">
                  {candleChartData.length}根
                </span>
              </div>
              <button
                onClick={() => setShowChart(!showChart)}
                className="text-xs text-dark-muted hover:text-dark-text"
              >
                {showChart ? '隐藏' : '显示'}
              </button>
            </div>

            {/* 时间周期选择器 */}
            {showChart && (
              <div className="flex items-center gap-1 mb-3 flex-wrap">
                {timeRangeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTimeRange(option.value)}
                    className={`px-2 py-1 text-xs rounded transition-all ${
                      timeRange === option.value
                        ? 'bg-accent-primary text-white font-semibold'
                        : 'bg-dark-bg border border-dark-border text-dark-muted hover:text-dark-text hover:border-accent-primary/50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {showChart && candleChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={candleChartData.length > 100 ? 250 : 200}>
                <ComposedChart
                  data={candleChartData}
                  margin={{
                    top: 5,
                    right: 5,
                    left: -20,
                    bottom: candleChartData.length > 100 ? 40 : 5
                  }}
                  barCategoryGap="5%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f29" />
                  <XAxis
                    dataKey="time"
                    stroke="#71717a"
                    style={{ fontSize: '9px' }}
                    interval={candleChartData.length > 50 ? Math.floor(candleChartData.length / 8) : 'preserveStartEnd'}
                    tick={{ fill: '#71717a' }}
                    angle={candleChartData.length > 100 ? -45 : 0}
                    textAnchor={candleChartData.length > 100 ? 'end' : 'middle'}
                    height={candleChartData.length > 100 ? 60 : 30}
                  />
                  <YAxis
                    stroke="#71717a"
                    style={{ fontSize: '9px' }}
                    domain={['dataMin - 10', 'dataMax + 10']}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                    tick={{ fill: '#71717a' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#13131a',
                      border: '1px solid #1f1f29',
                      fontSize: '10px',
                      padding: '8px'
                    }}
                    labelStyle={{ color: '#a1a1aa', marginBottom: '6px', fontWeight: 'bold' }}
                    labelFormatter={(label, payload) => {
                      // 显示完整时间
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
                      const color = isUp ? '#10b981' : '#ef4444'; // 绿涨红跌

                      // 计算Y轴的实际范围
                      const dataMin = Math.min(...candleChartData.map(d => d.low)) - 10;
                      const dataMax = Math.max(...candleChartData.map(d => d.high)) + 10;
                      const range = dataMax - dataMin;

                      // 计算像素位置
                      const getY = (price) => y + height - ((price - dataMin) / range) * height;

                      const highY = getY(high);
                      const lowY = getY(low);
                      const openY = getY(open);
                      const closeY = getY(close);

                      const candleWidth = Math.max(width * 0.9, 4);
                      const centerX = x + width / 2;

                      return (
                        <g key={`candle-${index}`}>
                          {/* 上影线 */}
                          <line
                            x1={centerX}
                            y1={highY}
                            x2={centerX}
                            y2={Math.min(openY, closeY)}
                            stroke={color}
                            strokeWidth={1}
                          />
                          {/* K线实体 */}
                          <rect
                            x={centerX - candleWidth / 2}
                            y={Math.min(openY, closeY)}
                            width={candleWidth}
                            height={Math.max(Math.abs(closeY - openY), 1)}
                            fill={color}
                            stroke={color}
                            strokeWidth={1}
                          />
                          {/* 下影线 */}
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
            )}
          </div>

          {/* 市场信息 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-dark-card border border-dark-border rounded-lg p-2">
              <h4 className="text-xs text-dark-muted mb-1">24h最高</h4>
              <div className="text-sm font-mono font-bold text-accent-success">
                ${high?.toFixed(2) || '---'}
              </div>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-lg p-2">
              <h4 className="text-xs text-dark-muted mb-1">24h最低</h4>
              <div className="text-sm font-mono font-bold text-accent-danger">
                ${low?.toFixed(2) || '---'}
              </div>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-lg p-2">
              <h4 className="text-xs text-dark-muted mb-1">成交量</h4>
              <div className="text-sm font-mono font-bold">
                ${volume ? (volume / 1000000).toFixed(1) : '---'}M
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default IntegratedDashboard;

