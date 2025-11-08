/**
 * 数据新鲜度验证器
 * 用于实时交易系统，确保数据足够新鲜
 */

class DataFreshnessValidator {
  constructor() {
    // 数据新鲜度阈值（毫秒）
    this.FRESHNESS_THRESHOLDS = {
      TICKER: 10000,        // Ticker数据：10秒
      OHLCV: 60000,         // K线数据：60秒
      INDICATORS: 60000,    // 技术指标：60秒
      ORDERBOOK: 5000,      // 订单簿：5秒
      TRADES: 30000,        // 交易记录：30秒
      SENTIMENT: 300000,    // 市场情绪：5分钟
      NEWS: 600000          // 新闻：10分钟
    };
    
    // 价格变化阈值（百分比）
    this.PRICE_CHANGE_THRESHOLD = 0.01; // 1%
  }
  
  /**
   * 验证Ticker数据新鲜度
   */
  validateTickerFreshness(ticker) {
    if (!ticker) {
      return {
        fresh: false,
        reason: 'NO_DATA',
        severity: 'CRITICAL',
        message: 'Ticker数据不存在'
      };
    }
    
    // 检查时间戳
    if (!ticker.timestamp) {
      console.warn('⚠️ Ticker数据缺少时间戳，无法验证新鲜度');
      return {
        fresh: true, // 假设新鲜（降级处理）
        reason: 'NO_TIMESTAMP',
        severity: 'WARNING',
        message: 'Ticker数据缺少时间戳，无法验证新鲜度'
      };
    }
    
    const now = Date.now();
    const dataAge = now - ticker.timestamp;
    const ageSeconds = (dataAge / 1000).toFixed(1);
    
    // 数据超过阈值视为过期
    if (dataAge > this.FRESHNESS_THRESHOLDS.TICKER) {
      return {
        fresh: false,
        reason: 'STALE_DATA',
        severity: 'HIGH',
        message: `Ticker数据过期（${ageSeconds}秒前），超过${this.FRESHNESS_THRESHOLDS.TICKER / 1000}秒阈值`,
        ageSeconds: parseFloat(ageSeconds),
        threshold: this.FRESHNESS_THRESHOLDS.TICKER / 1000
      };
    }
    
    return {
      fresh: true,
      ageSeconds: parseFloat(ageSeconds),
      message: `Ticker数据新鲜（${ageSeconds}秒前）`
    };
  }
  
  /**
   * 验证OHLCV数据新鲜度
   */
  validateOHLCVFreshness(ohlcv, timeframe = '1h') {
    if (!ohlcv || ohlcv.length === 0) {
      return {
        fresh: false,
        reason: 'NO_DATA',
        severity: 'HIGH',
        message: 'OHLCV数据不存在'
      };
    }
    
    const lastCandle = ohlcv[ohlcv.length - 1];
    if (!lastCandle.timestamp) {
      return {
        fresh: true, // 假设新鲜
        reason: 'NO_TIMESTAMP',
        severity: 'WARNING',
        message: 'OHLCV数据缺少时间戳'
      };
    }
    
    const now = Date.now();
    const dataAge = now - lastCandle.timestamp;
    const ageMinutes = (dataAge / 60000).toFixed(1);
    
    // 根据时间框架调整阈值
    const threshold = this.getOHLCVThreshold(timeframe);
    
    if (dataAge > threshold) {
      return {
        fresh: false,
        reason: 'STALE_DATA',
        severity: 'MEDIUM',
        message: `OHLCV数据过期（${ageMinutes}分钟前），超过${threshold / 60000}分钟阈值`,
        ageMinutes: parseFloat(ageMinutes),
        threshold: threshold / 60000
      };
    }
    
    return {
      fresh: true,
      ageMinutes: parseFloat(ageMinutes),
      message: `OHLCV数据新鲜（${ageMinutes}分钟前）`
    };
  }
  
  /**
   * 根据时间框架获取OHLCV阈值
   */
  getOHLCVThreshold(timeframe) {
    const thresholds = {
      '1m': 120000,   // 2分钟
      '5m': 300000,   // 5分钟
      '15m': 900000,  // 15分钟
      '30m': 1800000, // 30分钟
      '1h': 3600000,  // 60分钟
      '4h': 14400000, // 4小时
      '1d': 86400000  // 24小时
    };
    return thresholds[timeframe] || this.FRESHNESS_THRESHOLDS.OHLCV;
  }
  
  /**
   * 检查价格是否发生显著变化
   */
  checkPriceChange(oldPrice, newPrice) {
    if (!oldPrice || !newPrice) {
      return {
        changed: true,
        reason: 'MISSING_PRICE',
        message: '价格数据缺失'
      };
    }
    
    const priceChange = Math.abs((newPrice - oldPrice) / oldPrice);
    const changePercent = (priceChange * 100).toFixed(2);
    
    if (priceChange > this.PRICE_CHANGE_THRESHOLD) {
      return {
        changed: true,
        reason: 'SIGNIFICANT_CHANGE',
        changePercent: parseFloat(changePercent),
        message: `价格变化${changePercent}%，超过${this.PRICE_CHANGE_THRESHOLD * 100}%阈值`,
        oldPrice,
        newPrice
      };
    }
    
    return {
      changed: false,
      changePercent: parseFloat(changePercent),
      message: `价格变化${changePercent}%，在正常范围内`
    };
  }
  
  /**
   * 验证多数据源价格一致性
   */
  validatePriceConsistency(prices) {
    if (!prices || prices.length < 2) {
      return {
        consistent: true,
        reason: 'INSUFFICIENT_DATA',
        message: '数据源不足，无法验证一致性'
      };
    }
    
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const maxDeviation = Math.max(...prices.map(p => Math.abs(p - avgPrice) / avgPrice));
    const deviationPercent = (maxDeviation * 100).toFixed(2);
    
    // 价格偏差超过0.5%视为不一致
    if (maxDeviation > 0.005) {
      return {
        consistent: false,
        reason: 'PRICE_DEVIATION',
        severity: 'HIGH',
        message: `多数据源价格偏差${deviationPercent}%，超过0.5%阈值`,
        deviationPercent: parseFloat(deviationPercent),
        avgPrice,
        prices
      };
    }
    
    return {
      consistent: true,
      deviationPercent: parseFloat(deviationPercent),
      message: `多数据源价格一致（偏差${deviationPercent}%）`,
      avgPrice
    };
  }
  
  /**
   * 计算动态缓存TTL（根据市场波动）
   */
  getDynamicCacheTTL(marketData, indicators) {
    // 默认60秒
    let ttl = 60000;
    
    try {
      const atr = indicators?.volatility?.atr;
      const price = marketData?.ticker?.last;
      
      if (!atr || !price) {
        console.log('📊 无法计算ATR百分比，使用默认缓存时间60秒');
        return ttl;
      }
      
      const atrPercent = (atr / price) * 100;
      
    // 极高波动（ATR>8%）：极短缓存（5秒）
      if (atrPercent > 8) {
      console.log(`🔥 极高波动（ATR ${atrPercent.toFixed(2)}%），使用极短缓存5秒`);
      return 5000; // 改为5秒而不是0，避免完全禁用缓存导致API限流
      }
      
      // 高波动（ATR 5-8%）：10秒缓存
      if (atrPercent > 5) {
        console.log(`⚡ 高波动（ATR ${atrPercent.toFixed(2)}%），缓存10秒`);
        return 10000;
      }
      
      // 中等波动（ATR 2-5%）：30秒缓存
      if (atrPercent > 2) {
        console.log(`📈 中等波动（ATR ${atrPercent.toFixed(2)}%），缓存30秒`);
        return 30000;
      }
      
      // 低波动（ATR<2%）：60秒缓存
      console.log(`📉 低波动（ATR ${atrPercent.toFixed(2)}%），缓存60秒`);
      return 60000;
      
    } catch (error) {
      console.error('❌ 计算动态缓存TTL失败:', error.message);
      return ttl;
    }
  }
  
  /**
   * 检查是否应该使缓存失效
   */
  shouldInvalidateCache(cachedAnalysis, currentMarketData) {
    if (!cachedAnalysis || !currentMarketData) {
      return { shouldInvalidate: true, reason: 'MISSING_DATA' };
    }
    
    // 1. 检查缓存时间
    const cacheAge = Date.now() - (cachedAnalysis.timestamp || 0);
    const cacheAgeSeconds = (cacheAge / 1000).toFixed(1);
    
    // 2. 检查价格变化
    const cachedPrice = cachedAnalysis.marketData?.ticker?.last;
    const currentPrice = currentMarketData.ticker?.last;
    
    if (cachedPrice && currentPrice) {
      const priceChangeResult = this.checkPriceChange(cachedPrice, currentPrice);
      
      if (priceChangeResult.changed) {
        return {
          shouldInvalidate: true,
          reason: 'PRICE_CHANGE',
          details: priceChangeResult,
          message: `价格变化${priceChangeResult.changePercent}%，缓存失效`
        };
      }
    }
    
    // 3. 检查数据新鲜度
    const freshnessResult = this.validateTickerFreshness(currentMarketData.ticker);
    if (!freshnessResult.fresh) {
      return {
        shouldInvalidate: true,
        reason: 'STALE_DATA',
        details: freshnessResult,
        message: '当前数据过期，需要刷新'
      };
    }
    
    return {
      shouldInvalidate: false,
      cacheAgeSeconds: parseFloat(cacheAgeSeconds),
      message: `缓存有效（${cacheAgeSeconds}秒前，价格变化<1%）`
    };
  }
  
  /**
   * 生成数据新鲜度报告
   */
  generateFreshnessReport(marketData) {
    const report = {
      timestamp: Date.now(),
      overall: 'FRESH',
      details: {}
    };
    
    // 检查Ticker
    if (marketData.ticker) {
      report.details.ticker = this.validateTickerFreshness(marketData.ticker);
      if (!report.details.ticker.fresh) {
        report.overall = 'STALE';
      }
    }
    
    // 检查OHLCV
    if (marketData.ohlcv) {
      report.details.ohlcv = this.validateOHLCVFreshness(marketData.ohlcv);
      if (!report.details.ohlcv.fresh && report.overall === 'FRESH') {
        report.overall = 'PARTIAL';
      }
    }
    
    return report;
  }
}

module.exports = new DataFreshnessValidator();

