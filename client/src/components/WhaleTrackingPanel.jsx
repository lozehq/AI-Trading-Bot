import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Activity, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import axios from 'axios';

const API_BASE = '/api';

function WhaleTrackingPanel() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState('BTC');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // 获取巨鲸报告
  const fetchWhaleReport = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/whale-tracking/report?asset=${selectedAsset}`);
      if (response.data.success) {
        setReport(response.data.data);
        setLastUpdate(new Date());
        setError(null);
      }
    } catch (err) {
      setError(err.message);
      console.error('获取巨鲸报告失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 自动刷新
  useEffect(() => {
    fetchWhaleReport();
    
    if (autoRefresh) {
      const interval = setInterval(fetchWhaleReport, 60000); // 每分钟刷新
      return () => clearInterval(interval);
    }
  }, [selectedAsset, autoRefresh]);

  // 获取信号颜色
  const getSignalColor = (signal) => {
    switch(signal) {
      case 'BULLISH': return 'text-green-400';
      case 'BEARISH': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  // 获取信号图标
  const getSignalIcon = (signal) => {
    switch(signal) {
      case 'BULLISH': return <TrendingUp className="w-4 h-4" />;
      case 'BEARISH': return <TrendingDown className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  // 获取交易类型标签
  const getTransactionTypeLabel = (type) => {
    switch(type) {
      case 'EXCHANGE_INFLOW': return { text: '流入交易所', color: 'bg-red-500/20 text-red-400', icon: <ArrowDownRight className="w-3 h-3" /> };
      case 'EXCHANGE_OUTFLOW': return { text: '流出交易所', color: 'bg-green-500/20 text-green-400', icon: <ArrowUpRight className="w-3 h-3" /> };
      case 'TRANSFER': return { text: '钱包转账', color: 'bg-blue-500/20 text-blue-400', icon: <Activity className="w-3 h-3" /> };
      default: return { text: type, color: 'bg-gray-500/20 text-gray-400', icon: null };
    }
  };

  // 格式化金额
  const formatAmount = (amount) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(2)}K`;
    return amount.toFixed(2);
  };

  // 格式化时间
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return date.toLocaleString('zh-CN');
  };

  if (loading && !report) {
    return (
      <div className="flex items-center justify-center h-96 bg-dark-card rounded-lg">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-accent-primary mx-auto mb-4" />
          <p className="text-dark-muted">加载巨鲸监控数据...</p>
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <div>
            <h3 className="text-red-400 font-semibold">数据加载失败</h3>
            <p className="text-sm text-dark-muted mt-1">{error}</p>
            <button
              onClick={fetchWhaleReport}
              className="mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部控制栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          🐋 巨鲸监控
          {report && (
            <span className="text-sm font-normal text-dark-muted">
              {selectedAsset}
            </span>
          )}
        </h2>
        
        <div className="flex items-center gap-3">
          {/* 资产选择 */}
          <select
            value={selectedAsset}
            onChange={(e) => setSelectedAsset(e.target.value)}
            className="px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm"
          >
            <option value="BTC">Bitcoin (BTC)</option>
            <option value="ETH">Ethereum (ETH)</option>
            <option value="USDT">Tether (USDT)</option>
          </select>

          {/* 自动刷新开关 */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              autoRefresh 
                ? 'bg-accent-primary text-white' 
                : 'bg-dark-bg border border-dark-border'
            }`}
          >
            {autoRefresh ? '自动刷新' : '手动刷新'}
          </button>

          {/* 刷新按钮 */}
          <button
            onClick={fetchWhaleReport}
            disabled={loading}
            className="p-2 bg-dark-bg border border-dark-border rounded-lg hover:bg-dark-card transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {lastUpdate && (
        <p className="text-xs text-dark-muted">
          最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}
        </p>
      )}

      {report && (
        <>
          {/* 告警区域 */}
          {report.alerts && report.alerts.length > 0 && (
            <div className="space-y-2">
              {report.alerts.map((alert, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    alert.severity === 'HIGH' 
                      ? 'bg-red-500/10 border-red-500/30' 
                      : 'bg-yellow-500/10 border-yellow-500/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-5 h-5 ${
                      alert.severity === 'HIGH' ? 'text-red-400' : 'text-yellow-400'
                    }`} />
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{alert.message}</h4>
                      <p className="text-sm text-dark-muted">{alert.recommendation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 总交易数 */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dark-muted">24h交易数</span>
                <Activity className="w-5 h-5 text-accent-primary" />
              </div>
              <div className="text-3xl font-bold">{report.stats.totalTransactions}</div>
              <div className="text-xs text-dark-muted mt-1">笔大额交易</div>
            </div>

            {/* 总交易量 */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dark-muted">总交易量</span>
                <DollarSign className="w-5 h-5 text-accent-primary" />
              </div>
              <div className="text-3xl font-bold">
                ${formatAmount(report.stats.totalVolume)}
              </div>
              <div className="text-xs text-dark-muted mt-1">USD</div>
            </div>

            {/* 流入数量 */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dark-muted">流入交易所</span>
                <ArrowDownRight className="w-5 h-5 text-red-400" />
              </div>
              <div className="text-3xl font-bold text-red-400">
                {report.stats.exchangeInflowCount}
              </div>
              <div className="text-xs text-dark-muted mt-1">笔 (卖压)</div>
            </div>

            {/* 流出数量 */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dark-muted">流出交易所</span>
                <ArrowUpRight className="w-5 h-5 text-green-400" />
              </div>
              <div className="text-3xl font-bold text-green-400">
                {report.stats.exchangeOutflowCount}
              </div>
              <div className="text-xs text-dark-muted mt-1">笔 (买盘)</div>
            </div>
          </div>

          {/* 交易所净流量 */}
          {report.netFlow && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">交易所净流量</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-dark-muted mb-1">净流量</div>
                  <div className={`text-2xl font-bold flex items-center gap-2 ${
                    getSignalColor(report.netFlow.signal)
                  }`}>
                    {getSignalIcon(report.netFlow.signal)}
                    {formatAmount(Math.abs(report.netFlow.netFlow))} {selectedAsset}
                  </div>
                  <div className="text-xs text-dark-muted mt-1">
                    {report.netFlow.signal === 'BEARISH' ? '净流入 (卖压)' : 
                     report.netFlow.signal === 'BULLISH' ? '净流出 (买盘)' : '平衡'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-dark-muted mb-1">总流入</div>
                  <div className="text-2xl font-bold text-red-400">
                    {formatAmount(report.netFlow.inflowTotal)} {selectedAsset}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-dark-muted mb-1">总流出</div>
                  <div className="text-2xl font-bold text-green-400">
                    {formatAmount(report.netFlow.outflowTotal)} {selectedAsset}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 最近交易列表 */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">最近大额交易</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {report.transactions && report.transactions.length > 0 ? (
                report.transactions.map((tx, index) => {
                  const typeInfo = getTransactionTypeLabel(tx.type);
                  return (
                    <div
                      key={tx.id || index}
                      className="p-3 bg-dark-bg rounded-lg border border-dark-border hover:border-accent-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          {/* 交易类型标签 */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${typeInfo.color}`}>
                              {typeInfo.icon}
                              {typeInfo.text}
                            </span>
                            <span className="text-xs text-dark-muted">{formatTime(tx.timestamp)}</span>
                          </div>
                          
                          {/* 金额和币种 */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-bold">
                              {formatAmount(tx.amount)} {tx.symbol}
                            </span>
                            <span className="text-sm text-dark-muted">
                              ≈ ${formatAmount(tx.amountUsd)}
                            </span>
                          </div>
                          
                          {/* 信号描述 */}
                          {tx.signal && (
                            <div className={`text-sm ${getSignalColor(tx.signal.signal)}`}>
                              {tx.signal.description}
                            </div>
                          )}
                          
                          {/* 地址信息（可选） */}
                          {tx.from && tx.to && (
                            <div className="text-xs text-dark-muted mt-2 space-y-1">
                              <div>从: {tx.from.owner !== 'unknown' ? tx.from.owner : tx.from.address?.substring(0, 10) + '...'}</div>
                              <div>到: {tx.to.owner !== 'unknown' ? tx.to.owner : tx.to.address?.substring(0, 10) + '...'}</div>
                            </div>
                          )}
                        </div>
                        
                        {/* 区块链标签 */}
                        <div className="text-xs px-2 py-1 bg-dark-card rounded">
                          {tx.blockchain}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-dark-muted py-8">
                  暂无大额交易记录
                </div>
              )}
            </div>
          </div>

          {/* 数据源说明 */}
          <div className="text-xs text-dark-muted text-center">
            💡 提示：完整功能需配置 WHALE_ALERT_API_KEY 或 GLASSNODE_API_KEY 环境变量
          </div>
        </>
      )}
    </div>
  );
}

export default WhaleTrackingPanel;
