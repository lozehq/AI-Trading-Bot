/**
 * 市场情绪数据收集器
 * 负责收集 Fear & Greed Index、CoinGecko 情绪数据、市场趋势等
 */

const BaseCollector = require('./BaseCollector');
const dataSourceManager = require('../dataSourceManager');
const freeAPIsService = require('../freeAPIsService');

class EmotionCollector extends BaseCollector {
  constructor() {
    super('EmotionCollector');
    this.cacheTimeout = 300000; // 5分钟缓存（情绪数据更新较慢）
  }

  /**
   * 收集市场情绪数据
   * @param {string} symbol - 交易对
   * @param {object} options - 选项 { forceRefresh }
   * @returns {object} 情绪数据
   */
  async collect(symbol, options = {}) {
    const { forceRefresh = false } = options;
    const cacheKey = this.getCacheKey(symbol);

    // 检查缓存
    if (!forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    console.log(`   [${this.name}] 收集市场情绪数据...`);

    try {
      // 并行获取情绪数据
      const [
        fearGreedIndex,
        fearGreedHistory,
        coinDetail,
        gainersLosers,
        sentiment,
        freeAPIs
      ] = await Promise.allSettled([
        // Fear & Greed Index
        this.safeExecute(() => dataSourceManager.getFearGreedIndex()),
        this.safeExecute(() => dataSourceManager.getFearGreedHistory()),
        
        // CoinGecko 数据
        this.safeExecute(() => dataSourceManager.getCoinDetail(symbol)),
        this.safeExecute(() => dataSourceManager.getGainersLosers()),
        
        // 市场情绪
        this.safeExecute(() => dataSourceManager.getSentiment(symbol)),
        
        // 免费API增强数据
        this.safeExecute(() => freeAPIsService.getEnhancedData())
      ]);

      const result = {
        // Fear & Greed
        fearGreedIndex: fearGreedIndex.status === 'fulfilled' ? fearGreedIndex.value : null,
        fearGreedHistory: fearGreedHistory.status === 'fulfilled' ? fearGreedHistory.value : null,
        
        // CoinGecko
        coinDetail: coinDetail.status === 'fulfilled' ? coinDetail.value : null,
        gainersLosers: gainersLosers.status === 'fulfilled' ? gainersLosers.value : null,
        
        // 情绪分析
        sentiment: sentiment.status === 'fulfilled' ? sentiment.value : null,
        
        // 免费API数据
        freeAPIs: freeAPIs.status === 'fulfilled' ? freeAPIs.value : null,
        
        timestamp: Date.now()
      };

      // 缓存结果
      this.setCache(cacheKey, result);

      // 统计成功率
      const total = 6;
      const successful = Object.values(result).filter(v => v !== null && v !== undefined).length - 1; // 减去timestamp
      console.log(`   [${this.name}] 情绪数据收集完成 (${successful}/${total})`);

      return result;

    } catch (error) {
      console.error(`   [${this.name}] 收集失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取市场趋势分析
   */
  async collectTrends() {
    console.log(`   [${this.name}] 收集市场趋势...`);

    const [trending, topGainers, topLosers] = await Promise.allSettled([
      this.safeExecute(() => dataSourceManager.getTrendingCoins()),
      this.safeExecute(() => dataSourceManager.getTopGainers()),
      this.safeExecute(() => dataSourceManager.getTopLosers())
    ]);

    return {
      trending: trending.status === 'fulfilled' ? trending.value : null,
      topGainers: topGainers.status === 'fulfilled' ? topGainers.value : null,
      topLosers: topLosers.status === 'fulfilled' ? topLosers.value : null,
      timestamp: Date.now()
    };
  }

  /**
   * 获取社交媒体情绪（如果支持）
   */
  async collectSocialSentiment(symbol) {
    console.log(`   [${this.name}] 收集社交媒体情绪...`);

    const [twitter, reddit, telegram] = await Promise.allSettled([
      this.safeExecute(() => dataSourceManager.getTwitterSentiment(symbol)),
      this.safeExecute(() => dataSourceManager.getRedditSentiment(symbol)),
      this.safeExecute(() => dataSourceManager.getTelegramSentiment(symbol))
    ]);

    return {
      twitter: twitter.status === 'fulfilled' ? twitter.value : null,
      reddit: reddit.status === 'fulfilled' ? reddit.value : null,
      telegram: telegram.status === 'fulfilled' ? telegram.value : null,
      timestamp: Date.now()
    };
  }

  /**
   * 获取完整情绪分析（包含趋势和社交媒体）
   */
  async collectComplete(symbol, options = {}) {
    const [baseEmotion, trends, social] = await Promise.allSettled([
      this.collect(symbol, options),
      this.collectTrends(),
      this.collectSocialSentiment(symbol)
    ]);

    return {
      base: baseEmotion.status === 'fulfilled' ? baseEmotion.value : null,
      trends: trends.status === 'fulfilled' ? trends.value : null,
      social: social.status === 'fulfilled' ? social.value : null,
      timestamp: Date.now()
    };
  }
}

module.exports = new EmotionCollector();

