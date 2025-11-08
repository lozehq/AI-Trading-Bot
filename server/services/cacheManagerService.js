// 统一缓存管理（AI分析用）：生成key、读写与动态TTL

const { caches } = require('../utils/cache');

class CacheManagerService {
  constructor() {
    this.timeWindowMs = 30 * 1000; // 默认30秒
  }

  generateAnalysisKey(marketData, indicators) {
    const price = Number(marketData?.price) || 0;
    const pricePercentBucket = Math.floor((price / 100) * 2) / 2; // 0.5%精度

    const rsi = indicators?.rsi || indicators?.momentum?.rsi14;
    const rsiBucket = rsi !== undefined ? Math.floor(rsi / 5) * 5 : 'unknown';

    const macd = indicators?.macd || indicators?.momentum?.macd;
    const hist = macd?.histogram;
    const macdTrend = hist !== undefined
      ? (hist > 0.1 ? 'strong_bull' : hist > 0 ? 'weak_bull' : hist < -0.1 ? 'strong_bear' : 'weak_bear')
      : 'unknown';

    const t = Math.floor(Date.now() / this.timeWindowMs);
    return `ai_analyses:${marketData.symbol}:${marketData.exchange || 'unknown'}:p${pricePercentBucket}:r${rsiBucket}:${macdTrend}:t${t}`;
  }

  get(key) {
    return caches.ai.get(key);
  }

  set(key, value, ttlMs) {
    return caches.ai.set(key, value, ttlMs);
  }

  del(key) {
    return caches.ai.delete(key);
  }
}

module.exports = new CacheManagerService();


