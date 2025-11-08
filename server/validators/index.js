/**
 * 输入验证模块
 * 使用Joi进行请求参数验证
 */

const Joi = require('joi');

/**
 * 通用验证中间件
 * @param {Joi.Schema} schema - Joi验证模式
 * @param {string} source - 验证来源 ('query', 'body', 'params')
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false, // 返回所有错误
      stripUnknown: true // 移除未知字段
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: {
          message: '输入验证失败',
          statusCode: 400,
          errors
        },
        timestamp: new Date().toISOString()
      });
    }

    // 用验证后的值替换原始值
    req[source] = value;
    next();
  };
}

// ========== 交易相关验证 ==========

const tradingSchemas = {
  // 策略信号查询
  strategySignal: Joi.object({
    exchange: Joi.string().valid('binance', 'okx', 'bybit', 'huobi').default('binance'),
    symbol: Joi.string().pattern(/^[A-Z]+\/[A-Z]+$/).default('ETH/USDT'),
    timeframe: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d').default('1h')
  }),

  // 交易历史查询
  history: Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(50)
  }),

  // 执行交易
  executeTrade: Joi.object({
    signal: Joi.string().valid('BUY', 'SELL').required(),
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    amount: Joi.number().positive().required(),
    price: Joi.number().positive().optional()
  }),

  // 启动自动交易
  autoStart: Joi.object({
    config: Joi.object({
      symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
      exchange: Joi.string().valid('okx', 'binance', 'bybit', 'huobi').default('okx'),
      maxPositionSize: Joi.number().min(1).max(100).optional(),
      stopLossPercent: Joi.number().min(0.1).max(10).optional(),
      takeProfitPercent: Joi.number().min(0.5).max(20).optional()
    }).required()
  })
};

// ========== AI相关验证 ==========

const aiSchemas = {
  // AI聊天
  chat: Joi.object({
    message: Joi.string().min(1).max(5000).required(),
    conversationId: Joi.string().uuid().optional(),
    model: Joi.string().valid('deepseek-chat', 'deepseek-reasoner').default('deepseek-chat'),
    temperature: Joi.number().min(0).max(2).default(0.7),
    maxTokens: Joi.number().integer().min(1).max(8000).default(2000),
    // 🆕 上下文联通
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).optional(),
    includeContext: Joi.boolean().default(true),
    k: Joi.number().integer().min(1).max(1000).default(5),
    executionsK: Joi.number().integer().min(1).max(1000).default(50),
    contextId: Joi.number().integer().positive().optional().allow(null),
    includeExecutions: Joi.boolean().default(true),
    analysisId: Joi.alternatives().try(Joi.string().max(100), Joi.number()).optional().allow(null),
    // 🆕 K线上下文
    includeOHLCV: Joi.boolean().default(false),
    timeframes: Joi.array().items(Joi.string().valid('1m','5m','15m','30m','1h','4h','1d')).default(['1h']),
    ohlcvLimit: Joi.alternatives().try(
      Joi.number().integer().min(1).max(5000),
      Joi.string().valid('all')
    ).default(200),
    ohlcvAttachMode: Joi.string().valid('none','head','tail','sampled','full').default('sampled')
  }),

  // AI分析
  analyze: Joi.object({
    exchange: Joi.string().valid('okx', 'binance', 'bybit', 'huobi').default('okx'),
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).default('ETH/USDT'),
    timeframe: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d').default('1h'),
    useCache: Joi.boolean().default(true),
    realtime: Joi.boolean().default(false)
  }),

  // AI增强分析（完整MCP模式）
  analyzeWithTools: Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    useFullMCP: Joi.boolean().default(true),
    forceRefresh: Joi.boolean().default(false),
    mode: Joi.string().valid('complete','fast','minimal','diagnose','narrative').optional(),
    contextK: Joi.number().integer().min(1).max(10).optional(),
    minWeight: Joi.number().min(0).max(1).optional(),
    contextId: Joi.number().integer().positive().optional().allow(null)
  })
};

// ========== 回测相关验证 ==========

const backtestSchemas = {
  // 运行回测
  run: Joi.object({
    strategy: Joi.string().required(),
    exchange: Joi.string().default('binance'),
    symbol: Joi.string().default('ETH/USDT'),
    timeframe: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d').default('1h'),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    initialCapital: Joi.number().positive().default(10000),
    fee: Joi.number().min(0).max(0.1).default(0.001),
    slippage: Joi.number().min(0).max(0.1).default(0.0005)
  }),

  // 获取回测结果
  results: Joi.object({
    backtestId: Joi.string().required(),
    detailed: Joi.boolean().default(false)
  })
};

// ========== 数据库相关验证 ==========

const databaseSchemas = {
  // 查询分析记录
  queryAnalyses: Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(50),
    offset: Joi.number().integer().min(0).default(0),
    symbol: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
  }),

  // 删除记录
  deleteRecords: Joi.object({
    ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required()
  }),

  // 清理旧数据
  cleanup: Joi.object({
    days: Joi.number().integer().min(1).max(365).default(90),
    table: Joi.string().valid('ai_analyses', 'mcp_logs', 'trades').optional()
  })
};

// ========== 价格预警相关验证 ==========

const priceAlertSchemas = {
  // 创建预警
  create: Joi.object({
    exchange: Joi.string().required(),
    symbol: Joi.string().required(),
    condition: Joi.string().valid('above', 'below', 'cross_above', 'cross_below').required(),
    targetPrice: Joi.number().positive().required(),
    enabled: Joi.boolean().default(true),
    notifyEmail: Joi.string().email().optional(),
    notifyWebhook: Joi.string().uri().optional()
  }),

  // 更新预警
  update: Joi.object({
    id: Joi.number().integer().positive().required(),
    condition: Joi.string().valid('above', 'below', 'cross_above', 'cross_below').optional(),
    targetPrice: Joi.number().positive().optional(),
    enabled: Joi.boolean().optional()
  }),

  // 删除预警
  delete: Joi.object({
    id: Joi.number().integer().positive().required()
  }),

  // 查询预警
  list: Joi.object({
    symbol: Joi.string().optional(),
    enabled: Joi.boolean().optional(),
    limit: Joi.number().integer().min(1).max(100).default(50)
  })
};

// ========== MCP相关验证 ==========

const mcpSchemas = {
  // 调用MCP工具
  callTool: Joi.object({
    toolName: Joi.string().required(),
    params: Joi.object().optional(),
    timeout: Joi.number().integer().min(1000).max(60000).default(10000)
  }),

  // 查询MCP日志
  queryLogs: Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(100),
    status: Joi.string().valid('success', 'error', 'timeout').optional(),
    toolName: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
  })
};

// ========== 市场数据相关验证 ==========

const marketDataSchemas = {
  // Ticker查询
  ticker: Joi.object({
    exchange: Joi.string().valid('okx', 'binance', 'bybit', 'huobi').default('okx'),
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).default('BTC/USDT')
  }),

  // OHLCV查询
  ohlcv: Joi.object({
    exchange: Joi.string().valid('okx', 'binance', 'bybit', 'huobi').default('okx'),
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).default('BTC/USDT'),
    timeframe: Joi.string().valid('1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w').default('1h'),
    limit: Joi.number().integer().min(1).max(1000).default(100)
  }),

  // OrderBook查询
  orderbook: Joi.object({
    exchange: Joi.string().valid('okx', 'binance', 'bybit', 'huobi').default('okx'),
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).default('BTC/USDT'),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  // 可用交易对查询
  availableSymbols: Joi.object({
    exchange: Joi.string().valid('okx', 'binance', 'bybit', 'huobi').default('okx'),
    quote: Joi.string().valid('USDT', 'USDC', 'BTC', 'ETH').default('USDT')
  })
};

// ========== 通用验证模式 ==========

const commonSchemas = {
  // 分页参数
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(1000).default(50)
  }),

  // ID参数
  id: Joi.object({
    id: Joi.number().integer().positive().required()
  }),

  // UUID参数
  uuid: Joi.object({
    id: Joi.string().uuid().required()
  }),

  // 日期范围
  dateRange: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
  }),

  // 交易对参数
  symbolParams: Joi.object({
    exchange: Joi.string().valid('okx', 'binance', 'bybit', 'huobi').default('okx'),
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).default('ETH/USDT')
  })
};

// ========== 导出 ==========

module.exports = {
  validate,
  
  // 验证模式
  schemas: {
    trading: tradingSchemas,
    ai: aiSchemas,
    backtest: backtestSchemas,
    database: databaseSchemas,
    priceAlert: priceAlertSchemas,
    mcp: mcpSchemas,
    marketData: marketDataSchemas,
    common: commonSchemas
  },

  // 便捷方法
  validateQuery: (schema) => validate(schema, 'query'),
  validateBody: (schema) => validate(schema, 'body'),
  validateParams: (schema) => validate(schema, 'params')
};

