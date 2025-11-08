/**
 * 衍生品数据收集器
 * 负责收集资金费率、持仓量、清算数据、多空比等衍生品相关数据
 */

const BaseCollector = require('./BaseCollector');
const dataSourceManager = require('../dataSourceManager');

class DerivativesCollector extends BaseCollector {
  constructor() {
    super('DerivativesCollector');
  }

  /**
   * 收集衍生品数据
   * @param {string} exchange - 交易所
   * @param {string} symbol - 交易对
   * @param {object} options - 选项 { forceRefresh }
   * @returns {object} 衍生品数据
   */
  async collect(exchange, symbol, options = {}) {
    const { forceRefresh = false } = options;
    const cacheKey = this.getCacheKey(exchange, symbol);

    // 检查缓存
    if (!forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    console.log(`   [${this.name}] 收集 ${symbol} 衍生品数据...`);

    try {
      // 并行获取衍生品数据（分批执行以避免过载）
      const batch1 = await Promise.allSettled([
        // 核心衍生品数据
        this.safeExecute(() => dataSourceManager.getFundingRate(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getOpenInterest(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getLiquidations(exchange, symbol, 100)),
        this.safeExecute(() => dataSourceManager.getFundingRateHistory(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getOpenInterestHistory(exchange, symbol))
      ]);

      const batch2 = await Promise.allSettled([
        // 多空比数据
        this.safeExecute(() => dataSourceManager.getLongShortRatio(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getLongShortRatioHistory(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getMarkPrice(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getTakerVolume(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getMarkOHLCV(exchange, symbol))
      ]);

      const batch3 = await Promise.allSettled([
        // OHLCV和订单簿
        this.safeExecute(() => dataSourceManager.getIndexOHLCV(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getL2OrderBook(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getBorrowRateHistory(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getLeverageTiers(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getFundingInterval(exchange, symbol))
      ]);

      const batch4 = await Promise.allSettled([
        // 高级OKX数据
        this.safeExecute(() => dataSourceManager.getOptionGreeks(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getOptionChain(exchange, symbol)),
        this.safeExecute(() => dataSourceManager.getSystemStatus(exchange)),
        this.safeExecute(() => dataSourceManager.getInsuranceFund(exchange)),
        this.safeExecute(() => dataSourceManager.getPremiumIndex(exchange, symbol))
      ]);

      // 合并所有批次结果
      const [
        fundingRate, openInterest, liquidations, fundingRateHistory, openInterestHistory,
        longShortRatio, longShortRatioHistory, markPrice, takerVolume, markOHLCV,
        indexOHLCV, l2OrderBook, borrowRateHistory, leverageTiers, fundingInterval,
        optionGreeks, optionChain, systemStatus, insuranceFund, premiumIndex
      ] = [...batch1, ...batch2, ...batch3, ...batch4];

      const result = {
        // 核心数据
        fundingRate: fundingRate.status === 'fulfilled' ? fundingRate.value : null,
        openInterest: openInterest.status === 'fulfilled' ? openInterest.value : null,
        liquidations: liquidations.status === 'fulfilled' ? liquidations.value : null,

        // 历史数据
        fundingRateHistory: fundingRateHistory.status === 'fulfilled' ? fundingRateHistory.value : null,
        openInterestHistory: openInterestHistory.status === 'fulfilled' ? openInterestHistory.value : null,

        // 多空比
        longShortRatio: longShortRatio.status === 'fulfilled' ? longShortRatio.value : null,
        longShortRatioHistory: longShortRatioHistory.status === 'fulfilled' ? longShortRatioHistory.value : null,

        // 标记价格和成交量
        markPrice: markPrice.status === 'fulfilled' ? markPrice.value : null,
        takerVolume: takerVolume.status === 'fulfilled' ? takerVolume.value : null,

        // OHLCV
        markOHLCV: markOHLCV.status === 'fulfilled' ? markOHLCV.value : null,
        indexOHLCV: indexOHLCV.status === 'fulfilled' ? indexOHLCV.value : null,

        // 订单簿和借贷
        l2OrderBook: l2OrderBook.status === 'fulfilled' ? l2OrderBook.value : null,
        borrowRateHistory: borrowRateHistory.status === 'fulfilled' ? borrowRateHistory.value : null,

        // 杠杆和资金费率间隔
        leverageTiers: leverageTiers.status === 'fulfilled' ? leverageTiers.value : null,
        fundingInterval: fundingInterval.status === 'fulfilled' ? fundingInterval.value : null,

        // 高级OKX数据
        optionGreeks: optionGreeks.status === 'fulfilled' ? optionGreeks.value : null,
        optionChain: optionChain.status === 'fulfilled' ? optionChain.value : null,
        systemStatus: systemStatus.status === 'fulfilled' ? systemStatus.value : null,
        insuranceFund: insuranceFund.status === 'fulfilled' ? insuranceFund.value : null,
        premiumIndex: premiumIndex.status === 'fulfilled' ? premiumIndex.value : null,

        timestamp: Date.now(),
        source: dataSourceManager.getCurrentSource()
      };

      // 缓存结果
      this.setCache(cacheKey, result);

      // 统计成功率
      const total = 20; // 更新总数
      const successful = Object.values(result).filter(v => v !== null && v !== undefined).length - 2; // 减去timestamp和source
      console.log(`   [${this.name}] 衍生品数据收集完成 (${successful}/${total})`);

      return result;

    } catch (error) {
      console.error(`   [${this.name}] 收集失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取期权数据（如果支持）
   */
  async collectOptions(exchange, symbol) {
    console.log(`   [${this.name}] 收集期权数据...`);

    const [optionGreeks, optionChain] = await Promise.allSettled([
      this.safeExecute(() => dataSourceManager.getOptionGreeks(exchange, symbol)),
      this.safeExecute(() => dataSourceManager.getOptionChain(exchange, symbol))
    ]);

    return {
      optionGreeks: optionGreeks.status === 'fulfilled' ? optionGreeks.value : null,
      optionChain: optionChain.status === 'fulfilled' ? optionChain.value : null,
      timestamp: Date.now()
    };
  }
}

module.exports = new DerivativesCollector();

