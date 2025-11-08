/**
 * 参数校验与自动纠错服务
 * 为MCP工具调用提供参数验证和自动修正
 */

/**
 * 工具参数Schema定义
 */
const TOOL_SCHEMAS = {
  // CCXT工具
  ccxt: {
    fetchTicker: {
      exchange: { type: 'string', required: true, default: 'binance' },
      symbol: { type: 'string', required: true, pattern: /^[A-Z]+\/[A-Z]+$/ }
    },
    fetchOHLCV: {
      exchange: { type: 'string', required: true, default: 'binance' },
      symbol: { type: 'string', required: true, pattern: /^[A-Z]+\/[A-Z]+$/ },
      timeframe: { type: 'string', required: true, enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'], default: '1h' },
      limit: { type: 'number', required: false, min: 1, max: 1000, default: 100 }
    },
    fetchOrderBook: {
      exchange: { type: 'string', required: true, default: 'binance' },
      symbol: { type: 'string', required: true, pattern: /^[A-Z]+\/[A-Z]+$/ },
      limit: { type: 'number', required: false, min: 1, max: 100, default: 20 }
    },
    fetchTrades: {
      exchange: { type: 'string', required: true, default: 'binance' },
      symbol: { type: 'string', required: true, pattern: /^[A-Z]+\/[A-Z]+$/ },
      limit: { type: 'number', required: false, min: 1, max: 1000, default: 50 }
    }
  },

  // 技术指标工具
  indicators: {
    rsi: {
      symbol: { type: 'string', required: true, pattern: /^[A-Z]+\/[A-Z]+$/ },
      period: { type: 'number', required: false, min: 2, max: 100, default: 14 }
    },
    macd: {
      symbol: { type: 'string', required: true, pattern: /^[A-Z]+\/[A-Z]+$/ },
      fastPeriod: { type: 'number', required: false, min: 2, max: 100, default: 12 },
      slowPeriod: { type: 'number', required: false, min: 2, max: 100, default: 26 },
      signalPeriod: { type: 'number', required: false, min: 2, max: 100, default: 9 }
    },
    bollinger_bands: {
      symbol: { type: 'string', required: true, pattern: /^[A-Z]+\/[A-Z]+$/ },
      period: { type: 'number', required: false, min: 2, max: 100, default: 20 },
      stdDev: { type: 'number', required: false, min: 0.1, max: 5, default: 2 }
    }
  },

  // CoinGecko工具
  coingecko: {
    getCoinsMarkets: {
      vsCurrency: { type: 'string', required: false, default: 'usd' },
      order: { type: 'string', required: false, enum: ['market_cap_desc', 'volume_desc', 'id_asc'], default: 'market_cap_desc' },
      perPage: { type: 'number', required: false, min: 1, max: 250, default: 10 }
    },
    getCoinDetail: {
      coinId: { type: 'string', required: true }
    }
  },

  // AkTools工具
  aktools: {
    okx_prices: {
      instId: { type: 'string', required: true, pattern: /^[A-Z]+-[A-Z]+$/ },
      bar: { type: 'string', required: false, enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'], default: '1h' },
      limit: { type: 'number', required: false, min: 1, max: 300, default: 50 }
    },
    okx_loan_ratios: {
      symbol: { type: 'string', required: true },
      period: { type: 'string', required: false, enum: ['5m', '1h', '1d'], default: '1h' }
    },
    okx_taker_volume: {
      symbol: { type: 'string', required: true },
      period: { type: 'string', required: false, enum: ['5m', '1h', '1d'], default: '1h' },
      instType: { type: 'string', required: false, enum: ['SPOT', 'SWAP'], default: 'SPOT' }
    }
  }
};

/**
 * 验证参数
 */
function validateParams(toolId, methodName, params) {
  const schema = TOOL_SCHEMAS[toolId]?.[methodName];
  
  if (!schema) {
    // 没有定义schema，跳过验证
    return { valid: true, params, errors: [] };
  }

  const errors = [];
  const validatedParams = { ...params };

  // 验证每个字段
  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const value = params[fieldName];

    // 检查必填字段
    if (fieldSchema.required && (value === undefined || value === null || value === '')) {
      // 如果有默认值，使用默认值
      if (fieldSchema.default !== undefined) {
        validatedParams[fieldName] = fieldSchema.default;
      } else {
        errors.push({
          field: fieldName,
          error: 'required',
          message: `字段 ${fieldName} 是必填的`
        });
        continue;
      }
    }

    // 如果值为空且有默认值，使用默认值
    if ((value === undefined || value === null || value === '') && fieldSchema.default !== undefined) {
      validatedParams[fieldName] = fieldSchema.default;
      continue;
    }

    // 跳过空值的非必填字段
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // 类型检查
    if (fieldSchema.type === 'string' && typeof value !== 'string') {
      errors.push({
        field: fieldName,
        error: 'type',
        message: `字段 ${fieldName} 应该是字符串类型，实际是 ${typeof value}`
      });
      continue;
    }

    if (fieldSchema.type === 'number' && typeof value !== 'number') {
      // 尝试转换
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push({
          field: fieldName,
          error: 'type',
          message: `字段 ${fieldName} 应该是数字类型，无法转换 ${value}`
        });
        continue;
      }
      validatedParams[fieldName] = numValue;
    }

    // 枚举检查
    if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
      errors.push({
        field: fieldName,
        error: 'enum',
        message: `字段 ${fieldName} 的值 ${value} 不在允许的范围内: ${fieldSchema.enum.join(', ')}`
      });
    }

    // 正则检查
    if (fieldSchema.pattern && typeof value === 'string' && !fieldSchema.pattern.test(value)) {
      errors.push({
        field: fieldName,
        error: 'pattern',
        message: `字段 ${fieldName} 的值 ${value} 不符合格式要求`
      });
    }

    // 数值范围检查
    if (fieldSchema.type === 'number') {
      const numValue = validatedParams[fieldName];
      if (fieldSchema.min !== undefined && numValue < fieldSchema.min) {
        errors.push({
          field: fieldName,
          error: 'min',
          message: `字段 ${fieldName} 的值 ${numValue} 小于最小值 ${fieldSchema.min}`
        });
      }
      if (fieldSchema.max !== undefined && numValue > fieldSchema.max) {
        errors.push({
          field: fieldName,
          error: 'max',
          message: `字段 ${fieldName} 的值 ${numValue} 大于最大值 ${fieldSchema.max}`
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    params: validatedParams,
    errors
  };
}

/**
 * 自动修正参数
 */
function autoFixParams(toolId, methodName, params) {
  const fixedParams = { ...params };
  let fixed = false;

  // Symbol格式修正
  if (fixedParams.symbol && typeof fixedParams.symbol === 'string') {
    const original = fixedParams.symbol;
    
    // btc -> BTC/USDT
    if (!/\//.test(fixedParams.symbol)) {
      fixedParams.symbol = `${fixedParams.symbol.toUpperCase()}/USDT`;
      fixed = true;
    }
    
    // btc/usdt -> BTC/USDT
    if (fixedParams.symbol !== fixedParams.symbol.toUpperCase()) {
      fixedParams.symbol = fixedParams.symbol.toUpperCase();
      fixed = true;
    }

    if (fixed) {
      console.log(`🔧 自动修正 symbol: ${original} -> ${fixedParams.symbol}`);
    }
  }

  // instId格式修正 (用于OKX)
  if (fixedParams.instId && typeof fixedParams.instId === 'string') {
    const original = fixedParams.instId;
    
    // BTC/USDT -> BTC-USDT
    if (fixedParams.instId.includes('/')) {
      fixedParams.instId = fixedParams.instId.replace('/', '-');
      fixed = true;
    }
    
    // btc-usdt -> BTC-USDT
    if (fixedParams.instId !== fixedParams.instId.toUpperCase()) {
      fixedParams.instId = fixedParams.instId.toUpperCase();
      fixed = true;
    }

    if (fixed) {
      console.log(`🔧 自动修正 instId: ${original} -> ${fixedParams.instId}`);
    }
  }

  // coinId格式修正 (用于CoinGecko)
  if (fixedParams.coinId && typeof fixedParams.coinId === 'string') {
    const original = fixedParams.coinId;
    
    // 常见币种映射
    const coinIdMap = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      'SOL': 'solana',
      'ADA': 'cardano',
      'XRP': 'ripple',
      'DOT': 'polkadot',
      'DOGE': 'dogecoin',
      'AVAX': 'avalanche-2',
      'MATIC': 'matic-network'
    };

    const upperCoinId = fixedParams.coinId.toUpperCase();
    if (coinIdMap[upperCoinId]) {
      fixedParams.coinId = coinIdMap[upperCoinId];
      fixed = true;
      console.log(`🔧 自动修正 coinId: ${original} -> ${fixedParams.coinId}`);
    } else if (fixedParams.coinId !== fixedParams.coinId.toLowerCase()) {
      fixedParams.coinId = fixedParams.coinId.toLowerCase();
      fixed = true;
      console.log(`🔧 自动修正 coinId: ${original} -> ${fixedParams.coinId}`);
    }
  }

  return { params: fixedParams, fixed };
}

/**
 * 验证并修正参数（组合函数）
 */
function validateAndFix(toolId, methodName, params) {
  // 1. 先尝试自动修正
  const { params: fixedParams, fixed } = autoFixParams(toolId, methodName, params);

  // 2. 验证修正后的参数
  const validation = validateParams(toolId, methodName, fixedParams);

  return {
    ...validation,
    autoFixed: fixed,
    originalParams: params
  };
}

module.exports = {
  validateParams,
  autoFixParams,
  validateAndFix,
  TOOL_SCHEMAS
};

