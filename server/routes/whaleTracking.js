/**
 * 巨鲸监控API路由
 */

const express = require('express');
const router = express.Router();
const whaleTrackingService = require('../services/WhaleTrackingService');

/**
 * GET /api/whale-tracking/transactions
 * 获取最近的巨鲸交易
 */
router.get('/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const transactions = await whaleTrackingService.getWhaleAlertTransactions(limit);
    
    res.json({
      success: true,
      data: transactions,
      count: transactions.length,
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
 * GET /api/whale-tracking/netflow
 * 获取交易所净流量
 */
router.get('/netflow', async (req, res) => {
  try {
    const asset = req.query.asset || 'BTC';
    const period = req.query.period || '24h';
    
    const netFlow = await whaleTrackingService.getExchangeNetFlow(asset, period);
    
    res.json({
      success: true,
      data: netFlow,
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
 * GET /api/whale-tracking/report
 * 获取完整巨鲸监控报告
 */
router.get('/report', async (req, res) => {
  try {
    const asset = req.query.asset || 'BTC';
    const report = await whaleTrackingService.getWhaleReport(asset);
    
    res.json({
      success: true,
      data: report,
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
 * GET /api/whale-tracking/top-holders
 * 获取持仓前100地址
 */
router.get('/top-holders', async (req, res) => {
  try {
    const asset = req.query.asset || 'BTC';
    const limit = parseInt(req.query.limit) || 100;
    
    const holders = await whaleTrackingService.getTopHolders(asset, limit);
    
    res.json({
      success: true,
      data: holders,
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
 * POST /api/whale-tracking/start-monitoring
 * 启动实时监控
 */
router.post('/start-monitoring', async (req, res) => {
  try {
    const interval = parseInt(req.body.interval) || 60000; // 默认1分钟
    
    whaleTrackingService.startMonitoring(interval);
    
    res.json({
      success: true,
      message: 'Whale tracking monitoring started',
      interval: interval
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/whale-tracking/stop-monitoring
 * 停止实时监控
 */
router.post('/stop-monitoring', async (req, res) => {
  try {
    whaleTrackingService.stopMonitoring();
    
    res.json({
      success: true,
      message: 'Whale tracking monitoring stopped'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
