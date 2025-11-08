/**
 * 交易所管理器
 * 负责管理交易所实例和失败重试逻辑
 */

const ExchangePoolManager = require('./ExchangePoolManager');

class ExchangeManager {
  constructor() {
    // 支持多个交易所，按优先级排序（优先选择较稳定、可访问性更高的OKX）
    const orderFromEnv = process.env.EXCHANGES && process.env.EXCHANGES.split(',').map(x => x.trim()).filter(Boolean);
    this.exchanges = orderFromEnv && orderFromEnv.length > 0
      ? orderFromEnv
      : ['okx', 'bybit', 'binance', 'huobi'];
    this.currentExchangeIndex = 0;
    this.poolManager = new ExchangePoolManager();
    this.currentExchange = null;
    this.currentExchangeName = null;

    // 断路器与日志节流
    this.unhealthy = new Map(); // exchangeName -> untilTs
    this.cooloffMs = 5 * 60 * 1000;
    this.warnDebounce = new Map(); // key -> ts
    this.warnWindowMs = 5 * 60 * 1000;

    this._initExchange();
  }

  /**
   * 初始化交易所
   */
  _initExchange() {
    const exchangeName = this.exchanges[this.currentExchangeIndex];
    this.currentExchange = this.poolManager.getExchange(exchangeName);
    this.currentExchangeName = exchangeName;
  }

  /**
   * 执行操作，如果失败则切换交易所重试
   */
  async executeWithFallback(operation, operationName) {
    // 限制最多只尝试当前 + 1 个备用，避免失败风暴
    const maxRetries = Math.min(2, this.exchanges.length);
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const msg = String(error.message || '');

        // 日志节流（同一操作/交易所/原因5分钟内只记一次）
        const wKey = `${this.currentExchangeName}:${operationName}:${(msg || '').slice(0,120)}`;
        const lastTs = this.warnDebounce.get(wKey) || 0;
        if (Date.now() - lastTs > this.warnWindowMs) {
          console.warn(`⚠️ [${this.currentExchangeName.toUpperCase()}] ${operationName}失败: ${msg}`);
          this.warnDebounce.set(wKey, Date.now());
        }

        const isHardBan = /418|IP banned|Way too much request weight/i.test(msg);
        const isThrottle = /throttle queue is over maxCapacity|429/i.test(msg);
        const isNetErr = /fetch failed|ENOTFOUND|ECONNRESET|EAI_AGAIN|getaddrinfo|network|timeout/i.test(msg);

        // 将当前交易所标记为冷却，避免短时间内重复尝试
        if (isHardBan || isThrottle || isNetErr) {
          this._markUnhealthy(this.currentExchangeName);
        }

        if (attempt < maxRetries - 1) {
          // 切到下一个健康的交易所；如果都不健康，提前中止
          const switched = this._switchToNextHealthyExchange();
          if (!switched) {
            throw new Error(`所有交易所都处于冷却或不可用: ${msg}`);
          }
          console.log(`🔄 切换到备用交易所: ${this.currentExchangeName.toUpperCase()}`);
        } else {
          throw new Error(`所有交易所都失败: ${msg}`);
        }
      }
    }
    throw lastError || new Error('未知错误');
  }

  _markUnhealthy(name) {
    this.unhealthy.set(name, Date.now() + this.cooloffMs);
  }

  _isHealthy(name) {
    const until = this.unhealthy.get(name) || 0;
    return !until || Date.now() > until;
  }

  _switchToNextHealthyExchange() {
    const total = this.exchanges.length;
    for (let i = 0; i < total; i++) {
      this._switchToNextExchange();
      if (this._isHealthy(this.currentExchangeName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 切换到下一个交易所
   */
  _switchToNextExchange() {
    this.currentExchangeIndex = (this.currentExchangeIndex + 1) % this.exchanges.length;
    this._initExchange();
  }

  /**
   * 获取当前交易所实例
   */
  getExchange() {
    return this.currentExchange;
  }

  /**
   * 获取当前交易所名称
   */
  getExchangeName() {
    return this.currentExchangeName;
  }

  /**
   * 获取所有支持的交易所列表
   */
  getSupportedExchanges() {
    return [...this.exchanges];
  }

  /**
   * 设置当前交易所
   */
  setExchange(exchangeName) {
    if (!this.exchanges.includes(exchangeName)) {
      throw new Error(`不支持的交易所: ${exchangeName}`);
    }

    const index = this.exchanges.indexOf(exchangeName);
    this.currentExchangeIndex = index;
    this._initExchange();

    console.log(`✅ 已切换到交易所: ${exchangeName}`);
  }

  /**
   * 获取连接池统计信息
   */
  getPoolStats() {
    return this.poolManager.getStats();
  }

  /**
   * 清空连接池
   */
  clearPool() {
    this.poolManager.clear();
    this._initExchange();
  }
}

module.exports = ExchangeManager;
