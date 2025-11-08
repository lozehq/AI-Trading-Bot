/**
 * 应用程序常量配置
 * 集中管理所有硬编码的值，便于配置和维护
 */

module.exports = {
  // ========== 超时配置 ==========
  TIMEOUTS: {
    // 数据获取超时（毫秒）
    DATA_FETCH: parseInt(process.env.DATA_FETCH_TIMEOUT) || 10000,
    
    // AI分析超时（毫秒）
    AI_ANALYSIS: parseInt(process.env.AI_ANALYSIS_TIMEOUT) || 30000,
    
    // AI分析超时（前端，毫秒）
    AI_ANALYSIS_FRONTEND: parseInt(process.env.AI_ANALYSIS_FRONTEND_TIMEOUT) || 90000,
    
    // WebSocket心跳间隔（毫秒）
    WEBSOCKET_HEARTBEAT: parseInt(process.env.WEBSOCKET_HEARTBEAT) || 30000,
    
    // HTTP请求超时（毫秒）
    HTTP_REQUEST: parseInt(process.env.HTTP_REQUEST_TIMEOUT) || 120000,
    
    // MCP工具调用超时（毫秒）
    MCP_TOOL_CALL: parseInt(process.env.MCP_TOOL_CALL_TIMEOUT) || 10000
  },

  // ========== 缓存配置 ==========
  CACHE: {
    // AI分析缓存TTL（毫秒）
    AI_ANALYSIS_TTL: parseInt(process.env.CACHE_AI_ANALYSIS_TTL) || 300000, // 5分钟
    
    // MCP数据缓存TTL（毫秒）
    MCP_DATA_TTL: parseInt(process.env.CACHE_MCP_DATA_TTL) || 60000, // 1分钟
    
    // 市场数据缓存TTL（毫秒）
    MARKET_DATA_TTL: parseInt(process.env.CACHE_MARKET_DATA_TTL) || 5000, // 5秒
    
    // 技术指标缓存TTL（毫秒）
    INDICATORS_TTL: parseInt(process.env.CACHE_INDICATORS_TTL) || 30000 // 30秒
  },

  // ========== 重试配置 ==========
  RETRY: {
    // 最大重试次数
    MAX_ATTEMPTS: parseInt(process.env.RETRY_MAX_ATTEMPTS) || 3,
    
    // 初始延迟（毫秒）
    INITIAL_DELAY: parseInt(process.env.RETRY_INITIAL_DELAY) || 1000,
    
    // 最大延迟（毫秒）
    MAX_DELAY: parseInt(process.env.RETRY_MAX_DELAY) || 10000,
    
    // 延迟倍数（指数退避）
    BACKOFF_MULTIPLIER: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER) || 2
  },

  // ========== 限流配置 ==========
  RATE_LIMIT: {
    // API限流窗口（毫秒）
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1分钟
    
    // 每个窗口最大请求数
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    
    // AI API限流（每分钟）
    AI_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_AI_MAX_REQUESTS) || 10,
    
    // DeepSeek API限流（每分钟）
    DEEPSEEK_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_DEEPSEEK_MAX_REQUESTS) || 5
  },

  // ========== 分页配置 ==========
  PAGINATION: {
    // 默认每页条目数
    DEFAULT_PAGE_SIZE: parseInt(process.env.PAGINATION_DEFAULT_PAGE_SIZE) || 50,
    
    // 最大每页条目数
    MAX_PAGE_SIZE: parseInt(process.env.PAGINATION_MAX_PAGE_SIZE) || 1000,
    
    // 历史记录默认限制
    HISTORY_LIMIT: parseInt(process.env.PAGINATION_HISTORY_LIMIT) || 20,
    
    // 最大思考步骤保留数
    MAX_THOUGHT_HISTORY: parseInt(process.env.MAX_THOUGHT_HISTORY) || 20
  },

  // ========== 自动AI配置 ==========
  AUTO_AI: {
    // 默认分析间隔（秒）
    DEFAULT_INTERVAL: parseInt(process.env.AUTO_AI_DEFAULT_INTERVAL) || 120,
    
    // 最小分析间隔（秒）
    MIN_INTERVAL: parseInt(process.env.AUTO_AI_MIN_INTERVAL) || 30,
    
    // 最大分析间隔（秒）
    MAX_INTERVAL: parseInt(process.env.AUTO_AI_MAX_INTERVAL) || 3600
  },

  // ========== WebSocket配置 ==========
  WEBSOCKET: {
    // 心跳间隔（毫秒）
    HEARTBEAT_INTERVAL: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000,
    
    // 价格更新间隔（毫秒）
    PRICE_UPDATE_INTERVAL: parseInt(process.env.WS_PRICE_UPDATE_INTERVAL) || 5000,
    
    // 最大连接数
    MAX_CONNECTIONS: parseInt(process.env.WS_MAX_CONNECTIONS) || 1000
  },

  // ========== 数据库配置 ==========
  DATABASE: {
    // 数据保留天数
    DATA_RETENTION_DAYS: parseInt(process.env.DB_DATA_RETENTION_DAYS) || 90,
    
    // 批量操作大小
    BATCH_SIZE: parseInt(process.env.DB_BATCH_SIZE) || 1000,
    
    // 查询超时（毫秒）
    QUERY_TIMEOUT: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000
  },

  // ========== AI配置 ==========
  AI: {
    // 默认温度
    DEFAULT_TEMPERATURE: parseFloat(process.env.AI_DEFAULT_TEMPERATURE) || 0.3,
    
    // 最大tokens
    DEFAULT_MAX_TOKENS: parseInt(process.env.AI_DEFAULT_MAX_TOKENS) || 2000,
    
    // 置信度阈值
    CONFIDENCE_THRESHOLD: parseInt(process.env.AI_CONFIDENCE_THRESHOLD) || 60,
    
    // 最小置信度
    MIN_CONFIDENCE: parseInt(process.env.AI_MIN_CONFIDENCE) || 0,
    
    // 最大置信度
    MAX_CONFIDENCE: parseInt(process.env.AI_MAX_CONFIDENCE) || 100
  },

  // ========== 交易配置 ==========
  TRADING: {
    // 默认风险百分比
    DEFAULT_RISK_PERCENTAGE: parseFloat(process.env.TRADING_DEFAULT_RISK_PERCENTAGE) || 0.02,
    
    // 默认初始资金
    DEFAULT_INITIAL_CAPITAL: parseFloat(process.env.TRADING_DEFAULT_INITIAL_CAPITAL) || 10000,
    
    // 默认手续费
    DEFAULT_FEE: parseFloat(process.env.TRADING_DEFAULT_FEE) || 0.001,
    
    // 默认滑点
    DEFAULT_SLIPPAGE: parseFloat(process.env.TRADING_DEFAULT_SLIPPAGE) || 0.0005
  },

  // ========== 回测配置 ==========
  BACKTEST: {
    // 默认时间周期
    DEFAULT_INTERVAL: process.env.BACKTEST_DEFAULT_INTERVAL || '1h',
    
    // 默认初始资金
    DEFAULT_INITIAL_CAPITAL: parseFloat(process.env.BACKTEST_DEFAULT_INITIAL_CAPITAL) || 10000,
    
    // 默认手续费
    DEFAULT_FEE: parseFloat(process.env.BACKTEST_DEFAULT_FEE) || 0.001,
    
    // 默认滑点
    DEFAULT_SLIPPAGE: parseFloat(process.env.BACKTEST_DEFAULT_SLIPPAGE) || 0.0005
  },

  // ========== 价格预警配置 ==========
  PRICE_ALERT: {
    // 检查间隔（毫秒）
    CHECK_INTERVAL: parseInt(process.env.PRICE_ALERT_CHECK_INTERVAL) || 10000,
    
    // 最大预警数量
    MAX_ALERTS: parseInt(process.env.PRICE_ALERT_MAX_ALERTS) || 100
  },

  // ========== 日志配置 ==========
  LOGGING: {
    // 日志级别
    LEVEL: process.env.LOG_LEVEL || 'info',
    
    // 是否启用彩色输出
    COLORIZE: process.env.LOG_COLORIZE !== 'false',
    
    // 日志文件路径
    FILE_PATH: process.env.LOG_FILE_PATH || './logs/app.log',
    
    // 日志文件最大大小（字节）
    MAX_FILE_SIZE: parseInt(process.env.LOG_MAX_FILE_SIZE) || 10485760, // 10MB
    
    // 保留的日志文件数量
    MAX_FILES: parseInt(process.env.LOG_MAX_FILES) || 5
  },

  // ========== 安全配置 ==========
  SECURITY: {
    // API密钥（应该从环境变量读取）
    API_KEY: process.env.API_KEY || 'dev-api-key-change-in-production',
    
    // JWT密钥（应该从环境变量读取）
    JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
    
    // JWT过期时间
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    
    // 是否启用HTTPS
    ENABLE_HTTPS: process.env.ENABLE_HTTPS === 'true',
    
    // 是否启用CORS
    ENABLE_CORS: process.env.ENABLE_CORS !== 'false',
    
    // 允许的来源
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:5173',
      'http://localhost:3000'
    ]
  },

  // ========== 应用配置 ==========
  APP: {
    // 应用名称
    NAME: process.env.APP_NAME || 'AI Trading Bot',
    
    // 应用版本
    VERSION: process.env.APP_VERSION || '1.0.0',
    
    // 环境
    ENV: process.env.NODE_ENV || 'development',
    
    // 是否为生产环境
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    
    // 是否为开发环境
    IS_DEVELOPMENT: process.env.NODE_ENV !== 'production',
    
    // 端口
    PORT: parseInt(process.env.PORT) || 3000,
    
    // WebSocket端口
    WS_PORT: parseInt(process.env.WS_PORT) || 3001
  },

  // ========== 默认交易对 ==========
  DEFAULTS: {
    EXCHANGE: process.env.DEFAULT_EXCHANGE || 'binance',
    SYMBOL: process.env.DEFAULT_SYMBOL || 'ETH/USDT',
    TIMEFRAME: process.env.DEFAULT_TIMEFRAME || '1h'
  }
};

