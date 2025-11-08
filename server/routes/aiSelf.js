const express = require('express');
const router = express.Router();

const runtimeStrategy = require('../services/runtimeStrategy');
const aiMemoryService = require('../services/aiMemoryService');
const priceAlertService = require('../services/priceAlertServiceV2');

// GET /api/ai/self/status?symbol=ETH/USDT&contextId=123
router.get('/status', async (req, res) => {
  try {
    const symbol = req.query.symbol || null;
    const contextId = req.query.contextId ? Number(req.query.contextId) : null;

    const tradingMode = (process.env.TRADING_MODE || 'paper').toLowerCase();
    const okxSim = process.env.OKX_SIMULATED === 'true';

    // 数据源
    let dataSource = 'unknown';
    try {
      const dataSourceManager = require('../services/dataSourceManager');
      if (dataSourceManager && typeof dataSourceManager.getCurrentSource === 'function') {
        dataSource = dataSourceManager.getCurrentSource();
      }
    } catch (_) {}

    // 历史与准确率
    let historyStats = null;
    if (symbol) {
      try {
        const acc = await aiMemoryService.analyzeHistoricalAccuracy(symbol, 50, contextId);
        historyStats = acc;
      } catch (_) {}
    }

    // 预警统计
    const alertStats = priceAlertService.getStats(symbol, contextId);

    // 运行时策略
    const strategy = runtimeStrategy.getConfig();

    res.json({
      success: true,
      data: {
        env: {
          tradingMode,
          okxSimulated: okxSim,
          dataSource
        },
        runtimeStrategy: strategy,
        alerts: alertStats,
        history: historyStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;


