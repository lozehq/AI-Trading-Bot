/**
 * 统一缓存管理器
 * 提供多层缓存策略、自动过期、LRU淘汰等功能
 */

class CacheManager {
  constructor(options = {}) {
    this.caches = new Map(); // 多个命名缓存空间
    this.defaultTTL = options.defaultTTL || 60000; // 默认1分钟
    this.maxSize = options.maxSize || 1000; // 最大缓存条目数
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
  }

  /**
   * 获取或创建缓存空间
   */
  getCache(namespace = 'default') {
    if (!this.caches.has(namespace)) {
      this.caches.set(namespace, new Map());
    }
    return this.caches.get(namespace);
  }

  /**
   * 生成缓存键
   */
  generateKey(...parts) {
    return parts.filter(p => p !== null && p !== undefined).join(':');
  }

  /**
   * 设置缓存
   */
  set(namespace, key, value, ttl = this.defaultTTL) {
    const cache = this.getCache(namespace);
    
    // LRU 淘汰策略
    if (cache.size >= this.maxSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
      this.stats.evictions++;
    }

    cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
      hits: 0
    });

    this.stats.sets++;
    return true;
  }

  /**
   * 获取缓存
   */
  get(namespace, key) {
    const cache = this.getCache(namespace);
    const entry = cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // 更新访问统计
    entry.hits++;
    this.stats.hits++;

    // LRU: 将访问的项移到最后
    cache.delete(key);
    cache.set(key, entry);

    return entry.value;
  }

  /**
   * 获取或设置（缓存穿透保护）
   */
  async getOrSet(namespace, key, fetchFn, ttl = this.defaultTTL) {
    // 先尝试从缓存获取
    const cached = this.get(namespace, key);
    if (cached !== null) {
      return cached;
    }

    // 缓存未命中，执行获取函数
    try {
      const value = await fetchFn();
      this.set(namespace, key, value, ttl);
      return value;
    } catch (error) {
      console.error(`[CacheManager] 获取数据失败 (${namespace}:${key}):`, error.message);
      throw error;
    }
  }

  /**
   * 删除缓存
   */
  delete(namespace, key) {
    const cache = this.getCache(namespace);
    const deleted = cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * 清空命名空间
   */
  clear(namespace) {
    if (namespace) {
      const cache = this.getCache(namespace);
      const size = cache.size;
      cache.clear();
      this.stats.deletes += size;
    } else {
      // 清空所有缓存
      this.caches.forEach(cache => {
        this.stats.deletes += cache.size;
        cache.clear();
      });
    }
  }

  /**
   * 批量删除（支持模式匹配）
   */
  deletePattern(namespace, pattern) {
    const cache = this.getCache(namespace);
    const regex = new RegExp(pattern);
    let count = 0;

    for (const key of cache.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
        count++;
      }
    }

    this.stats.deletes += count;
    return count;
  }

  /**
   * 获取缓存统计
   */
  getStats(namespace) {
    const stats = { ...this.stats };

    if (namespace) {
      const cache = this.getCache(namespace);
      stats.size = cache.size;
      stats.namespace = namespace;
    } else {
      stats.totalSize = Array.from(this.caches.values()).reduce((sum, cache) => sum + cache.size, 0);
      stats.namespaces = Array.from(this.caches.keys());
    }

    stats.hitRate = stats.hits + stats.misses > 0 
      ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) + '%'
      : '0%';

    return stats;
  }
}

module.exports = new CacheManager({
  defaultTTL: 60000,
  maxSize: 1000
});

