/**
 * 简单内存缓存系统
 *
 * 功能:
 * - TTL（生存时间）支持
 * - 自动过期清理
 * - 最大容量限制
 * - LRU（最近最少使用）淘汰策略
 */

const { CACHE } = require('../config/constants'); // ✅ 使用配置常量

class SimpleCache {
  /**
   * 创建缓存实例
   * 
   * @param {number} ttl - 缓存生存时间（毫秒），默认60秒
   * @param {number} maxSize - 最大缓存条目数，默认100
   */
  constructor(ttl = 60000, maxSize = 100) {
    this.cache = new Map();
    this.ttl = ttl;
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;

    // ✅ 修复：使用固定的清理间隔而不是ttl
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CACHE.CLEANUP_INTERVAL || 30000);
  }

  /**
   * 生成缓存键
   * 
   * @param {string} prefix - 键前缀
   * @param {object} params - 参数对象
   * @returns {string} 缓存键
   */
  static generateKey(prefix, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    return sortedParams ? `${prefix}:${sortedParams}` : prefix;
  }

  /**
   * 设置缓存
   * 
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} customTtl - 自定义TTL（可选）
   */
  set(key, value, customTtl = null) {
    // 检查容量限制
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // LRU淘汰：删除最早的条目
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const ttl = customTtl || this.ttl;
    const expiry = Date.now() + ttl;

    this.cache.set(key, {
      value,
      expiry,
      createdAt: Date.now()
    });
  }

  /**
   * 获取缓存
   * 
   * @param {string} key - 缓存键
   * @returns {*} 缓存值，如果不存在或已过期返回null
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    
    // 更新访问时间（LRU）
    this.cache.delete(key);
    this.cache.set(key, item);
    
    return item.value;
  }

  /**
   * 检查缓存是否存在
   * 
   * @param {string} key - 缓存键
   * @returns {boolean} 是否存在且未过期
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * 删除缓存
   * 
   * @param {string} key - 缓存键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个过期缓存`);
    }
  }

  /**
   * 获取缓存统计信息
   * 
   * @returns {object} 统计信息
   */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total * 100).toFixed(2) : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`,
      ttl: this.ttl
    };
  }

  /**
   * 销毁缓存实例
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

/**
 * 缓存装饰器
 * 
 * 使用方法:
 * const cachedFunction = cacheDecorator(
 *   originalFunction,
 *   cache,
 *   (args) => `key:${args[0]}`
 * );
 */
function cacheDecorator(fn, cache, keyGenerator) {
  return async function(...args) {
    const key = keyGenerator(args);
    
    // 尝试从缓存获取
    const cached = cache.get(key);
    if (cached !== null) {
      console.log(`📦 使用缓存: ${key}`);
      return cached;
    }

    // 执行原函数
    const result = await fn(...args);
    
    // 存入缓存
    cache.set(key, result);
    
    return result;
  };
}

/**
 * 创建预配置的缓存实例
 * ✅ 使用配置常量
 */
const caches = {
  // 市场价格缓存（30秒）
  price: new SimpleCache(CACHE.PRICE_TTL, 50),

  // 技术指标缓存（60秒）
  indicators: new SimpleCache(CACHE.INDICATORS_TTL, 100),

  // MCP工具结果缓存（120秒）
  mcp: new SimpleCache(CACHE.MCP_DATA_TTL, 100),

  // AI分析缓存（5分钟）
  ai: new SimpleCache(CACHE.AI_ANALYSIS_TTL, 20),

  // 市场数据缓存（120秒）
  market: new SimpleCache(CACHE.MCP_DATA_TTL, 50),

  // 静态数据缓存（1小时）- 用于不常变化的数据
  static: new SimpleCache(CACHE.STATIC_DATA_TTL, 30)
};

/**
 * 获取所有缓存的统计信息
 */
function getAllCacheStats() {
  const stats = {};
  
  for (const [name, cache] of Object.entries(caches)) {
    stats[name] = cache.getStats();
  }
  
  return stats;
}

/**
 * 清空所有缓存
 */
function clearAllCaches() {
  for (const cache of Object.values(caches)) {
    cache.clear();
  }
  console.log('🧹 所有缓存已清空');
}

module.exports = {
  SimpleCache,
  cacheDecorator,
  caches,
  getAllCacheStats,
  clearAllCaches
};

