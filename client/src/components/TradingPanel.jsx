import React, { useState } from 'react';
import axios from 'axios';
import { Play, Square, TrendingUp, TrendingDown, AlertCircle, Brain } from 'lucide-react';

function TradingPanel({ selectedSymbol, onSymbolChange, ticker, indicators }) {
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);

  const getTradeSignal = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/trading/strategy-signal', {
        params: {
          exchange: 'binance',
          symbol: selectedSymbol,
          timeframe: '1h'
        }
      });
      
      setSignal(response.data.data);
    } catch (error) {
      console.error('获取交易信号失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeWithAI = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/deepseek/analyze', {
        marketData: {
          symbol: selectedSymbol,
          price: ticker?.price,
          change24h: ticker?.change24h,
          volume24h: ticker?.volume24h,
          high24h: ticker?.high24h,
          low24h: ticker?.low24h
        },
        indicators
      });
      
      setAiAnalysis(response.data.data);
    } catch (error) {
      console.error('AI分析失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeTrade = async () => {
    if (!signal || signal.signal === 'HOLD') {
      alert('当前没有有效的交易信号');
      return;
    }

    try {
      const response = await axios.post('/api/trading/execute', {
        signal,
        symbol: selectedSymbol
      });
      
      if (response.data.success) {
        alert('交易执行成功！');
      }
    } catch (error) {
      console.error('执行交易失败:', error);
      alert('交易执行失败: ' + error.message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Control Panel */}
      <div className="card space-y-4">
        <h2 className="text-xl font-bold mb-4">交易控制台</h2>
        
        {/* Symbol Selector */}
        <div>
          <label className="block text-sm text-dark-muted mb-2">交易对</label>
          <select
            value={selectedSymbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            className="input w-full"
          >
            <option value="ETH/USDT">ETH/USDT</option>
            <option value="BTC/USDT">BTC/USDT</option>
            <option value="SOL/USDT">SOL/USDT</option>
            <option value="BNB/USDT">BNB/USDT</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={getTradeSignal}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            <Play className="w-4 h-4" />
            <span>{loading ? '分析中...' : '获取交易信号'}</span>
          </button>

          <button
            onClick={analyzeWithAI}
            disabled={loading}
            className="btn bg-purple-600 hover:bg-purple-700 text-white w-full flex items-center justify-center space-x-2"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{loading ? 'AI分析中...' : 'DeepSeek AI 分析'}</span>
          </button>

          {signal && signal.signal !== 'HOLD' && (
            <button
              onClick={executeTrade}
              className={`btn w-full flex items-center justify-center space-x-2 ${
                signal.signal === 'BUY' 
                  ? 'bg-accent-success hover:bg-green-600' 
                  : 'bg-accent-danger hover:bg-red-600'
              } text-white`}
            >
              {signal.signal === 'BUY' ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>执行 {signal.signal} 交易</span>
            </button>
          )}
        </div>

        {/* Current Price Info */}
        {ticker && (
          <div className="mt-6 p-4 bg-dark-bg rounded-lg">
            <div className="text-sm text-dark-muted mb-1">当前价格</div>
            <div className="text-3xl font-bold font-mono">${ticker.price?.toFixed(2)}</div>
            <div className={`text-sm mt-1 ${ticker.change24h >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
              {ticker.change24h >= 0 ? '+' : ''}{ticker.change24h?.toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      {/* Signal Display */}
      <div className="space-y-4">
        {/* Technical Signal */}
        {signal && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">技术信号</h3>
            <div className={`inline-block px-4 py-2 rounded-lg font-bold mb-4 ${
              signal.signal === 'BUY' 
                ? 'bg-accent-success/20 text-accent-success' 
                : signal.signal === 'SELL'
                ? 'bg-accent-danger/20 text-accent-danger'
                : 'bg-accent-warning/20 text-accent-warning'
            }`}>
              {signal.signal}
            </div>
            
            <div className="space-y-3">
              <div>
                <div className="text-sm text-dark-muted">置信度</div>
                <div className="flex items-center space-x-2 mt-1">
                  <div className="flex-1 bg-dark-bg rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        signal.confidence > 70 ? 'bg-accent-success' :
                        signal.confidence > 40 ? 'bg-accent-warning' :
                        'bg-accent-danger'
                      }`}
                      style={{ width: `${signal.confidence}%` }}
                    />
                  </div>
                  <span className="font-mono">{signal.confidence?.toFixed(0)}%</span>
                </div>
              </div>

              {signal.entryPrice && (
                <div>
                  <div className="text-sm text-dark-muted">入场价</div>
                  <div className="font-mono">${signal.entryPrice?.toFixed(2)}</div>
                </div>
              )}

              {signal.stopLoss && (
                <div>
                  <div className="text-sm text-dark-muted">止损价</div>
                  <div className="font-mono text-accent-danger">${signal.stopLoss?.toFixed(2)}</div>
                </div>
              )}

              {signal.takeProfit && (
                <div>
                  <div className="text-sm text-dark-muted">止盈价</div>
                  <div className="font-mono text-accent-success">${signal.takeProfit?.toFixed(2)}</div>
                </div>
              )}

              {signal.reasoning && (
                <div>
                  <div className="text-sm text-dark-muted mb-1">分析理由</div>
                  <div className="text-sm bg-dark-bg p-3 rounded-lg">
                    {signal.reasoning}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Brain className="w-5 h-5 text-purple-500" />
              <span>AI 深度分析</span>
            </h3>
            
            <div className={`inline-block px-4 py-2 rounded-lg font-bold mb-4 ${
              aiAnalysis.signal === 'BUY' 
                ? 'bg-accent-success/20 text-accent-success' 
                : aiAnalysis.signal === 'SELL'
                ? 'bg-accent-danger/20 text-accent-danger'
                : 'bg-accent-warning/20 text-accent-warning'
            }`}>
              AI建议: {aiAnalysis.signal}
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-sm text-dark-muted">AI置信度</div>
                <div className="flex items-center space-x-2 mt-1">
                  <div className="flex-1 bg-dark-bg rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-purple-600"
                      style={{ width: `${aiAnalysis.confidence}%` }}
                    />
                  </div>
                  <span className="font-mono">{aiAnalysis.confidence?.toFixed(0)}%</span>
                </div>
              </div>

              {aiAnalysis.reasoning && (
                <div>
                  <div className="text-sm text-dark-muted mb-1">AI分析</div>
                  <div className="text-sm bg-dark-bg p-3 rounded-lg whitespace-pre-wrap">
                    {aiAnalysis.reasoning}
                  </div>
                </div>
              )}

              {aiAnalysis.riskLevel && (
                <div>
                  <div className="text-sm text-dark-muted">风险等级</div>
                  <div className={`inline-block px-3 py-1 rounded mt-1 ${
                    aiAnalysis.riskLevel === 'LOW' ? 'bg-accent-success/20 text-accent-success' :
                    aiAnalysis.riskLevel === 'MEDIUM' ? 'bg-accent-warning/20 text-accent-warning' :
                    'bg-accent-danger/20 text-accent-danger'
                  }`}>
                    {aiAnalysis.riskLevel}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TradingPanel;

