import React, { useState } from 'react';
import IntegratedDashboard from './IntegratedDashboard';
import CompactAIChatPanel from './CompactAIChatPanel';
import ModelNarrativeCard from './ModelNarrativeCard';
import AutoAIPanel from './AutoAIPanel';
import AIMonitoringSummary from './AIMonitoringSummary';
import ExecutionQualityCard from './ExecutionQualityCard';
import CompletedTradesPanel from './CompletedTradesPanel';
import { LayoutGrid, Maximize2, Minimize2 } from 'lucide-react';

/**
 * 整合式主页面
 * 将仪表盘、AI自动分析、AI对话整合到一个视图中
 */
function UnifiedHomePage({
  ticker,
  indicators,
  ohlcv,
  loading,
  error,
  onRefresh,
  selectedSymbol,
  setSelectedSymbol,
  // AutoAI状态
  autoAIRunning,
  setAutoAIRunning,
  autoAIInterval,
  setAutoAIInterval,
  autoAIAnalysis,
  setAutoAIAnalysis,
  autoAIThoughts,
  setAutoAIThoughts,
  addAutoAIThought,
  modelChatHistory,
  setModelChatHistory
}) {
  const [layout, setLayout] = useState('3-column'); // '3-column', '2-column', 'focus-ai'
  const [showDashboard, setShowDashboard] = useState(true);
  const [showChat, setShowChat] = useState(true);

  // 交易类型筛选（ALL | SPOT | FUTURES）
  const [instrument, setInstrument] = useState('ALL');

  // 布局切换
  const toggleLayout = () => {
    if (layout === '3-column') {
      setLayout('2-column');
      setShowChat(false);
    } else if (layout === '2-column') {
      setLayout('focus-ai');
      setShowDashboard(false);
      setShowChat(false);
    } else {
      setLayout('3-column');
      setShowDashboard(true);
      setShowChat(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* 右侧浮动：模型自述卡片（主页也可用） */}
      <ModelNarrativeCard selectedSymbol={selectedSymbol} />
      {/* 页面标题和布局控制 */}
      <div className="card bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1 flex items-center space-x-2">
              <LayoutGrid className="w-6 h-6 text-purple-500" />
              <span>AI自动分析 & 模型聊天</span>
            </h1>
            <p className="text-sm text-dark-muted">
              受nof1.ai启发 • 仅作为分析工具 • 实时市场数据分析 + AI自动决策 + 智能对话
            </p>
          {/* 筛选：现货/合约 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-muted hidden md:inline">交易类型</span>
            <select
              className="text-xs bg-dark-bg border border-dark-border rounded px-2 py-1"
              value={instrument}
              onChange={(e)=>setInstrument(e.target.value)}
            >
              <option value="ALL">全部</option>
              <option value="SPOT">现货</option>
              <option value="FUTURES">合约</option>
            </select>
          </div>

          </div>

          {/* 布局切换按钮 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleLayout}
              className="flex items-center space-x-2 px-3 py-2 bg-dark-bg hover:bg-dark-border rounded-lg transition-colors text-sm"
              title="切换布局"
            >
              {layout === '3-column' ? (
                <>
                  <Minimize2 className="w-4 h-4" />
                  <span className="hidden md:inline">简化布局</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" />
                  <span className="hidden md:inline">完整布局</span>
                </>
              )}
            </button>

            <div className="text-xs text-dark-muted bg-dark-bg px-2 py-1 rounded">
              {layout === '3-column' ? '3栏' : layout === '2-column' ? '2栏' : '专注'}
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区 - 响应式网格布局 */}
      <div className={`grid gap-4 ${
        layout === '3-column'
          ? 'grid-cols-1 lg:grid-cols-12'
          : layout === '2-column'
          ? 'grid-cols-1 lg:grid-cols-3'
          : 'grid-cols-1'
      }`}>
        {/* 左侧栏：仪表盘 */}
        {showDashboard && (
          <div className={`${
            layout === '3-column' ? 'lg:col-span-3' : 'lg:col-span-1'
          }`}>
            <div className="card sticky top-4">
              <IntegratedDashboard
                ticker={ticker}
                indicators={indicators}
                ohlcv={ohlcv}
                loading={loading}
                error={error}
                onRefresh={onRefresh}
              />
            </div>
          </div>
        )}

        {/* 中间主区域：AI自动分析 */}
        <div className={`${
          layout === '3-column'
            ? 'lg:col-span-6'
            : layout === '2-column'
            ? 'lg:col-span-2'
            : 'lg:col-span-1'
        }`}>
          <AutoAIPanel
            selectedSymbol={selectedSymbol}
            setSelectedSymbol={setSelectedSymbol}
            isRunning={autoAIRunning}
            setIsRunning={setAutoAIRunning}
            interval={autoAIInterval}
            setInterval={setAutoAIInterval}
            analysis={autoAIAnalysis}
            setAnalysis={setAutoAIAnalysis}
            chainOfThought={autoAIThoughts}
            setChainOfThought={setAutoAIThoughts}
            addAutoAIThought={addAutoAIThought}
            modelChatHistory={modelChatHistory}
            setModelChatHistory={setModelChatHistory}
            showTitle={false}
          />

          {/* AI监控概览（主要板块内的紧凑视图） */}
          <div className="mt-4">
            <AIMonitoringSummary instrument={instrument} />
          </div>

          {/* 执行质量小卡片 */}
          <div className="mt-4">
            <ExecutionQualityCard selectedSymbol={selectedSymbol} instrument={instrument} />
          </div>

          {/* Completed Trades 列表 */}
          <div className="mt-4">
            <CompletedTradesPanel selectedSymbol={selectedSymbol} />
          </div>
        </div>

        {/* 右侧栏：AI对话 */}
        {showChat && (
          <div className={`${
            layout === '3-column' ? 'lg:col-span-3' : ''
          }`}>
            <div className="card sticky top-4">
              <CompactAIChatPanel selectedSymbol={selectedSymbol} />
            </div>
          </div>
        )}
      </div>

      {/* 移动端快捷操作栏 */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 bg-dark-card border-t border-dark-border p-2 flex justify-around">
        <button
          onClick={() => setShowDashboard(!showDashboard)}
          className={`px-3 py-2 rounded-lg text-xs transition-colors ${
            showDashboard ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted'
          }`}
        >
          仪表盘
        </button>
        <button
          onClick={() => setShowChat(!showChat)}
          className={`px-3 py-2 rounded-lg text-xs transition-colors ${
            showChat ? 'bg-accent-primary text-white' : 'bg-dark-bg text-dark-muted'
          }`}
        >
          对话
        </button>
      </div>

      {/* 提示信息 - 参考Alpha Arena风格 */}
      <div className="card bg-blue-500/5 border-blue-500/20">
        <div className="flex items-start space-x-3">
          <div className="text-2xl">🎯</div>
          <div className="flex-1">
            <h3 className="font-semibold mb-2 text-sm">关于本系统</h3>
            <div className="text-xs text-dark-muted space-y-2">
              <p>
                <strong>受nof1.ai启发</strong> - 本系统参考了nof1.ai的AI交易分析理念，专注于使用AI模型进行市场分析和决策支持。
              </p>
              <p>
                <strong>仅作为分析工具</strong> - 本系统不执行真实交易，仅提供AI驱动的市场分析、技术指标解读和交易信号建议。所有分析结果仅供参考，不构成投资建议。
              </p>
              <p>
                <strong>核心功能</strong>：
                • 实时市场数据监控
                • AI自动分析（DeepSeek V3.1）
                • 技术指标计算（MCP工具集成）
                • 智能对话助手
              </p>
              <p className="text-yellow-500/80">
                ⚠️ <strong>风险提示</strong>：加密货币市场波动剧烈，投资有风险，入市需谨慎。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UnifiedHomePage;

