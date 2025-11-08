/**
 * MCP日志管理器
 * 收集和管理所有MCP工具的日志
 */

class MCPLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 500; // 最多保存500条日志
    this.listeners = new Set(); // WebSocket监听器
  }

  /**
   * 添加日志
   */
  log(level, toolId, message) {
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      level, // info, success, warning, error
      toolId,
      message,
      time: new Date().toLocaleTimeString()
    };

    this.logs.push(logEntry);
    
    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 通知监听器
    this.notifyListeners(logEntry);

    // 控制台输出
    const icon = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }[level] || '📝';

    console.log(`${icon} [${toolId}] ${message}`);
  }

  /**
   * 添加监听器
   */
  addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * 移除监听器
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * 通知所有监听器
   */
  notifyListeners(logEntry) {
    this.listeners.forEach(listener => {
      try {
        listener(logEntry);
      } catch (error) {
        console.error('通知监听器失败:', error);
      }
    });
  }

  /**
   * 获取最近的日志
   */
  queryLogs({ toolId = null, limit = 100, level = null, search = null } = {}) {
    let result = [...this.logs];

    if (toolId) {
      result = result.filter(log => log.toolId === toolId);
    }

    if (level && level !== 'all') {
      result = result.filter(log => log.level === level);
    }

    if (search) {
      const keyword = search.toLowerCase();
      result = result.filter(log =>
        log.message?.toLowerCase().includes(keyword) ||
        log.toolId?.toLowerCase().includes(keyword)
      );
    }

    return result.slice(-limit).reverse();
  }

  /**
   * 清除日志
   */
  clearLogs(toolId = null) {
    if (toolId) {
      this.logs = this.logs.filter(log => log.toolId !== toolId);
    } else {
      this.logs = [];
    }
  }

  /**
   * 快捷方法
   */
  info(toolId, message) {
    this.log('info', toolId, message);
  }

  success(toolId, message) {
    this.log('success', toolId, message);
  }

  warning(toolId, message) {
    this.log('warning', toolId, message);
  }

  error(toolId, message) {
    this.log('error', toolId, message);
  }
}

module.exports = new MCPLogger();

