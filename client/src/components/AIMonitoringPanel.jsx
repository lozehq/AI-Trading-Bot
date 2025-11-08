import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Activity, TrendingUp, TrendingDown, AlertCircle, CheckCircle, XCircle, Clock, Zap, Shield, Target, BarChart3 } from 'lucide-react';

function AIMonitoringPanel() {
  const [monitoring, setMonitoring] = useState(null);
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [aiDetail, setAiDetail] = useState(null);
  const [aiHistory, setAiHistory] = useState([]);
  const [tradingMode, setTradingMode] = useState(() => localStorage.getItem('tradingMode') || 'paper');
  const [accountInfo, setAccountInfo] = useState(null);
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const endpointIndexRef = useRef(0);
  const endpointsRef = useRef([]);

  // moved below after connectWebSocket definition

  // 监听前端交易模式切换事件
  useEffect(() => {
    const handler = (e) => {
      const mode = e?.detail?.mode || 'paper';
      setTradingMode(mode);
    };
    window.addEventListener('tradingModeChanged', handler);
    return () => window.removeEventListener('tradingModeChanged', handler);
  }, []);

  // 获取真实账户信息（live/demo）
  useEffect(() => {
    let timer = null;
    const fetchAccount = async () => {
      try {
        if (tradingMode === 'paper') { setAccountInfo(null); return; }
        const res = await axios.get('/api/okx/trade/account', { params: { mode: tradingMode } });
        setAccountInfo(res.data?.data || null);
      } catch (_) {
        // 忽略错误，保持现有显示
      }
    };
    fetchAccount();
    if (tradingMode !== 'paper') {
      timer = setInterval(fetchAccount, 15000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [tradingMode, connected]);

  const addLog = useCallback((log) => {
    setLogs(prev => {
      const newLogs = [log, ...prev];
      return newLogs.slice(0, 50);
    });
  }, []);

  const connectWebSocket = useCallback((isRetry = false) => {
    if (!shouldReconnectRef.current) return;

    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const primaryUrl = process.env.NODE_ENV === 'production'
      ? `${proto}://${window.location.host}/ws`
      : `${proto}://${window.location.hostname}:3001`;
    const fallbackUrl = `${proto}://${window.location.hostname}:3001`;
    endpointsRef.current = Array.from(new Set([primaryUrl, fallbackUrl]));

    const endpoints = endpointsRef.current;
    const index = isRetry ? (endpointIndexRef.current + 1) % endpoints.length : endpointIndexRef.current % endpoints.length;
    endpointIndexRef.current = index;
    const targetUrl = endpoints[index];

    const scheduleReconnect = (advanceEndpoint = false) => {
      if (!shouldReconnectRef.current) return;
      if (advanceEndpoint) {
        endpointIndexRef.current = (endpointIndexRef.current + 1) % endpointsRef.current.length;
      }
      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const baseDelay = 1500 * Math.pow(2, attempt - 1);
      const delay = Math.min(baseDelay, 30000) + Math.random() * 800;
      console.log(`[AI监控] ${(delay / 1000).toFixed(1)}秒后重连 (第 ${attempt} 次尝试)...`);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        connectWebSocket(true);
      }, delay);
    };

    let ws;
    try {
      ws = new WebSocket(targetUrl);
    } catch (err) {
      console.error('[AI监控] 创建 WebSocket 失败:', err);
      scheduleReconnect(true);
      return;
    }

    ws.onopen = () => {
      console.log(`[AI监控] WebSocket已连接 (${targetUrl})`);
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      endpointIndexRef.current = 0;
      ws.send(JSON.stringify({ type: 'subscribe_monitoring' }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'monitoring_summary':
          setMonitoring(data.data);
          setLastUpdate(new Date());
          break;
        case 'monitoring_update':
          if (data.updateType && data.data) {
            setMonitoring(prev => ({
              ...prev,
              [data.updateType]: data.data
            }));
          }
          break;
        case 'ai_analysis':
          addLog({
            type: 'ai',
            message: `AI分析完成: ${data.data.signal} (置信度: ${data.data.confidence}%)`,
            data: data.data,
            timestamp: data.timestamp
          });
          setAiDetail(data.data);
          setAiHistory(prev => [{
            signal: data.data.signal,
            confidence: data.data.confidence,
            entryPrice: data.data.entryPrice,
            timestamp: data.timestamp
          }, ...prev].slice(0, 10));
          break;
        case 'order_filled':
          addLog({
            type: 'success',
            message: `订单成交: ${data.data.order.symbol} ${data.data.order.side}`,
            data: data.data,
            timestamp: data.timestamp
          });
          break;
        case 'position_opened':
          addLog({
            type: 'info',
            message: `新开仓位: ${data.data.symbol} ${data.data.side}`,
            data: data.data,
            timestamp: data.timestamp
          });
          break;
        case 'position_closed':
          addLog({
            type: 'info',
            message: `平仓: ${data.data.symbol}`,
            data: data.data,
            timestamp: data.timestamp
          });
          break;
        case 'monitoring_error':
          addLog({
            type: 'error',
            message: data.message,
            timestamp: data.timestamp
          });
          break;
        case 'monitoring_warning':
          addLog({
            type: 'warning',
            message: data.message,
            timestamp: data.timestamp
          });
          break;
        default:
          break;
      }
    };

    ws.onerror = (error) => {
      console.error(`[AI监控] WebSocket错误 (${targetUrl}):`, error);
      setConnected(false);
      if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        try { ws.close(); } catch (_) {}
      }
    };

    ws.onclose = () => {
      console.log(`[AI监控] WebSocket断开 (${targetUrl})`);
      setConnected(false);
      wsRef.current = null;
      if (!shouldReconnectRef.current) return;
      scheduleReconnect(true);
    };

    wsRef.current = ws;
  }, [addLog]);

  // 初始化与在线重连（放在 connectWebSocket 定义之后避免TDZ错误）
  useEffect(() => {
    shouldReconnectRef.current = true;
    connectWebSocket();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
      wsRef.current = null;
    };
  }, [connectWebSocket]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOnline = () => {
      if (!shouldReconnectRef.current) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      connectWebSocket();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [connectWebSocket]);

  if (!monitoring) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-primary border-t-transparent mx-auto mb-4" />
          <p className="text-dark-muted">正在连接监控系统...</p>
        </div>
      </div>
    );
  }

  const { trading, risk, orders, positions, ai, system } = monitoring;

  return (
    <div className="space-y-6">
      {/* 连接状态 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">AI自动分析监控</h2>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
          <span className="text-sm text-dark-muted">
            {connected ? '实时连接' : '连接断开'}
          </span>
          {lastUpdate && (
            <span className="text-xs text-dark-muted">
              (更新于 {lastUpdate.toLocaleTimeString()})
            </span>
          )}
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 交易状态 */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-muted">交易状态</span>
            <Activity className={`w-5 h-5 ${trading.enabled ? 'text-green-500' : 'text-gray-500'}`} />
          </div>
          <div className="text-2xl font-bold font-mono mb-1">
            {trading.enabled ? (trading.paused ? '已暂停' : '运行中') : '未启动'}
          </div>
          <div className="text-xs text-dark-muted">
            {trading.symbol || '无交易对'} ({trading.mode})
          </div>
        </div>

        {/* 账户余额 */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-muted">账户余额</span>
            <BarChart3 className="w-5 h-5 text-blue-500" />
          </div>
          {tradingMode !== 'paper' && accountInfo && !accountInfo.paper ? (
            <>
              <div className="text-2xl font-bold font-mono mb-1">
                ${Number(accountInfo.totalEquity || 0).toLocaleString()}
              </div>
              <div className="text-xs text-dark-muted">
                可用: ${Number(accountInfo.availableBalance || 0).toLocaleString()} • 类型: {accountInfo.accountType || 'spot'}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono mb-1">
                ${risk.balance?.toLocaleString() || '0'}
              </div>
              <div className={`text-xs ${risk.dailyPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                今日: {risk.dailyPnL >= 0 ? '+' : ''}${risk.dailyPnL?.toFixed(2) || '0'}
              </div>
            </>
          )}
        </div>

        {/* AI信号 */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-muted">最新信号</span>
            <Zap className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-2xl font-bold font-mono mb-1">
            {ai.lastSignal || '无信号'}
          </div>
          <div className="text-xs text-dark-muted">
            置信度: {ai.confidence}% | 分析 {ai.totalAnalyses} 次
          </div>
        </div>

        {/* 持仓 */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-muted">持仓</span>
            <Target className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold font-mono mb-1">
            {positions.count} 个
          </div>
          <div className={`text-xs ${positions.unrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            未实现: {positions.unrealizedPnl >= 0 ? '+' : ''}${positions.unrealizedPnl?.toFixed(2) || '0'}
          </div>
        </div>
      </div>

      {/* 风控状态 */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Shield className="w-5 h-5 mr-2 text-blue-500" />
          风控状态
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-dark-muted mb-1">回撤</div>
            <div className="flex items-center">
              <div className="flex-1 bg-dark-bg rounded-full h-2 mr-2">
                <div
                  className={`h-2 rounded-full ${parseFloat(risk.drawdown) > 5 ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(parseFloat(risk.drawdown) || 0, 100)}%` }}
                />
              </div>
              <span className="text-sm font-mono">{risk.drawdown}%</span>
            </div>
          </div>

          <div>
            <div className="text-sm text-dark-muted mb-1">连续亏损</div>
            <div className="text-xl font-bold font-mono">
              {risk.consecutiveLosses} 次
            </div>
          </div>

          <div>
            <div className="text-sm text-dark-muted mb-1">监控订单</div>
            <div className="text-xl font-bold font-mono">
              {orders.monitoring} 个
            </div>
          </div>

          <div>
            <div className="text-sm text-dark-muted mb-1">系统运行</div>
            <div className="text-sm font-mono">
              {formatUptime(system.uptime)}
            </div>
          </div>
        </div>

        {/* 风控警告 */}
        {(risk.consecutiveLosses >= 3 || parseFloat(risk.drawdown) > 5) && (
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-yellow-500 mr-2 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-yellow-500">风控警告</div>
              <div className="text-sm text-dark-muted mt-1">
                {risk.consecutiveLosses >= 3 && `连续亏损 ${risk.consecutiveLosses} 次，请注意风险。`}
                {parseFloat(risk.drawdown) > 5 && ` 当前回撤 ${risk.drawdown}%，接近警戒线。`}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI分析详情 */}
      {aiDetail && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">AI分析详情</h3>
            <div className="text-xs text-dark-muted">{new Date(aiDetail.timestamp || Date.now()).toLocaleString()}</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <div className="text-xs text-dark-muted mb-1">信号</div>
              <div className="font-mono font-bold text-base">{aiDetail.signal || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-dark-muted mb-1">置信度</div>
              <div className="font-mono font-bold">{Number.isFinite(aiDetail.confidence) ? `${aiDetail.confidence}%` : 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-dark-muted mb-1">入场价</div>
              <div className="font-mono font-bold">{Number.isFinite(aiDetail.entryPrice) ? `$${aiDetail.entryPrice.toFixed(2)}` : 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-dark-muted mb-1">止损 / 止盈</div>
              <div className="font-mono font-bold">
                {Number.isFinite(aiDetail.stopLoss) ? `$${aiDetail.stopLoss.toFixed(2)}` : 'N/A'}
                <span className="text-dark-muted mx-1">/</span>
                {Number.isFinite(aiDetail.takeProfit) ? `$${aiDetail.takeProfit.toFixed(2)}` : 'N/A'}
              </div>
            </div>
          </div>

          {aiDetail.summary && (
            <div className="mb-2 text-sm">
              <span className="text-dark-muted">结论：</span>
              <span>{aiDetail.summary}</span>
            </div>
          )}
          {aiDetail.reasoning && (
            <div className="text-xs text-dark-muted whitespace-pre-wrap">{aiDetail.reasoning}</div>
          )}

          {(aiDetail.coreIndicatorsAlignment || aiDetail.signalChangeReason) && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {aiDetail.coreIndicatorsAlignment && (
                <div className="bg-dark-bg rounded p-2 border border-dark-border">
                  <div className="text-dark-muted mb-1">核心指标一致性</div>
                  <div className="font-mono">{aiDetail.coreIndicatorsAlignment}</div>
                </div>
              )}
              {aiDetail.signalChangeReason && (
                <div className="bg-dark-bg rounded p-2 border border-dark-border">
                  <div className="text-dark-muted mb-1">信号变更原因</div>
                  <div className="font-mono whitespace-pre-wrap">{aiDetail.signalChangeReason}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 多时间框架趋势 */}
      {aiDetail?.multiTimeframe?.trends && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-3">多时间框架趋势</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {['1h','4h','1d'].map(tf => {
              const t = aiDetail.multiTimeframe.trends[tf];
              if (!t) return null;
              const dir = t.direction === 'bull' ? '📈 多头' : t.direction === 'bear' ? '📉 空头' : '↔️ 震荡';
              return (
                <div key={tf} className="bg-dark-bg rounded p-3 border border-dark-border">
                  <div className="text-xs text-dark-muted mb-1">{tf.toUpperCase()}</div>
                  <div className="font-semibold mb-1">{dir}</div>
                  <div className="text-xs text-dark-muted">EMA9/21/50: {[
                    Number.isFinite(t.ema9) ? t.ema9.toFixed(2) : 'N/A',
                    Number.isFinite(t.ema21) ? t.ema21.toFixed(2) : 'N/A',
                    Number.isFinite(t.ema50) ? t.ema50.toFixed(2) : 'N/A'
                  ].join(' / ')}</div>
                  <div className="text-xs">强度: {Number.isFinite(t.strength) ? `${t.strength}%` : 'N/A'}</div>
                </div>
              );
            })}
          </div>
          {aiDetail.multiTimeframe.resonance && (
            <div className="mt-3 text-sm">
              <div className="text-dark-muted">共振：{aiDetail.multiTimeframe.resonance.status}（评分 {aiDetail.multiTimeframe.resonance.score}/100）</div>
              <div className="text-dark-muted">置信度调整：{aiDetail.multiTimeframe.resonance.adjustment > 0 ? '+' : ''}{aiDetail.multiTimeframe.resonance.adjustment}%</div>
              {aiDetail.multiTimeframe.resonance.description && (
                <div className="text-xs text-dark-muted mt-1">{aiDetail.multiTimeframe.resonance.description}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI决策时间线 */}
      {aiHistory.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">AI决策时间线</h3>
            <div className="text-xs text-dark-muted">最近 {aiHistory.length} 次</div>
          </div>
          <div className="space-y-2">
            {aiHistory.map((h, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm bg-dark-bg rounded p-2 border border-dark-border">
                <div className="font-mono">{new Date(h.timestamp).toLocaleTimeString()}</div>
                <div className="font-semibold">{h.signal}</div>
                <div className="text-dark-muted">{Number.isFinite(h.confidence) ? `${h.confidence}%` : '-'}</div>
                <div className="font-mono">{Number.isFinite(h.entryPrice) ? `$${Number(h.entryPrice).toFixed(2)}` : '-'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 实时日志 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center">
            <Clock className="w-5 h-5 mr-2 text-green-500" />
            实时事件日志
          </h3>
          <button
            onClick={() => setLogs([])}
            className="text-sm text-dark-muted hover:text-white"
          >
            清除
          </button>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center text-dark-muted py-8">
              暂无事件日志
            </div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className="flex items-start p-3 bg-dark-bg rounded-lg hover:bg-dark-border transition-colors"
              >
                {log.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5" />}
                {log.type === 'error' && <XCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />}
                {log.type === 'warning' && <AlertCircle className="w-5 h-5 text-yellow-500 mr-2 mt-0.5" />}
                {log.type === 'info' && <Activity className="w-5 h-5 text-blue-500 mr-2 mt-0.5" />}
                {log.type === 'ai' && <Zap className="w-5 h-5 text-purple-500 mr-2 mt-0.5" />}

                <div className="flex-1">
                  <div className="text-sm">{log.message}</div>
                  <div className="text-xs text-dark-muted mt-1">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 详细指标 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 订单统计 */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">订单统计</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-dark-muted">正在监控</span>
              <span className="font-mono font-bold">{orders.monitoring}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-muted">最近成交</span>
              <span className="font-mono font-bold text-green-500">{orders.recentFills}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-muted">失败订单</span>
              <span className="font-mono font-bold text-red-500">{orders.failures}</span>
            </div>
          </div>
        </div>

        {/* 系统健康 */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">系统健康</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-dark-muted">运行时间</span>
              <span className="font-mono">{formatUptime(system.uptime)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-muted">错误数</span>
              <span className="font-mono font-bold text-red-500">{system.errorCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-muted">警告数</span>
              <span className="font-mono font-bold text-yellow-500">{system.warningCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天 ${hours % 24}小时`;
  if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${seconds}秒`;
}

export default AIMonitoringPanel;
