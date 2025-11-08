/**
 * OKX数据API路由
 * 提供完整的市场数据和技术指标接口
 */

const express = require('express');
const { ApiResponse } = require('../utils/response');
const router = express.Router();
const okxDataService = require('../services/okxDataService');

/**
 * GET /api/okx/ticker/:symbol
 * 获取实时价格
 * 示例: /api/okx/ticker/BTC/USDT
 */
router.get('/ticker/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const data = await okxDataService.getTicker(symbol);
    
    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/okx/ohlcv/:symbol
 * 获取K线数据
 * 参数: timeframe (1m, 5m, 15m, 1h, 4h, 1d), limit (默认100)
 * 示例: /api/okx/ohlcv/BTC/USDT?timeframe=1h&limit=100
 */
router.get('/ohlcv/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const timeframe = req.query.timeframe || '1h';
    const limit = parseInt(req.query.limit) || 100;
    
    const data = await okxDataService.getOHLCV(symbol, timeframe, limit);
    
    res.json({
      success: true,
      data,
      count: data.length,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/okx/orderbook/:symbol
 * 获取订单簿
 * 参数: limit (默认20)
 * 示例: /api/okx/orderbook/BTC/USDT?limit=20
 */
router.get('/orderbook/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const limit = parseInt(req.query.limit) || 20;
    
    const data = await okxDataService.getOrderBook(symbol, limit);
    
    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/okx/trades/:symbol
 * 获取最近成交记录
 * 参数: limit (默认50)
 * 示例: /api/okx/trades/BTC/USDT?limit=50
 */
router.get('/trades/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const limit = parseInt(req.query.limit) || 50;
    
    const data = await okxDataService.getTrades(symbol, limit);
    
    res.json({
      success: true,
      data,
      count: data.length,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/okx/markets
 * 获取所有交易对列表
 * 示例: /api/okx/markets
 */
router.get('/markets', async (req, res) => {
  try {
    const data = await okxDataService.getMarkets();
    
    res.json({
      success: true,
      data,
      count: data.length,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/okx/tickers
 * 批量获取多个交易对价格
 * 参数: symbols (逗号分隔)
 * 示例: /api/okx/tickers?symbols=BTC/USDT,ETH/USDT,BNB/USDT
 */
router.get('/tickers', async (req, res) => {
  try {
    const symbols = req.query.symbols 
      ? req.query.symbols.split(',').map(s => s.trim())
      : ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'];
    
    const data = await okxDataService.getTickers(symbols);
    
    res.json({
      success: true,
      data,
      count: Object.keys(data).length,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/okx/indicators/:symbol
 * 获取所有技术指标
 * 参数: timeframe (默认1h)
 * 示例: /api/okx/indicators/BTC/USDT?timeframe=1h
 */
router.get('/indicators/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const timeframe = req.query.timeframe || '1h';
    
    const data = await okxDataService.getAllIndicators(symbol, timeframe);
    
    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/okx/complete/:symbol
 * 获取完整市场数据（一次性获取所有数据）
 * 参数: timeframe (默认1h)
 * 示例: /api/okx/complete/BTC/USDT?timeframe=1h
 */
router.get('/complete/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const timeframe = req.query.timeframe || '1h';
    
    const data = await okxDataService.getCompleteMarketData(symbol, timeframe);
    
    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/okx/test
 * 测试接口 - 获取BTC/USDT的完整数据
 */
router.get('/test', async (req, res) => {
  try {
    console.log('\n🧪 [测试] 开始获取OKX完整数据...\n');
    
    const data = await okxDataService.getCompleteMarketData('BTC/USDT', '1h');
    
    console.log('\n✅ [测试] 数据获取成功！');
    console.log(`📊 价格: $${data.summary.price}`);
    console.log(`📈 24h涨跌: ${data.summary.change24h}%`);
    console.log(`📊 RSI: ${data.summary.rsi.toFixed(2)}`);
    console.log(`📊 趋势: ${data.summary.trend}\n`);
    
    res.json({
      success: true,
      message: '测试成功！',
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('\n❌ [测试] 失败:', error.message, '\n');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

