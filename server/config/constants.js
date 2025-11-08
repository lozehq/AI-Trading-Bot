/**
 * 系统常量配置
 * 包含缓存、限制、默认值等配置项
 */

module.exports = {
  CACHE: {
    // 默认TTL（生存时间）60秒
    DEFAULT_TTL: 60000,

    // 最大缓存条目数
    MAX_SIZE: 100,

    // 清理间隔（毫秒）
    CLEANUP_INTERVAL: 30000,

    // 市场数据缓存键前缀
    MARKET_DATA_PREFIX: 'market_data_',

    // K线数据缓存键前缀
    OHLCV_PREFIX: 'ohlcv_',

    // 指标数据缓存键前缀
    INDICATOR_PREFIX: 'indicator_',

    // 价格数据缓存时间（30秒）
    PRICE_TTL: 30000,

    // 技术指标缓存时间（60秒）
    INDICATORS_TTL: 60000,

    // MCP工具数据缓存时间（120秒）
    MCP_DATA_TTL: 120000,

    // AI分析缓存时间（300秒 - 5分钟）
    AI_ANALYSIS_TTL: 300000,

    // 静态数据缓存时间（3600秒 - 1小时）
    // 用于不常变化的数据：VIP等级、杠杆档位、系统状态等
    STATIC_DATA_TTL: 3600000,
  },

  // API限制配置
  API: {
    // 请求超时时间（毫秒）
    TIMEOUT: 10000,

    // 最大重试次数
    MAX_RETRIES: 3,

    // 重试间隔（毫秒）
    RETRY_DELAY: 1000,
  },

  // 交易配置
  TRADING: {
    // 默认交易对
    DEFAULT_SYMBOL: 'BTC/USDT',

    // 默认时间周期
    DEFAULT_TIMEFRAME: '1m',

    // 最大持仓数量
    MAX_POSITIONS: 10,
  },

  // WebSocket配置
  WEBSOCKET: {
    // 心跳间隔（毫秒）
    HEARTBEAT_INTERVAL: 30000,

    // 心跳超时（毫秒）
    HEARTBEAT_TIMEOUT: 60000,

    // 最大连接数
    MAX_CONNECTIONS: 100,

    // 连接超时（毫秒）
    CONNECTION_TIMEOUT: 5000,

    // 价格推送间隔（毫秒）- 降低频率避免限流
    PRICE_UPDATE_INTERVAL: 5000,
  },

  // 超时配置
  TIMEOUTS: {
    // WebSocket连接超时
    WEBSOCKET: 5000,

    // API请求超时
    API: 10000,

    // 数据库查询超时
    DATABASE: 30000,
  },

  // 限流配置
  RATE_LIMIT: {
    // 最小请求间隔（毫秒）
    MIN_INTERVAL: 100,

    // 每分钟最大请求数
    MAX_REQUESTS_PER_MINUTE: 60,

    // 突发最大请求数
    MAX_BURST: 10,

    // AI聊天服务限流间隔
    AI_CHAT_INTERVAL: 1000,

    // AI分析服务限流间隔
    AI_ANALYSIS_INTERVAL: 2000,

    // 各主机特定限流规则（毫秒）
    HOST_RULES: {
      'www.okx.com': {
        minInterval: 500,
        maxRequestsPerMinute: 80
      },
      'aws.okx.com': {
        minInterval: 500,
        maxRequestsPerMinute: 80
      },
      'fapi.binance.com': {
        minInterval: 250,
        maxRequestsPerMinute: 120
      },
      'api.binance.com': {
        minInterval: 250,
        maxRequestsPerMinute: 120
      },
      'api.alternative.me': {
        minInterval: 1500,
        maxRequestsPerMinute: 30
      }
    }
  },

  // AI分析配置
  AI_ANALYSIS: {
    // 数据收集超时（毫秒）- 完整42个数据源，超低速串行获取
    DATA_COLLECTION_TIMEOUT: 180000, // 3分钟用于获取所有数据源

    // 多时间框架数据超时（毫秒）- 6个时间框架，批次串行请求
    MULTI_TIMEFRAME_TIMEOUT: 120000, // 2分钟

    // Ticker获取超时（毫秒）
    TICKER_TIMEOUT: 10000, // 10秒

    // 指标计算超时（毫秒）
    INDICATORS_TIMEOUT: 15000, // 15秒

    // AI分析总超时（毫秒）
    AI_ANALYSIS_TIMEOUT: 300000, // 5分钟总超时（容纳完整数据获取）

    // K线默认数量
    DEFAULT_KLINE_LIMIT: 100,

    // 多时间框架失败率阈值
    TIMEFRAME_FAILURE_THRESHOLD: 0.5,

    // 并发请求限制（极低以避免OKX频率限制）
    CONCURRENCY_LIMIT: 2, // 从3降到2（最保守）

    // OKX API频率限制配置（每2秒最多20个请求）
    OKX_RATE_LIMIT: {
      // 请求之间的延迟（毫秒）- 串行请求时使用
      REQUEST_DELAY: 500, // 从200ms大幅增加到500ms

      // 批次大小（并行请求数）- 极小批次
      BATCH_SIZE: 2, // 从3降到2（最保守）

      // 批次之间的延迟（毫秒）- 大幅增加
      BATCH_DELAY: 1500, // 从600ms增加到1.5秒

      // 重试配置
      RETRY_MAX_ATTEMPTS: 3,
      RETRY_INITIAL_DELAY: 2000, // 从1秒增加到2秒
      RETRY_MULTIPLIER: 2,
    },

    // 时间框架权重配置
    TIMEFRAME_WEIGHTS: {
      '1d': 0.40,  // 长期趋势，权重最高
      '4h': 0.25,  // 中期趋势
      '1h': 0.15,  // 短期趋势
      '30m': 0.10, // 超短期
      '15m': 0.07, // 入场时机
      '1m': 0.03   // 精确入场
    },

    // 趋势强度阈值（百分比）
    STRONG_TREND_THRESHOLD: 2.0,

    // 共振级别阈值
    RESONANCE_THRESHOLDS: {
      VERY_STRONG: 80,  // 超强共振
      STRONG: 65,       // 强共振
      MEDIUM: 50,       // 中等共振
    },

    // 共振置信度调整
    RESONANCE_CONFIDENCE_ADJUSTMENT: {
      VERY_STRONG: 30,  // +30%
      STRONG: 20,       // +20%
      MEDIUM: 10,       // +10%
      WEAK: -15,        // -15%
    },
  },

  // 数据源配置
  DATA_SOURCES: {
    // 总数据源数量
    TOTAL_COUNT: 48,

    // 基础数据源
    BASE_COUNT: 15,

    // Phase 1 关键数据源
    PHASE1_COUNT: 5,

    // Phase 2 高优先级数据源
    PHASE2_COUNT: 10,

    // Phase 3 中优先级数据源
    PHASE3_COUNT: 6,

    // Phase 4 高价值数据源
    PHASE4_COUNT: 5,

    // Phase 4 Final 完成数据源
    PHASE4_FINAL_COUNT: 7,
  },
};
