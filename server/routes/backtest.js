const express = require('express');
const router = express.Router();

let backtestEngine = null;
const backtestMemoryService = require('../services/backtestMemoryService');

function getBacktestEngineInstance() {
  if (!backtestEngine) {
    try {
      const { getBacktestEngine } = require('../services/backtestEngine');
      backtestEngine = getBacktestEngine();
    } catch (error) {
      console.error('初始化回测引擎失败:', error.message);
      return null;
    }
  }
  return backtestEngine;
}

// 运行单个回测
router.post('/run', async (req, res) => {
  try {
    const engine = getBacktestEngineInstance();
    if (!engine) {
      return res.status(503).json({ success: false, error: '回测引擎不可用' });
    }
    const result = await engine.runBacktest(req.body);

    // ⏺️ 持久化到记忆面板（如提供 contextId）
    const { contextId = null } = req.body || {};
    try {
      if (contextId !== undefined && contextId !== null) {
        backtestMemoryService.saveResult(
          contextId,
          result.symbol || req.body.symbol,
          result.strategyName || req.body.strategyName,
          req.body,
          result
        );
      }
    } catch (e) {
      console.warn('⚠️ 回测结果保存失败（忽略）:', e.message);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// 批量回测
router.post('/run-batch', async (req, res) => {
  try {
    const engine = getBacktestEngineInstance();
    if (!engine) {
      return res.status(503).json({ success: false, error: '回测引擎不可用' });
    }
    const { configs, contextId = null } = req.body;
    const results = await engine.runBatchBacktest(configs);

    // ⏺️ 批量保存
    try {
      if (Array.isArray(results) && (contextId !== undefined && contextId !== null)) {
        results.forEach((r, idx) => {
          if (r && !r.error) {
            const cfg = Array.isArray(configs) ? configs[idx] : {};
            backtestMemoryService.saveResult(
              contextId,
              r.symbol || cfg.symbol,
              r.strategyName || cfg.strategyName,
              cfg,
              r
            );
          }
        });
      }
    } catch (e) {
      console.warn('⚠️ 批量回测结果保存失败（忽略）:', e.message);
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// 获取所有策略
router.get('/strategies', (req, res) => {
  try {
    const engine = getBacktestEngineInstance();
    if (!engine) {
      return res.status(503).json({ success: false, error: '回测引擎不可用' });
    }
    const strategies = Array.from(engine.strategies.keys());
    res.json({
      success: true,
      data: strategies
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取所有回测结果
router.get('/results', (req, res) => {
  try {
    const engine = getBacktestEngineInstance();
    if (!engine) {
      return res.status(503).json({ success: false, error: '回测引擎不可用' });
    }
    const results = engine.getAllResults();
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

// 比较策略
router.post('/compare', (req, res) => {
  try {
    const engine = getBacktestEngineInstance();
    if (!engine) {
      return res.status(503).json({ success: false, error: '回测引擎不可用' });
    }
    const { resultIds } = req.body;
    const comparison = engine.compareStrategies(resultIds);
    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// 清理旧结果
router.delete('/cleanup', (req, res) => {
  try {
    const engine = getBacktestEngineInstance();
    if (!engine) {
      return res.status(503).json({ success: false, error: '回测引擎不可用' });
    }
    const { daysToKeep = 7 } = req.body;
    engine.cleanupOldResults(daysToKeep);
    res.json({
      success: true,
      message: '清理完成'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;