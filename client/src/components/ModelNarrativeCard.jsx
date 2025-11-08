import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { BookOpenText, Loader2, RefreshCcw, X, Activity } from 'lucide-react';

const stageFallback = {
  observation: 'observe',
  ai_analysis: 'decide',
  trade_action: 'act',
  risk_alert: 'review',
  system: 'system'
};

const stageLabels = {
  observe: '观察',
  decide: '决策',
  act: '执行',
  review: '复盘',
  system: '系统'
};

const stageColors = {
  observe: 'bg-blue-500/10 border-blue-500/30',
  decide: 'bg-purple-500/10 border-purple-500/30',
  act: 'bg-green-500/10 border-green-500/30',
  review: 'bg-amber-500/10 border-amber-500/30',
  system: 'bg-slate-500/10 border-slate-500/30'
};

const getNarrativeKey = (item) => {
  if (!item) return '';
  const content = typeof item.content === 'string' ? item.content.slice(0, 24) : '';
  return item.id || `${item.type || 'unknown'}-${item.timestamp || 0}-${content}`;
};

const mergeNarratives = (incoming, existing = []) => {
  const map = new Map();
  [...incoming, ...existing].forEach(entry => {
    if (!entry) return;
    const key = getNarrativeKey(entry);
    if (!map.has(key)) {
      map.set(key, entry);
    }
  });

  return Array.from(map.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 50);
};

function Sparkline({ data }) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const width = 120;
  const height = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const up = data[data.length - 1] >= data[0];
  const stroke = up ? '#22c55e' : '#ef4444';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-80">
      <polyline fill="none" stroke={stroke} strokeWidth="2" points={points} />
    </svg>
  );
}

function ModelNarrativeCard({ selectedSymbol }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [narrativeHistory, setNarrativeHistory] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const endpointIndexRef = useRef(0);
  const endpointsRef = useRef([]);

  // 🆕 WebSocket 连接（nof1.ai 风格实时推送）
  const connectWebSocket = useCallback((isRetry = false) => {
    if (!shouldReconnectRef.current) return;

    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsPort = import.meta.env.VITE_WS_PORT || 3001;
    const endpoints = new Set([
      `${proto}://${window.location.hostname}:${wsPort}`
    ]);
    if (process.env.NODE_ENV === 'production') {
      endpoints.add(`${proto}://${window.location.host}/ws`);
    }
    endpointsRef.current = Array.from(endpoints);
    if (endpointsRef.current.length === 0) {
      console.warn('模型自述 WebSocket 未配置可用端点');
      return;
    }

    const index = isRetry
      ? (endpointIndexRef.current + 1) % endpointsRef.current.length
      : endpointIndexRef.current % endpointsRef.current.length;
    endpointIndexRef.current = index;
    const targetUrl = endpointsRef.current[index];

    const scheduleReconnect = (advanceEndpoint = false) => {
      if (!shouldReconnectRef.current) return;
      if (advanceEndpoint && endpointsRef.current.length > 1) {
        endpointIndexRef.current = (endpointIndexRef.current + 1) % endpointsRef.current.length;
      }
      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      const baseDelay = 1200 * Math.pow(2, attempt - 1);
      const delay = Math.min(baseDelay, 20000) + Math.random() * 600;
      console.log(`[模型叙述] ${(delay / 1000).toFixed(1)}秒后重连 (第 ${attempt} 次尝试)...`);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => connectWebSocket(true), delay);
    };

    let ws;
    try {
      ws = new WebSocket(targetUrl);
    } catch (err) {
      console.error('[模型叙述] 创建 WebSocket 失败:', err);
      scheduleReconnect(true);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`🔗 模型自述 WebSocket 已连接 (${targetUrl})`);
      setWsConnected(true);
      reconnectAttemptsRef.current = 0;
      endpointIndexRef.current = 0;
      ws.send(JSON.stringify({ type: 'subscribe_monitoring' }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }

        if (message.type === 'narrative_history') {
          const arr = Array.isArray(message.data) ? message.data : [];
          if (arr.length > 0) {
            setNarrativeHistory(prev => mergeNarratives(arr, prev));
          }
          return;
        }

        if (message.type === 'model_narrative') {
          const narrative = message.data;
          if (narrative) {
            setNarrativeHistory(prev => mergeNarratives([narrative], prev));
          }
          return;
        }
      } catch (e) {
        console.error('解析 WebSocket 消息失败:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
      setWsConnected(false);
      if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        try { ws.close(); } catch (_) {}
      }
    };

    ws.onclose = () => {
      console.log('❌ 模型自述 WebSocket 已断开');
      setWsConnected(false);
      wsRef.current = null;
      if (!shouldReconnectRef.current) return;
      scheduleReconnect(true);
    };
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connectWebSocket();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        try { ws.close(); } catch (_) {}
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

  useEffect(() => {
    if (open) {
      fetchNarrative();
      fetchNarrativeHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedSymbol]);

  const fetchNarrative = async () => {
    if (!selectedSymbol) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.post('/api/ai/analyze-with-tools', {
        symbol: selectedSymbol,
        useFullMCP: true,
        mode: 'narrative'
      });
      setData(resp.data?.data || null);
    } catch (e) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 🆕 获取叙述历史
  const fetchNarrativeHistory = async () => {
    try {
      const resp = await axios.get('/api/monitoring/narrative-history');
      if (resp.data?.success) {
        setNarrativeHistory(mergeNarratives(resp.data.data || [], []));
      }
    } catch (e) {
      console.error('获取叙述历史失败:', e);
    }
  };

  const NarrativeBody = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-40 text-dark-muted">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> 加载中...
        </div>
      );
    }

    // 🆕 优先显示实时叙述历史（nof1.ai 风格）
    if (narrativeHistory.length > 0) {
      const lastN = 24;
      const confidenceSeries = narrativeHistory
        .map(n => n?.metrics?.confidence)
        .filter(v => Number.isFinite(v))
        .slice(0, lastN)
        .reverse();
      const totalMsSeries = narrativeHistory
        .map(n => n?.metrics?.totalMs)
        .filter(v => Number.isFinite(v))
        .slice(0, lastN)
        .reverse();
      return (
        <div className="space-y-3">
          {/* 连接状态指示 */}
          <div className="flex items-center justify-between pb-2 border-b border-dark-border">
            <div className="text-xs text-dark-muted">实时自述流</div>
            <div className="flex items-center space-x-1">
              <Activity className={`w-3 h-3 ${wsConnected ? 'text-green-500' : 'text-dark-muted'}`} />
              <span className="text-[10px] text-dark-muted">
                {wsConnected ? '已连接' : '断开'}
              </span>
            </div>
          </div>

          {/* 迷你指标面板 */}
          {(confidenceSeries.length > 1 || totalMsSeries.length > 1) && (
            <div className="grid grid-cols-2 gap-3 text-[10px] text-dark-muted">
              <div>
                <div className="mb-1">置信度</div>
                <Sparkline data={confidenceSeries} />
              </div>
              <div>
                <div className="mb-1">总耗时(ms)</div>
                <Sparkline data={totalMsSeries} />
              </div>
            </div>
          )}

          {/* 叙述时间线（滚动由外层容器承载，避免内外双滚导致底部空白） */}
          <div className="space-y-3 pr-2">
            {narrativeHistory.map((item, idx) => {
              const stage = item.stage || stageFallback[item.type] || 'observe';
              const cardClass = stageColors[stage] || 'bg-dark-border/10 border-dark-border';
              const stageLabel = stageLabels[stage] || item.type || '叙述';
              const key = getNarrativeKey(item) || idx;

              return (
                <div
                  key={key}
                  className={`border rounded-lg p-3 ${cardClass}`}
                >
                  {/* 头部：阶段 + 时间 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-semibold text-accent-primary">
                        {stageLabel}
                      </span>
                      {item.symbol && (
                        <span className="text-[10px] text-dark-muted uppercase">
                          {item.symbol}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-dark-muted">
                      {new Date(item.timestamp).toLocaleTimeString('zh-CN')}
                    </span>
                  </div>

                  {/* 内容 */}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {item.content}
                  </div>

                  {/* 迷你价格序列 */}
                  {Array.isArray(item.sparkline) && item.sparkline.length > 1 && (
                    <div className="mt-2">
                      <Sparkline data={item.sparkline} />
                    </div>
                  )}

                  {/* 意图和下一步 */}
                  {(item.intent || item.nextAction) && (
                    <div className="mt-2 pt-2 border-t border-dark-border/50 text-[11px] text-dark-muted space-y-0.5">
                      {item.intent && <div>意图：{item.intent}</div>}
                      {item.nextAction && <div>下一步：{item.nextAction}</div>}
                    </div>
                  )}

                  {/* 证据 */}
                  {item.evidence && (
                    <div className="mt-2 pt-2 border-t border-dark-border/50">
                      <div className="text-[10px] text-dark-muted mb-1">证据：</div>
                      {Array.isArray(item.evidence) ? (
                        <ul className="text-[11px] text-dark-muted space-y-0.5 pl-3 list-disc">
                          {item.evidence.map((evi, eIdx) => (
                            <li key={`${key}-evi-${eIdx}`}>{String(evi)}</li>
                          ))}
                        </ul>
                      ) : typeof item.evidence === 'object' ? (
                        <div className="text-[11px] text-dark-muted space-y-0.5">
                          {Object.entries(item.evidence).map(([eKey, eValue]) => {
                            if (eValue && typeof eValue === 'object') return null;
                            return (
                              <div key={`${key}-${eKey}`}>
                                {eKey}: {String(eValue)}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-[11px] text-dark-muted">{String(item.evidence)}</div>
                      )}
                    </div>
                  )}

                  {/* 指标/耗时 */}
                  {item.metrics && (
                    <div className="mt-2 pt-2 border-t border-dark-border/50 text-[10px] text-dark-muted grid grid-cols-3 gap-2">
                      {item.metrics.totalMs !== undefined && (
                        <div>总耗时：{item.metrics.totalMs}ms</div>
                      )}
                      {item.metrics.aiMs !== undefined && (
                        <div>AI：{item.metrics.aiMs}ms</div>
                      )}
                      {item.metrics.collectMs !== undefined && (
                        <div>采集：{item.metrics.collectMs}ms</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // 兜底：显示旧版格式
    if (error) {
      return (
        <div className="text-sm text-red-400">{error}</div>
      );
    }
    
    return (
      <div className="text-sm text-dark-muted text-center py-8">
        暂无叙述内容，等待AI分析...
      </div>
    );
  };

  return (
    <div>
      {/* Edge Toggle Button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed right-2 top-1/3 z-40 bg-accent-primary text-white px-2 py-2 rounded-l ${open ? 'hidden' : ''}`}
        title="模型自述"
      >
        <BookOpenText className="w-4 h-4" />
      </button>

      {/* Floating Card */}
      {open && (
        <div className="fixed right-2 top-16 bottom-4 z-50 w-96 max-w-[90vw] bg-dark-card border border-dark-border rounded-lg shadow-xl flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-dark-border">
            <div className="flex items-center space-x-2">
              <BookOpenText className="w-4 h-4 text-accent-primary" />
              <div className="text-sm font-semibold">模型自述（{selectedSymbol || ''}）</div>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={fetchNarrative} className="p-1 hover:bg-dark-border rounded" title="刷新">
                <RefreshCcw className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-dark-border rounded" title="关闭">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <NarrativeBody />
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelNarrativeCard;


