const express = require('express');
const router = express.Router();
const performanceMonitor = require('../services/performanceMonitor');
const { getAllCacheStats } = require('../utils/cache');

/**
 * GET /api/performance/summary
 * Get performance summary
 */
router.get('/summary', (req, res) => {
  try {
    const summary = performanceMonitor.getSummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/detailed
 * Get detailed performance report
 */
router.get('/detailed', (req, res) => {
  try {
    const report = performanceMonitor.getDetailedReport();
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/performance/cache
 * Get cache statistics
 */
router.get('/cache', (req, res) => {
  try {
    const cacheStats = getAllCacheStats();
    res.json({
      success: true,
      data: cacheStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/performance/reset
 * Reset performance metrics
 */
router.post('/reset', (req, res) => {
  try {
    performanceMonitor.reset();
    res.json({
      success: true,
      message: 'Performance metrics reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
