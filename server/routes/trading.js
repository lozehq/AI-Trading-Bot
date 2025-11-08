const express = require('express');
const router = express.Router();
const getTradingEngine = require('../services/tradingEngineInstance');
const { validateQuery, validateBody, schemas } = require('../validators'); // ✅ 添加输入验证

const tradingEngine = getTradingEngine();

/**
 * GET /api/trading/strategy-signal
 * 获取交易策略信号
 */
router.get('/strategy-signal',
  validateQuery(schemas.trading.strategySignal), // ✅ 添加输入验证
  async (req, res) => {
    try {
      const { exchange, symbol, timeframe } = req.query;

      const signal = await tradingEngine.getStrategySignal(exchange, symbol, timeframe);

      res.json({
        success: true,
        data: signal
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/trading/positions
 * 获取当前持仓
 */
router.get('/positions', async (req, res) => {
  try {
    const positions = tradingEngine.getPositions();
    
    res.json({
      success: true,
      data: positions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/trading/history
 * 获取交易历史
 */
router.get('/history',
  validateQuery(schemas.trading.history), // ✅ 添加输入验证
  async (req, res) => {
    try {
      const { limit } = req.query;
      const history = tradingEngine.getTradeHistory(limit);

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * GET /api/trading/performance
 * 获取交易表现统计
 */
router.get('/performance', async (req, res) => {
  try {
    const performance = tradingEngine.getPerformanceStats();
    
    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/trading/execute
 * 执行交易（手动）
 */
router.post('/execute', validateBody(schemas.trading.executeTrade), async (req, res) => {
  try {
    const { signal, symbol, amount } = req.body;

    const result = await tradingEngine.executeTrade(signal, symbol, amount);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/trading/auto/start
 * 启动自动交易
 */
router.post('/auto/start', validateBody(schemas.trading.autoStart), async (req, res) => {
  try {
    const { config } = req.body;
    tradingEngine.startAutoTrading(config);

    // 统一开关：同时设置运行时策略为已启用
    try {
      const runtimeStrategy = require('../services/runtimeStrategy');
      runtimeStrategy.updateConfig({ autoTradeEnabled: true });
    } catch (_) {}

    res.json({
      success: true,
      message: '自动交易已启动'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/trading/auto/stop
 * 停止自动交易
 */
router.post('/auto/stop', async (req, res) => {
  try {
    tradingEngine.stopAutoTrading();

    // 统一开关：同时关闭运行时策略中的自动交易
    try {
      const runtimeStrategy = require('../services/runtimeStrategy');
      runtimeStrategy.updateConfig({ autoTradeEnabled: false });
    } catch (_) {}

    res.json({
      success: true,
      message: '自动交易已停止'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

