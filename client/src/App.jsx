import React, { useEffect } from 'react';
import Header from './components/Header';
import PriceTicker from './components/PriceTicker';
import Dashboard from './components/Dashboard';
// 已移除独立的交易与AI增强页
import AIChatPanel from './components/AIChatPanel';
import AutoAIPanel from './components/AutoAIPanel';
import MCPControlPanel from './components/MCPControlPanel';
import AccountPanel from './components/AccountPanel';
import UnifiedHomePage from './components/UnifiedHomePage';
import PriceAlertPanel from './components/PriceAlertPanel';
import MemoryPanel from './components/MemoryPanel';
import WhaleTrackingPanel from './components/WhaleTrackingPanel';
import AdvancedMarketPanel from './components/AdvancedMarketPanel';
import PromptManager from './components/PromptManager';
import AIEnhancedPanel from './components/AIEnhancedPanel';
import OpsPanel from './components/OpsPanel';
import { Home, Brain, LayoutDashboard, Fish, BarChart3, CreditCard, Bell, Bot, MessageSquare, Puzzle, FileText, Wrench, Plug } from 'lucide-react';
import VPNWarningModal from './components/VPNWarningModal';



import { useWebSocket } from './hooks/useWebSocket';
import { useMarketData } from './hooks/useMarketData';
import { useLanguage } from './hooks/useLanguage.jsx';
import { useUI, useTrading, useAI, useMarket } from './hooks/useReduxStore';

function App() {
  // 使用自定义hooks替代useState
  const { activeTab, connected, setActiveTab, setConnected } = useUI();
  const { autoTradingEnabled, selectedSymbol, setAutoTradingEnabled, setSelectedSymbol } = useTrading();
  const {
    autoAIRunning,
    autoAIInterval,
    autoAIAnalysis,
    autoAIThoughts,
    modelChatHistory,
    setAutoAIRunning,
    setAutoAIInterval,
    setAutoAIAnalysis,
    setAutoAIThoughts,
    addAutoAIThought,
    setModelChatHistory,
    addChatMessage
  } = useAI();
  const { marketData, tradeSignals } = useMarket();

  // 复用原有的hooks
  const { ticker: restTicker, indicators: restIndicators, ohlcv, loading, error, refresh } = useMarketData(selectedSymbol);
  const { t } = useLanguage();

  // WebSocket URL: 生产环境使用相对路径，开发环境使用 localhost
  const WS_URL = process.env.NODE_ENV === 'production'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
    : 'ws://localhost:3001';
  const { connected: wsConnected, marketData: wsMarketData, tradeSignals: wsTradeSignals, hotTickers } = useWebSocket(WS_URL);

  // ticker和indicators优先用WS数据，REST作为fallback
  const ticker = (hotTickers && hotTickers[selectedSymbol]) || wsMarketData || restTicker;
  const indicators = wsMarketData?.indicators || restIndicators;

  // 将WebSocket数据同步到Redux store
  useEffect(() => {
    setConnected(wsConnected);
  }, [wsConnected, setConnected]);

  useEffect(() => {
    document.title = connected
      ? `AI Trading Bot - ${selectedSymbol}`
      : 'AI Trading Bot - Connecting...';
  }, [connected, selectedSymbol]);

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <Header
        connected={connected}
        autoTradingEnabled={autoTradingEnabled}
        onToggleAutoTrading={setAutoTradingEnabled}
      />

      {/* Price Ticker */}
      <PriceTicker symbols={['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT']} />

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Tab Navigation - 现代化设计 */}
        <div className="relative mb-6">
          {/* 背景横条 */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-dark-border to-transparent"></div>

          {/* 导航按钮 */}
          <div className="flex space-x-1 overflow-x-auto scrollbar-thin scrollbar-thumb-dark-border scrollbar-track-transparent pb-px">
            {[
              { key: 'home', label: '主页', Icon: Home, badge: 'NEW', badgeColor: 'bg-gradient-to-r from-green-500 to-emerald-500' },
              { key: 'memory', label: '记忆面板', Icon: Brain, badge: 'BETA', badgeColor: 'bg-gradient-to-r from-blue-500 to-cyan-500' },
              { key: 'dashboard', label: t('nav.dashboard'), Icon: LayoutDashboard },
              { key: 'whale-tracking', label: '巨鲸监控', Icon: Fish, badge: '热', badgeColor: 'bg-gradient-to-r from-orange-500 to-red-500' },
              { key: 'advanced-market', label: '高级数据', Icon: BarChart3, badge: 'PRO', badgeColor: 'bg-gradient-to-r from-purple-500 to-pink-500' },
              { key: 'account', label: '账户', Icon: CreditCard },
              { key: 'price-alerts', label: '价格预警', Icon: Bell },
              { key: 'auto-ai', label: 'AI模型', Icon: Bot },
              { key: 'ai-chat', label: t('nav.aiChat'), Icon: MessageSquare },
              { key: 'ai-enhanced', label: 'AI增强', Icon: Puzzle },
              { key: 'prompts', label: '提示词', Icon: FileText },
              { key: 'ops', label: '研究/运维', Icon: Wrench },
              { key: 'mcp-control', label: t('nav.dataSource'), Icon: Plug }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`group relative px-4 py-3 font-medium transition-all duration-300 whitespace-nowrap rounded-t-lg ${
                  activeTab === tab.key
                    ? 'text-accent-primary bg-gradient-to-b from-dark-card/50 to-transparent shadow-lg shadow-accent-primary/20'
                    : 'text-dark-muted hover:text-dark-text hover:bg-dark-card/30'
                }`}
              >
                {/* 激活指示条 */}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent-primary to-transparent"></div>
                )}

                {/* 内容 */}
                <span className="flex items-center gap-2">
                  {tab.Icon && <tab.Icon className="w-4 h-4" />}
                  <span className="text-sm">{tab.label}</span>
                </span>

                {/* Badge */}
                {tab.badge && (
                  <span className={`absolute -top-1 -right-1 ${tab.badgeColor || 'bg-accent-success'} text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-lg animate-pulse`}>
                    {tab.badge}
                  </span>
                )}

                {/* Hover 效果 */}
                <div className="absolute inset-0 rounded-t-lg bg-gradient-to-b from-white/0 to-white/0 group-hover:from-white/5 group-hover:to-transparent transition-all duration-300"></div>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {activeTab === 'home' && (
            <UnifiedHomePage
              ticker={ticker}
              indicators={indicators}
              ohlcv={ohlcv}
              loading={loading}
              error={error}
              onRefresh={refresh}
              selectedSymbol={selectedSymbol}
              autoAIRunning={autoAIRunning}
              setAutoAIRunning={setAutoAIRunning}
              autoAIInterval={autoAIInterval}
              setAutoAIInterval={setAutoAIInterval}
              autoAIAnalysis={autoAIAnalysis}
              setAutoAIAnalysis={setAutoAIAnalysis}
              autoAIThoughts={autoAIThoughts}
              setAutoAIThoughts={setAutoAIThoughts}
              addAutoAIThought={addAutoAIThought}
              modelChatHistory={modelChatHistory}
              setModelChatHistory={setModelChatHistory}
              setSelectedSymbol={setSelectedSymbol}
            />

          )}

          {activeTab === 'memory' && (
            <MemoryPanel />
          )}

          {activeTab === 'dashboard' && (
            <Dashboard
              ticker={ticker}
              indicators={indicators}
              ohlcv={ohlcv}
              loading={loading}
              error={error}
              refresh={refresh}
            />
          )}

          {activeTab === 'account' && (
            <AccountPanel />
          )}

          {activeTab === 'auto-ai' && (
            <AutoAIPanel
              selectedSymbol={selectedSymbol}
              setSelectedSymbol={setSelectedSymbol}
              isRunning={autoAIRunning}
              setIsRunning={setAutoAIRunning}
              interval={autoAIInterval}
              setInterval={setAutoAIInterval}
              analysis={autoAIAnalysis}
              setAnalysis={setAutoAIAnalysis}
              chainOfThought={autoAIThoughts || []}
              setChainOfThought={setAutoAIThoughts}
              addAutoAIThought={addAutoAIThought}
              modelChatHistory={modelChatHistory || []}
              setModelChatHistory={setModelChatHistory}
            />
          )}

          {activeTab === 'ai-chat' && (
            <AIChatPanel
              modelChatHistory={modelChatHistory}
              addChatMessage={addChatMessage}
              selectedSymbol={selectedSymbol}
            />
          )}

          {activeTab === 'price-alerts' && (
            <PriceAlertPanel symbol={selectedSymbol} />
          )}

          {activeTab === 'whale-tracking' && (
            <WhaleTrackingPanel />
          )}

          {activeTab === 'ai-enhanced' && (
            <AIEnhancedPanel selectedSymbol={selectedSymbol} />
          )}

          {activeTab === 'prompts' && (
            <PromptManager />
          )}

          {activeTab === 'ops' && (
            <OpsPanel />
          )}

          {activeTab === 'advanced-market' && (
            <AdvancedMarketPanel selectedSymbol={selectedSymbol} />
          )}

          {/* 交易总览已合并入 账户 面板 */}

          {activeTab === 'mcp-control' && (
            <MCPControlPanel />
          )}
        </div>
      </div>
      <VPNWarningModal />
    </div>
  );
}

export default App;
