const axios = require('axios');
const { performance } = require('perf_hooks');

class BacktestEngine {
  constructor() {
    this.strategies = new Map();
    this.results = new Map();
    this.historicalData = new Map();
    this.cache = new Map(); // cacheKey -> { timestamp, result }
    this.defaultCacheTTL = Number(process.env.BACKTEST_CACHE_TTL_MS) || (4 * 60 * 60 * 1000);
  }

  registerStrategy(name, strategyFactory) {
    let factoryFn;

    if (typeof strategyFactory === 'function' && typeof strategyFactory.prototype?.execute === 'function') {
      factoryFn = (params = {}) => new strategyFactory(params);
    } else if (typeof strategyFactory === 'function' && !strategyFactory.execute) {
      factoryFn = (params = {}) => strategyFactory(params);
      const testInstance = factoryFn({});
      if (!testInstance || typeof testInstance.execute !== 'function') {
        throw new Error('策略工厂必须返回包含 execute 方法的对象');
      }
    } else if (strategyFactory && typeof strategyFactory.execute === 'function') {
      factoryFn = () => strategyFactory;
    } else {
      throw new Error('策略必须是类、工厂函数或包含 execute 方法的实例');
    }

    this.strategies.set(name, {
      name,
      factory: factoryFn,
      createdAt: new Date()
    });

    console.log(`📊 注册策略: ${name}`);
  }

  listStrategies() {
    return Array.from(this.strategies.keys());
  }

  buildCacheKey(config) {
    const serializable = {
      strategy: config.strategyName,
      symbol: config.symbol,
      interval: config.interval,
      startDate: config.startDate,
      endDate: config.endDate,
      initialCapital: config.initialCapital,
      fee: config.fee,
      slippage: config.slippage,
      params: config.params || null
    };
    return JSON.stringify(serializable);
  }

  async runBacktestWithCache(config, options = {}) {
    const ttl = Number(options.ttlMs) || this.defaultCacheTTL;
    const cacheKey = this.buildCacheKey(config);
    const cached = this.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < ttl) {
      return {
        ...cached.result,
        fromCache: true,
        cacheTTL: ttl,
        cacheExpiresAt: cached.timestamp + ttl
      };
    }

    const result = await this.runBacktest(config);
    const timestamp = Date.now();
    this.cache.set(cacheKey, { timestamp, result });
    return {
      ...result,
      fromCache: false,
      cacheTTL: ttl,
      cacheExpiresAt: timestamp + ttl
    };
  }

  // 获取历史数据
  async fetchHistoricalData(symbol, exchange = 'binance', interval = '1h', limit = 500) {
    const cacheKey = `${exchange}:${symbol}:${interval}`;
    
    // 检查缓存
    if (this.historicalData.has(cacheKey)) {
      const cached = this.historicalData.get(cacheKey);
      if (Date.now() - cached.timestamp < 60 * 60 * 1000) { // 1小时缓存
        return cached.data;
      }
    }
    
    try {
      let data = [];
      
      if (exchange === 'binance') {
        const response = await axios.get(
          `https://api.binance.com/api/v3/klines`,
          {
            params: {
              symbol: symbol.replace('/', ''),
              interval,
              limit
            }
          }
        );
        
        data = response.data.map(candle => ({
          timestamp: candle[0],
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5])
        }));
      }
      
      // 缓存数据
      this.historicalData.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (error) {
      console.error(`获取历史数据失败: ${error.message}`);
      throw error;
    }
  }

  // 运行回测
  async runBacktest(config) {
    const {
      strategyName,
      symbol,
      exchange = 'binance',
      interval = '1h',
      startDate,
      endDate,
      initialCapital = 10000,
      fee = 0.001, // 0.1%手续费
      slippage = 0.0005 // 0.05%滑点
    } = config;
    
    const strategyEntry = this.strategies.get(strategyName);
    if (!strategyEntry) {
      throw new Error(`策略不存在: ${strategyName}`);
    }

    const strategyParams = config.params || {};
    const strategy = strategyEntry.factory(strategyParams) || {};
    
    console.log(`🔄 开始回测: ${strategyName} on ${symbol}`);
    const startTime = performance.now();
    
    // 获取历史数据
    const historicalData = await this.fetchHistoricalData(symbol, exchange, interval);
    
    // 过滤日期范围
    const filteredData = historicalData.filter(candle => {
      const candleTime = new Date(candle.timestamp);
      return (!startDate || candleTime >= new Date(startDate)) &&
             (!endDate || candleTime <= new Date(endDate));
    });
    
    if (filteredData.length === 0) {
      throw new Error('指定日期范围内没有数据');
    }
    
    // 初始化回测状态
    const state = {
      capital: initialCapital,
      position: 0,
      trades: [],
      equity: [],
      signals: [],
      maxDrawdown: 0,
      peakEquity: initialCapital
    };
    
    // 运行策略
    for (let i = 0; i < filteredData.length; i++) {
      const candle = filteredData[i];
      const history = filteredData.slice(Math.max(0, i - 100), i + 1); // 提供最近100根K线
      
      // 执行策略
      const signal = await strategy.execute({
        currentPrice: candle.close,
        candle,
        history,
        position: state.position,
        capital: state.capital
      });
      
      // 记录信号
      if (signal && signal.action !== 'hold') {
        state.signals.push({
          timestamp: candle.timestamp,
          action: signal.action,
          price: candle.close,
          reason: signal.reason
        });
      }
      
      // 执行交易
      if (signal && signal.action === 'buy' && state.position === 0) {
        const amount = (state.capital * (signal.size || 1)) / candle.close;
        const cost = amount * candle.close * (1 + fee + slippage);
        
        if (cost <= state.capital) {
          state.position = amount;
          state.capital -= cost;
          state.trades.push({
            timestamp: candle.timestamp,
            type: 'buy',
            price: candle.close * (1 + slippage),
            amount,
            cost,
            fee: amount * candle.close * fee
          });
        }
      } else if (signal && signal.action === 'sell' && state.position > 0) {
        const revenue = state.position * candle.close * (1 - fee - slippage);
        state.capital += revenue;
        
        state.trades.push({
          timestamp: candle.timestamp,
          type: 'sell',
          price: candle.close * (1 - slippage),
          amount: state.position,
          revenue,
          fee: state.position * candle.close * fee
        });
        
        state.position = 0;
      }
      
      // 计算权益
      const currentEquity = state.capital + (state.position * candle.close);
      state.equity.push({
        timestamp: candle.timestamp,
        value: currentEquity
      });
      
      // 更新最大回撤
      if (currentEquity > state.peakEquity) {
        state.peakEquity = currentEquity;
      }
      const drawdown = (state.peakEquity - currentEquity) / state.peakEquity;
      if (drawdown > state.maxDrawdown) {
        state.maxDrawdown = drawdown;
      }
    }
    
    // 计算最终收益
    const finalCandle = filteredData[filteredData.length - 1];
    const finalEquity = state.capital + (state.position * finalCandle.close);
    
    // 计算统计指标
    const stats = this.calculateStats({
      trades: state.trades,
      equity: state.equity,
      initialCapital,
      finalEquity,
      maxDrawdown: state.maxDrawdown
    });
    
    const endTime = performance.now();
    
    const result = {
      strategyName,
      symbol,
      interval,
      period: {
        start: filteredData[0].timestamp,
        end: finalCandle.timestamp,
        days: Math.ceil((finalCandle.timestamp - filteredData[0].timestamp) / (1000 * 60 * 60 * 24))
      },
      performance: {
        initialCapital,
        finalEquity,
        totalReturn: ((finalEquity - initialCapital) / initialCapital) * 100,
        maxDrawdown: state.maxDrawdown * 100,
        ...stats
      },
      trades: state.trades,
      signals: state.signals,
      equity: state.equity,
      executionTime: (endTime - startTime) / 1000
    };
    
    // 保存结果
    this.results.set(`${strategyName}_${symbol}_${Date.now()}`, result);
    
    console.log(`✅ 回测完成: 收益率 ${result.performance.totalReturn.toFixed(2)}%`);
    
    return result;
  }

  // 计算统计指标
  calculateStats({ trades, equity, initialCapital, finalEquity, maxDrawdown }) {
    const winningTrades = trades.filter((t, i) => {
      if (t.type === 'sell' && i > 0) {
        const buyTrade = trades[i - 1];
        return t.revenue > buyTrade.cost;
      }
      return false;
    });
    
    const losingTrades = trades.filter((t, i) => {
      if (t.type === 'sell' && i > 0) {
        const buyTrade = trades[i - 1];
        return t.revenue <= buyTrade.cost;
      }
      return false;
    });
    
    const totalTrades = Math.floor(trades.length / 2);
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    
    // 计算夏普比率 (假设无风险利率为0)
    const returns = [];
    for (let i = 1; i < equity.length; i++) {
      returns.push((equity[i].value - equity[i - 1].value) / equity[i - 1].value);
    }
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length
    );
    
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // 年化
    
    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      sharpeRatio,
      avgTradeReturn: totalTrades > 0 
        ? ((finalEquity - initialCapital) / initialCapital / totalTrades) * 100 
        : 0
    };
  }

  // 批量回测
  async runBatchBacktest(configs) {
    const results = [];
    
    for (const config of configs) {
      try {
        const result = await this.runBacktest(config);
        results.push(result);
      } catch (error) {
        console.error(`回测失败 ${config.strategyName}: ${error.message}`);
        results.push({
          strategyName: config.strategyName,
          symbol: config.symbol,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // 比较多个策略
  compareStrategies(resultIds) {
    const comparison = [];
    
    for (const id of resultIds) {
      const result = this.results.get(id);
      if (result && !result.error) {
        comparison.push({
          strategy: result.strategyName,
          symbol: result.symbol,
          totalReturn: result.performance.totalReturn,
          maxDrawdown: result.performance.maxDrawdown,
          winRate: result.performance.winRate,
          sharpeRatio: result.performance.sharpeRatio,
          totalTrades: result.performance.totalTrades
        });
      }
    }
    
    // 按收益率排序
    comparison.sort((a, b) => b.totalReturn - a.totalReturn);
    
    return comparison;
  }

  // 获取所有回测结果
  getAllResults() {
    return Array.from(this.results.values());
  }

  // 清理旧结果
  cleanupOldResults(daysToKeep = 7) {
    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [key, result] of this.results.entries()) {
      if (result.timestamp && result.timestamp < cutoff) {
        this.results.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个旧回测结果`);
    }
  }
}

// 内置策略示例
class SimpleMAStrategy {
  constructor(params = {}) {
    this.shortPeriod = Number(params.shortPeriod) || 10;
    this.longPeriod = Number(params.longPeriod) || 20;
  }

  async execute({ history, position }) {
    if (history.length < this.longPeriod) {
      return { action: 'hold' };
    }

    const shortMA = history.slice(-this.shortPeriod)
      .reduce((sum, c) => sum + c.close, 0) / this.shortPeriod;

    const longMA = history.slice(-this.longPeriod)
      .reduce((sum, c) => sum + c.close, 0) / this.longPeriod;

    if (shortMA > longMA && position === 0) {
      return { action: 'buy', size: 1, reason: 'MA金叉' };
    } else if (shortMA < longMA && position > 0) {
      return { action: 'sell', size: 1, reason: 'MA死叉' };
    }

    return { action: 'hold' };
  }
}

class MomentumStrategy {
  constructor(params = {}) {
    this.lookback = Number(params.lookback) || 20;
    this.threshold = Number(params.threshold) || 0.015; // 1.5%
  }

  async execute({ history, position }) {
    if (history.length < this.lookback) {
      return { action: 'hold' };
    }

    const window = history.slice(-this.lookback);
    const first = window[0].close;
    const last = window[window.length - 1].close;
    if (!first) return { action: 'hold' };
    const change = (last - first) / first;

    if (change > this.threshold && position === 0) {
      return { action: 'buy', size: 1, reason: `动量向上 ${ (change*100).toFixed(2) }%` };
    }
    if (change < -this.threshold && position > 0) {
      return { action: 'sell', size: 1, reason: `动量向下 ${ (change*100).toFixed(2) }%` };
    }
    return { action: 'hold' };
  }
}

class RSIReversionStrategy {
  constructor(params = {}) {
    this.period = Number(params.period) || 14;
    this.buyLevel = Number(params.buyLevel) || 30;
    this.sellLevel = Number(params.sellLevel) || 70;
  }

  calculateRSI(history) {
    if (history.length < this.period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = history.length - this.period; i < history.length; i++) {
      const change = history[i].close - history[i - 1].close;
      if (change >= 0) gains += change;
      else losses -= change;
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  }

  async execute({ history, position }) {
    const rsi = this.calculateRSI(history);
    if (rsi === null) return { action: 'hold' };

    if (rsi < this.buyLevel && position === 0) {
      return { action: 'buy', size: 1, reason: `RSI ${rsi.toFixed(1)} 低于 ${this.buyLevel}` };
    }
    if (rsi > this.sellLevel && position > 0) {
      return { action: 'sell', size: 1, reason: `RSI ${rsi.toFixed(1)} 高于 ${this.sellLevel}` };
    }
    return { action: 'hold' };
  }
}

// 单例模式
let backtestEngineInstance = null;

function getBacktestEngine() {
  if (!backtestEngineInstance) {
    backtestEngineInstance = new BacktestEngine();
    backtestEngineInstance.registerStrategy('SimpleMA', (params = {}) => new SimpleMAStrategy(params));
    backtestEngineInstance.registerStrategy('Momentum', (params = {}) => new MomentumStrategy(params));
    backtestEngineInstance.registerStrategy('RSIReversion', (params = {}) => new RSIReversionStrategy(params));
  }
  return backtestEngineInstance;
}

module.exports = {
  getBacktestEngine,
  BacktestEngine,
  SimpleMAStrategy,
  MomentumStrategy,
  RSIReversionStrategy
};