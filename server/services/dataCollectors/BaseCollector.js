/**
 * 基础数据收集器
 * 提供通用的缓存、重试、超时控制功能
 */

const { AI_ANALYSIS } = require('../../config/constants');

class BaseCollector {
  constructor(name) {
    this.name = name;
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1分钟缓存
  }

  /**
   * 延迟函数
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 智能重试函数（带指数退避）
   */
  async retryWithBackoff(fn, options = {}) {
    const {
      maxAttempts = AI_ANALYSIS.OKX_RATE_LIMIT.RETRY_MAX_ATTEMPTS,
      initialDelay = AI_ANALYSIS.OKX_RATE_LIMIT.RETRY_INITIAL_DELAY,
      multiplier = AI_ANALYSIS.OKX_RATE_LIMIT.RETRY_MULTIPLIER,
      errorHandler = (error) => console.error(`[${this.name}] Retry error:`, error.message)
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        const status = error?.response?.status;
        const transient = status === 429 || status === 503 || status === 502 || status === 504 ||
                          error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' ||
                          (error.message && /Too Many Requests/i.test(error.message));

        if (transient && attempt < maxAttempts) {
          const delay = initialDelay * Math.pow(multiplier, attempt - 1);
          console.log(`   [${this.name}] 临时错误(${status || error.code || 'unknown'})，第${attempt}/${maxAttempts}次重试，等待${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        // 非临时错误或已达最大次数
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * 缓存管理
   */
  getCacheKey(...args) {
    return `${this.name}_${args.join('_')}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
      console.log(`   [${this.name}] 使用缓存数据: ${key}`);
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * 带超时控制的执行
   */
  async withTimeout(promise, timeoutMs, errorMessage) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage || `${this.name} 操作超时`)), timeoutMs)
      )
    ]);
  }

  /**
   * 安全执行（捕获错误并返回null）
   */
  async safeExecute(fn, defaultValue = null) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`   [${this.name}] 执行失败:`, error.message);
      return defaultValue;
    }
  }

  /**
   * 批量并行执行（带错误处理）
   */
  async batchExecute(tasks, batchSize = 3) {
    const results = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch);
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * 子类必须实现的收集方法
   */
  async collect(exchange, symbol, options = {}) {
    throw new Error(`${this.name}.collect() must be implemented by subclass`);
  }
}

module.exports = BaseCollector;

