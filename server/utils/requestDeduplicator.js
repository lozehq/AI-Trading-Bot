/**
 * 请求去重合并器
 * 防止同一时刻对相同资源的重复请求
 * 
 * 工作原理:
 * 1. 当多个请求同时发起时，只执行第一个
 * 2. 其他请求等待第一个请求完成，复用结果
 * 3. 请求完成后立即清理，不影响下次请求
 * 
 * 适用场景:
 * - 高频API调用（如实时价格）
 * - 多组件同时请求同一数据
 * - 防止瞬时流量峰值
 */

class RequestDeduplicator {
  constructor() {
    // 存储进行中的请求: { key: Promise }
    this.pendingRequests = new Map();
    
    // 统计信息
    this.stats = {
      totalRequests: 0,      // 总请求数
      mergedRequests: 0,     // 被合并的请求数
      activeRequests: 0      // 当前活跃请求数
    };
  }

  /**
   * 生成请求键
   * @param {string} namespace - 命名空间（如 'ticker', 'ohlcv'）
   * @param {object} params - 请求参数
   * @returns {string} 请求键
   */
  generateKey(namespace, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return sortedParams ? `${namespace}:${sortedParams}` : namespace;
  }

  /**
   * 执行去重请求
   * @param {string} key - 请求键
   * @param {Function} requestFn - 实际执行请求的函数
   * @returns {Promise<any>} 请求结果
   */
  async deduplicate(key, requestFn) {
    this.stats.totalRequests++;

    // 检查是否有进行中的相同请求
    if (this.pendingRequests.has(key)) {
      this.stats.mergedRequests++;
      console.log(`🔄 [去重] 合并请求: ${key} (节省 ${this.stats.mergedRequests}/${this.stats.totalRequests})`);
      
      // 复用进行中的请求
      return await this.pendingRequests.get(key);
    }

    // 创建新请求
    this.stats.activeRequests++;
    const requestPromise = this._executeRequest(key, requestFn);
    
    // 存储请求Promise
    this.pendingRequests.set(key, requestPromise);

    return await requestPromise;
  }

  /**
   * 执行请求（内部方法）
   * @private
   */
  async _executeRequest(key, requestFn) {
    try {
      const result = await requestFn();
      return result;
    } finally {
      // 请求完成后立即清理，允许下次新请求
      this.pendingRequests.delete(key);
      this.stats.activeRequests--;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const total = this.stats.totalRequests;
    const merged = this.stats.mergedRequests;
    const mergeRate = total > 0 ? ((merged / total) * 100).toFixed(2) : 0;

    return {
      totalRequests: total,
      mergedRequests: merged,
      actualRequests: total - merged,
      activeRequests: this.stats.activeRequests,
      mergeRate: `${mergeRate}%`,
      savingsRate: mergeRate
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      mergedRequests: 0,
      activeRequests: 0
    };
  }

  /**
   * 清空所有进行中的请求（慎用）
   */
  clear() {
    this.pendingRequests.clear();
    this.stats.activeRequests = 0;
  }

  /**
   * 获取当前活跃请求数
   */
  getActiveCount() {
    return this.pendingRequests.size;
  }
}

// 创建全局单例
const globalDeduplicator = new RequestDeduplicator();

/**
 * 快捷方法：为特定类型的请求去重
 */
const deduplicators = {
  // 价格数据去重
  ticker: async (symbol, exchange, requestFn) => {
    const key = globalDeduplicator.generateKey('ticker', { symbol, exchange });
    return await globalDeduplicator.deduplicate(key, requestFn);
  },

  // K线数据去重
  ohlcv: async (symbol, exchange, timeframe, limit, requestFn) => {
    const key = globalDeduplicator.generateKey('ohlcv', { symbol, exchange, timeframe, limit });
    return await globalDeduplicator.deduplicate(key, requestFn);
  },

  // 技术指标去重
  indicators: async (symbol, exchange, timeframe, requestFn) => {
    const key = globalDeduplicator.generateKey('indicators', { symbol, exchange, timeframe });
    return await globalDeduplicator.deduplicate(key, requestFn);
  },

  // 订单簿去重
  orderBook: async (symbol, exchange, limit, requestFn) => {
    const key = globalDeduplicator.generateKey('orderBook', { symbol, exchange, limit });
    return await globalDeduplicator.deduplicate(key, requestFn);
  },

  // 通用去重
  generic: async (namespace, params, requestFn) => {
    const key = globalDeduplicator.generateKey(namespace, params);
    return await globalDeduplicator.deduplicate(key, requestFn);
  }
};

module.exports = {
  RequestDeduplicator,
  globalDeduplicator,
  deduplicators
};
