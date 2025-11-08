/**
 * Performance Monitor Service
 * Tracks API performance, cache hit rates, and system metrics
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      apiCalls: {
        total: 0,
        success: 0,
        failed: 0,
        totalDuration: 0
      },
      cache: {
        hits: 0,
        misses: 0
      },
      concurrency: {
        maxActive: 0,
        maxPending: 0,
        currentActive: 0,
        currentPending: 0
      },
      dataSources: {},
      errors: []
    };

    this.startTime = Date.now();
  }

  /**
   * Record API call metrics
   */
  recordAPICall(dataSource, duration, success = true) {
    this.metrics.apiCalls.total++;
    this.metrics.apiCalls.totalDuration += duration;

    if (success) {
      this.metrics.apiCalls.success++;
    } else {
      this.metrics.apiCalls.failed++;
    }

    // Track per-source metrics
    if (!this.metrics.dataSources[dataSource]) {
      this.metrics.dataSources[dataSource] = {
        calls: 0,
        success: 0,
        failed: 0,
        totalDuration: 0,
        avgDuration: 0
      };
    }

    const sourceMetrics = this.metrics.dataSources[dataSource];
    sourceMetrics.calls++;
    sourceMetrics.totalDuration += duration;
    sourceMetrics.avgDuration = sourceMetrics.totalDuration / sourceMetrics.calls;

    if (success) {
      sourceMetrics.success++;
    } else {
      sourceMetrics.failed++;
    }
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(hit = true) {
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }
  }

  /**
   * Update concurrency metrics
   */
  updateConcurrency(active, pending) {
    this.metrics.concurrency.currentActive = active;
    this.metrics.concurrency.currentPending = pending;

    if (active > this.metrics.concurrency.maxActive) {
      this.metrics.concurrency.maxActive = active;
    }

    if (pending > this.metrics.concurrency.maxPending) {
      this.metrics.concurrency.maxPending = pending;
    }
  }

  /**
   * Record error
   */
  recordError(dataSource, error, context = {}) {
    const errorRecord = {
      dataSource,
      message: error.message,
      timestamp: Date.now(),
      context
    };

    this.metrics.errors.push(errorRecord);

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift();
    }
  }

  /**
   * Get performance summary
   */
  getSummary() {
    const uptime = Date.now() - this.startTime;
    const avgResponseTime = this.metrics.apiCalls.total > 0
      ? Math.round(this.metrics.apiCalls.totalDuration / this.metrics.apiCalls.total)
      : 0;

    const cacheHitRate = (this.metrics.cache.hits + this.metrics.cache.misses) > 0
      ? ((this.metrics.cache.hits / (this.metrics.cache.hits + this.metrics.cache.misses)) * 100).toFixed(2)
      : 0;

    const successRate = this.metrics.apiCalls.total > 0
      ? ((this.metrics.apiCalls.success / this.metrics.apiCalls.total) * 100).toFixed(2)
      : 0;

    return {
      uptime: {
        milliseconds: uptime,
        seconds: Math.round(uptime / 1000),
        minutes: Math.round(uptime / 60000),
        hours: Math.round(uptime / 3600000)
      },
      apiCalls: {
        ...this.metrics.apiCalls,
        avgResponseTime,
        successRate: `${successRate}%`,
        failureRate: `${(100 - parseFloat(successRate)).toFixed(2)}%`
      },
      cache: {
        ...this.metrics.cache,
        hitRate: `${cacheHitRate}%`,
        total: this.metrics.cache.hits + this.metrics.cache.misses
      },
      concurrency: this.metrics.concurrency,
      dataSources: this.metrics.dataSources,
      recentErrors: this.metrics.errors.slice(-10),
      timestamp: Date.now()
    };
  }

  /**
   * Get detailed report
   */
  getDetailedReport() {
    const summary = this.getSummary();

    // Sort data sources by call count
    const sortedSources = Object.entries(this.metrics.dataSources)
      .sort((a, b) => b[1].calls - a[1].calls)
      .map(([name, metrics]) => ({
        name,
        calls: metrics.calls,
        success: metrics.success,
        failed: metrics.failed,
        successRate: `${((metrics.success / metrics.calls) * 100).toFixed(2)}%`,
        avgDuration: `${Math.round(metrics.avgDuration)}ms`
      }));

    return {
      ...summary,
      topDataSources: sortedSources.slice(0, 10),
      slowestDataSources: sortedSources
        .sort((a, b) => parseFloat(b.avgDuration) - parseFloat(a.avgDuration))
        .slice(0, 10)
    };
  }

  /**
   * Print summary to console
   */
  printSummary() {
    const summary = this.getSummary();

    console.log('\n' + '='.repeat(60));
    console.log('Performance Monitor Summary');
    console.log('='.repeat(60));
    console.log(`Uptime: ${summary.uptime.minutes} minutes`);
    console.log(`API Calls: ${summary.apiCalls.total} (${summary.apiCalls.successRate} success)`);
    console.log(`Avg Response Time: ${summary.apiCalls.avgResponseTime}ms`);
    console.log(`Cache Hit Rate: ${summary.cache.hitRate}`);
    console.log(`Max Concurrency: ${summary.concurrency.maxActive} active, ${summary.concurrency.maxPending} pending`);
    console.log(`Recent Errors: ${summary.recentErrors.length}`);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      apiCalls: {
        total: 0,
        success: 0,
        failed: 0,
        totalDuration: 0
      },
      cache: {
        hits: 0,
        misses: 0
      },
      concurrency: {
        maxActive: 0,
        maxPending: 0,
        currentActive: 0,
        currentPending: 0
      },
      dataSources: {},
      errors: []
    };

    this.startTime = Date.now();
    console.log('Performance metrics reset');
  }
}

// Global performance monitor instance
const performanceMonitor = new PerformanceMonitor();

// Print summary every 5 minutes
setInterval(() => {
  performanceMonitor.printSummary();
}, 300000);

module.exports = performanceMonitor;
