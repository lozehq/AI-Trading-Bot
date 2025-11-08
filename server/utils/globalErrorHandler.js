/**
 * 全局错误处理器
 * 捕获未处理的Promise rejection和异常
 */

const fs = require('fs');
const path = require('path');

class GlobalErrorHandler {
  constructor() {
    this.errorLogPath = path.join(__dirname, '../../logs');
    this.criticalErrors = [];
    this.maxCriticalErrors = 10;
    this.resetInterval = 60000; // 1分钟重置计数

    // 确保日志目录存在
    if (!fs.existsSync(this.errorLogPath)) {
      fs.mkdirSync(this.errorLogPath, { recursive: true });
    }

    // 定期重置错误计数
    setInterval(() => {
      if (this.criticalErrors.length > 0) {
        console.log(`[错误处理器] 重置错误计数，过去1分钟内有${this.criticalErrors.length}个严重错误`);
        this.criticalErrors = [];
      }
    }, this.resetInterval);
  }

  /**
   * 初始化全局错误处理
   */
  initialize() {
    // 处理未捕获的Promise rejection
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ [未处理的Promise Rejection]:', reason);

      this.logError('unhandledRejection', {
        reason: reason?.toString() || 'Unknown reason',
        stack: process.env.NODE_ENV === 'production'
          ? '[REDACTED in production]'
          : (reason?.stack || 'No stack trace'),
        promise: promise?.toString() || 'Unknown promise'
      });

      // 记录严重错误
      this.recordCriticalError('unhandledRejection', reason);

      // 如果是致命错误，考虑优雅关闭
      if (this.isFatalError(reason)) {
        console.error('💀 检测到致命错误，准备优雅关闭...');
        this.gracefulShutdown('FATAL_ERROR');
      }
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      console.error('❌ [未捕获的异常]:', error);

      this.logError('uncaughtException', {
        message: error.message,
        stack: process.env.NODE_ENV === 'production'
          ? '[REDACTED in production]'
          : error.stack,
        code: error.code
      });

      // 记录严重错误
      this.recordCriticalError('uncaughtException', error);

      // 未捕获异常通常是严重错误，需要重启
      console.error('💀 未捕获异常，准备重启应用...');
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // 处理警告
    process.on('warning', (warning) => {
      console.warn('⚠️ [Node.js警告]:', warning.name, warning.message);

      this.logError('warning', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack
      });
    });

    // 处理退出信号
    process.on('SIGTERM', () => {
      console.log('📡 收到SIGTERM信号，优雅关闭...');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      console.log('📡 收到SIGINT信号，优雅关闭...');
      this.gracefulShutdown('SIGINT');
    });

    // 监控内存使用
    this.startMemoryMonitoring();


  // 敏感信息脱敏
  sanitize(obj){
    const mask=(s)=>typeof s==='string'?(s.length>8?s.slice(0,4)+'***'+s.slice(-4):'***'):s;
    const isKey=(k)=>{
      if(!k) return false; const s=String(k).toLowerCase();
      return s.includes('authorization')||s.includes('api_key')||s.includes('apikey')||s.includes('secret')||s.includes('token')||s.includes('passphrase')||s.includes('password')||s.endsWith('key');
    };
    const walk=(v)=>{
      if(!v||typeof v!=='object') return v;
      if(Array.isArray(v)) return v.map(walk);
      const out={};
      for(const [k,val] of Object.entries(v)){
        if(val&&typeof val==='object') out[k]=walk(val);
        else if(isKey(k)) out[k]=mask(val);
        else out[k]=val;
      }
      return out;
    };
    return walk(obj);
  }

    console.log('✅ [全局错误处理器] 已初始化');
  }

  /**
   * 记录错误到文件
   * @param {string} type - 错误类型
   * @param {Object} error - 错误详情
   */
  logError(type, error) {
    const timestamp = new Date().toISOString();
    const logFile = path.join(this.errorLogPath, `error-${new Date().toISOString().split('T')[0]}.log`);

    const logEntry = {
      timestamp,
      type,
      error: this.sanitize(error),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };

    try {
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch (writeError) {
      console.error('写入错误日志失败:', writeError.message);
    }
  }

  /**
   * 记录严重错误
   * @param {string} type - 错误类型
   * @param {Error} error - 错误对象
   */
  recordCriticalError(type, error) {
    this.criticalErrors.push({
      type,
      timestamp: Date.now(),
      message: error?.message || error?.toString() || 'Unknown error'
    });

    // 检查是否错误过多
    if (this.criticalErrors.length >= this.maxCriticalErrors) {
      console.error('💀 [错误处理器] 1分钟内严重错误过多，系统不稳定！');
      this.gracefulShutdown('TOO_MANY_ERRORS');
    }
  }

  /**
   * 判断是否为致命错误
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否致命
   */
  isFatalError(error) {
    if (!error) return false;

    const fatalPatterns = [
      /EADDRINUSE/,        // 端口已占用
      /EACCES/,            // 权限错误
      /ENOMEM/,            // 内存不足
      /ENOSPC/,            // 磁盘空间不足
      /Cannot find module/,// 模块缺失
      /Maximum call stack/,// 栈溢出
      /out of memory/i,    // 内存溢出
      /SQLITE_CORRUPT/,    // 数据库损坏
      /SQLITE_CANTOPEN/    // 无法打开数据库
    ];

    const errorString = error.toString() + (error.stack || '');
    return fatalPatterns.some(pattern => pattern.test(errorString));
  }

  /**
   * 优雅关闭应用
   * @param {string} reason - 关闭原因
   */
  async gracefulShutdown(reason) {
    console.log(`🛑 [优雅关闭] 原因: ${reason}`);

    // 设置关闭超时
    const shutdownTimeout = setTimeout(() => {
      console.error('❌ 优雅关闭超时，强制退出');
      process.exit(1);
    }, 10000); // 10秒超时

    try {
      // 关闭WebSocket连接
      const { cleanup: cleanupWebSocket } = require('../websocket');
      if (cleanupWebSocket) {
        console.log('📡 清理WebSocket...');
        cleanupWebSocket();
      }

      // 关闭数据库连接
      const { closeDatabase } = require('../database/database');
      if (closeDatabase) {
        console.log('💾 关闭数据库...');
        closeDatabase();
      }

      // 清理其他资源
      await this.cleanupResources();

      clearTimeout(shutdownTimeout);
      console.log('✅ 优雅关闭完成');
      process.exit(0);

    } catch (error) {
      console.error('❌ 优雅关闭失败:', error.message);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }

  /**
   * 清理资源
   */
  async cleanupResources() {
    // 清理所有定时器
    const timers = process._getActiveHandles().filter(h => h.constructor.name === 'Timer');
    timers.forEach(timer => {
      if (timer._onTimeout) {
        clearTimeout(timer);
      }
    });

    // 清理所有interval
    const intervals = process._getActiveHandles().filter(h => h.constructor.name === 'Timeout');
    intervals.forEach(interval => {
      if (interval._repeat) {
        clearInterval(interval);
      }
    });

    console.log(`✅ 清理了 ${timers.length} 个定时器和 ${intervals.length} 个间隔器`);
  }

  /**
   * 启动内存监控
   */
  startMemoryMonitoring() {
    const checkInterval = 30000; // 30秒检查一次
    const memoryThreshold = 1024 * 1024 * 1024; // 1GB

    setInterval(() => {
      const usage = process.memoryUsage();
      const heapUsed = usage.heapUsed;
      const heapTotal = usage.heapTotal;
      const external = usage.external;
      const rss = usage.rss;

      // 计算堆使用率
      const heapUsagePercent = (heapUsed / heapTotal) * 100;

      // 内存使用过高警告
      if (rss > memoryThreshold) {
        console.warn(`⚠️ [内存警告] RSS内存使用过高: ${(rss / 1024 / 1024).toFixed(2)} MB`);

        // 尝试手动垃圾回收（如果启用了 --expose-gc）
        if (global.gc) {
          console.log('🧹 触发手动垃圾回收...');
          global.gc();
        }
      }

      // 堆内存使用率过高
      if (heapUsagePercent > 90) {
        console.warn(`⚠️ [内存警告] 堆内存使用率过高: ${heapUsagePercent.toFixed(2)}%`);
        this.logError('highMemoryUsage', {
          rss: rss,
          heapUsed: heapUsed,
          heapTotal: heapTotal,
          external: external,
          heapUsagePercent: heapUsagePercent
        });
      }
    }, checkInterval);
  }

  /**
   * 创建Promise包装器，自动处理rejection
   * @param {Promise} promise - 原始Promise
   * @param {string} context - 上下文描述
   * @returns {Promise} 包装后的Promise
   */
  static wrapPromise(promise, context = 'Unknown') {
    return promise.catch(error => {
      console.error(`❌ [Promise错误] ${context}:`, error.message);

      // 记录但不抛出，防止崩溃
      if (global.errorHandler) {
        global.errorHandler.logError('promiseError', {
          context,
          error: error.message,
          stack: error.stack
        });
      }

      // 返回默认值或重新抛出
      if (error.critical) {
        throw error;
      }

      return null; // 返回null作为默认值
    });
  }

  /**
   * 创建安全的异步函数包装器
   * @param {Function} fn - 异步函数
   * @param {string} name - 函数名称
   * @returns {Function} 包装后的函数
   */
  static safeAsync(fn, name = 'Unknown') {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        console.error(`❌ [异步错误] ${name}:`, error.message);

        if (global.errorHandler) {
          global.errorHandler.logError('asyncError', {
            function: name,
            error: error.message,
            stack: error.stack
          });
        }

        // 根据错误类型决定是否重新抛出
        if (error.critical || error.fatal) {
          throw error;
        }

        return null;
      }
    };
  }
}

// 创建单例实例
const errorHandler = new GlobalErrorHandler();

// 导出
module.exports = {
  GlobalErrorHandler,
  errorHandler,
  wrapPromise: GlobalErrorHandler.wrapPromise,
  safeAsync: GlobalErrorHandler.safeAsync
};