import React, { useEffect, useRef, useState } from 'react';

function AIMonitoringSummary({ instrument = 'ALL' }) {
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [lastSignal, setLastSignal] = useState(null); // { signal, confidence, entryPrice, timestamp }
  const [warnings, setWarnings] = useState(0);
  const [errors, setErrors] = useState(0);
  const [execLite, setExecLite] = useState(null); // { qualityScore, p95Latency, p95SlippagePercent }
  const wsRef = useRef(null);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const primaryUrl = process.env.NODE_ENV === 'production'
      ? `${proto}://${window.location.host}/ws`
      : `${proto}://${window.location.hostname}:3001`;
    const fallbackUrl = `${proto}://${window.location.hostname}:3001`;
    let didFallback = false;

    const ws = new WebSocket(primaryUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      try { ws.send(JSON.stringify({ type: 'subscribe_monitoring' })); } catch (_) {}
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data || !data.type) return;
        switch (data.type) {
          case 'monitoring_summary':
            setLastUpdate(new Date());
            break;
          case 'monitoring_update':
            if (data.updateType === 'executionQuality') {
              const s = data.data || {};
              setExecLite({
                qualityScore: s.qualityScore,
                p95Latency: s.latencyStats?.p95,
                p95SlippagePercent: (s.slippageStats?.p95 || 0) / 100
              });
            }
            break;
          case 'ai_analysis':
            setLastSignal({
              signal: data.data?.signal,
              confidence: data.data?.confidence,
              entryPrice: data.data?.entryPrice,
              timestamp: data.timestamp
            });
            break;
          case 'monitoring_warning':
            setWarnings((n) => n + 1);
            break;
          case 'monitoring_error':
            setErrors((n) => n + 1);
            break;
          default:
            break;
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      setConnected(false);
      if (process.env.NODE_ENV === 'production' && !didFallback) {
        didFallback = true;
        try {
          const ws2 = new WebSocket(fallbackUrl);
          ws2.onopen = () => {
            setConnected(true);
            ws2.send(JSON.stringify({ type: 'subscribe_monitoring' }));
          };
          ws2.onmessage = ws.onmessage;
          ws2.onerror = () => setConnected(false);
          ws2.onclose = () => setConnected(false);
          wsRef.current = ws2;
        } catch (_) {}
      }
    };

    ws.onclose = () => setConnected(false);

    return () => { try { wsRef.current && wsRef.current.close(); } catch (_) {} };
  }, []);

  const formatTime = (ts) => {
    if (!ts) return '-';
    const d = typeof ts === 'number' ? new Date(ts) : ts;
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">AI监控概览</h3>
        <div className="text-[10px] text-dark-muted">筛选：{instrument==='ALL'?'全部':instrument==='SPOT'?'现货':'合约'}</div>
        <div className="flex items-center space-x-2 text-xs text-dark-muted">
          <span className={`inline-flex items-center px-2 py-0.5 rounded border ${connected ? 'border-green-600 text-green-400' : 'border-dark-border'}`}>
            {connected ? '连接正常' : '未连接'}
          </span>
          <span>更新: {lastUpdate ? formatTime(lastUpdate) : '-'}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-dark-bg rounded p-3">
          <div className="text-[11px] text-dark-muted mb-1">最近信号</div>
          <div className="text-sm font-bold">
            {lastSignal?.signal || '-'}
          </div>
          <div className="text-[11px] text-dark-muted mt-1">置信度 {lastSignal?.confidence ?? '-'}%</div>
        </div>
        <div className="bg-dark-bg rounded p-3">
          <div className="text-[11px] text-dark-muted mb-1">入场价</div>
          <div className="text-sm font-bold">{lastSignal?.entryPrice ?? '-'}</div>
          <div className="text-[11px] text-dark-muted mt-1">时间 {formatTime(lastSignal?.timestamp)}</div>
        </div>
        <div className="bg-dark-bg rounded p-3">
          <div className="text-[11px] text-dark-muted mb-1">告警统计</div>
          <div className="text-sm font-bold">⚠️ {warnings} / ❌ {errors}</div>
          <div className="text-[11px] text-dark-muted mt-1">会话期内</div>
        </div>
      </div>

      {/* 迷你执行质量概览条 */}
      <div className="mt-3 bg-dark-bg rounded p-2 border border-dark-border/50">
        <div className="flex items-center justify-between text-[11px] text-dark-muted">
          <span>执行质量</span>
          <span className="font-mono">{lastUpdate ? formatTime(lastUpdate) : '-'}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="bg-dark-bg/60 rounded p-2 text-center">
            <div className="text-[10px] text-dark-muted">质量评分</div>
            <div className="text-sm font-bold">{Number.isFinite(execLite?.qualityScore) ? Math.round(execLite.qualityScore) : '--'}</div>
          </div>
          <div className="bg-dark-bg/60 rounded p-2 text-center">
            <div className="text-[10px] text-dark-muted">p95 延迟</div>
            <div className={`text-sm font-bold ${execLite?.p95Latency > 2000 ? 'text-red-400' : execLite?.p95Latency > 1000 ? 'text-orange-400' : 'text-green-400'}`}>{Number.isFinite(execLite?.p95Latency) ? `${Math.round(execLite.p95Latency)}ms` : '--'}</div>
          </div>
          <div className="bg-dark-bg/60 rounded p-2 text-center">
            <div className="text-[10px] text-dark-muted">p95 滑点</div>
            <div className={`text-sm font-bold ${Math.abs(execLite?.p95SlippagePercent || 0) > 0.01 ? 'text-red-400' : Math.abs(execLite?.p95SlippagePercent || 0) > 0.005 ? 'text-orange-400' : 'text-green-400'}`}>{Number.isFinite(execLite?.p95SlippagePercent) ? `${(execLite.p95SlippagePercent*100).toFixed(2)}%` : '--'}</div>
          </div>
        </div>
      </div>

      <div className="text-[11px] text-dark-muted mt-3">
        更多详情请前往 账户 → AI监控。
      </div>
    </div>
  );
}

export default AIMonitoringSummary;


