import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Zap } from 'lucide-react';
import OKXTradingPanel from './OKXTradingPanel';
import TradingOverviewPanel from './TradingOverviewPanel';
import AIMonitoringPanel from './AIMonitoringPanel';
import { useTrading, useAI } from '../hooks/useReduxStore';

function AccountPanel() {
  const [activeSubTab, setActiveSubTab] = useState('ai'); // 'ai' | 'manual' | 'overview' | 'monitor' | 'risk-advanced'
  const { autoTradingEnabled, setAutoTradingEnabled, selectedSymbol } = useTrading();
  const { autoAIInterval, setAutoAIInterval } = useAI();
  const [busy, setBusy] = useState(false);
  const [multiSymbolsText, setMultiSymbolsText] = useState('');
  const [rc, setRc] = useState(null); // risk control config
  const [savingRc, setSavingRc] = useState(false);

  const tradingMode = typeof window !== 'undefined'
    ? (localStorage.getItem('tradingMode') || 'paper')
    : 'paper';

  const modeBadge = () => {
    if (tradingMode === 'live') {
      return (
        <div className="px-3 py-1 rounded bg-red-500/15 border border-red-500 text-red-400 text-sm font-semibold">
          ⚠️ 真实交易
        </div>
      );
    }
    if (tradingMode === 'demo') {
      return (
        <div className="px-3 py-1 rounded bg-purple-500/15 border border-purple-500 text-purple-400 text-sm font-semibold">
          🧪 OKX 模拟
        </div>
      );
    }
    return (
      <div className="px-3 py-1 rounded bg-blue-500/15 border border-blue-500 text-blue-400 text-sm font-semibold">
        📝 纸上交易
      </div>
    );
  };

  // 加载风控配置
  useEffect(() => {
    const loadRc = async () => {
      try {
        const { data } = await axios.get('/api/auto-trade/risk/config');
        if (data?.success) setRc(data.data);
      } catch (_) {}
    };
    loadRc();
  }, []);

  const handleToggleAuto = useCallback(async () => {
    const enable = !autoTradingEnabled;
    setBusy(true);
    try {
      if (enable) {
        await axios.post('/api/trading/auto/start', {
          config: {
            exchange: 'okx',
            symbol: selectedSymbol || 'ETH/USDT',
            symbols: multiSymbolsText
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
            interval: Number(autoAIInterval || 120) * 1000,
            mode: tradingMode
          }
        });
        setAutoTradingEnabled(true);
      } else {
        await axios.post('/api/trading/auto/stop');
        setAutoTradingEnabled(false);
      }
    } catch (e) {
      console.error('切换自动交易失败:', e.message);
    } finally {
      setBusy(false);
    }
  }, [autoTradingEnabled, autoAIInterval, selectedSymbol, tradingMode, setAutoTradingEnabled]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-bold">账户</h2>
          {modeBadge()}
          {tradingMode === 'live' && (
            <div className="flex items-center space-x-2 text-red-500 ml-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">真实资金，请务必设置止损并控制仓位</span>
            </div>
          )}
        </div>

        <button
          onClick={handleToggleAuto}
          className={`flex items-center space-x-2 px-3 py-2 rounded border transition-colors ${
            autoTradingEnabled
              ? 'bg-green-600/20 border-green-600 text-green-400'
              : 'bg-dark-bg border-dark-border text-dark-muted hover:text-white'
          }`}
          title="切换AI自动交易"
        >
          <Zap className={`w-4 h-4 ${autoTradingEnabled ? 'animate-pulse' : ''}`} />
          <span className="text-sm font-semibold">{busy ? '处理中…' : `AI自动交易：${autoTradingEnabled ? '开启' : '关闭'}`}</span>
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 border-b border-dark-border">
        <button
          onClick={() => setActiveSubTab('ai')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeSubTab === 'ai' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-dark-muted hover:text-white'
          }`}
        >
          AI自动交易
        </button>
        <button
          onClick={() => setActiveSubTab('manual')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeSubTab === 'manual' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-dark-muted hover:text-white'
          }`}
        >
          手动交易
        </button>
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeSubTab === 'overview' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-dark-muted hover:text-white'
          }`}
        >
          交易总览
        </button>
        <button
          onClick={() => setActiveSubTab('monitor')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeSubTab === 'monitor' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-dark-muted hover:text-white'
          }`}
        >
          AI监控
        </button>
        <button
          onClick={() => setActiveSubTab('risk-advanced')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeSubTab === 'risk-advanced' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-dark-muted hover:text-white'
          }`}
        >
          高级风控
        </button>
      </div>

      {/* Content */}
      <div className="animate-fade-in">
        {activeSubTab === 'ai' && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">AI自动交易控制</h3>
                <p className="text-xs text-dark-muted mt-1">
                  开启后，AI将根据策略信号自动在已连接的 {tradingMode === 'live' ? '真实' : tradingMode === 'demo' ? 'OKX模拟' : '纸上'} 账户执行交易。
                </p>
              </div>
              <button
                onClick={handleToggleAuto}
                className={`flex items-center space-x-2 px-3 py-2 rounded border transition-colors ${
                  autoTradingEnabled
                    ? 'bg-green-600/20 border-green-600 text-green-400'
                    : 'bg-dark-bg border-dark-border text-dark-muted hover:text-white'
                }`}
              >
                <Zap className={`w-4 h-4 ${autoTradingEnabled ? 'animate-pulse' : ''}`} />
                <span className="text-sm font-semibold">{busy ? '处理中…' : (autoTradingEnabled ? '关闭AI' : '开启AI')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-dark-bg rounded p-4">
                <div className="text-xs text-dark-muted mb-1">当前状态</div>
                <div className={`text-lg font-bold ${autoTradingEnabled ? 'text-green-400' : 'text-dark-muted'}`}>
                  {autoTradingEnabled ? '运行中' : '已关闭'}
                </div>
              </div>
              <div className="bg-dark-bg rounded p-4">
                <div className="text-xs text-dark-muted mb-1">交易模式</div>
                <div className="text-lg font-bold">
                  {tradingMode === 'live' ? '真实账户' : tradingMode === 'demo' ? 'OKX模拟' : '纸上交易'}
                </div>
              </div>
              <div className="bg-dark-bg rounded p-4">
                <div className="text-xs text-dark-muted mb-1">安全提示</div>
                <div className="text-sm">
                  {tradingMode === 'live' ? '真实资金风险，请设置风控参数。' : '建议先在模拟盘验证策略。'}
                </div>
              </div>
            </div>

            {/* 运行参数（轻量） */}
            <div className="bg-dark-bg rounded p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-dark-muted mb-1">自动分析间隔</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={30}
                    step={30}
                    value={Number(autoAIInterval || 120)}
                    onChange={(e)=> setAutoAIInterval(Math.max(30, Number(e.target.value||120)))}
                    className="w-24 bg-dark-card border border-dark-border rounded px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-dark-muted">秒</span>
                </div>
                <div className="text-[10px] text-dark-muted mt-1">启动时会以该间隔轮询交易信号</div>
              </div>
              <div>
                <div className="text-xs text-dark-muted mb-1">交易对</div>
                <div className="text-sm font-semibold">{selectedSymbol || 'ETH/USDT'}</div>
                <div className="text-[10px] text-dark-muted mt-1">当前选择于顶部行情</div>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleToggleAuto}
                  className={`px-3 py-2 rounded text-sm ${autoTradingEnabled ? 'bg-red-600 text-white' : 'bg-accent-success text-white'}`}
                  disabled={busy}
                >
                  {busy ? '处理中…' : (autoTradingEnabled ? '停止自动交易' : '启动自动交易')}
                </button>
              </div>
            </div>

            {/* 多交易对轮询 */}
            <div className="bg-dark-bg rounded p-4">
              <div className="text-sm font-semibold mb-2">多交易对轮询</div>
              <input
                value={multiSymbolsText}
                onChange={(e)=> setMultiSymbolsText(e.target.value)}
                placeholder="示例: BTC/USDT,ETH/USDT,SOL/USDT"
                className="w-full bg-dark-card border border-dark-border rounded px-2 py-2 text-sm"
              />
              <div className="text-[10px] text-dark-muted mt-1">留空则仅使用当前交易对。填写后将轮流在列表中依次分析与执行。</div>
            </div>

            {/* 风控参数设置 */}
            <div className="bg-dark-bg rounded p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">风控参数</div>
                <button
                  onClick={async ()=>{
                    try {
                      setSavingRc(true);
                      const payload = {
                        MIN_CONFIDENCE: Number(rc?.MIN_CONFIDENCE || 70),
                        MAX_DAILY_LOSS_PERCENT: Number(rc?.MAX_DAILY_LOSS_PERCENT || 2),
                        MAX_DRAWDOWN_PERCENT: Number(rc?.MAX_DRAWDOWN_PERCENT || 10),
                        MAX_POSITION_RATIO: Number(rc?.MAX_POSITION_RATIO || 0.8),
                        MAX_CONSECUTIVE_LOSSES: Number(rc?.MAX_CONSECUTIVE_LOSSES || 5)
                      };
                      await axios.post('/api/auto-trade/risk/config', payload);
                    } catch (_) {} finally { setSavingRc(false); }
                  }}
                  className={`text-xs px-2 py-1 rounded ${savingRc?'opacity-60 cursor-not-allowed':'bg-accent-success text-white'}`}
                  disabled={savingRc}
                >
                  {savingRc ? '保存中…' : '保存'}
                </button>
              </div>
              {rc ? (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-dark-muted mb-1">最小置信度(%)</div>
                    <input type="number" min={0} max={100} value={rc.MIN_CONFIDENCE}
                      onChange={(e)=> setRc({ ...rc, MIN_CONFIDENCE: Number(e.target.value) })}
                      className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                  </div>
                  <div>
                    <div className="text-xs text-dark-muted mb-1">日最大亏损(%)</div>
                    <input type="number" min={0} step={0.1} value={rc.MAX_DAILY_LOSS_PERCENT}
                      onChange={(e)=> setRc({ ...rc, MAX_DAILY_LOSS_PERCENT: Number(e.target.value) })}
                      className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                  </div>
                  <div>
                    <div className="text-xs text-dark-muted mb-1">最大回撤(%)</div>
                    <input type="number" min={0} step={0.1} value={rc.MAX_DRAWDOWN_PERCENT}
                      onChange={(e)=> setRc({ ...rc, MAX_DRAWDOWN_PERCENT: Number(e.target.value) })}
                      className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                  </div>
                  <div>
                    <div className="text-xs text-dark-muted mb-1">总仓位上限(比例)</div>
                    <input type="number" min={0} max={1} step={0.05} value={rc.MAX_POSITION_RATIO}
                      onChange={(e)=> setRc({ ...rc, MAX_POSITION_RATIO: Number(e.target.value) })}
                      className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                  </div>
                  <div>
                    <div className="text-xs text-dark-muted mb-1">连续亏损上限(次)</div>
                    <input type="number" min={0} step={1} value={rc.MAX_CONSECUTIVE_LOSSES}
                      onChange={(e)=> setRc({ ...rc, MAX_CONSECUTIVE_LOSSES: Number(e.target.value) })}
                      className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-dark-muted">正在加载风控配置…</div>
              )}
            </div>

            <div className="text-xs text-dark-muted">
              提示：AI将使用后端风控参数（如最大单笔金额、止损止盈等）自动下单。你可以在 .env 或管理面板中配置。
            </div>
          </div>
        )}
        {activeSubTab === 'manual' && (
          <OKXTradingPanel />
        )}
        {activeSubTab === 'overview' && (
          <TradingOverviewPanel />
        )}
        {activeSubTab === 'monitor' && (
          <AIMonitoringPanel />
        )}
        {activeSubTab === 'risk-advanced' && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">高级风控参数</h3>
              <button
                onClick={async ()=>{
                  try {
                    setSavingRc(true);
                    const payload = {
                      MAX_SLIPPAGE_PERCENT: Number(rc?.MAX_SLIPPAGE_PERCENT || 0.5),
                      MAX_PRICE_DEVIATION_PERCENT: Number(rc?.MAX_PRICE_DEVIATION_PERCENT || 5),
                      MIN_VOLUME_24H: Number(rc?.MIN_VOLUME_24H || 1000000),
                      MAX_LEVERAGE: Number(rc?.MAX_LEVERAGE || 3),
                      MAX_POSITION_HOLD_HOURS: Number(rc?.MAX_POSITION_HOLD_HOURS || 72)
                    };
                    await axios.post('/api/auto-trade/risk/config', payload);
                  } catch(_){ } finally { setSavingRc(false); }
                }}
                className={`text-xs px-3 py-1.5 rounded ${savingRc?'opacity-60 cursor-not-allowed':'bg-accent-success text-white'}`}
                disabled={savingRc}
              >{savingRc ? '保存中…' : '保存'}</button>
            </div>

            {rc ? (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
                <div>
                  <div className="text-xs text-dark-muted mb-1">最大滑点(%)</div>
                  <input type="number" min={0} step={0.05} value={rc.MAX_SLIPPAGE_PERCENT}
                    onChange={(e)=> setRc({ ...rc, MAX_SLIPPAGE_PERCENT: Number(e.target.value) })}
                    className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                </div>
                <div>
                  <div className="text-xs text-dark-muted mb-1">价格偏离上限(%)</div>
                  <input type="number" min={0} step={0.1} value={rc.MAX_PRICE_DEVIATION_PERCENT}
                    onChange={(e)=> setRc({ ...rc, MAX_PRICE_DEVIATION_PERCENT: Number(e.target.value) })}
                    className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                </div>
                <div>
                  <div className="text-xs text-dark-muted mb-1">最小24h成交量(USDT)</div>
                  <input type="number" min={0} step={1000} value={rc.MIN_VOLUME_24H}
                    onChange={(e)=> setRc({ ...rc, MIN_VOLUME_24H: Number(e.target.value) })}
                    className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                </div>
                <div>
                  <div className="text-xs text-dark-muted mb-1">最大杠杆(×)</div>
                  <input type="number" min={1} max={125} step={1} value={rc.MAX_LEVERAGE}
                    onChange={(e)=> setRc({ ...rc, MAX_LEVERAGE: Number(e.target.value) })}
                    className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                </div>
                <div>
                  <div className="text-xs text-dark-muted mb-1">最大持仓时长(小时)</div>
                  <input type="number" min={1} step={1} value={rc.MAX_POSITION_HOLD_HOURS}
                    onChange={(e)=> setRc({ ...rc, MAX_POSITION_HOLD_HOURS: Number(e.target.value) })}
                    className="w-full bg-dark-card border border-dark-border rounded px-2 py-1"/>
                </div>
              </div>
            ) : (
              <div className="text-xs text-dark-muted">正在加载风控配置…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AccountPanel;


