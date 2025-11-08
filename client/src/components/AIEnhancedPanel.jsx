import React, { useState } from 'react';
import axios from 'axios';
import { Brain, Zap, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Search } from 'lucide-react';

function AIEnhancedPanel({ selectedSymbol }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mcpTools, setMcpTools] = useState([]);
  const [aiTools, setAiTools] = useState([]);
  const [symbol, setSymbol] = useState(selectedSymbol || 'ETH/USDT');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableSymbols, setAvailableSymbols] = useState([]);

  // 获取可用MCP工具
  const fetchMCPTools = async () => {
    try {
      const response = await axios.get('/api/mcp/tools');
      setMcpTools(response.data.data);
    } catch (error) {
      console.error('获取MCP工具失败:', error);
    }
  };

  // 获取AI可用的工具
  const fetchAITools = async () => {
    try {
      const response = await axios.get('/api/ai/available-tools');
      setAiTools(response.data.data.tools);
    } catch (error) {
      console.error('获取AI工具失败:', error);
    }
  };

  // 获取可用交易对
  const fetchAvailableSymbols = async () => {
    try {
      const response = await axios.get('/api/market/available-symbols', {
        params: { exchange: 'binance' }
      });
      setAvailableSymbols(response.data.data);
    } catch (error) {
      // 如果API不存在，使用默认列表
      setAvailableSymbols([
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT',
        'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'TRX/USDT',
        'MATIC/USDT', 'DOT/USDT', 'AVAX/USDT', 'LINK/USDT',
        'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'ETC/USDT'
      ]);
    }
  };

  React.useEffect(() => {
    fetchMCPTools();
    fetchAITools();
    fetchAvailableSymbols();
  }, []);

  React.useEffect(() => {
    setSymbol(selectedSymbol || 'ETH/USDT');
  }, [selectedSymbol]);

  // AI增强分析
  const analyzeWithMCP = async (useFullMCP = true) => {
    setLoading(true);
    try {
      const response = await axios.post('/api/ai/analyze-with-tools', {
        symbol: symbol, // 使用本地选择的交易对
        useFullMCP // true=完整MCP（AI自主选择），false=基础模式（预设5个工具）
      });
      
      setAnalysis(response.data.data);
    } catch (error) {
      console.error('AI分析失败:', error);
      alert('AI分析失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 过滤交易对
  const filteredSymbols = availableSymbols.filter(s => 
    s.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* 交易对选择 */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">选择要分析的加密货币</h3>
        
        {/* 搜索框 */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="搜索交易对（如：BTC, ETH, SOL...）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-full"
          />
        </div>

        {/* 交易对网格 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
          {filteredSymbols.slice(0, 24).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSymbol(s);
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                symbol === s
                  ? 'bg-accent-primary text-white'
                  : 'bg-dark-bg hover:bg-dark-border text-dark-text'
              }`}
            >
              {s.replace('/USDT', '')}
            </button>
          ))}
        </div>

        {/* 当前选择 */}
        <div className="mt-4 p-3 bg-dark-bg rounded-lg">
          <div className="text-sm text-dark-muted">当前选择</div>
          <div className="text-2xl font-bold font-mono mt-1">{symbol}</div>
        </div>
      </div>

      {/* MCP工具状态 */}
      <div className="card bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">AI全面分析</h2>
              <p className="text-sm text-dark-muted">
                <span className="text-accent-success font-semibold">让AI分析</span>: AI自主选择工具（Function Calling，可用60+个MCP函数）
              </p>
            </div>
          </div>
          
          <button
            onClick={() => analyzeWithMCP(true)}
            disabled={loading}
            className="btn-primary flex items-center space-x-2"
          >
            <Brain className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            <span>{loading ? 'AI思考中...' : '让AI分析'}</span>
          </button>
        </div>
      </div>

      {/* MCP工具说明 */}
      {aiTools.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-3">MCP数据工具（每次分析自动使用）</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {aiTools.map((tool, index) => (
              <div key={index} className="p-3 bg-dark-bg rounded-lg border border-accent-success/20">
                <div className="flex items-center space-x-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-accent-success" />
                  <span className="text-sm font-semibold">{tool.name}</span>
                </div>
                <p className="text-xs text-dark-muted">{tool.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 bg-green-900/10 rounded-lg border border-green-500/30">
            <p className="text-xs text-green-400">
              每次点击"AI分析"，系统会自动使用所有MCP工具获取数据，然后交给AI进行全面分析
            </p>
          </div>
        </div>
      )}

      {/* MCP工具列表 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {mcpTools.map((tool, index) => (
          <div key={index} className="card">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-4 h-4 text-accent-success" />
              <h4 className="font-semibold">{tool.name}</h4>
            </div>
            <p className="text-sm text-dark-muted mb-2">{tool.description}</p>
            <div className="text-xs text-accent-primary">{tool.methodsCount} 个可用方法</div>
          </div>
        ))}
      </div>

      {/* AI分析结果 */}
      {analysis && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
            <Brain className="w-5 h-5 text-purple-500" />
            <span>AI深度分析结果</span>
          </h3>

          {/* 交易信号 */}
          <div className={`inline-block px-6 py-3 rounded-lg font-bold text-lg mb-4 ${
            (analysis.decision?.signal ?? analysis.signal) === 'BUY'
              ? 'bg-accent-success/20 text-accent-success border-2 border-accent-success'
              : (analysis.decision?.signal ?? analysis.signal) === 'SELL'
              ? 'bg-accent-danger/20 text-accent-danger border-2 border-accent-danger'
              : 'bg-accent-warning/20 text-accent-warning border-2 border-accent-warning'
          }`}>
            {analysis.decision?.signal ?? analysis.signal}
          </div>

          {/* 置信度 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-dark-muted">AI置信度</span>
              <span className="font-mono font-bold">{analysis.confidence}%</span>
            </div>
            <div className="w-full bg-dark-bg rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  analysis.confidence > 70 ? 'bg-accent-success' :
                  analysis.confidence > 40 ? 'bg-accent-warning' :
                  'bg-accent-danger'
                }`}
                style={{ width: `${analysis.confidence}%` }}
              />
            </div>
          </div>

          {/* 交易参数 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-dark-bg p-3 rounded-lg">
              <div className="text-xs text-dark-muted mb-1">入场价</div>
              <div className="font-mono font-bold text-lg">${analysis.entryPrice?.toFixed(2)}</div>
            </div>
            <div className="bg-dark-bg p-3 rounded-lg">
              <div className="text-xs text-dark-muted mb-1">止损价</div>
              <div className="font-mono font-bold text-lg text-accent-danger">
                ${analysis.stopLoss?.toFixed(2)}
              </div>
            </div>
            <div className="bg-dark-bg p-3 rounded-lg">
              <div className="text-xs text-dark-muted mb-1">止盈价</div>
              <div className="font-mono font-bold text-lg text-accent-success">
                ${analysis.takeProfit?.toFixed(2)}
              </div>
            </div>
            <div className="bg-dark-bg p-3 rounded-lg">
              <div className="text-xs text-dark-muted mb-1">风险等级</div>
              <div className={`font-bold text-lg ${
                analysis.riskLevel === 'LOW' ? 'text-accent-success' :
                analysis.riskLevel === 'MEDIUM' ? 'text-accent-warning' :
                'text-accent-danger'
              }`}>
                {analysis.riskLevel}
              </div>
            </div>
          </div>

          {/* 关键要点 */}
          {analysis.keyPoints && analysis.keyPoints.length > 0 && (
            <div className="mb-4">
              <div className="text-sm text-dark-muted mb-2">关键要点</div>
              <div className="space-y-2">
                {analysis.keyPoints.map((point, i) => (
                  <div key={i} className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-accent-success mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 分析理由 */}
          <div className="bg-dark-bg p-4 rounded-lg mb-4">
            <div className="text-sm text-dark-muted mb-2">AI分析理由</div>
            <div className="text-sm whitespace-pre-wrap">{analysis.reasoning}</div>
          </div>

          {/* MCP数据使用情况 */}
          {analysis.mcpDataUsed && (
            <div className="border-t border-dark-border pt-4">
              <div className="text-sm text-dark-muted mb-2">MCP数据获取情况</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div className={`flex items-center space-x-1 ${analysis.mcpDataUsed.price ? 'text-accent-success' : 'text-dark-muted'}`}>
                  {analysis.mcpDataUsed.price ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  <span>实时价格</span>
                </div>
                <div className={`flex items-center space-x-1 ${analysis.mcpDataUsed.indicators ? 'text-accent-success' : 'text-dark-muted'}`}>
                  {analysis.mcpDataUsed.indicators ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  <span>技术指标</span>
                </div>
                <div className={`flex items-center space-x-1 ${analysis.mcpDataUsed.sentiment ? 'text-accent-success' : 'text-dark-muted'}`}>
                  {analysis.mcpDataUsed.sentiment ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  <span>市场情绪</span>
                </div>
                <div className={`flex items-center space-x-1 ${analysis.mcpDataUsed.coinDetail ? 'text-accent-success' : 'text-dark-muted'}`}>
                  {analysis.mcpDataUsed.coinDetail ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  <span>币种详情</span>
                </div>
                <div className={`flex items-center space-x-1 ${analysis.mcpDataUsed.gainersLosers ? 'text-accent-success' : 'text-dark-muted'}`}>
                  {analysis.mcpDataUsed.gainersLosers ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  <span>涨跌榜</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-accent-success">
                使用了所有可用的MCP工具数据进行分析
              </div>
            </div>
          )}
        </div>
      )}

      {/* 提示信息 */}
      {!analysis && !loading && (
        <div className="card text-center py-12">
          <Brain className="w-16 h-16 mx-auto mb-4 text-purple-500 opacity-50" />
          <h3 className="text-xl font-semibold mb-2">AI增强分析</h3>
          <p className="text-dark-muted mb-4">
            使用MCP工具获取多维度数据，让AI进行深度分析
          </p>
          <p className="text-sm text-dark-muted">
            点击上方"开始AI分析"按钮
          </p>
        </div>
      )}
    </div>
  );
}

export default AIEnhancedPanel;

