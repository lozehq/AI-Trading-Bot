const mcpIntegration = require('./mcpIntegration'); // 使用MCP集成
const deepseekService = require('./deepseek');
const okxTrading = require('./exchange/OkxTradingService');
const okxAlgoOrder = require('./exchange/OkxAlgoOrderService');
const orderMonitor = require('./OrderMonitor');
const riskControl = require('./RiskControl');
const positionSyncer = require('./PositionSyncer');
const monitoringService = require('./MonitoringService');

class TradingEngine {
  constructor() {
    this.positions = [];
    this.tradeHistory = [];
    this.isAutoTrading = false;
    this.autoTradingInterval = null;
    this.accountBalance = 10000; // 初始资金
    this.riskPercentage = 2; // 每笔交易风险2%
    this.tradingMode = process.env.TRADING_MODE || 'paper'; // 交易模式
    this.symbolList = null;  // 多交易对轮询
    this.symbolIndex = 0;
  }

  // 新增：动态调整风险比例
  setRiskPercentage(percent) {
    const p = Number(percent);
    if (Number.isFinite(p) && p > 0 && p <= 10) {
      this.riskPercentage = p;
      console.log(`[交易引擎] 已更新风险比例: ${p}%`);
    }
  }

  /**
   * 获取综合交易信号
   */
  async getStrategySignal(exchange, symbol, timeframe) {
    try {
      // 1. 获取市场数据（使用统一数据源）
      const dataSourceManager = require('./dataSourceManager');
      const ticker = await dataSourceManager.getTicker(exchange, symbol);
      const indicators = await dataSourceManager.getAllIndicators(exchange, symbol, timeframe);
      
      // 2. 技术面分析
      const technicalSignal = this.analyzeTechnicalIndicators(indicators, ticker);
      
      // 3. AI分析
      const aiAnalysis = await deepseekService.analyzeMarket(
        {
          symbol,
          price: ticker?.price || ticker?.last || 0,
          change24h: ticker?.change24h || ticker?.percentage || 0,
          volume24h: ticker?.volume24h || ticker?.quoteVolume || 0,
          high24h: ticker?.high24h || ticker?.high || 0,
          low24h: ticker?.low24h || ticker?.low || 0
        },
        indicators,
        null // 暂无新闻数据
      );

      // 4. 综合信号
      const finalSignal = this.combineSignals(technicalSignal, aiAnalysis);

      return {
        ...finalSignal,
        technicalSignal,
        aiAnalysis,
        currentPrice: ticker?.price || ticker?.last || 0,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('获取策略信号失败:', error);
      throw error;
    }
  }

  /**
   * 技术指标分析
   */
  analyzeTechnicalIndicators(indicators, ticker) {
    const signals = [];
    let score = 0;

    // RSI分析
    if (indicators.rsi) {
      if (indicators.rsi < 30) {
        signals.push('RSI超卖');
        score += 2;
      } else if (indicators.rsi > 70) {
        signals.push('RSI超买');
        score -= 2;
      }
    }

    // MACD分析
    if (indicators.macd) {
      if (indicators.macd.histogram > 0) {
        signals.push('MACD多头');
        score += 1;
      } else {
        signals.push('MACD空头');
        score -= 1;
      }
    }

    // 布林带分析
    if (indicators.bollinger && ticker) {
      const currentPrice = ticker?.price || ticker?.last || 0;
      if (currentPrice > 0 && currentPrice < indicators.bollinger.lower) {
        signals.push('价格触及布林带下轨');
        score += 1.5;
      } else if (currentPrice > 0 && currentPrice > indicators.bollinger.upper) {
        signals.push('价格触及布林带上轨');
        score -= 1.5;
      }
    }

    // EMA趋势分析
    if (indicators.ema) {
      if (indicators.ema.ema9 > indicators.ema.ema21 && 
          indicators.ema.ema21 > indicators.ema.ema50) {
        signals.push('EMA多头排列');
        score += 1.5;
      } else if (indicators.ema.ema9 < indicators.ema.ema21 && 
                 indicators.ema.ema21 < indicators.ema.ema50) {
        signals.push('EMA空头排列');
        score -= 1.5;
      }
    }

    let signal = 'HOLD';
    if (score >= 3) signal = 'BUY';
    else if (score <= -3) signal = 'SELL';

    return {
      signal,
      score,
      signals,
      confidence: Math.min(Math.abs(score) * 15, 100)
    };
  }

  /**
   * 综合技术信号和AI信号
   */
  combineSignals(technicalSignal, aiAnalysis) {
    // 如果两个信号一致，提高置信度
    if (technicalSignal.signal === aiAnalysis.signal) {
      return {
        signal: technicalSignal.signal,
        confidence: Math.min((technicalSignal.confidence + aiAnalysis.confidence) / 1.5, 95),
        reasoning: `技术面和AI分析一致: ${aiAnalysis.reasoning}`,
        technicalScore: technicalSignal.score,
        entryPrice: aiAnalysis.entryPrice,
        stopLoss: aiAnalysis.stopLoss,
        takeProfit: aiAnalysis.takeProfit,
        riskLevel: aiAnalysis.riskLevel
      };
    }

    // 如果信号冲突，降低置信度
    if ((technicalSignal.signal === 'BUY' && aiAnalysis.signal === 'SELL') ||
        (technicalSignal.signal === 'SELL' && aiAnalysis.signal === 'BUY')) {
      return {
        signal: 'HOLD',
        confidence: 30,
        reasoning: '技术面和AI分析存在分歧，建议观望',
        technicalScore: technicalSignal.score,
        riskLevel: 'HIGH'
      };
    }

    // AI优先（置信度高时）
    if (aiAnalysis.confidence > 70) {
      return {
        ...aiAnalysis,
        reasoning: `AI高置信度建议: ${aiAnalysis.reasoning}`,
        technicalScore: technicalSignal.score
      };
    }

    // 默认观望
    return {
      signal: 'HOLD',
      confidence: Math.max(technicalSignal.confidence, aiAnalysis.confidence || 0),
      reasoning: aiAnalysis.reasoning || '信号不明确，建议观望',
      technicalScore: technicalSignal.score,
      riskLevel: 'MEDIUM'
    };
  }

  /**
   * 执行交易（集成真实交易）
   */
  async executeTrade(signal, symbol, customAmount = null) {
    if (signal.signal === 'HOLD') {
      return { status: 'skipped', reason: '信号为观望' };
    }

    try {
      // 1. 计算仓位大小
      const positionSize = customAmount || this.calculatePositionSize(
        signal.entryPrice || signal.currentPrice,
        signal.stopLoss
      );

      // 2. 风控检查
      const riskCheck = await riskControl.checkBeforeTrade(
        signal,
        symbol,
        positionSize,
        this.tradingMode
      );

      if (!riskCheck.allowed) {
        console.warn(`[交易引擎] 风控拒绝: ${riskCheck.reason}`);
        return {
          status: 'rejected',
          reason: riskCheck.reason,
          code: riskCheck.code
        };
      }

      console.log(`[交易引擎] 风控通过，准备执行交易: ${signal.signal} ${symbol}`);

      // 3. 下主订单（带原子性保证）
      let mainOrderId = null;
      let algoOrderIds = [];
      let order = null;
      const eventBus = require('./EventBus');
      const clientOrderId = `ai_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

      try {
        // 触发“准备下单”事件
        try { eventBus.emit('order.submitting', { clientOrderId, symbol, side: signal.signal, amount: positionSize, mode: this.tradingMode, expectedPrice: signal.entryPrice || signal.currentPrice, ts: Date.now(), analysisId: signal.analysisId }); } catch(_) {}

        order = await okxTrading.createOrder({
          symbol,
          side: signal.signal.toUpperCase(),
          type: 'MARKET', // 市价单
          amount: positionSize,
          mode: this.tradingMode,
          // 传递幂等ID（ccxt会映射为OKX clOrdId）
          params: { clientOrderId, clOrdId: clientOrderId }
        });

        console.log(`[交易引擎] 主订单已提交:`, order);
        mainOrderId = order.id;

        // 触发“已提交”事件
        try { eventBus.emit('order.submitted', { clientOrderId, orderId: mainOrderId, symbol, side: signal.signal, amount: positionSize, mode: this.tradingMode, ts: Date.now() }); } catch(_) {}

        // 4. 启动订单监控
        if (order.id) {
          orderMonitor.monitorOrder(order.id, symbol, this.tradingMode, (updatedOrder) => {
            console.log(`[交易引擎] 订单更新: ${updatedOrder.status}`);
          });
        }

        // 5. 下止盈止损单（如果失败则回滚主订单）
        if (signal.stopLoss || signal.takeProfit) {
          try {
            const algoOrders = await okxAlgoOrder.createStopLossAndTakeProfit({
              symbol,
              side: signal.signal.toUpperCase(),
              amount: positionSize,
              stopLossPrice: signal.stopLoss,
              takeProfitPrice: signal.takeProfit,
              mode: this.tradingMode
            });

            console.log(`[交易引擎] 止盈止损单已提交:`, algoOrders);
            if (Array.isArray(algoOrders)) {
              algoOrderIds = algoOrders.map(o => o.id).filter(Boolean);
            }
          } catch (slError) {
            console.error(`[交易引擎] 止损单失败，紧急取消主订单:`, slError);

            // 尝试取消主订单
            if (mainOrderId) {
              try {
                await okxTrading.cancelOrder(mainOrderId, symbol);
                console.log(`[交易引擎] 主订单已成功取消: ${mainOrderId}`);
              } catch (cancelError) {
                console.error(`[交易引擎] ⚠️ 紧急取消主订单失败:`, cancelError);
                // 发送紧急通知
                console.error(`[交易引擎] ❌ 危险：主订单${mainOrderId}无止损保护！需要手动处理！`);
              }
            }

            throw new Error(`止损单下单失败: ${slError.message}`);
          }
        }
      } catch (error) {
        // 如果有任何错误，尝试清理已创建的订单
        if (mainOrderId && !error.message.includes('止损单下单失败')) {
          try {
            await okxTrading.cancelOrder(mainOrderId, symbol);
            console.log(`[交易引擎] 错误回滚：主订单已取消`);
          } catch (cancelError) {
            console.error(`[交易引擎] 回滚失败:`, cancelError);
          }
        }
        try { eventBus.emit('order.error', { clientOrderId, symbol, error: error.message, mode: this.tradingMode }); } catch(_) {}
        throw error;
      }

      // 6. 记录到本地
      const trade = {
        id: order.id || Date.now().toString(),
        symbol,
        side: signal.signal,
        entryPrice: signal.entryPrice || signal.currentPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        amount: positionSize,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        timestamp: new Date().toISOString(),
        status: 'open',
        orderId: order.id,
        mode: this.tradingMode
      };

      this.positions.push(trade);
      this.tradeHistory.push({
        ...trade,
        action: 'open'
      });

      try { eventBus.emit('position.opened', { ...trade, clientOrderId }); } catch(_) {}

      return {
        status: 'executed',
        trade,
        order,
        riskCheck
      };

    } catch (error) {
      console.error('[交易引擎] 执行交易失败:', error.message);
      return {
        status: 'error',
        reason: error.message,
        error
      };
    }
  }

  /**
   * 计算仓位大小
   */
  calculatePositionSize(entryPrice, stopLoss) {
    if (!stopLoss || !entryPrice) {
      // 默认仓位
      return (this.accountBalance * this.riskPercentage / 100) / entryPrice;
    }

    const riskAmount = this.accountBalance * (this.riskPercentage / 100);
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    
    return riskAmount / riskPerUnit;
  }

  /**
   * 获取持仓
   */
  getPositions() {
    return this.positions.filter(p => p.status === 'open');
  }

  /**
   * 获取交易历史
   */
  getTradeHistory(limit = 50) {
    return this.tradeHistory.slice(-limit).reverse();
  }

  /**
   * 获取表现统计
   */
  getPerformanceStats() {
    const closedTrades = this.tradeHistory.filter(t => t.status === 'closed');
    const wins = closedTrades.filter(t => t.profit > 0);
    const losses = closedTrades.filter(t => t.profit < 0);
    
    const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

    return {
      totalTrades: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      averageWin: wins.length > 0 ? (wins.reduce((s, t) => s + t.profit, 0) / wins.length).toFixed(2) : 0,
      averageLoss: losses.length > 0 ? (losses.reduce((s, t) => s + t.profit, 0) / losses.length).toFixed(2) : 0,
      currentBalance: this.accountBalance.toFixed(2),
      openPositions: this.getPositions().length
    };
  }

  /**
   * 启动自动交易
   */
  startAutoTrading(config = {}) {
    if (this.isAutoTrading) {
      console.log('[交易引擎] 自动交易已经在运行');
      return;
    }

    this.isAutoTrading = true;
    const interval = config.interval || 60000; // 默认1分钟
    const symbol = config.symbol || 'BTC/USDT';
    this.symbolList = Array.isArray(config.symbols) && config.symbols.length > 0
      ? config.symbols
          .map(s => String(s).trim())
          .filter(Boolean)
      : null;
    this.symbolIndex = 0;
    const exchange = config.exchange || process.env.EXCHANGE_NAME || 'binance';
    this.tradingMode = config.mode || process.env.TRADING_MODE || 'paper';

    console.log(`[交易引擎] 启动自动交易: ${this.symbolList ? this.symbolList.join(',') : symbol} on ${exchange}, 模式: ${this.tradingMode}`);

    // 更新监控状态
    monitoringService.updateAutoTradingStatus({
      enabled: true,
      symbol,
      mode: this.tradingMode,
      interval,
      lastSignalTime: null,
      lastTradeTime: null
    });

    // 启动持仓同步
    positionSyncer.start(this.tradingMode);

    // 启动风控系统
    riskControl.updateBalance(this.tradingMode);

    this.autoTradingInterval = setInterval(async () => {
      try {
        // 轮询选择当前交易对
        let runSymbol = symbol;
        if (this.symbolList && this.symbolList.length > 0) {
          runSymbol = this.symbolList[this.symbolIndex % this.symbolList.length];
          this.symbolIndex++;
        }
        // 检查风控状态
        const riskStatus = riskControl.getStatus();
        if (riskStatus.tradingPaused) {
          console.warn(`[交易引擎] 交易已暂停: ${riskStatus.pauseReason}`);
          return;
        }

        // 获取交易信号
        const signal = await this.getStrategySignal(exchange, runSymbol, '1h');

        // 更新AI分析状态（带详细字段与多时间框架）
        let multiTimeframe = null;
        try {
          const dataSourceManager = require('./dataSourceManager');
          multiTimeframe = await dataSourceManager.getMultiTimeframeTrend(
            exchange,
            runSymbol
          );
        } catch (e) {
          // 忽略多时间框架失败
        }

        monitoringService.updateAIAnalysis({
          signal: signal.signal,
          confidence: signal.confidence,
          reasoning: signal.reasoning,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          riskLevel: signal.riskLevel,
          summary: signal.aiAnalysis?.summary,
          coreIndicatorsAlignment: signal.aiAnalysis?.decision?.coreIndicatorsAlignment || signal.aiAnalysis?.coreIndicatorsAlignment,
          signalChangeReason: signal.aiAnalysis?.decision?.signalChangeReason || signal.aiAnalysis?.signalChangeReason,
          multiTimeframe,
          timestamp: Date.now()
        });

        // 更新最后信号时间
        monitoringService.updateAutoTradingStatus({
          lastSignalTime: Date.now()
        });

        // 只有高置信度才执行
        if (signal.confidence > 70) {
          const result = await this.executeTrade(signal, runSymbol);
          console.log(`[交易引擎] 交易执行结果:`, result);

          // 更新最后交易时间
          if (result.status === 'executed') {
            monitoringService.updateAutoTradingStatus({
              lastTradeTime: Date.now()
            });
          }
        } else {
          console.log(`[交易引擎] 信号置信度不足 (${signal.confidence}%), 不执行交易`);
        }
      } catch (error) {
        console.error('[交易引擎] 自动交易错误:', error);
        monitoringService.addError(`自动交易错误: ${error.message}`);
      }
    }, interval);
  }

  /**
   * 停止自动交易
   */
  stopAutoTrading() {
    if (this.autoTradingInterval) {
      clearInterval(this.autoTradingInterval);
      this.autoTradingInterval = null;
    }
    this.isAutoTrading = false;

    // 更新监控状态
    monitoringService.updateAutoTradingStatus({
      enabled: false
    });

    // 停止持仓同步
    positionSyncer.stop();

    // 停止所有订单监控
    orderMonitor.stopAll();

    console.log('[交易引擎] 自动交易已停止');
  }
}

module.exports = TradingEngine;

