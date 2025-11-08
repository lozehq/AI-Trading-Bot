/**
 * 监控数据API路由
 * 提供增强的仓位监控、资金管理、执行质量等监控数据访问
 */

const express = require('express');
const router = express.Router();
const monitoringService = require('../services/MonitoringService');
const ExecutionService = require('../database/services/ExecutionService');

/**
 * 获取完整的监控状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = await monitoringService.refreshAllStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('获取监控状态失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取增强的监控摘要
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = monitoringService.getSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('获取监控摘要失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取增强的监控数据（包含新监控服务）
 */
router.get('/enhanced-summary', async (req, res) => {
  try {
    const enhancedSummary = monitoringService.getEnhancedSummary();
    res.json({ success: true, data: enhancedSummary });
  } catch (error) {
    console.error('获取增强监控摘要失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取最近的事件日志
 */
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const logs = monitoringService.getRecentLogs(limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('获取监控日志失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 清除日志
 */
router.post('/logs/clear', async (req, res) => {
  try {
    monitoringService.clearLogs();
    res.json({ success: true, message: '监控日志已清除' });
  } catch (error) {
    console.error('清除监控日志失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取实时仓位监控数据
 */
router.get('/positions/enhanced', async (req, res) => {
  try {
    const enhancedPositions = monitoringService.state.enhancedPositionStatus;
    res.json({ success: true, data: enhancedPositions });
  } catch (error) {
    console.error('获取增强仓位监控数据失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取资金管理监控数据
 */
router.get('/fund-management', async (req, res) => {
  try {
    const fundManagementStatus = monitoringService.state.fundManagementStatus;
    res.json({ success: true, data: fundManagementStatus });
  } catch (error) {
    console.error('获取资金管理监控数据失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取执行质量监控数据
 */
router.get('/execution-quality', async (req, res) => {
  try {
    const executionQualityStatus = monitoringService.state.executionQualityStatus;
    res.json({ success: true, data: executionQualityStatus });
  } catch (error) {
    console.error('获取执行质量监控数据失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取账户状态聚合数据
 */
router.get('/account-state', async (req, res) => {
  try {
    const accountStateStatus = monitoringService.state.accountStateStatus;
    res.json({ success: true, data: accountStateStatus });
  } catch (error) {
    console.error('获取账户状态聚合数据失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取最近执行明细（可按symbol过滤）
 */
router.get('/executions', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
    const symbol = req.query.symbol;
    let rows = ExecutionService.getRecent(limit);
    if (symbol) rows = rows.filter(r => r.symbol === symbol);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取模型叙述历史（nof1.ai 风格）
 */
router.get('/narrative-history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = monitoringService.getNarrativeHistory(limit);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('获取叙述历史失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;