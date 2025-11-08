/**
 * 应用配置集中管理
 * 
 * 功能:
 * - 环境变量集中管理
 * - 配置验证
 * - 默认值设置
 * - 类型转换
 */

require('dotenv').config();

/**
 * 获取环境变量（带类型转换）
 */
function getEnv(key, defaultValue, type = 'string') {
  const value = process.env[key];
  
  if (value === undefined) {
    return defaultValue;
  }
  
  switch (type) {
    case 'number':
      return parseInt(value, 10);
    case 'boolean':
      return value === 'true' || value === '1';
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return defaultValue;
      }
    default:
      return value;
  }
}

/**
 * 验证必需的环境变量
 */
function validateRequiredEnv(keys) {
  const missing = [];
  
  for (const key of keys) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `缺少必需的环境变量: ${missing.join(', ')}\n` +
      `请检查 .env 文件或参考 .env.example`
    );
  }
}

/**
 * 应用配置
 */
const config = {
  // ========================================
  // 服务器配置
  // ========================================
  server: {
    port: getEnv('PORT', 3002, 'number'),
    wsPort: getEnv('WS_PORT', 3001, 'number'),
    env: getEnv('NODE_ENV', 'development'),
    isDevelopment: getEnv('NODE_ENV', 'development') === 'development',
    isProduction: getEnv('NODE_ENV', 'development') === 'production',
    corsOrigin: getEnv('CORS_ORIGIN', '*')
  },

  // ========================================
  // AI配置
  // ========================================
  ai: {
    apiKey: getEnv('DEEPSEEK_API_KEY', ''),
    apiUrl: getEnv('DEEPSEEK_API_URL', 'https://catsapi.com/v1/chat/completions'),
    model: getEnv('DEEPSEEK_MODEL', 'deepseek-v3.1'),
    maxRetries: getEnv('AI_MAX_RETRIES', 3, 'number'),
    timeout: getEnv('AI_TIMEOUT', 30000, 'number'),
    useLocalFallback: getEnv('USE_LOCAL_FALLBACK', true, 'boolean'),
    fallbackOnly: getEnv('FALLBACK_ONLY', false, 'boolean')
  },

  // ========================================
  // 交易所配置
  // ========================================
  exchange: {
    name: getEnv('EXCHANGE_NAME', 'okx'),
    defaultSymbol: getEnv('DEFAULT_SYMBOL', 'ETH/USDT'),
    rateLimit: getEnv('RATE_LIMIT', 1000, 'number'),
    enableLiveTrading: getEnv('ENABLE_LIVE_TRADING', false, 'boolean')
  },

  // ========================================
  // 数据库配置
  // ========================================
  database: {
    path: getEnv('DB_PATH', './data/trading.db'),
    backupDir: getEnv('DB_BACKUP_DIR', './data/backups'),
    backupRetentionDays: getEnv('DB_BACKUP_RETENTION_DAYS', 7, 'number'),
    enableAutoBackup: getEnv('DB_ENABLE_AUTO_BACKUP', true, 'boolean')
  },

  // ========================================
  // MCP工具配置
  // ========================================
  mcp: {
    timeout: getEnv('MCP_TIMEOUT', 10000, 'number'),
    maxConcurrent: getEnv('MCP_MAX_CONCURRENT', 10, 'number'),
    retryAttempts: getEnv('MCP_RETRY_ATTEMPTS', 2, 'number'),
    enableLogging: getEnv('MCP_ENABLE_LOGGING', true, 'boolean')
  },

  // ========================================
  // 缓存配置
  // ========================================
  cache: {
    ttl: getEnv('CACHE_TTL', 60000, 'number'),
    maxSize: getEnv('CACHE_MAX_SIZE', 100, 'number'),
    enableCache: getEnv('ENABLE_CACHE', true, 'boolean')
  },

  // ========================================
  // 日志配置
  // ========================================
  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    enableFileLogging: getEnv('ENABLE_FILE_LOGGING', true, 'boolean'),
    logDir: getEnv('LOG_DIR', './logs'),
    maxLogFiles: getEnv('MAX_LOG_FILES', 5, 'number'),
    maxLogSize: getEnv('MAX_LOG_SIZE', 5242880, 'number') // 5MB
  },

  // ========================================
  // 监控配置
  // ========================================
  monitoring: {
    enablePerformanceMonitoring: getEnv('ENABLE_PERFORMANCE_MONITORING', true, 'boolean'),
    slowRequestThreshold: getEnv('SLOW_REQUEST_THRESHOLD', 1000, 'number'),
    enableHealthCheck: getEnv('ENABLE_HEALTH_CHECK', true, 'boolean')
  },

  // ========================================
  // 安全配置
  // ========================================
  security: {
    apiSecretKey: getEnv('API_SECRET_KEY', ''),
    enableApiAuth: getEnv('ENABLE_API_AUTH', false, 'boolean'),
    rateLimitWindow: getEnv('RATE_LIMIT_WINDOW', 60000, 'number'),
    rateLimitMax: getEnv('RATE_LIMIT_MAX', 100, 'number')
  },

  // ========================================
  // 交易配置
  // ========================================
  trading: {
    maxPositions: getEnv('MAX_POSITIONS', 5, 'number'),
    maxTradeAmount: getEnv('MAX_TRADE_AMOUNT', 1000, 'number'),
    stopLossPercentage: getEnv('STOP_LOSS_PERCENTAGE', 2, 'number'),
    takeProfitPercentage: getEnv('TAKE_PROFIT_PERCENTAGE', 5, 'number'),
    enableAutoTrading: getEnv('ENABLE_AUTO_TRADING', false, 'boolean')
  },

  // ========================================
  // 通知配置
  // ========================================
  notifications: {
    enable: getEnv('ENABLE_NOTIFICATIONS', false, 'boolean'),
    telegram: {
      botToken: getEnv('TELEGRAM_BOT_TOKEN', ''),
      chatId: getEnv('TELEGRAM_CHAT_ID', '')
    },
    email: {
      smtpHost: getEnv('EMAIL_SMTP_HOST', ''),
      smtpPort: getEnv('EMAIL_SMTP_PORT', 587, 'number'),
      from: getEnv('EMAIL_FROM', ''),
      to: getEnv('EMAIL_TO', '')
    }
  },

  // ========================================
  // 开发配置
  // ========================================
  development: {
    debug: getEnv('DEBUG', false, 'boolean'),
    verboseLogging: getEnv('VERBOSE_LOGGING', false, 'boolean'),
    enableApiDocs: getEnv('ENABLE_API_DOCS', true, 'boolean')
  }
};

/**
 * 验证配置
 */
function validateConfig() {
  const errors = [];

  // 验证端口
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('PORT必须在1-65535之间');
  }

  // 验证AI配置（如果不是fallback模式）
  if (!config.ai.fallbackOnly && !config.ai.apiKey) {
    console.warn('⚠️  警告: DEEPSEEK_API_KEY未配置，将使用本地fallback模式');
  }

  // 验证交易配置
  if (config.trading.enableAutoTrading && !config.exchange.enableLiveTrading) {
    errors.push('启用自动交易需要同时启用实盘交易');
  }

  // 验证通知配置
  if (config.notifications.enable) {
    if (!config.notifications.telegram.botToken && !config.notifications.email.smtpHost) {
      errors.push('启用通知需要配置Telegram或Email');
    }
  }

  if (errors.length > 0) {
    throw new Error(`配置验证失败:\n${errors.join('\n')}`);
  }
}

/**
 * 打印配置信息
 */
function printConfig() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 应用配置');
  console.log('='.repeat(60));
  console.log(`环境: ${config.server.env}`);
  console.log(`服务器端口: ${config.server.port}`);
  console.log(`WebSocket端口: ${config.server.wsPort}`);
  console.log(`交易所: ${config.exchange.name}`);
  console.log(`默认交易对: ${config.exchange.defaultSymbol}`);
  console.log(`AI模型: ${config.ai.model}`);
  console.log(`数据库: ${config.database.path}`);
  console.log(`日志级别: ${config.logging.level}`);
  console.log(`缓存TTL: ${config.cache.ttl}ms`);
  console.log(`实盘交易: ${config.exchange.enableLiveTrading ? '✅ 启用' : '❌ 禁用'}`);
  console.log(`自动交易: ${config.trading.enableAutoTrading ? '✅ 启用' : '❌ 禁用'}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * 获取配置值
 */
function get(path, defaultValue = null) {
  const keys = path.split('.');
  let value = config;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }
  
  return value;
}

/**
 * 设置配置值（运行时）
 */
function set(path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  let target = config;
  
  for (const key of keys) {
    if (!(key in target)) {
      target[key] = {};
    }
    target = target[key];
  }
  
  target[lastKey] = value;
}

// 验证配置
try {
  validateConfig();
} catch (error) {
  console.error('❌ 配置错误:', error.message);
  process.exit(1);
}

module.exports = {
  ...config,
  get,
  set,
  printConfig,
  validateConfig
};

