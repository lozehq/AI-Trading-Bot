/**
 * 请求统计路由
 * 提供请求去重统计信息
 */

const express = require('express');
const router = express.Router();
const { globalDeduplicator } = require('../utils/requestDeduplicator');

/**
 * GET /api/request-stats
 * 获取请求去重统计信息
 */
router.get('/', (req, res) => {
  try {
    const stats = globalDeduplicator.getStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        message: `请求合并率: ${stats.mergeRate}，节省了 ${stats.mergedRequests} 次API调用`
      }
    });
  } catch (error) {
    console.error('❌ [请求统计] 获取失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/request-stats/reset
 * 重置统计信息
 */
router.post('/reset', (req, res) => {
  try {
    globalDeduplicator.resetStats();
    
    res.json({
      success: true,
      message: '统计信息已重置'
    });
  } catch (error) {
    console.error('❌ [请求统计] 重置失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/request-stats/active
 * 获取当前活跃请求数
 */
router.get('/active', (req, res) => {
  try {
    const activeCount = globalDeduplicator.getActiveCount();
    
    res.json({
      success: true,
      data: {
        activeRequests: activeCount,
        message: activeCount > 0 
          ? `当前有 ${activeCount} 个请求正在处理中` 
          : '当前无活跃请求'
      }
    });
  } catch (error) {
    console.error('❌ [请求统计] 获取活跃请求失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
