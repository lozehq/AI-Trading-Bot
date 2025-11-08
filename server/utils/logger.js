/**
 * 统一日志系统
 *
 * 功能:
 * - 结构化日志
 * - 日志级别管理
 * - 文件持久化
 * - 控制台彩色输出
 * - 日志轮转
 */

const fs = require('fs');
const path = require('path');

// 日志级别
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// 日志颜色
const COLORS = {
  ERROR: '\x1b[31m', // 红色
  WARN: '\x1b[33m',  // 黄色
  INFO: '\x1b[36m',  // 青色
  DEBUG: '\x1b[90m', // 灰色
  RESET: '\x1b[0m'
};

// 日志图标
const ICONS = {
  ERROR: '❌',
  WARN: '⚠️',
  INFO: 'ℹ️',
  DEBUG: '🔍'
};


// 脱敏工具：深度遍历并对敏感键进行打码
function maskString(val){
  if (typeof val !== 'string') return val;
  if (val.length <= 8) return '***';
  return val.slice(0,4) + '***' + val.slice(-4);
}
function isSensitiveKey(k){
  if (!k) return false;
  const s = String(k).toLowerCase();
  return s.includes('authorization') || s.includes('api_key') || s.includes('apikey') || s.includes('secret') || s.includes('token') || s.includes('passphrase') || s.includes('password') || s.endsWith('key');
}
function sanitizeMeta(obj){
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => sanitizeMeta(v));
  const out = {};
  for (const [k,v] of Object.entries(obj)){
    if (v && typeof v === 'object') {
      out[k] = sanitizeMeta(v);
    } else if (isSensitiveKey(k)) {
      out[k] = typeof v === 'string' ? maskString(v) : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

class Logger {
  constructor() {
    this.logLevel = this.getLogLevel();
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
  }

  /**
   * 获取日志级别
   */
  getLogLevel() {
    const level = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
    return LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.INFO;
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 格式化日志消息
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      ...meta
    };
  }

  /**
   * 写入日志文件
   */
  writeToFile(level, formattedMessage) {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `${date}.log`);
    const errorLogFile = path.join(this.logDir, `${date}-error.log`);

    const logLine = JSON.stringify(formattedMessage) + '\n';

    // 写入所有日志
    fs.appendFileSync(logFile, logLine);

    // 错误日志单独记录
    if (level === 'ERROR') {
      fs.appendFileSync(errorLogFile, logLine);
    }
  }

  /**
   * 控制台输出
   */
  writeToConsole(level, message, meta = {}) {
    const color = COLORS[level];
    const icon = ICONS[level];
    const timestamp = new Date().toLocaleTimeString();

    let output = `${color}${icon} [${timestamp}] [${level}]${COLORS.RESET} ${message}`;

    // 如果有额外的元数据，格式化输出
    if (Object.keys(meta).length > 0) {
      output += '\n' + JSON.stringify(meta, null, 2);
    }

    console.log(output);
  }

  /**
   * 通用日志方法
   */
  log(level, message, meta = {}) {
    const levelValue = LOG_LEVELS[level];

    // 检查日志级别
    if (levelValue > this.logLevel) {
      return;
    }

    const safeMeta = sanitizeMeta(meta);
    const formattedMessage = this.formatMessage(level, message, safeMeta);

    // 控制台输出
    this.writeToConsole(level, message, safeMeta);

    // 文件输出
    try {
      this.writeToFile(level, formattedMessage);
    } catch (error) {
      console.error('日志写入失败:', error.message);
    }
  }

  /**
   * 错误日志
   */
  error(message, meta = {}) {
    this.log('ERROR', message, meta);
  }

  /**
   * 警告日志
   */
  warn(message, meta = {}) {
    this.log('WARN', message, meta);
  }

  /**
   * 信息日志
   */
  info(message, meta = {}) {
    this.log('INFO', message, meta);
  }

  /**
   * 调试日志
   */
  debug(message, meta = {}) {
    this.log('DEBUG', message, meta);
  }

  /**
   * HTTP请求日志
   */
  http(req, res, duration) {
    const meta = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress
    };

    if (res.statusCode >= 500) {
      this.error('HTTP请求失败', meta);
    } else if (res.statusCode >= 400) {
      this.warn('HTTP请求错误', meta);
    } else if (duration > 1000) {
      this.warn('HTTP慢请求', meta);
    } else {
      this.info('HTTP请求', meta);
    }
  }

  /**
   * MCP调用日志
   */
  mcp(toolName, method, params, result, duration, error = null) {
    const meta = {
      tool: toolName,
      method,
      params,
      duration: `${duration}ms`,
      success: !error
    };

    if (error) {
      meta.error = error.message || String(error);
      this.error(`MCP调用失败: ${toolName}.${method}`, meta);
    } else {
      meta.result = result;
      this.info(`MCP调用成功: ${toolName}.${method}`, meta);
    }
  }

  /**
   * AI分析日志
   */
  ai(symbol, decision, confidence, duration) {
    const meta = {
      symbol,
      decision,
      confidence: `${confidence}%`,
      duration: `${duration}ms`
    };

    this.info('AI分析完成', meta);
  }

  /**
   * 交易日志
   */
  trade(action, symbol, price, amount, orderId = null) {
    const meta = {
      action,
      symbol,
      price,
      amount,
      orderId,
      value: price * amount
    };

    this.info(`交易${action}`, meta);
  }

  /**
   * 清理旧日志
   */
  cleanOldLogs(days = 7) {
    const files = fs.readdirSync(this.logDir);
    const now = Date.now();
    const maxAge = days * 24 * 60 * 60 * 1000;

    files.forEach(file => {
      const filePath = path.join(this.logDir, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  删除旧日志: ${file}`);
      }
    });
  }
}

// 创建单例
const logger = new Logger();

// 定期清理旧日志（每天凌晨3点）
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() === 0) {
      logger.cleanOldLogs(7);
    }
  }, 60000); // 每分钟检查一次
}

module.exports = logger;

