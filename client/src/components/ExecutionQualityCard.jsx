import React, { useEffect, useRef, useState, useMemo } from 'react';
import axios from 'axios';

function Sparkline({ data = [], color = '#22c55e', height = 28, strokeWidth = 2, valueFormatter }) {
  const width = 120;
  const h = height;
  const values = (data || []).filter(v => Number.isFinite(v));
  if (values.length === 0) {
    return <div style={{ width, height: h }} className="bg-dark-bg/50 rounded" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2; // padding 2
    return `${x},${y}`;
  }).join(' ');
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(x / step)));
    setHoverIdx(idx);
  };
  const handleLeave = () => setHoverIdx(null);
  const cx = hoverIdx != null ? hoverIdx * step : null;
  const cy = hoverIdx != null ? (h - ((values[hoverIdx] - min) / range) * (h - 4) - 2) : null;
  const display = (v) => valueFormatter ? valueFormatter(v) : v;
  return (
    <div className="relative" style={{ width, height: h }}>
      <svg width={width} height={h} className="block" onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <polyline fill="none" stroke={color} strokeWidth={strokeWidth} points={points} />
        {hoverIdx != null && (
          <>
            <circle cx={cx} cy={cy} r={2.5} fill={color} />
            <line x1={cx} y1={0} x2={cx} y2={h} stroke={color} strokeWidth={0.5} opacity={0.3} />
          </>
        )}
      </svg>
      {hoverIdx != null && (
        <div className="absolute -top-6 left-0 text-[10px] bg-dark-card border border-dark-border px-1.5 py-0.5 rounded shadow"
             style={{ transform: `translateX(${Math.max(0, Math.min(width - 40, cx - 20))}px)` }}>
          {display(values[hoverIdx])}
        </div>
      )}
    </div>
  );
}

function ExecutionQualityCard({ selectedSymbol, instrument = 'ALL' }) {
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null); // { slippageStats, fillRateStats, latencyStats, qualityScore, recentExecutions }
  const [updatedAt, setUpdatedAt] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [winSize, setWinSize] = useState(30);
  const wsRef = useRef(null);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const primaryUrl = process.env.NODE_ENV === 'production'
      ? `${proto}://${window.location.host}/ws`
      : `${proto}://${window.location.hostname}:3001`;

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
        if (data.type === 'monitoring_update' && data.updateType === 'executionQuality') {
          setStats(data.data || null);
          setUpdatedAt(new Date());
        }
      } catch (_) {}
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => setConnected(false);

    return () => { try { wsRef.current && wsRef.current.close(); } catch (_) {} };
  }, []);

  const avgSlippage = stats?.slippageStats?.average;
  const avgLatencyMs = stats?.latencyStats?.average;
  const avgFillRate = stats?.fillRateStats?.average;
  const qualityScore = stats?.qualityScore;
  const recent = Array.isArray(stats?.recentExecutions) ? stats.recentExecutions : [];
  const classifyInstrument = (e) => {
    const side = String(e.side || '').toUpperCase();
    if (side === 'LONG' || side === 'SHORT') return 'FUTURES';
    if (side === 'BUY' || side === 'SELL') return 'SPOT';
    return 'UNKNOWN';
  };
  const recentFiltered = useMemo(() => {
    if (instrument === 'ALL') return recent;
    return recent.filter((e) => {
      const kind = classifyInstrument(e);
      return instrument === 'SPOT' ? kind === 'SPOT' : kind === 'FUTURES';
    });
  }, [recent, instrument]);
  const p50Latency = stats?.latencyStats?.p50;
  const p95Latency = stats?.latencyStats?.p95;
  const p50Slip = stats?.slippageStats?.p50;
  const p95Slip = stats?.slippageStats?.p95;
  const slipHist = stats?.slippageStats?.histogram || {};
  const history = Array.isArray(stats?.history) ? stats.history : [];
  const series = useMemo(() => {
    return {
      latencyP95: history.map(p => Number(p.p95Latency) || 0),
      slippageP95Pct: history.map(p => Math.abs(Number(p.p95SlippagePercent) || 0)),
      fillRateAvg: history.map(p => Number(p.avgFillRate) || 0)
    };
  }, [history]);
  const seriesWin = useMemo(() => {
    const cut = (arr) => arr.slice(-Math.max(1, Math.min(60, winSize)));
    return {
      latencyP95: cut(series.latencyP95),
      slippageP95Pct: cut(series.slippageP95Pct),
      fillRateAvg: cut(series.fillRateAvg)
    };
  }, [series, winSize]);

  const fmtTime = (ts) => {
    if (!ts) return '-';
    const d = new Date(typeof ts === 'number' ? ts : String(ts));
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">执行质量</h3>
        <div className={`text-[10px] px-2 py-0.5 rounded border ${connected ? 'border-green-600 text-green-400' : 'border-dark-border text-dark-muted'}`}>
          {connected ? '实时' : '离线'}{updatedAt ? ` · ${updatedAt.toLocaleTimeString('zh-CN')}` : ''}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-dark-bg rounded p-3">
          <div className="text-[11px] text-dark-muted mb-1">质量评分</div>
          <div className="text-lg font-bold">{Number.isFinite(qualityScore) ? Math.round(qualityScore) : '--'}</div>
        </div>
        <div className="bg-dark-bg rounded p-3">
          <div className="text-[11px] text-dark-muted mb-1">平均滑点</div>
          <div className="text-sm font-bold">{Number.isFinite(avgSlippage) ? `${avgSlippage.toFixed(1)} bps` : '--'}</div>
        </div>
        <div className="bg-dark-bg rounded p-3">
          <div className="text-[11px] text-dark-muted mb-1">平均延迟</div>
          <div className="text-sm font-bold">{Number.isFinite(avgLatencyMs) ? `${Math.round(avgLatencyMs)} ms` : '--'}</div>
        </div>
        <div className="bg-dark-bg rounded p-3">
          <div className="text-[11px] text-dark-muted mb-1">平均成交率</div>
          <div className="text-sm font-bold">{Number.isFinite(avgFillRate) ? `${avgFillRate.toFixed(1)}%` : '--'}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="text-[11px] text-dark-muted">
          统计窗口：24h；阈值：延迟≥2s/5s、滑点≥50/100 bps。
        </div>
        <button
          onClick={() => setShowDetails(v => !v)}
          className="text-[11px] px-2 py-1 rounded bg-dark-bg hover:bg-dark-card text-dark-text border border-dark-border"
        >
          {showDetails ? '隐藏明细' : `最近执行 (${(instrument==='ALL'?recent.length:recentFiltered.length)})`}
        </button>
      </div>

      {/* 分布概览 */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
        <div className="bg-dark-bg/30 p-2 rounded">
          <div className="text-dark-muted mb-1">延迟分位数</div>
          <div className="font-mono">p50 {Number.isFinite(p50Latency) ? Math.round(p50Latency) : '--'}ms · p95 {Number.isFinite(p95Latency) ? Math.round(p95Latency) : '--'}ms</div>
        </div>
        <div className="bg-dark-bg/30 p-2 rounded">
          <div className="text-dark-muted mb-1">滑点分位数</div>
          <div className="font-mono">p50 {Number.isFinite(p50Slip) ? (p50Slip/100).toFixed(2) : '--'}% · p95 {Number.isFinite(p95Slip) ? (p95Slip/100).toFixed(2) : '--'}%</div>
        </div>
      </div>

      {/* 滑点直方图 */}
      <div className="mt-2">
        <div className="text-[11px] text-dark-muted mb-1">滑点分布 (abs)</div>
        <div className="grid grid-cols-5 gap-1 text-[10px]">
          {['<10','10-20','20-50','50-100','>=100'].map((k) => (
            <div key={k} className="bg-dark-bg rounded p-1 text-center">
              <div className="text-dark-muted">{k}bps</div>
              <div className="font-mono text-sm">{slipHist[k] || 0}</div>
            </div>
          ))}
        </div>
      </div>

    {/* 趋势小图 */}
    <div className="mt-3 flex items-center justify-between">
      <div className="text-[11px] text-dark-muted">趋势 (窗口)</div>
      <div className="space-x-1">
        {[10,30,60].map(n => (
          <button key={n}
                  onClick={() => setWinSize(n)}
                  className={`text-[10px] px-2 py-0.5 rounded border ${winSize===n ? 'border-accent-primary text-accent-primary' : 'border-dark-border text-dark-muted'} bg-dark-bg hover:bg-dark-card`}>{n}</button>
        ))}
      </div>
    </div>
    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-dark-bg/40 p-2 rounded border border-dark-border/50">
          <div className="flex items-center justify-between text-[11px] text-dark-muted">
            <span>延迟趋势 (p95)</span>
            <span className="font-mono text-[10px]">{Number.isFinite(p95Latency) ? `${Math.round(p95Latency)}ms` : '--'}</span>
          </div>
        <Sparkline data={seriesWin.latencyP95} color="#60a5fa" valueFormatter={(v)=>`${Math.round(v)}ms`} />
        </div>
        <div className="bg-dark-bg/40 p-2 rounded border border-dark-border/50">
          <div className="flex items-center justify-between text-[11px] text-dark-muted">
            <span>滑点趋势 (p95%)</span>
            <span className="font-mono text-[10px]">{Number.isFinite(p95Slip) ? `${(p95Slip/100).toFixed(2)}%` : '--'}</span>
          </div>
        <Sparkline data={seriesWin.slippageP95Pct} color="#34d399" valueFormatter={(v)=>`${(v*100).toFixed(2)}%`} />
        </div>
        <div className="bg-dark-bg/40 p-2 rounded border border-dark-border/50">
          <div className="flex items-center justify-between text-[11px] text-dark-muted">
            <span>成交率趋势 (%)</span>
            <span className="font-mono text-[10px]">{Number.isFinite(avgFillRate) ? `${avgFillRate.toFixed(1)}%` : '--'}</span>
          </div>
        <Sparkline data={seriesWin.fillRateAvg} color="#f59e0b" valueFormatter={(v)=>`${v.toFixed(1)}%`} />
        </div>
      </div>

      {showDetails && (
        <div className="mt-3 bg-dark-bg/60 rounded border border-dark-border divide-y divide-dark-border">
          {(instrument==='ALL'?recent:recentFiltered).length === 0 ? (
            <div className="text-[12px] text-dark-muted p-3">暂无执行记录</div>
          ) : (instrument==='ALL'?recent:recentFiltered).map((e, idx) => {
            const slipPercentVal = Number.isFinite(e.slippagePercent) ? e.slippagePercent : (e.slippage && Number.isFinite(e.slippage.percent) ? e.slippage.percent : undefined);
            const slip = Number.isFinite(slipPercentVal) ? `${(slipPercentVal * 100).toFixed(2)}%` : '--';
            const latencyVal = Number.isFinite(e.latencyMs) ? e.latencyMs : (e.latency && Number.isFinite(e.latency.ms) ? e.latency.ms : undefined);
            const latency = Number.isFinite(latencyVal) ? `${Math.round(latencyVal)}ms` : '--';
            const fillVal = Number.isFinite(e.fillRate) ? e.fillRate : (e.fillRate && Number.isFinite(e.fillRate.percent) ? e.fillRate.percent : undefined);
            const fill = Number.isFinite(fillVal) ? `${fillVal.toFixed(1)}%` : '--';
            const isBuy = (String(e.side).toUpperCase() === 'BUY' || String(e.side).toUpperCase() === 'LONG');
            const timeVal = e.time || e.executionTime || e.timestamp;
            return (
              <div key={`${e.time || idx}-${e.symbol}-${idx}`} className="p-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${isBuy ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{String(e.side).toUpperCase()}</span>
                    <span className={`px-1 py-0.5 rounded text-[10px] border ${classifyInstrument(e)==='FUTURES' ? 'border-purple-500/50 text-purple-300' : classifyInstrument(e)==='SPOT' ? 'border-emerald-500/50 text-emerald-300' : 'border-dark-border text-dark-muted'}`}>
                      {classifyInstrument(e)==='FUTURES' ? '合约' : classifyInstrument(e)==='SPOT' ? '现货' : '未知'}
                    </span>
                    <span className="font-mono text-dark-text">{e.symbol}</span>
                    <span className="text-dark-muted">{fmtTime(timeVal)}</span>
                  </div>
                  <span className="text-[10px] text-dark-muted">{String(e.status || '').toUpperCase()}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-[12px]">
                  <div className="bg-dark-card rounded p-2">
                    <div className="text-[10px] text-dark-muted">价格</div>
                    <div className="font-mono">
                      {Number(e.expectedPrice)?.toFixed ? Number(e.expectedPrice).toFixed(4) : e.expectedPrice} → {Number(e.actualPrice)?.toFixed ? Number(e.actualPrice).toFixed(4) : e.actualPrice}
                    </div>
                  </div>
                  <div className="bg-dark-card rounded p-2">
                    <div className="text-[10px] text-dark-muted">滑点</div>
                    <div className={`${(slipPercentVal ?? 0) > 0.01 ? 'text-red-400' : (slipPercentVal ?? 0) > 0.005 ? 'text-orange-400' : 'text-green-400'} font-mono`}>{slip}</div>
                  </div>
                  <div className="bg-dark-card rounded p-2">
                    <div className="text-[10px] text-dark-muted">延迟/成交率</div>
                    <div className="font-mono">{latency} · {fill}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 导出 CSV 按钮 */}
      <div className="mt-3 flex justify-end">
        <button
          onClick={async () => {
            try {
              const params = { limit: 500 };
              if (selectedSymbol) params.symbol = selectedSymbol;
              const res = await axios.get('/api/monitoring/executions', { params });
              const rows = res.data?.data || [];
              if (rows.length === 0) return;
              const header = [
                'created_at','symbol','side','status','expected_price','actual_price','requested_amount','filled_amount','slippage_bps','latency_ms','fill_rate_percent','order_id','client_order_id','analysis_id'
              ];
              const csv = [header.join(',')].concat(
                rows.map(r => [
                  r.created_at,
                  r.symbol,
                  r.side,
                  r.status,
                  r.expected_price,
                  r.actual_price,
                  r.requested_amount,
                  r.filled_amount,
                  r.slippage_bps,
                  r.latency_ms,
                  r.fill_rate_percent,
                  r.order_id || '',
                  r.client_order_id || '',
                  r.analysis_id || ''
                ].join(','))
              ).join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `executions_${selectedSymbol || 'all'}_${Date.now()}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } catch (e) {
              // ignore
            }
          }}
          className="text-[11px] px-2 py-1 rounded bg-dark-bg hover:bg-dark-card text-dark-text border border-dark-border"
        >
          导出CSV
        </button>
      </div>
    </div>
  );
}

export default ExecutionQualityCard;


