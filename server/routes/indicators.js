const express = require('express');
const router = express.Router();
const dataSourceManager = require('../services/dataSourceManager'); // 使用统一数据源管理器

const DEFAULT_EXCHANGE = process.env.EXCHANGE_NAME || 'okx';
const DEFAULT_SYMBOL = process.env.DEFAULT_SYMBOL || 'BTC/USDT';

/**
 * GET /api/indicators/all
 * 获取所有技术指标
 */
router.get('/all', async (req, res) => {
  try {
    const {
      exchange = DEFAULT_EXCHANGE,
      symbol = DEFAULT_SYMBOL,
      timeframe = '1h'
    } = req.query;

    console.log(`📊 [API] 获取所有指标: ${symbol} (${exchange}, ${timeframe})`);

    // 使用完整的OKX数据服务获取所有技术指标（加入超时保护与降级）
    const okxDataService = require('../services/okxDataService');
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时，请稍后重试')), 25000));
    let indicators = {};
    try {
      indicators = await Promise.race([
        okxDataService.getAllIndicators(symbol, timeframe),
        timeoutPromise
      ]);
    } catch (e) {
      console.warn(`⚠️ [API] 指标超时/失败: ${e.message}，降级为空集合`);
      indicators = { __degraded: true };
    }

    // 统计返回的指标数量
    const indicatorCount = Object.keys(indicators || {}).length;
    console.log(`✅ [API] 完整指标获取成功: ${symbol}, 共 ${indicatorCount} 个指标组`);

    res.json({
      success: true,
      data: indicators
    });
  } catch (error) {
    console.error('❌ [API] 指标获取失败:', error.message);

    // 最外层异常：依然做软降级，避免前端500
    res.json({ success: true, data: { __degraded: true, __error: error.message } });
  }
});

/**
 * GET /api/indicators/rsi
 * 获取RSI指标
 */
router.get('/rsi', async (req, res) => {
  try {
    const {
      exchange = DEFAULT_EXCHANGE,
      symbol = DEFAULT_SYMBOL,
      timeframe = '1h',
      period = 14
    } = req.query;
    
    const ohlcv = await dataSourceManager.getOHLCV(exchange, symbol, timeframe, 100);
    const closePrices = ohlcv.map(c => c.close);
    const mcpService = require('../services/mcpService');
    const rsi = mcpService.calculateRSI(closePrices, parseInt(period));
    
    res.json({
      success: true,
      data: { rsi, period: parseInt(period) }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/indicators/macd
 * 获取MACD指标
 */
router.get('/macd', async (req, res) => {
  try {
    const {
      exchange = DEFAULT_EXCHANGE,
      symbol = DEFAULT_SYMBOL,
      timeframe = '1h'
    } = req.query;
    
    const ohlcv = await dataSourceManager.getOHLCV(exchange, symbol, timeframe, 100);
    const closePrices = ohlcv.map(c => c.close);
    const mcpService = require('../services/mcpService');
    const macd = mcpService.calculateMACD(closePrices);
    
    res.json({
      success: true,
      data: macd
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/indicators/bollinger
 * 获取布林带指标
 */
router.get('/bollinger', async (req, res) => {
  try {
    const {
      exchange = DEFAULT_EXCHANGE,
      symbol = DEFAULT_SYMBOL,
      timeframe = '1h',
      period = 20,
      stdDev = 2
    } = req.query;
    
    const ohlcv = await dataSourceManager.getOHLCV(exchange, symbol, timeframe, 100);
    const closePrices = ohlcv.map(c => c.close);
    const mcpService = require('../services/mcpService');
    const bollinger = mcpService.calculateBollingerBands(
      closePrices,
      parseInt(period),
      parseFloat(stdDev)
    );
    
    res.json({
      success: true,
      data: bollinger
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

