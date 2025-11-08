/**
 * 数据收集器统一入口
 * 提供统一的数据收集接口，整合所有收集器
 */

const coreCollector = require('./CoreCollector');
const derivativesCollector = require('./DerivativesCollector');
const emotionCollector = require('./EmotionCollector');
const newsCollector = require('./NewsCollector');
const divergenceDetector = require('../divergenceDetector');
const priceActionService = require('../priceActionService');

class DataCollectorOrchestrator {
  constructor() {
    this.collectors = {
      core: coreCollector,
      derivatives: derivativesCollector,
      emotion: emotionCollector,
      news: newsCollector
    };
  }

  /**
   * 收集所有数据（完整模式）
   * @param {string} exchange - 交易所
   * @param {string} symbol - 交易对
   * @param {object} options - 选项
   * @returns {object} 完整数据
   */
  async collectAll(exchange, symbol, options = {}) {
    const { forceRefresh = false, includeMultiTimeframe = true } = options;
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 开始收集 ${symbol} 完整数据`);
    console.log(`   交易所: ${exchange}`);
    console.log(`   强制刷新: ${forceRefresh ? '是' : '否'}`);
    console.log(`   多时间框架: ${includeMultiTimeframe ? '是' : '否'}`);
    console.log(`${'═'.repeat(60)}\n`);

    const startTime = Date.now();

    try {
      // 并行收集所有数据
      const [coreData, derivativesData, emotionData, newsData] = await Promise.allSettled([
        // 核心数据（包含多时间框架）
        this.collectors.core.collectComplete(exchange, symbol, { 
          forceRefresh, 
          includeMultiTimeframe 
        }),
        
        // 衍生品数据
        this.collectors.derivatives.collect(exchange, symbol, { forceRefresh }),
        
        // 情绪数据
        this.collectors.emotion.collect(symbol, { forceRefresh }),
        
        // 新闻数据
        this.collectors.news.collect(symbol, { forceRefresh })
      ]);

      // 提取核心数据
      const core = coreData.status === 'fulfilled' ? coreData.value : null;
      const derivatives = derivativesData.status === 'fulfilled' ? derivativesData.value : null;
      const emotion = emotionData.status === 'fulfilled' ? emotionData.value : null;
      const news = newsData.status === 'fulfilled' ? newsData.value : null;

      // 计算价格行为和背离
      let priceAction = null;
      let divergence = null;

      if (core?.base?.ohlcv && core?.base?.indicators) {
        try {
          // priceActionService.analyze 需要 symbol 和 multiTimeframe 数据
          priceAction = priceActionService.analyze(
            symbol,
            core.multiTimeframe || {}
          );

          divergence = divergenceDetector.detectDivergence(
            core.base.ohlcv,
            core.base.indicators
          );
        } catch (error) {
          console.warn('   价格行为/背离分析失败:', error.message);
        }
      }

      // 组装完整数据
      const result = {
        // 基础数据
        ticker: core?.base?.ticker || null,
        ohlcv: core?.base?.ohlcv || null,
        indicators: core?.base?.indicators || null,
        advancedIndicators: core?.base?.advancedIndicators || null,
        orderBook: core?.base?.orderBook || null,
        trades: core?.base?.trades || null,

        // 多时间框架
        multiTimeframe: core?.multiTimeframe || null,

        // 衍生品数据 - 核心
        fundingRate: derivatives?.fundingRate || null,
        openInterest: derivatives?.openInterest || null,
        liquidations: derivatives?.liquidations || null,
        fundingRateHistory: derivatives?.fundingRateHistory || null,
        openInterestHistory: derivatives?.openInterestHistory || null,
        longShortRatio: derivatives?.longShortRatio || null,
        longShortRatioHistory: derivatives?.longShortRatioHistory || null,
        markPrice: derivatives?.markPrice || null,
        takerVolume: derivatives?.takerVolume || null,
        markOHLCV: derivatives?.markOHLCV || null,
        indexOHLCV: derivatives?.indexOHLCV || null,
        l2OrderBook: derivatives?.l2OrderBook || null,
        borrowRateHistory: derivatives?.borrowRateHistory || null,
        leverageTiers: derivatives?.leverageTiers || null,
        fundingInterval: derivatives?.fundingInterval || null,

        // 衍生品数据 - 高级OKX
        optionGreeks: derivatives?.optionGreeks || null,
        optionChain: derivatives?.optionChain || null,
        systemStatus: derivatives?.systemStatus || null,
        insuranceFund: derivatives?.insuranceFund || null,
        premiumIndex: derivatives?.premiumIndex || null,

        // 情绪数据
        sentiment: emotion?.sentiment || null,
        coinDetail: emotion?.coinDetail || null,
        gainersLosers: emotion?.gainersLosers || null,
        freeAPIs: emotion?.freeAPIs || null,
        fearGreedIndex: emotion?.fearGreedIndex || null,
        fearGreedHistory: emotion?.fearGreedHistory || null,

        // 新闻数据
        aktools: news ? { news: news.combined || [] } : null,

        // 高级分析
        priceAction,
        divergence,

        // 元数据
        timestamp: Date.now(),
        collectionTime: Date.now() - startTime,
        source: core?.base?.source || 'unknown'
      };

      const duration = Date.now() - startTime;
      console.log(`\n✅ 数据收集完成，耗时: ${duration}ms`);
      console.log(`${'═'.repeat(60)}\n`);

      return result;

    } catch (error) {
      console.error('❌ 数据收集失败:', error.message);
      throw error;
    }
  }

  /**
   * 清除所有缓存
   */
  clearAllCaches() {
    Object.values(this.collectors).forEach(collector => {
      collector.clearCache();
    });
    console.log('✅ 所有收集器缓存已清除');
  }
}

module.exports = new DataCollectorOrchestrator();

