/**
 * 交易所配置
 * 解决地理限制问题：某些交易所（如Binance）在部分地区不可用
 */

module.exports = {
  // 默认交易所：OKX（在大多数地区可用）
  DEFAULT_EXCHANGE: process.env.DEFAULT_EXCHANGE || 'okx',
  
  // 备用交易所列表（按优先级排序）
  FALLBACK_EXCHANGES: ['okx', 'bybit', 'binance', 'huobi', 'gate'],
  
  // 推荐交易所（无地区限制）
  RECOMMENDED_EXCHANGES: ['okx', 'bybit'],
  
  // 可能受限的交易所
  RESTRICTED_EXCHANGES: ['binance', 'coinbase'],
  
  // 交易所优先级（用于自动选择）
  EXCHANGE_PRIORITY: {
    okx: 100,      // 最高优先级
    bybit: 90,
    huobi: 80,
    gate: 70,
    binance: 50,   // 降低优先级（可能受限）
    coinbase: 40
  },
  
  // 代理配置（如需使用Binance等受限交易所）
  PROXY_CONFIG: {
    enabled: process.env.PROXY_ENABLED === 'true',
    host: process.env.PROXY_HOST || '',
    port: process.env.PROXY_PORT || '',
    protocol: process.env.PROXY_PROTOCOL || 'http'
  },
  
  // 获取最佳交易所
  getBestExchange() {
    // 优先使用环境变量配置
    if (process.env.DEFAULT_EXCHANGE) {
      return process.env.DEFAULT_EXCHANGE;
    }
    
    // 如果配置了代理，可以使用任何交易所
    if (this.PROXY_CONFIG.enabled) {
      return 'binance';
    }
    
    // 否则使用推荐的无限制交易所
    return this.RECOMMENDED_EXCHANGES[0];
  },
  
  // 获取备用交易所（排除受限的）
  getFallbackExchanges() {
    if (this.PROXY_CONFIG.enabled) {
      return this.FALLBACK_EXCHANGES;
    }
    
    // 如果没有代理，排除可能受限的交易所
    return this.FALLBACK_EXCHANGES.filter(
      ex => !this.RESTRICTED_EXCHANGES.includes(ex)
    );
  }
};

