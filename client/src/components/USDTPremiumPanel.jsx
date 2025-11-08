import React, { useState, useEffect } from 'react';

const USDTPremiumPanel = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/advanced-market/usdt-premium');
      if (!response.ok) throw new Error('获取数据失败');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        throw new Error(result.message || '数据获取失败');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = autoRefresh ? setInterval(fetchData, 30000) : null;
    return () => interval && clearInterval(interval);
  }, [autoRefresh]);

  const getSignalColor = (signal) => {
    const colors = {
      EXTREME_PANIC: 'text-red-600 bg-red-100',
      PANIC: 'text-red-500 bg-red-50',
      FEAR: 'text-orange-500 bg-orange-50',
      NEUTRAL: 'text-gray-500 bg-gray-50',
      GREED: 'text-green-500 bg-green-50',
      EXTREME_GREED: 'text-green-600 bg-green-100'
    };
    return colors[signal] || colors.NEUTRAL;
  };

  const getSignalLabel = (signal) => {
    const labels = {
      EXTREME_PANIC: '极度恐慌',
      PANIC: '恐慌',
      FEAR: '恐惧',
      NEUTRAL: '中性',
      GREED: '贪婪',
      EXTREME_GREED: '极度贪婪'
    };
    return labels[signal] || signal;
  };

  if (loading && !data) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <div className="text-center text-red-500">
          <p className="mb-4">❌ {error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-secondary"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-dark-text flex items-center">
              💵 USDT溢价率监控
            </h2>
            <p className="text-dark-muted text-sm mt-1">
              追踪场外市场情绪，捕捉资金流动信号
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-accent-primary rounded"
              />
              <span className="text-dark-muted text-sm">自动刷新 (30s)</span>
            </label>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-secondary disabled:opacity-50 transition-all"
            >
              {loading ? '刷新中...' : '🔄 刷新'}
            </button>
          </div>
        </div>
      </div>

      {data && (
        <>
          {/* Market Signal */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-6">
            <div className="text-center">
              <div className={`inline-block px-8 py-4 rounded-lg ${getSignalColor(data.signal)}`}>
                <div className="text-sm text-gray-600 mb-1">市场情绪</div>
                <div className="text-3xl font-bold">{getSignalLabel(data.signal)}</div>
              </div>
              <p className="mt-4 text-dark-muted">{data.description}</p>
            </div>
          </div>

          {/* Premium Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <div className="text-dark-muted text-sm mb-2">平均溢价率</div>
              <div className={`text-3xl font-bold ${
                data.averagePremium > 0 ? 'text-red-500' : 'text-green-500'
              }`}>
                {data.averagePremium > 0 ? '+' : ''}{data.averagePremium.toFixed(2)}%
              </div>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <div className="text-dark-muted text-sm mb-2">离岸汇率</div>
              <div className="text-3xl font-bold text-dark-text">
                {data.usdCnyRate.toFixed(4)}
              </div>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <div className="text-dark-muted text-sm mb-2">更新时间</div>
              <div className="text-lg text-dark-text">
                {new Date(data.timestamp).toLocaleString('zh-CN')}
              </div>
            </div>
          </div>

          {/* Exchange Prices */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-dark-text mb-4">各交易所价格对比</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left py-3 px-4 text-dark-muted font-medium">交易所</th>
                    <th className="text-right py-3 px-4 text-dark-muted font-medium">USDT/CNY</th>
                    <th className="text-right py-3 px-4 text-dark-muted font-medium">溢价率</th>
                    <th className="text-right py-3 px-4 text-dark-muted font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prices.map((price, idx) => (
                    <tr key={idx} className="border-b border-dark-border/50 hover:bg-dark-bg transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-medium text-dark-text">{price.exchange}</span>
                      </td>
                      <td className="py-3 px-4 text-right text-dark-text font-mono">
                        ¥{price.usdtCny.toFixed(4)}
                      </td>
                      <td className={`py-3 px-4 text-right font-semibold ${
                        price.premium > 0 ? 'text-red-500' : 'text-green-500'
                      }`}>
                        {price.premium > 0 ? '+' : ''}{price.premium.toFixed(2)}%
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`px-2 py-1 rounded text-xs ${
                          price.premium > 2 ? 'bg-red-100 text-red-600' :
                          price.premium > 0 ? 'bg-orange-100 text-orange-600' :
                          price.premium > -2 ? 'bg-gray-100 text-gray-600' :
                          'bg-green-100 text-green-600'
                        }`}>
                          {price.premium > 2 ? '高溢价' :
                           price.premium > 0 ? '溢价' :
                           price.premium > -2 ? '正常' : '折价'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Analysis Guide */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-dark-text mb-4">📊 分析指南</h3>
            <div className="space-y-3 text-sm text-dark-muted">
              <div className="flex items-start">
                <span className="text-red-500 mr-2">📈</span>
                <div>
                  <strong className="text-dark-text">高溢价 (&gt;3%)</strong>
                  <span> - 市场极度恐慌，资金外流，通常出现在暴跌后或重大利空消息</span>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-orange-500 mr-2">⚠️</span>
                <div>
                  <strong className="text-dark-text">溢价 (1.5%-3%)</strong>
                  <span> - 市场谨慎，资金略有流出，可能是调整信号</span>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-gray-500 mr-2">➖</span>
                <div>
                  <strong className="text-dark-text">中性 (-1.5% ~ 1.5%)</strong>
                  <span> - 市场平衡，资金流动正常</span>
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-green-500 mr-2">📉</span>
                <div>
                  <strong className="text-dark-text">折价 (&lt;-1.5%)</strong>
                  <span> - 市场乐观，资金流入，通常是上涨行情的前兆</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default USDTPremiumPanel;
