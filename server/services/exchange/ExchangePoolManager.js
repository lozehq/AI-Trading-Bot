/**
 * 交易所连接池管理器
 * 负责管理CCXT交易所实例的连接池，实现实例复用和LRU淘汰
 */

const ccxt = require('ccxt');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

class ExchangePoolManager {
  constructor() {
    this.pool = new Map();
    this.maxPoolSize = 5;
    this.stats = {
      hits: 0,
      misses: 0,
      created: 0
    };
  }

  /**
   * 从连接池获取或创建交易所实例
   */
  getExchange(exchangeName) {
    if (this.pool.has(exchangeName)) {
      this.stats.hits++;
      console.log(`📦 [连接池] 复用 ${exchangeName} 实例 (命中率: ${this._getHitRate().toFixed(1)}%)`);
      return this.pool.get(exchangeName);
    }

    this.stats.misses++;
    this._evictIfNeeded();

    const instance = this._createExchange(exchangeName);
    this.pool.set(exchangeName, instance);
    this.stats.created++;

    console.log(`✨ [连接池] 创建 ${exchangeName} 实例 (池大小: ${this.pool.size}/${this.maxPoolSize})`);

    return instance;
  }

  /**
   * 创建交易所实例
   */
  _createExchange(exchangeName) {
    // 检测代理设置
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
    const socksProxyUrl = process.env.SOCKS_PROXY || process.env.SOCKS5_PROXY;

    const config = {
      // Lower timeout to avoid long stalls and memory pressure during network issues
      timeout: 8000,
      enableRateLimit: true,
      options: {
        defaultType: 'spot'
      }
    };

    // 配置API密钥(如果存在)
    if (exchangeName === 'okx') {
      const apiKey = process.env.OKX_API_KEY;
      const secret = process.env.OKX_API_SECRET;
      const password = process.env.OKX_API_PASSPHRASE;

      if (apiKey && secret && password) {
        config.apiKey = apiKey;
        config.secret = secret;
        config.password = password;
        console.log(`🔑 [认证] OKX API密钥已配置`);
      }
    } else if (exchangeName === 'binance') {
      const apiKey = process.env.BINANCE_API_KEY;
      const secret = process.env.BINANCE_API_SECRET;

      if (apiKey && secret) {
        config.apiKey = apiKey;
        config.secret = secret;
        console.log(`🔑 [认证] Binance API密钥已配置`);
      }
    }
    // 可以为其他交易所添加类似配置

    // 配置代理
    if (socksProxyUrl) {
      console.log(`🔗 [代理] 使用SOCKS5代理: ${socksProxyUrl}`);
      config.agent = new SocksProxyAgent(socksProxyUrl);
    } else if (proxyUrl) {
      console.log(`🔗 [代理] 使用HTTPS代理: ${proxyUrl}`);
      config.agent = new HttpsProxyAgent(proxyUrl);
    } else {
      console.log(`🔗 [代理] 使用系统默认代理设置`);
      // 不设置agent，让CCXT使用系统默认设置
    }

    return new ccxt[exchangeName](config);
  }

  /**
   * LRU淘汰策略
   */
  _evictIfNeeded() {
    if (this.pool.size >= this.maxPoolSize) {
      const firstKey = this.pool.keys().next().value;
      this.pool.delete(firstKey);
      console.log(`🗑️  [连接池] 淘汰 ${firstKey} 实例 (达到最大连接数)`);
    }
  }

  /**
   * 获取连接池命中率
   */
  _getHitRate() {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * 获取连接池统计信息
   */
  getStats() {
    return {
      poolSize: this.pool.size,
      maxPoolSize: this.maxPoolSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      created: this.stats.created,
      hitRate: this._getHitRate()
    };
  }

  /**
   * 清空连接池
   */
  clear() {
    this.pool.clear();
    console.log('🧹 [连接池] 已清空所有连接');
  }
}

module.exports = ExchangePoolManager;
