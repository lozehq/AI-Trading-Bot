/**
 * 高级市场数据API路由
 * USDT溢价率、做市商深度、隐含波动率、跨交易所套利
 */

const express = require('express');
const router = express.Router();
const advancedMarketDataService = require('../services/AdvancedMarketDataService');

/**
 * GET /api/advanced-market/usdt-premium
 * 获取USDT溢价率
 */
router.get('/usdt-premium', async (req, res) => {
  try {
    const data = await advancedMarketDataService.getUSDTPremium();
    
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
 * GET /api/advanced-market/market-maker-depth
 * 获取做市商深度分析
 */
router.get('/market-maker-depth', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'BTC/USDT';
    const exchange = req.query.exchange || 'okx';
    
    const data = await advancedMarketDataService.getMarketMakerDepth(symbol, exchange);
    
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
 * GET /api/advanced-market/implied-volatility
 * 获取隐含波动率
 */
router.get('/implied-volatility', async (req, res) => {
  try {
    const asset = req.query.asset || 'BTC';
    
    const data = await advancedMarketDataService.getImpliedVolatility(asset);
    
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
 * GET /api/advanced-market/cross-exchange-arbitrage
 * 获取跨交易所套利机会
 */
router.get('/cross-exchange-arbitrage', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'BTC/USDT';
    
    const data = await advancedMarketDataService.getCrossExchangeArbitrage(symbol);
    
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
 * GET /api/advanced-market/all
 * 获取所有高级市场数据
 */
router.get('/all', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'BTC/USDT';
    const asset = req.query.asset || 'BTC';
    
    const data = await advancedMarketDataService.getAllAdvancedData(symbol, asset);
    
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

module.exports = router;
