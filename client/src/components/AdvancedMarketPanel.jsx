import React, { useState, useEffect } from 'react';

import { BarChart3, DollarSign, TrendingUp, Zap, Coins, RefreshCw, XCircle } from 'lucide-react';

const AdvancedMarketPanel = ({ selectedSymbol: parentSymbol = 'BTC/USDT' }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeSection, setActiveSection] = useState('all'); // all, usdt, depth, volatility, arbitrage
  const [selectedSymbol, setSelectedSymbol] = useState(parentSymbol);

  const symbols = [
    { symbol: 'BTC/USDT', name: 'Bitcoin', icon: '₿' },
    { symbol: 'ETH/USDT', name: 'Ethereum', icon: 'Ξ' },
    { symbol: 'SOL/USDT', name: 'Solana', icon: '◆' },
    { symbol: 'BNB/USDT', name: 'BNB', icon: '🔶' },
    { symbol: 'XRP/USDT', name: 'Ripple', icon: '●' },
    { symbol: 'ADA/USDT', name: 'Cardano', icon: '♥' }
  ];

  const fetchData = async () => {
    try {
      setLoading(true);
      const asset = selectedSymbol.split('/')[0];
      const response = await fetch(`/api/advanced-market/all?symbol=${selectedSymbol}&asset=${asset}`);
      if (!response.ok) throw new Error('获取数据失败');
      const result = await response.json();
      if (result.success) {
        const srv = result.data || {};
        const transformed = { ...srv };
        const up = srv.usdtPremium || null;
        if (up) {
          const fx = parseFloat(up.fxRate);
          const avgPrem = parseFloat(up.premium);
          const exchanges = Array.isArray(up.exchanges) ? up.exchanges : [];
          const prices = exchanges.map(ex => {
            const usdtCny = Number(ex.price);
            const prem = Number.isFinite(fx) && fx > 0 ? ((usdtCny - fx) / fx) * 100 : 0;
            return { exchange: ex.exchange, usdtCny, premium: prem };
          });
          const description = up.description || [up.sentiment, up.recommendation].filter(Boolean).join(' | ');
          transformed.usdtPremium = {
            ...up,
            averagePremium: Number.isFinite(avgPrem) ? avgPrem : 0,
            usdCnyRate: Number.isFinite(fx) ? fx : 0,
            prices,
            description
          };
        }
        setData(transformed);
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
    const interval = autoRefresh ? setInterval(fetchData, 10000) : null;
    return () => interval && clearInterval(interval);
  }, [autoRefresh, selectedSymbol]);

  const getSignalColor = (signal) => {
    const colors = {
      BULLISH: 'text-green-600 bg-green-100',
      BEARISH: 'text-red-600 bg-red-100',
      NEUTRAL: 'text-gray-600 bg-gray-100',
      PANIC: 'text-red-500 bg-red-50',
      FEAR: 'text-orange-500 bg-orange-50',
      GREED: 'text-green-500 bg-green-50',
      EXTREME_GREED: 'text-green-600 bg-green-100',
      HIGH_VOLATILITY: 'text-red-500 bg-red-50',
      LOW_VOLATILITY: 'text-blue-500 bg-blue-50',
      STRONG: 'text-green-600 bg-green-100',
      MODERATE: 'text-green-500 bg-green-50',
      WEAK: 'text-yellow-600 bg-yellow-100',
      NONE: 'text-gray-500 bg-gray-50'
    };
    return colors[signal] || colors.NEUTRAL;
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
          <p className="mb-4 flex items-center gap-2"><XCircle className="w-4 h-4" /> {error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-secondary">
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
            <h2 className="text-2xl font-bold text-dark-text flex items-center gap-2"><BarChart3 className="w-5 h-5 text-accent-primary" /> 高级市场数据</h2>
            <p className="text-dark-muted text-sm mt-1">专业级市场深度分析工具</p>
          </div>
          <div className="flex items-center space-x-4">
            {/* Symbol Selector */}
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="px-4 py-2 bg-dark-bg border border-dark-border rounded text-dark-text hover:border-accent-primary focus:outline-none focus:border-accent-primary transition-colors"
            >
              {symbols.map(s => (
                <option key={s.symbol} value={s.symbol}>
                  {s.icon} {s.name} ({s.symbol.split('/')[0]})
                </option>
              ))}
            </select>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-accent-primary rounded"
              />
              <span className="text-dark-muted text-sm">自动刷新 (10s)</span>
            </label>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-secondary disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> 刷新中...</span>
              ) : (
                <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" /> 刷新</span>
              )}
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex space-x-2 overflow-x-auto">
          {[
            { key: 'all', label: '全部', Icon: BarChart3 },
            { key: 'usdt', label: 'USDT溢价', Icon: DollarSign },
            { key: 'depth', label: '做市商深度', Icon: TrendingUp },
            { key: 'volatility', label: '隐含波动率', Icon: Zap },
            { key: 'arbitrage', label: '跨所套利', Icon: Coins }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={`px-4 py-2 rounded transition-all whitespace-nowrap ${
                activeSection === tab.key
                  ? 'bg-accent-primary text-white'
                  : 'bg-dark-bg text-dark-muted hover:text-dark-text'
              }`}
            >
              <span className="inline-flex items-center gap-2">{tab.Icon && <tab.Icon className="w-4 h-4" />}<span>{tab.label}</span></span>
            </button>
          ))}
        </div>
      </div>

      {data && (
        <>
          {/* USDT Premium */}
          {(activeSection === 'all' || activeSection === 'usdt') && data.usdtPremium && (
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center">
                <span className="flex items-center"><DollarSign className="w-5 h-5 mr-2" /> USDT溢价率</span>
                <span className={`ml-3 px-3 py-1 rounded text-sm ${getSignalColor(data.usdtPremium.signal)}`}>
                  {data.usdtPremium.signal}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-dark-muted text-sm">平均溢价率</div>
                  <div className={`text-2xl font-bold ${
                    data.usdtPremium.averagePremium > 0 ? 'text-red-500' : 'text-green-500'
                  }`}>
                    {data.usdtPremium.averagePremium > 0 ? '+' : ''}{(data.usdtPremium.averagePremium || 0).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-dark-muted text-sm">USD/CNY汇率</div>
                  <div className="text-2xl font-bold text-dark-text">{(data.usdtPremium.usdCnyRate || 0).toFixed(4)}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-dark-muted text-sm">信号说明</div>
                  <div className="text-sm text-dark-text">{data.usdtPremium.description}</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-border">
                      <th className="text-left py-2 text-dark-muted">交易所</th>
                      <th className="text-right py-2 text-dark-muted">USDT/CNY</th>
                      <th className="text-right py-2 text-dark-muted">溢价率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.usdtPremium.prices || []).map((price, idx) => (
                      <tr key={idx} className="border-b border-dark-border/50">
                        <td className="py-2 text-dark-text">{price.exchange}</td>
                        <td className="py-2 text-right font-mono text-dark-text">¥{(price.usdtCny || 0).toFixed(4)}</td>
                        <td className={`py-2 text-right font-semibold ${
                          price.premium > 0 ? 'text-red-500' : 'text-green-500'
                        }`}>
                          {price.premium > 0 ? '+' : ''}{(price.premium || 0).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Market Maker Depth */}
          {(activeSection === 'all' || activeSection === 'depth') && data.marketMakerDepth && (
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center">
                <span className="flex items-center"><TrendingUp className="w-5 h-5 mr-2" /> 做市商深度分析</span>
                <span className={`ml-3 px-3 py-1 rounded text-sm ${getSignalColor(data.marketMakerDepth.signal)}`}>
                  {data.marketMakerDepth.signal}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-dark-muted text-sm">买卖压力比</div>
                  <div className={`text-2xl font-bold ${
                    parseFloat(data.marketMakerDepth.pressureRatio || 0) > 1 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {parseFloat(data.marketMakerDepth.pressureRatio || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-dark-muted text-sm">买单墙数量</div>
                  <div className="text-2xl font-bold text-green-500">{(data.marketMakerDepth.buyWalls || []).length}</div>
                </div>
                <div>
                  <div className="text-dark-muted text-sm">卖单墙数量</div>
                  <div className="text-2xl font-bold text-red-500">{(data.marketMakerDepth.sellWalls || []).length}</div>
                </div>
                <div>
                  <div className="text-dark-muted text-sm">交易所</div>
                  <div className="text-lg font-semibold text-dark-text">{data.marketMakerDepth.exchange}</div>
                </div>
              </div>
              <div className="text-sm text-dark-muted mb-4">{data.marketMakerDepth.description}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-green-500 mb-2">买单墙 (支撑位)</h4>
                  <div className="space-y-1">
                    {(data.marketMakerDepth.buyWalls || []).slice(0, 3).map((wall, idx) => (
                      <div key={idx} className="text-xs bg-dark-bg p-2 rounded flex justify-between">
                        <span className="text-dark-text font-mono">${(wall.price || 0).toLocaleString()}</span>
                        <span className="text-dark-muted">{parseFloat(wall.size || 0).toFixed(4)} {selectedSymbol.split('/')[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-red-500 mb-2">卖单墙 (阻力位)</h4>
                  <div className="space-y-1">
                    {(data.marketMakerDepth.sellWalls || []).slice(0, 3).map((wall, idx) => (
                      <div key={idx} className="text-xs bg-dark-bg p-2 rounded flex justify-between">
                        <span className="text-dark-text font-mono">${(wall.price || 0).toLocaleString()}</span>
                        <span className="text-dark-muted">{parseFloat(wall.size || 0).toFixed(4)} {selectedSymbol.split('/')[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Implied Volatility */}
          {(activeSection === 'all' || activeSection === 'volatility') && data.impliedVolatility && (
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center">
                <span className="flex items-center"><Zap className="w-5 h-5 mr-2" /> 隐含波动率</span>
                <span className={`ml-3 px-3 py-1 rounded text-sm ${getSignalColor(data.impliedVolatility.signal)}`}>
                  {data.impliedVolatility.signal}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-dark-muted text-sm">年化波动率</div>
                  <div className="text-3xl font-bold text-dark-text">{parseFloat(data.impliedVolatility.impliedVolatility || 0).toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-dark-muted text-sm">数据来源</div>
                  <div className="text-lg text-dark-text">{data.impliedVolatility.source || '历史波动率'}</div>
                </div>
                <div>
                  <div className="text-dark-muted text-sm">资产</div>
                  <div className="text-lg text-dark-text">{data.impliedVolatility.asset || selectedSymbol.split('/')[0]}</div>
                </div>
              </div>
              <div className="bg-dark-bg p-4 rounded">
                <div className="text-sm text-dark-muted">{data.impliedVolatility.description}</div>
              </div>
            </div>
          )}

          {/* Cross-Exchange Arbitrage */}
          {(activeSection === 'all' || activeSection === 'arbitrage') && data.crossExchangeArbitrage && (
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center">
                <span className="flex items-center"><Coins className="w-5 h-5 mr-2" /> 跨交易所套利机会</span>
                <span className={`ml-3 px-3 py-1 rounded text-sm ${getSignalColor(data.crossExchangeArbitrage.opportunity)}`}>
                  {data.crossExchangeArbitrage.opportunity}
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-dark-muted text-sm">最大价差</div>
                  <div className="text-2xl font-bold text-accent-primary">
                    {parseFloat(data.crossExchangeArbitrage.spreadPercent || 0).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-dark-muted text-sm">净套利空间</div>
                  <div className={`text-2xl font-bold ${
                    parseFloat(data.crossExchangeArbitrage.netSpreadPercent || 0) > 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {parseFloat(data.crossExchangeArbitrage.netSpreadPercent || 0).toFixed(2)}%
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-dark-muted text-sm">建议操作</div>
                  <div className="text-sm text-dark-text">
                    {data.crossExchangeArbitrage.recommendation || '无明显套利空间'}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-border">
                      <th className="text-left py-2 text-dark-muted">交易所</th>
                      <th className="text-right py-2 text-dark-muted">价格 (USD)</th>
                      <th className="text-right py-2 text-dark-muted">与最低差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.crossExchangeArbitrage.prices || []).length > 0 ? (
                      (data.crossExchangeArbitrage.prices || []).map((price, idx) => {
                        const prices = data.crossExchangeArbitrage.prices || [];
                        const lowestPrice = prices.length > 0 ? Math.min(...prices.map(p => p.price || 0)) : 0;
                        const priceDiff = lowestPrice > 0 ? (((price.price || 0) - lowestPrice) / lowestPrice) * 100 : 0;
                        return (
                          <tr key={idx} className="border-b border-dark-border/50">
                            <td className="py-2 text-dark-text">{price.exchange}</td>
                            <td className="py-2 text-right font-mono text-dark-text">${(price.price || 0).toLocaleString()}</td>
                            <td className={`py-2 text-right font-semibold ${
                              priceDiff > 0.1 ? 'text-red-500' : priceDiff < -0.1 ? 'text-green-500' : 'text-gray-500'
                            }`}>
                              {priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="3" className="py-4 text-center text-dark-muted">
                          暂无价格数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-dark-bg p-4 rounded">
                <div className="text-sm text-dark-muted">{data.crossExchangeArbitrage.description}</div>
              </div>
            </div>
          )}

          {/* Summary Dashboard */}
          {activeSection === 'all' && (
            <div className="bg-dark-card border border-dark-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5" /> 市场情绪总览</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {data.usdtPremium && (
                  <div className="bg-dark-bg p-4 rounded">
                    <div className="text-dark-muted text-sm mb-2">场外情绪</div>
                    <div className={`px-3 py-1 rounded inline-block ${getSignalColor(data.usdtPremium.signal)}`}>
                      {data.usdtPremium.signal}
                    </div>
                  </div>
                )}
                {data.marketMakerDepth && (
                  <div className="bg-dark-bg p-4 rounded">
                    <div className="text-dark-muted text-sm mb-2">盘口压力</div>
                    <div className={`px-3 py-1 rounded inline-block ${getSignalColor(data.marketMakerDepth.signal)}`}>
                      {data.marketMakerDepth.signal}
                    </div>
                  </div>
                )}
                {data.impliedVolatility && (
                  <div className="bg-dark-bg p-4 rounded">
                    <div className="text-dark-muted text-sm mb-2">市场波动</div>
                    <div className={`px-3 py-1 rounded inline-block ${getSignalColor(data.impliedVolatility.signal)}`}>
                      {data.impliedVolatility.signal}
                    </div>
                  </div>
                )}
                {data.crossExchangeArbitrage && (
                  <div className="bg-dark-bg p-4 rounded">
                    <div className="text-dark-muted text-sm mb-2">套利机会</div>
                    <div className={`px-3 py-1 rounded inline-block ${getSignalColor(data.crossExchangeArbitrage.opportunity)}`}>
                      {data.crossExchangeArbitrage.opportunity}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdvancedMarketPanel;
