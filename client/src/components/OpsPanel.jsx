import React, { useEffect, useState } from 'react';
import axios from 'axios';

function Section({ title, children, right }) {
  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function OpsPanel() {
  // Backtest
  const [strategies, setStrategies] = useState([]);
  const [btSymbol, setBtSymbol] = useState('ETH/USDT');
  const [btStrategy, setBtStrategy] = useState('');
  const [btInterval, setBtInterval] = useState('1h');
  const [btRunning, setBtRunning] = useState(false);
  const [btResult, setBtResult] = useState(null);

  // Causal What-if
  const [cwSymbol, setCwSymbol] = useState('ETH/USDT');
  const [cwVar, setCwVar] = useState('rsi');
  const [cwValue, setCwValue] = useState('75');
  const [cwResult, setCwResult] = useState(null);

  // Ticks
  const [tickSymbol, setTickSymbol] = useState('ETH/USDT');
  const [tickStatus, setTickStatus] = useState(null);

  // Performance
  const [perf, setPerf] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);

  useEffect(() => {
    // load strategies for backtest
    (async () => {
      try {
        const res = await axios.get('/api/backtest/strategies');
        const list = res.data?.data || [];
        setStrategies(list);
        if (!btStrategy && list.length) setBtStrategy(list[0]);
      } catch (_) {}
    })();
  }, []);

  const runBacktest = async () => {
    setBtRunning(true);
    setBtResult(null);
    try {
      const res = await axios.post('/api/backtest/run', {
        strategyName: btStrategy,
        symbol: btSymbol,
        interval: btInterval,
        initialCapital: 10000
      });
      setBtResult(res.data?.data || null);
    } catch (e) {
      setBtResult({ error: e.response?.data?.error || e.message });
    } finally {
      setBtRunning(false);
    }
  };

  const causalWhatIf = async () => {
    try {
      const payload = { symbol: cwSymbol, intervention: {} };
      const v = Number(cwValue);
      payload.intervention[cwVar] = Number.isFinite(v) ? v : cwValue;
      const res = await axios.post('/api/causal/what-if', payload);
      setCwResult(res.data?.data || null);
    } catch (e) {
      setCwResult({ error: e.response?.data?.error || e.message });
    }
  };

  const tickStart = async () => {
    await axios.post('/api/ticks/record/start', { symbol: tickSymbol });
    await tickGetStatus();
  };
  const tickStop = async () => {
    await axios.post('/api/ticks/record/stop', { symbol: tickSymbol });
    await tickGetStatus();
  };
  const tickBackfill = async () => {
    await axios.post('/api/ticks/backfill', { symbol: tickSymbol, limit: 500 });
    await tickGetStatus();
  };
  const tickGetStatus = async () => {
    try {
      const res = await axios.get('/api/ticks/status', { params: { symbol: tickSymbol } });
      setTickStatus(res.data?.data || null);
    } catch (e) {
      setTickStatus({ error: e.response?.data?.error || e.message });
    }
  };

  const loadPerf = async () => {
    const res = await axios.get('/api/performance/summary');
    setPerf(res.data?.data || null);
  };
  const loadCacheStats = async () => {
    const res = await axios.get('/api/performance/cache');
    setCacheStats(res.data?.data || null);
  };
  const resetPerf = async () => {
    await axios.post('/api/performance/reset');
    await loadPerf();
  };

  return (
    <div className="space-y-4">
      <Section
        title="📊 策略回测"
        right={
          <div className="flex items-center gap-2">
            <select value={btStrategy} onChange={(e)=>setBtStrategy(e.target.value)} className="input">
              {strategies.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={btSymbol} onChange={(e)=>setBtSymbol(e.target.value)} className="input w-36" />
            <select value={btInterval} onChange={(e)=>setBtInterval(e.target.value)} className="input w-24">
              {['1m','5m','15m','1h','4h','1d'].map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <button onClick={runBacktest} disabled={btRunning || !btStrategy} className="btn-primary">
              {btRunning ? '运行中…' : '运行回测'}
            </button>
          </div>
        }
      >
        {btResult ? (
          btResult.error ? (
            <div className="text-accent-danger text-sm">{btResult.error}</div>
          ) : (
            <div className="text-xs overflow-x-auto">
              <pre className="whitespace-pre-wrap">{JSON.stringify({
                strategy: btResult.strategyName,
                symbol: btResult.symbol,
                trades: (btResult.trades||[]).length,
                finalEquity: btResult.finalEquity,
                maxDrawdown: btResult.maxDrawdown,
              }, null, 2)}</pre>
            </div>
          )
        ) : (
          <div className="text-dark-muted text-sm">选择策略并运行回测，查看概要结果</div>
        )}
      </Section>

      <Section title="🧪 因果分析 What-if">
        <div className="flex items-center gap-2 mb-3">
          <input value={cwSymbol} onChange={(e)=>setCwSymbol(e.target.value)} className="input w-36" />
          <input value={cwVar} onChange={(e)=>setCwVar(e.target.value)} className="input w-28" placeholder="变量，如 rsi" />
          <input value={cwValue} onChange={(e)=>setCwValue(e.target.value)} className="input w-28" placeholder="值" />
          <button onClick={causalWhatIf} className="btn-secondary">运行</button>
        </div>
        {cwResult && (
          <div className="text-xs overflow-x-auto">
            {cwResult.error ? (
              <div className="text-accent-danger">{cwResult.error}</div>
            ) : (
              <pre className="whitespace-pre-wrap">{JSON.stringify(cwResult, null, 2)}</pre>
            )}
          </div>
        )}
      </Section>

      <Section title="⏱️ TICK 工具">
        <div className="flex items-center gap-2 mb-3">
          <input value={tickSymbol} onChange={(e)=>setTickSymbol(e.target.value)} className="input w-36" />
          <button onClick={tickStart} className="btn-secondary">开始录制</button>
          <button onClick={tickStop} className="btn-secondary">停止录制</button>
          <button onClick={tickBackfill} className="btn-secondary">回填500</button>
          <button onClick={tickGetStatus} className="btn-secondary">查看状态</button>
        </div>
        {tickStatus && (
          <div className="text-xs overflow-x-auto">
            {tickStatus.error ? (
              <div className="text-accent-danger">{tickStatus.error}</div>
            ) : (
              <pre className="whitespace-pre-wrap">{JSON.stringify(tickStatus, null, 2)}</pre>
            )}
          </div>
        )}
      </Section>

      <Section
        title="⚙️ 性能监控"
        right={
          <div className="flex items-center gap-2">
            <button onClick={loadPerf} className="btn-secondary">概览</button>
            <button onClick={loadCacheStats} className="btn-secondary">缓存</button>
            <button onClick={resetPerf} className="btn-secondary">重置</button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-dark-bg border border-dark-border rounded p-2 min-h-[60px]">
            <div className="text-dark-muted mb-1">Summary</div>
            <pre className="whitespace-pre-wrap">{perf ? JSON.stringify(perf, null, 2) : '点击“概览”获取'}</pre>
          </div>
          <div className="bg-dark-bg border border-dark-border rounded p-2 min-h-[60px]">
            <div className="text-dark-muted mb-1">Cache</div>
            <pre className="whitespace-pre-wrap">{cacheStats ? JSON.stringify(cacheStats, null, 2) : '点击“缓存”获取'}</pre>
          </div>
        </div>
      </Section>
    </div>
  );
}

