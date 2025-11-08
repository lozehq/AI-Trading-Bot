import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, TrendingUp, Zap, Settings, Globe, RefreshCcw, Sliders, Shield, TestTube, AlertTriangle, Key } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage.jsx';
import SettingsPanel from './SettingsPanel.jsx';

function Header({ connected, autoTradingEnabled, onToggleAutoTrading }) {
  const [mcpStatus, setMcpStatus] = useState(null);
  const { language, toggleLanguage, t } = useLanguage();
  const [globalRealtime, setGlobalRealtime] = useState(false);
  const [showStrategyPanel, setShowStrategyPanel] = useState(false);
  const [currentStrategy, setCurrentStrategy] = useState(null);
  const [tradingMode, setTradingMode] = useState(() => {
    return localStorage.getItem('tradingMode') || 'paper';
  });
  const [showModePanel, setShowModePanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem('ui_density') === 'compact'; } catch (_) { return false; }
  });

  useEffect(() => {
    const fetchMCPStatus = async () => {
      try {
        const response = await axios.get('/api/mcp-control/status');
        setMcpStatus(response.data.data);
      } catch (error) {
        // 忽略错误
      }
    };

    // 允许其他组件通过事件打开设置面板
    const onOpenSettings = () => setShowSettings(true);
    window.addEventListener('open-settings', onOpenSettings);

    const fetchStrategy = async () => {
      try {
        const res = await axios.get('/api/strategy');
        const cfg = res.data?.data || {};
        setGlobalRealtime(!!cfg.globalRealtime);
        setCurrentStrategy(cfg);
        // 自动识别预设
        if (!cfg.globalRealtime && cfg.tickerTTL === 5000 && cfg.indicatorsTTL === 30000) {
          setCurrentStrategy({ ...cfg, preset: 'conservative' });
        } else if (!cfg.globalRealtime && cfg.tickerTTL === 2000 && cfg.indicatorsTTL === 15000) {
          setCurrentStrategy({ ...cfg, preset: 'balanced' });
        } else if (cfg.globalRealtime && cfg.tickerTTL === 1000 && cfg.indicatorsTTL === 10000) {
          setCurrentStrategy({ ...cfg, preset: 'realtime' });
        } else {
          setCurrentStrategy({ ...cfg, preset: 'custom' });
        }
      } catch (e) {}
    };

    fetchMCPStatus();
    fetchStrategy();
    const interval = setInterval(fetchMCPStatus, 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('open-settings', onOpenSettings);
    };
  }, []);

  useEffect(() => {
    try {
      if (compact) {
        document.body.classList.add('compact');
        localStorage.setItem('ui_density', 'compact');
      } else {
        document.body.classList.remove('compact');
        localStorage.setItem('ui_density', 'comfortable');
      }
    } catch (_) {}
  }, [compact]);

  const applyPreset = async (preset) => {
    const configs = {
      conservative: { globalRealtime: false, tickerTTL: 5000, indicatorsTTL: 30000 },
      balanced: { globalRealtime: false, tickerTTL: 2000, indicatorsTTL: 15000 },
      realtime: { globalRealtime: true, tickerTTL: 1000, indicatorsTTL: 10000 }
    };
    const cfg = configs[preset];
    if (!cfg) return;
    try {
      await axios.post('/api/strategy', cfg);
      setGlobalRealtime(cfg.globalRealtime);
      setCurrentStrategy({ ...cfg, preset });
      setShowStrategyPanel(false);
    } catch (e) {
      alert('设置失败: ' + e.message);
    }
  };

  const changeTradingMode = (mode) => {
    setTradingMode(mode);
    localStorage.setItem('tradingMode', mode);
    setShowModePanel(false);
    // 触发全局事件通知其他组件
    window.dispatchEvent(new CustomEvent('tradingModeChanged', { detail: { mode } }));
  };

  const getModeConfig = () => {
    const configs = {
      paper: { label: '纸上交易', icon: Shield, color: 'blue', desc: '模拟交易，不消耗真实资金' },
      demo: { label: 'OKX模拟', icon: TestTube, color: 'purple', desc: '使用OKX模拟盘API' },
      live: { label: '真实交易', icon: AlertTriangle, color: 'red', desc: '⚠️ 真实资金交易，请谨慎' }
    };
    return configs[tradingMode] || configs.paper;
  };

  return (
    <header className="bg-dark-card border-b border-dark-border sticky top-0 z-50 backdrop-blur-lg bg-opacity-90">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <img 
              src="/logo.png" 
              alt="AI Trading Bot Logo" 
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="text-xl font-bold gradient-text">{t('app.title')}</h1>
              <p className="text-xs text-dark-muted">{t('app.subtitle')}</p>
            </div>
          </div>

          {/* Status & Controls */}
          <div className="flex items-center space-x-6">
            {/* Trading Mode Selector */}
            <div className="relative">
              <button
                onClick={() => setShowModePanel(!showModePanel)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg hover:opacity-80 transition-all ${
                  tradingMode === 'paper' ? 'bg-blue-500/20 border border-blue-500' :
                  tradingMode === 'demo' ? 'bg-purple-500/20 border border-purple-500' :
                  'bg-red-500/20 border border-red-500'
                }`}
                title="交易模式"
              >
                {React.createElement(getModeConfig().icon, { className: 'w-4 h-4' })}
                <span className="text-sm font-medium">{getModeConfig().label}</span>
              </button>
              {showModePanel && (
                <div className="absolute top-full right-0 mt-2 bg-dark-card border border-dark-border rounded-lg shadow-lg p-3 w-80 z-50">
                  <div className="text-sm font-semibold mb-3">选择交易模式</div>
                  <div className="space-y-2">
                    {['paper', 'demo', 'live'].map(mode => {
                      const cfg = {
                        paper: { label: '纸上交易', icon: Shield, color: 'blue', desc: '模拟交易，不消耗真实资金' },
                        demo: { label: 'OKX模拟', icon: TestTube, color: 'purple', desc: '使用OKX模拟盘API' },
                        live: { label: '真实交易', icon: AlertTriangle, color: 'red', desc: '⚠️ 真实资金交易，请谨慎' }
                      }[mode];
                      return (
                        <button
                          key={mode}
                          onClick={() => changeTradingMode(mode)}
                          className={`w-full text-left p-3 rounded border ${
                            tradingMode === mode 
                              ? `border-${cfg.color}-500 bg-${cfg.color}-500/10` 
                              : 'border-dark-border hover:bg-dark-border/40'
                          } transition`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center space-x-2">
                              {React.createElement(cfg.icon, { className: `w-4 h-4 text-${cfg.color}-500` })}
                              <span className="text-sm font-medium">{cfg.label}</span>
                            </div>
                            {tradingMode === mode && <span className="text-xs text-accent-primary">✓</span>}
                          </div>
                          <div className="text-xs text-dark-muted">{cfg.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-dark-border text-xs text-dark-muted">
                    💡 模式会保存在浏览器本地，刷新后保持
                  </div>
                </div>
              )}
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center space-x-2 px-3 py-2 bg-dark-bg rounded-lg hover:bg-dark-border transition-all"
              title="系统设置"
            >
              <Key className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-medium">设置</span>
            </button>

            {/* Density Toggle */}
            <button
              onClick={() => setCompact(v => !v)}
              className="flex items-center space-x-2 px-3 py-2 bg-dark-bg rounded-lg hover:bg-dark-border transition-all"
              title="界面密度"
            >
              <span className="text-sm font-medium">{compact ? '紧凑' : '舒适'}</span>
            </button>

            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="flex items-center space-x-2 px-3 py-2 bg-dark-bg rounded-lg hover:bg-dark-border transition-all"
              title={language === 'zh' ? 'Switch to English' : '切换到中文'}
            >
              <Globe className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-medium">{language === 'zh' ? '中文' : 'EN'}</span>
            </button>

          {/* Strategy Preset Selector */}
          <div className="relative">
            <button
              onClick={() => setShowStrategyPanel(!showStrategyPanel)}
              className="flex items-center space-x-2 px-3 py-2 bg-dark-bg rounded-lg hover:bg-dark-border transition-all"
              title="策略预设"
            >
              <Sliders className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-medium">{currentStrategy?.preset === 'conservative' ? '保守' : currentStrategy?.preset === 'balanced' ? '均衡' : currentStrategy?.preset === 'realtime' ? '实时' : '自定义'}</span>
            </button>
            {showStrategyPanel && (
              <div className="absolute top-full right-0 mt-2 bg-dark-card border border-dark-border rounded-lg shadow-lg p-3 w-80 z-50">
                <div className="text-sm font-semibold mb-3">策略预设</div>
                <div className="space-y-2">
                  {[
                    { key: 'conservative', label: '保守模式', desc: 'Ticker 5s / 指标 30s / 全局实时关闭', icon: '🛡️' },
                    { key: 'balanced', label: '均衡模式', desc: 'Ticker 2s / 指标 15s / 全局实时关闭', icon: '⚖️' },
                    { key: 'realtime', label: '实时模式', desc: 'Ticker 1s / 指标 10s / 全局实时开启', icon: '⚡' }
                  ].map(p => (
                    <button
                      key={p.key}
                      onClick={() => applyPreset(p.key)}
                      className={`w-full text-left p-2 rounded border ${currentStrategy?.preset === p.key ? 'border-accent-primary bg-accent-primary/10' : 'border-dark-border hover:bg-dark-border/40'} transition`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{p.icon} {p.label}</span>
                        {currentStrategy?.preset === p.key && <span className="text-xs text-accent-primary">✓</span>}
                      </div>
                      <div className="text-xs text-dark-muted">{p.desc}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-dark-border text-xs text-dark-muted">
                  当前：Ticker {currentStrategy?.tickerTTL}ms / 指标 {currentStrategy?.indicatorsTTL}ms / 全局实时 {currentStrategy?.globalRealtime ? '开' : '关'}
                </div>
              </div>
            )}
          </div>

            {/* MCP Tools Status */}
            {mcpStatus && (
              <div className="flex items-center space-x-2 px-3 py-2 bg-dark-bg rounded-lg">
                <Settings className="w-4 h-4 text-purple-500" />
                <span className="text-sm">
                  MCP: <span className="font-mono text-accent-success">{mcpStatus.runningTools}</span>
                  <span className="text-dark-muted">/{mcpStatus.totalTools}</span>
                </span>
              </div>
            )}

            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className="relative">
                <div className={`status-dot ${connected ? 'bg-accent-success' : 'bg-accent-danger'}`} />
                {connected && (
                  <span className="pulse-ring bg-accent-success" />
                )}
              </div>
              <span className="text-sm text-dark-muted">
                {connected ? t('header.live') : 'Offline'}
              </span>
            </div>

            {/* Auto Trading Toggle */}
            <button
              onClick={() => onToggleAutoTrading(!autoTradingEnabled)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
                autoTradingEnabled
                  ? 'bg-accent-success text-white glow'
                  : 'bg-dark-border text-dark-muted hover:bg-dark-border'
              }`}
            >
              <Zap className={`w-4 h-4 ${autoTradingEnabled ? 'animate-pulse' : ''}`} />
              <span>{autoTradingEnabled ? `${t('header.autoTrading')} ${t('header.on')}` : `${t('header.autoTrading')} ${t('header.off')}`}</span>
            </button>

            {/* System Status */}
            <div className="flex items-center space-x-2 px-3 py-2 bg-dark-bg rounded-lg">
              <Activity className="w-4 h-4 text-accent-primary" />
              <span className="text-sm font-mono">System: OK</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </header>
  );
}

export default Header;
