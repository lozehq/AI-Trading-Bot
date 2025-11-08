/**
 * AI记忆路由 - 查看历史分析记录
 */

const express = require('express');
const router = express.Router();
const aiMemoryService = require('../services/aiMemoryService');

/**
 * GET /api/ai-memory/history/:symbol
 * 获取指定交易对的历史分析记录
 */
router.get('/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const analyses = await aiMemoryService.getRecentAnalyses(symbol, limit);

    res.json({
      success: true,
      data: {
        symbol,
        count: analyses.length,
        analyses
      }
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-memory/accuracy/:symbol
 * 获取历史预测准确率
 */
router.get('/accuracy/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const accuracy = await aiMemoryService.analyzeHistoricalAccuracy(symbol, limit);

    res.json({
      success: true,
      data: accuracy
    });
  } catch (error) {
    console.error('分析准确率失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-memory/stats/:symbol
 * 获取交易统计
 */
router.get('/stats/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const stats = await aiMemoryService.getTradingStats(symbol);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-memory/detail/:id
 * 获取单条分析详情
 */
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await aiMemoryService.getAnalysisById(id);
    if (!detail) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/ai-memory/clean/:symbol
 * 清理旧记录
 */
router.delete('/clean/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const keepCount = parseInt(req.query.keep) || 50;

    await aiMemoryService.cleanOldRecords(symbol, keepCount);

    res.json({
      success: true,
      message: `已清理 ${symbol} 的旧记录，保留最近 ${keepCount} 条`
    });
  } catch (error) {
    console.error('清理记录失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

