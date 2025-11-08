/**
 * 免费API数据管理器
 * 集成Yahoo Finance、Reddit、Blockchain等免费数据源
 */

const axios = require('axios');

class FreeAPIManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1分钟缓存
  }

  /**
   * 生成缓存键
   */
  getCacheKey(source, method, params = {}) {
    return `${source}:${method}:${JSON.stringify(params)}`;
  }

  /**
   * 检查缓存
   */
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  /**
   * 设置缓存
   */
  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Yahoo Finance API - 获取美股指数
   */
  async getMarketIndices() {
    const cacheKey = this.getCacheKey('yahoo', 'indices');
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      console.log('📊 [免费API] 获取美股指数数据...');
      
      const [sp500, nasdaq, dxy] = await Promise.all([
        this.fetchYahooIndex('^GSPC'),  // 标普500
        this.fetchYahooIndex('^IXIC'),  // 纳斯达克
        this.fetchYahooIndex('DX-Y.NYB') // 美元指数 (备用)
      ]);

      const data = {
        sp500: sp500?.meta?.regularMarketPrice || 0,
        sp500_change: sp500?.meta?.regularMarketChangePercent || 0,
        nasdaq: nasdaq?.meta?.regularMarketPrice || 0,
        nasdaq_change: nasdaq?.meta?.regularMarketChangePercent || 0,
        dxy: dxy?.meta?.regularMarketPrice || 0,
        dxy_change: dxy?.meta?.regularMarketChangePercent || 0,
        timestamp: new Date().toISOString()
      };

      this.setCachedData(cacheKey, data);
      console.log('✅ [免费API] 美股指数数据获取成功');
      return data;

    } catch (error) {
      console.error('❌ [免费API] 美股指数数据获取失败:', error.message);
      return null;
    }
  }

  /**
   * 获取单个Yahoo指数
   */
  async fetchYahooIndex(symbol) {
    try {
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
        { timeout: 5000 }
      );
      
      if (response.data?.chart?.result?.[0]) {
        return response.data.chart.result[0];
      }
      return null;
    } catch (error) {
      console.warn(`⚠️ [免费API] ${symbol} 获取失败:`, error.message);
      return null;
    }
  }

  /**
   * Reddit API - 获取加密货币情绪
   */
  async getCryptoSentiment() {
    const cacheKey = this.getCacheKey('reddit', 'sentiment');
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      console.log('📊 [免费API] 获取Reddit加密货币情绪...');
      
      const response = await axios.get(
        'https://www.reddit.com/r/cryptocurrency/hot.json?limit=10',
        { 
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }
      );

      const posts = response.data?.data?.children || [];
      
      // 计算情绪指标
      const totalScore = posts.reduce((sum, post) => sum + (post.data?.score || 0), 0);
      const totalComments = posts.reduce((sum, post) => sum + (post.data?.num_comments || 0), 0);
      const avgScore = totalScore / posts.length || 0;
      
      // 分析标题情绪
      const titles = posts.map(post => post.data?.title || '').join(' ');
      const bullishKeywords = ['bull', 'moon', 'pump', 'rise', 'up', 'high', 'surge', 'rally'];
      const bearishKeywords = ['bear', 'crash', 'dump', 'fall', 'down', 'low', 'drop', 'decline'];
      
      const bullishCount = bullishKeywords.filter(keyword => 
        titles.toLowerCase().includes(keyword)
      ).length;
      const bearishCount = bearishKeywords.filter(keyword => 
        titles.toLowerCase().includes(keyword)
      ).length;

      const data = {
        posts_count: posts.length,
        avg_score: Math.round(avgScore),
        total_comments: totalComments,
        bullish_mentions: bullishCount,
        bearish_mentions: bearishCount,
        sentiment_score: Math.max(-100, Math.min(100, (bullishCount - bearishCount) * 20)),
        engagement_level: totalComments > 1000 ? 'HIGH' : totalComments > 500 ? 'MEDIUM' : 'LOW',
        timestamp: new Date().toISOString()
      };

      this.setCachedData(cacheKey, data);
      console.log('✅ [免费API] Reddit情绪数据获取成功');
      return data;

    } catch (error) {
      console.error('❌ [免费API] Reddit情绪数据获取失败:', error.message);
      return null;
    }
  }

  /**
   * Blockchain.info API - 获取比特币链上数据
   */
  async getBitcoinOnChain() {
    const cacheKey = this.getCacheKey('blockchain', 'bitcoin');
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      console.log('📊 [免费API] 获取比特币链上数据...');
      
      const [blockHeight, hashRate, difficulty, mempoolSize] = await Promise.all([
        this.fetchBlockchainData('getblockcount'),
        this.fetchBlockchainData('hashrate'),
        this.fetchBlockchainData('getdifficulty'),
        this.fetchBlockchainData('mempoolsize')
      ]);

      const data = {
        block_height: parseInt(blockHeight) || 0,
        hash_rate: parseFloat(hashRate) || 0,
        difficulty: parseFloat(difficulty) || 0,
        mempool_size: parseInt(mempoolSize) || 0,
        network_health: this.calculateNetworkHealth(hashRate, difficulty),
        timestamp: new Date().toISOString()
      };

      this.setCachedData(cacheKey, data);
      console.log('✅ [免费API] 比特币链上数据获取成功');
      return data;

    } catch (error) {
      console.error('❌ [免费API] 比特币链上数据获取失败:', error.message);
      return null;
    }
  }

  /**
   * 获取Blockchain.info数据
   */
  async fetchBlockchainData(endpoint) {
    try {
      const response = await axios.get(
        `https://blockchain.info/q/${endpoint}`,
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      console.warn(`⚠️ [免费API] Blockchain ${endpoint} 获取失败:`, error.message);
      return null;
    }
  }

  /**
   * 计算网络健康度
   */
  calculateNetworkHealth(hashRate, difficulty) {
    const hr = parseFloat(hashRate) || 0;
    const diff = parseFloat(difficulty) || 0;
    
    if (hr > 100 && diff > 20) return 'EXCELLENT';
    if (hr > 50 && diff > 15) return 'GOOD';
    if (hr > 20 && diff > 10) return 'FAIR';
    return 'POOR';
  }

  /**
   * 获取所有免费API数据
   */
  async getAllFreeData() {
    console.log('🚀 [免费API] 开始获取所有免费数据...');
    
    const [indices, sentiment, onchain] = await Promise.allSettled([
      this.getMarketIndices(),
      this.getCryptoSentiment(),
      this.getBitcoinOnChain()
    ]);

    const result = {
      success: true,
      data: {
        market_indices: indices.status === 'fulfilled' ? indices.value : null,
        social_sentiment: sentiment.status === 'fulfilled' ? sentiment.value : null,
        on_chain_data: onchain.status === 'fulfilled' ? onchain.value : null
      },
      errors: {
        market_indices: indices.status === 'rejected' ? indices.reason.message : null,
        social_sentiment: sentiment.status === 'rejected' ? sentiment.reason.message : null,
        on_chain_data: onchain.status === 'rejected' ? onchain.reason.message : null
      },
      timestamp: new Date().toISOString()
    };

    const successCount = Object.values(result.data).filter(d => d !== null).length;
    console.log(`✅ [免费API] 数据获取完成: ${successCount}/3 成功`);
    
    return result;
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 [免费API] 缓存已清理');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout
    };
  }
}

module.exports = new FreeAPIManager();
