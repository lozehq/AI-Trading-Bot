/**
 * 核心数据收集器
 * 负责收集 CCXT/MCP 核心行情数据（价格、K线、技术指标、订单簿等）
 */

const BaseCollector = require('./BaseCollector');
const dataSourceManager = require('../dataSourceManager');
const { AI_ANALYSIS } = require('../../config/constants');

class CoreCollector extends BaseCollector {
  constructor() {
    super('CoreCollector');
  }

  /**
   * 收集核心市场数据
   * @param {string} exchange - 交易所
   * @param {string} symbol - 交易对
   * @param {object} options - 选项 { timeframe, forceRefresh }
   * @returns {object} 核心数据
   */
  async collect(exchange, symbol, options = {}) {
    const { timeframe = '1h', forceRefresh = false } = options;
    const cacheKey = this.getCacheKey(exchange, symbol, timeframe);

    // 检查缓存
    if (!forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    console.log(`   [${this.name}] 收集 ${symbol} 核心数据...`);

    try {
      // 并行获取核心数据
      const [ticker, ohlcv, indicators, orderBook, trades, advancedIndicators] = await Promise.allSettled([
        this.retryWithBackoff(() => dataSourceManager.getTicker(exchange, symbol)),
        this.retryWithBackoff(() => dataSourceManager.getOHLCV(exchange, symbol, timeframe, AI_ANALYSIS.DEFAULT_KLINE_LIMIT)),
        this.retryWithBackoff(() => dataSourceManager.getAllIndicators(exchange, symbol, timeframe)),
        this.safeExecute(() => dataSourceManager.getOrderBook(exchange, symbol, 20)),
        this.safeExecute(() => dataSourceManager.getTrades(exchange, symbol, 50)),
        this.safeExecute(() => dataSourceManager.getAdvancedIndicators(symbol, timeframe))
      ]);

      const result = {
        ticker: ticker.status === 'fulfilled' ? ticker.value : null,
        ohlcv: ohlcv.status === 'fulfilled' ? ohlcv.value : null,
        indicators: indicators.status === 'fulfilled' ? indicators.value : null,
        orderBook: orderBook.status === 'fulfilled' ? orderBook.value : null,
        trades: trades.status === 'fulfilled' ? trades.value : null,
        advancedIndicators: advancedIndicators.status === 'fulfilled' ? advancedIndicators.value : null,
        timestamp: Date.now(),
        source: dataSourceManager.getCurrentSource()
      };

      // 缓存结果
      this.setCache(cacheKey, result);

      console.log(`   [${this.name}] 核心数据收集完成`);
      return result;

    } catch (error) {
      console.error(`   [${this.name}] 收集失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取多时间框架数据
   * @param {string} exchange - 交易所
   * @param {string} symbol - 交易对
   * @param {array} timeframes - 时间框架列表
   * @returns {object} 多时间框架数据
   */
  async collectMultiTimeframe(exchange, symbol, timeframes = ['1m', '15m', '30m', '1h', '4h', '1d']) {
    console.log(`   [${this.name}] 收集多时间框架数据: ${timeframes.join(', ')}`);

    const batchSize = 2; // 每批2个时间框架
    const requestDelay = 200; // 请求间隔200ms

    const results = {};
    
    for (let i = 0; i < timeframes.length; i += batchSize) {
      const batch = timeframes.slice(i, i + batchSize);
      console.log(`   [${this.name}] 处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(timeframes.length/batchSize)}: ${batch.join(', ')}`);

      const batchResults = await Promise.allSettled(
        batch.map(async (tf, idx) => {
          // 添加请求延迟避免频率限制
          await this.sleep(requestDelay * idx);

          return this.retryWithBackoff(async () => {
            const [ohlcv, indicators] = await Promise.all([
              dataSourceManager.getOHLCV(exchange, symbol, tf, AI_ANALYSIS.DEFAULT_KLINE_LIMIT),
              dataSourceManager.getAllIndicators(exchange, symbol, tf)
            ]);

            return { timeframe: tf, ohlcv, indicators };
          });
        })
      );

      // 处理批次结果
      batchResults.forEach((result, idx) => {
        const tf = batch[idx];
        if (result.status === 'fulfilled') {
          results[tf] = result.value;
          console.log(`      ✓ ${tf} 数据获取成功`);
        } else {
          console.warn(`      ✗ ${tf} 数据获取失败:`, result.reason?.message);
          results[tf] = null;
        }
      });
    }

    return results;
  }

  /**
   * 获取完整市场数据（包含多时间框架）
   */
  async collectComplete(exchange, symbol, options = {}) {
    const { includeMultiTimeframe = true, forceRefresh = false } = options;

    const [baseData, multiTimeframeData] = await Promise.allSettled([
      this.collect(exchange, symbol, { ...options, forceRefresh }),
      includeMultiTimeframe ? this.collectMultiTimeframe(exchange, symbol) : Promise.resolve(null)
    ]);

    return {
      base: baseData.status === 'fulfilled' ? baseData.value : null,
      multiTimeframe: multiTimeframeData.status === 'fulfilled' ? multiTimeframeData.value : null,
      timestamp: Date.now()
    };
  }
}

module.exports = new CoreCollector();

