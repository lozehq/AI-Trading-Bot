const express = require('express');
const router = express.Router();
const mcpClient = require('../services/mcpClient');
const mcpLogger = require('../services/mcpLogger');
const dataSourceManager = require('../services/dataSourceManager');

const DEFAULT_EXCHANGE = process.env.EXCHANGE_NAME || 'binance';

/**
 * 扩展的技术指标API - 支持crypto-indicators-mcp的所有30+个指标
 */

// 指标列表
const AVAILABLE_INDICATORS = {
  // 趋势指标
  'aroon': 'calculate_aroon',
  'parabolic-sar': 'calculate_parabolic_sar',
  'ichimoku': 'calculate_ichimoku_cloud',
  
  // 动量指标
  'rsi': 'calculate_relative_strength_index',
  'kdj': 'calculate_kdj',
  'williams-r': 'calculate_williams_r',
  'stochastic': 'calculate_stochastic_oscillator',
  'cci': 'calculate_commodity_channel_index',
  'roc': 'calculate_price_rate_of_change',
  
  // 移动平均
  'sma': 'calculate_simple_moving_average',
  'ema': 'calculate_exponential_moving_average',
  'dema': 'calculate_double_exponential_moving_average',
  'tema': 'calculate_triple_exponential_moving_average',
  'rma': 'calculate_rolling_moving_average',
  'vwma': 'calculate_volume_weighted_moving_average',
  
  // 波动性指标
  'bollinger-bands': 'calculate_bollinger_bands',
  'atr': 'calculate_average_true_range',
  'mass-index': 'calculate_mass_index',
  
  // 其他指标
  'typical-price': 'calculate_typical_price',
  'vortex': 'calculate_vortex',
  'awesome': 'calculate_awesome_oscillator',
  'chaikin': 'calculate_chaikin_oscillator'
};

/**
 * GET /api/indicators-extended/list
 * 获取所有可用指标列表
 */
router.get('/list', (req, res) => {
  const indicators = Object.keys(AVAILABLE_INDICATORS).map(key => ({
    id: key,
    function: AVAILABLE_INDICATORS[key],
    category: getCategoryByKey(key)
  }));
  
  res.json({
    success: true,
    data: {
      indicators,
      total: indicators.length
    }
  });
});

/**
 * GET /api/indicators-extended/:indicator
 * 调用特定技术指标
 */
router.get('/:indicator', async (req, res) => {
  try {
    const { indicator } = req.params;
    const {
      symbol = 'ETH/USDT',
      timeframe = '1h',
      period = 14,
      limit = 100
    } = req.query;
    
    const functionName = AVAILABLE_INDICATORS[indicator];
    if (!functionName) {
      return res.status(404).json({
        success: false,
        error: `未知指标: ${indicator}`,
        available: Object.keys(AVAILABLE_INDICATORS)
      });
    }

    mcpLogger.info('crypto-indicators-mcp', `调用${functionName} for ${symbol}`);

    // 检查当前数据源
    const currentSource = dataSourceManager.getCurrentSource();
    let result;

    if (currentSource === 'mcp') {
      // MCP模式：调用MCP工具
      result = await mcpClient.sendMCPRequest(
        'crypto-indicators-mcp',
        functionName,
        {
          symbol,
          timeframe,
          period: parseInt(period),
          limit: parseInt(limit)
        }
      );
    } else {
      // CCXT模式：从getAllIndicators中提取
      const allIndicators = await dataSourceManager.getAllIndicators(
        exchange,
        symbol,
        timeframe
      );

      // 根据指标名称提取对应数据
      result = extractIndicatorFromAll(indicator, allIndicators);

      if (!result) {
        throw new Error(`CCXT模式下暂不支持指标: ${indicator}`);
      }
    }

    mcpLogger.success('crypto-indicators-mcp', `✓ ${indicator}计算完成`);

    res.json({
      success: true,
      data: {
        indicator,
        function: functionName,
        symbol,
        timeframe,
        result
      }
    });
  } catch (error) {
    mcpLogger.error('crypto-indicators-mcp', `指标计算失败: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/indicators-extended/batch
 * 批量计算多个指标（并行优化版本）
 */
router.post('/batch', async (req, res) => {
  try {
    const { indicators, symbol = 'ETH/USDT', timeframe = '1h' } = req.body;

    if (!indicators || !Array.isArray(indicators)) {
      return res.status(400).json({
        success: false,
        error: '请提供指标数组'
      });
    }

    mcpLogger.info('crypto-indicators-mcp', `批量计算${indicators.length}个指标 for ${symbol}`);

    // ✅ 性能优化：使用 Promise.all 并行执行
    const startTime = Date.now();
    const promises = indicators.map(indicator => {
      const functionName = AVAILABLE_INDICATORS[indicator];
      if (!functionName) {
        return Promise.resolve({ indicator, error: '未知指标' });
      }

      return mcpClient.sendMCPRequest(
        'crypto-indicators-mcp',
        functionName,
        { symbol, timeframe, limit: 100 }
      )
        .then(result => ({ indicator, result }))
        .catch(error => ({ indicator, error: error.message }));
    });

    const resultsArray = await Promise.all(promises);

    // 转换为对象格式
    const results = {};
    resultsArray.forEach(({ indicator, result, error }) => {
      results[indicator] = error ? { error } : result;
    });

    const duration = Date.now() - startTime;
    mcpLogger.success('crypto-indicators-mcp', `✓ 批量计算完成 (${duration}ms, 并行执行)`);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

function getCategoryByKey(key) {
  if (['aroon', 'parabolic-sar', 'ichimoku'].includes(key)) return '趋势指标';
  if (['rsi', 'kdj', 'williams-r', 'stochastic', 'cci', 'roc'].includes(key)) return '动量指标';
  if (['sma', 'ema', 'dema', 'tema', 'rma', 'vwma'].includes(key)) return '移动平均';
  if (['bollinger-bands', 'atr', 'mass-index'].includes(key)) return '波动性指标';
  return '其他指标';
}

/**
 * 从完整指标中提取特定指标
 */
function extractIndicatorFromAll(indicatorName, allIndicators) {
  const mapping = {
    'aroon': 'aroon',
    'parabolic-sar': 'parabolicSAR',
    'ichimoku': 'ichimoku',
    'rsi': 'rsi',
    'kdj': 'kdj',
    'williams-r': 'williamsR',
    'stochastic': 'stochastic',
    'cci': 'cci',
    'roc': 'roc',
    'sma': 'sma',
    'ema': 'ema',
    'dema': 'dema',
    'tema': 'tema',
    'rma': 'rma',
    'vwma': 'vwma',
    'bollinger-bands': 'bollingerBands',
    'atr': 'atr',
    'mass-index': 'massIndex',
    'typical-price': 'typicalPrice',
    'vortex': 'vortex',
    'awesome': 'awesomeOscillator',
    'chaikin': 'chaikinOscillator'
  };

  const key = mapping[indicatorName];
  return key ? allIndicators[key] : null;
}

module.exports = router;

