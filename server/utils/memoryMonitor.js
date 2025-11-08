/**
 * 内存监控和垃圾回收优化
 */

const cacheModule = require('./cache');
let networkOptimizer = null;

class MemoryMonitor {
  constructor() {
    this.isMonitoring = false;
    this.interval = null;
    this.lastGC = Date.now();
    this.MEMORY_THRESHOLD = 85; // 85%内存使用率阈值
    this.GC_COOLDOWN = 10000; // 10秒冷却时间
    this.gcWarned = false; // 避免重复提示
    this.highUsageCount = 0;
    this.recoveryCount = 0;
    this.underPressure = false;
    this.originalConcurrency = null;
    this.lastDiagnosticLog = 0;
    this.pressureStartedAt = 0;
    this.PRESSURE_SAMPLE_THRESHOLD = 3; // 连续3次超阈值触发限流
    this.RECOVERY_SAMPLE_THRESHOLD = 6; // 连续6次恢复低于安全线恢复
    this.RECOVERY_THRESHOLD = 70; // 低于70%认为恢复
    this.DIAGNOSTIC_INTERVAL = 20000; // 诊断日志间隔
  }

  /**
   * 启动内存监控
   */
  start() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log('📊 启动内存监控...');

    this.interval = setInterval(() => {
      this.checkMemory();
    }, 5000); // 每5秒检查一次
  }

  /**
   * 停止内存监控
   */
  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('📊 停止内存监控');
  }

  /**
   * 检查内存使用情况
   */
  checkMemory() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // 只在开发模式或高内存使用时打印
    if (heapPercent > this.MEMORY_THRESHOLD) {
      console.log(`⚠️ [内存监控] 堆内存使用: ${heapUsedMB.toFixed(2)}MB/${heapTotalMB.toFixed(2)}MB (${heapPercent.toFixed(2)}%)`);

      // 如果超过阈值且距离上次GC足够时间，触发垃圾回收
      if (Date.now() - this.lastGC > this.GC_COOLDOWN) {
        this.forceGC();
      }

      this.highUsageCount++;
      this.recoveryCount = 0;
      if (this.highUsageCount >= this.PRESSURE_SAMPLE_THRESHOLD) {
        this.activatePressureMode(heapPercent);
      } else if (this.underPressure) {
        this.logRuntimeDiagnostics('pressure-ongoing', heapPercent);
      }
    }
    else {
      this.highUsageCount = 0;
      if (heapPercent < this.RECOVERY_THRESHOLD) {
        this.recoveryCount++;
      } else {
        this.recoveryCount = 0;
      }

      if (this.underPressure && this.recoveryCount >= this.RECOVERY_SAMPLE_THRESHOLD) {
        this.deactivatePressureMode(heapPercent);
      }
    }

    // 保留详细的内存统计，但减少日志频率
    if (heapPercent > 95) {
      console.warn(`❌ [内存警告] 内存使用率过高: ${heapPercent.toFixed(2)}%`);

      // 记录详细内存信息用于调试
      const rssMB = memUsage.rss / 1024 / 1024;
      const externalMB = memUsage.external / 1024 / 1024;

      console.error(`内存详情: RSS=${rssMB.toFixed(2)}MB, Heap=${heapUsedMB.toFixed(2)}MB, External=${externalMB.toFixed(2)}MB`);

      // 如果内存使用超过98%，触发紧急清理
      if (heapPercent > 98) {
        this.emergencyCleanup();
      }
    } else if (this.underPressure && heapPercent <= this.MEMORY_THRESHOLD && Date.now() - this.lastDiagnosticLog > this.DIAGNOSTIC_INTERVAL) {
      this.logRuntimeDiagnostics('pressure-monitor', heapPercent);
    }
  }

  /**
   * 强制垃圾回收
   */
  forceGC() {
    if (global.gc) {
      console.log('🗑️ [内存监控] 触发垃圾回收...');
      global.gc();
      this.lastGC = Date.now();

      // 记录GC后的内存情况
      setTimeout(() => {
        const memUsage = process.memoryUsage();
        const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        console.log(`✅ [内存监控] GC后内存使用: ${heapPercent.toFixed(2)}%`);
        this.logRuntimeDiagnostics('post-gc', heapPercent);
      }, 1000);
    } else if (!this.gcWarned) {
      console.log('⚠️ [内存监控] GC不可用，使用 --expose-gc 标志启动Node.js');
      this.gcWarned = true;
    }
  }

  /**
   * 紧急内存清理
   */
  emergencyCleanup() {
    console.error('🚨 [内存监控] 触发紧急内存清理...');

    // 1. 强制垃圾回收
    this.forceGC();

    // 2. 清理缓存
    try {
      cacheModule.clearAllCaches();
      console.log('✅ [内存监控] 已清理所有缓存');
    } catch (e) {
      console.warn('⚠️ [内存监控] 清理缓存失败:', e.message);
    }

    // 3. 清理可能的内存泄漏
    try {
      // 清理全局变量中的大对象
      if (global.tempData) {
        global.tempData = null;
      }
    } catch (e) {
      // 忽略错误
    }
  }

  /**
   * 获取内存统计信息
   */
  getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      heapPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      timestamp: Date.now(),
      underPressure: this.underPressure,
      pressureSince: this.underPressure ? this.pressureStartedAt : null,
      highUsageCount: this.highUsageCount,
      recoveryCount: this.recoveryCount
    };
  }

  /**
   * 进入内存保护模式
   */
  activatePressureMode(heapPercent) {
    if (this.underPressure && Date.now() - this.lastDiagnosticLog < this.DIAGNOSTIC_INTERVAL) {
      return;
    }

    if (!this.underPressure) {
      this.underPressure = true;
      this.pressureStartedAt = Date.now();
      console.warn(`🔥 [内存监控] 多次检测堆使用率高 (${heapPercent.toFixed(2)}%)，进入内存保护模式`);
      this.forceGC();
      this.logRuntimeDiagnostics('pressure-enter', heapPercent);
      cacheModule.clearAllCaches();
      this.adjustNetworkConcurrency('enter');
    } else {
      this.logRuntimeDiagnostics('pressure-ongoing', heapPercent);
    }
  }

  /**
   * 退出内存保护模式
   */
  deactivatePressureMode(heapPercent) {
    if (!this.underPressure) return;

    this.underPressure = false;
    this.pressureStartedAt = 0;
    console.log(`✅ [内存监控] 内存使用已恢复 (${heapPercent.toFixed(2)}%)，退出保护模式`);
    this.adjustNetworkConcurrency('exit');
    this.logRuntimeDiagnostics('pressure-exit', heapPercent);
  }

  /**
   * 记录运行诊断信息
   */
  logRuntimeDiagnostics(reason, heapPercent) {
    try {
      const cacheStats = cacheModule.getAllCacheStats();
      const summary = Object.entries(cacheStats)
        .map(([name, stats]) => `${name}=size:${stats.size}/${stats.maxSize},hit:${stats.hitRate}`)
        .join(' | ');

      const resourceUsage = process.resourceUsage();
      const rssMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
      const netStats = this.safeGetNetworkStats();

      console.log(`📈 [内存诊断:${reason}] heap=${heapPercent.toFixed(2)}%, rss=${rssMB}MB, activeRequests=${netStats.activeRequests}, concurrency=${netStats.concurrencyLimit}`);
      console.log(`📦 [缓存快照] ${summary}`);
      console.log(`🧠 CPU使用 user=${(resourceUsage.userCPUTime / 1000).toFixed(2)}ms sys=${(resourceUsage.systemCPUTime / 1000).toFixed(2)}ms`);
      this.lastDiagnosticLog = Date.now();
    } catch (err) {
      console.warn('[内存诊断] 获取缓存/资源信息失败:', err.message);
    }
  }

  safeGetNetworkStats() {
    try {
      networkOptimizer = networkOptimizer || require('./networkOptimizer');
      return networkOptimizer.getStats();
    } catch (_) {
      return { activeRequests: 0, concurrencyLimit: this.originalConcurrency || 0 };
    }
  }

  adjustNetworkConcurrency(stage) {
    try {
      networkOptimizer = networkOptimizer || require('./networkOptimizer');
      if (!networkOptimizer || typeof networkOptimizer.updateConfig !== 'function') {
        return;
      }

      if (stage === 'enter') {
        if (this.originalConcurrency == null) {
          this.originalConcurrency = networkOptimizer.concurrencyLimit || 5;
        }
        const reduced = Math.max(2, Math.floor((networkOptimizer.concurrencyLimit || 4) / 2));
        if (reduced < (networkOptimizer.concurrencyLimit || 0)) {
          networkOptimizer.updateConfig({ concurrencyLimit: reduced });
          console.warn(`🚦 [内存监控] 将网络并发限制从 ${this.originalConcurrency} 调整为 ${reduced}`);
        }
      } else if (stage === 'exit' && this.originalConcurrency) {
        networkOptimizer.updateConfig({ concurrencyLimit: this.originalConcurrency });
        console.log(`🚦 [内存监控] 恢复网络并发限制为 ${this.originalConcurrency}`);
      }
    } catch (err) {
      console.warn('[内存监控] 调整网络并发失败:', err.message);
    }
  }
}

module.exports = new MemoryMonitor();