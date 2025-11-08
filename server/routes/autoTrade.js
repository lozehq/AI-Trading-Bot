const express = require('express');
const router = express.Router();
const okxAlgoOrder = require('../services/exchange/OkxAlgoOrderService');
const riskControl = require('../services/RiskControl');
const positionSyncer = require('../services/PositionSyncer');
const orderMonitor = require('../services/OrderMonitor');
const monitoringService = require('../services/MonitoringService');
const { validateBody, validateQuery } = require('../validators');
const Joi = require('joi');
const { getConfig, setConfig } = require('../database/database');

// 策略委托下单
router.post('/algo-order', validateBody(
  Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    side: Joi.string().valid('buy', 'sell', 'BUY', 'SELL').required(),
    orderType: Joi.string().valid('conditional', 'oco', 'trigger', 'move_order_stop').required(),
    triggerPrice: Joi.number().positive().required(),
    amount: Joi.number().positive().required(),
    orderPrice: Joi.number().positive().optional(),
    mode: Joi.string().valid('paper', 'demo', 'live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxAlgoOrder.createAlgoOrder(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 创建止盈止损单
router.post('/stop-limit', validateBody(
  Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    side: Joi.string().valid('buy', 'sell', 'BUY', 'SELL').required(),
    amount: Joi.number().positive().required(),
    stopLossPrice: Joi.number().positive().optional(),
    takeProfitPrice: Joi.number().positive().optional(),
    mode: Joi.string().valid('paper', 'demo', 'live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxAlgoOrder.createStopLossAndTakeProfit(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 创建追踪止损
router.post('/trailing-stop', validateBody(
  Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    side: Joi.string().valid('buy', 'sell', 'BUY', 'SELL').required(),
    amount: Joi.number().positive().required(),
    callbackRatio: Joi.number().positive().required(),
    activationPrice: Joi.number().positive().optional(),
    mode: Joi.string().valid('paper', 'demo', 'live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxAlgoOrder.createTrailingStop(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 撤销策略委托
router.post('/cancel-algo', validateBody(
  Joi.object({
    algoId: Joi.string().required(),
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    mode: Joi.string().valid('paper', 'demo', 'live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxAlgoOrder.cancelAlgoOrder(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 查询未完成策略委托
router.get('/algo-orders/pending', validateQuery(
  Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).optional(),
    orderType: Joi.string().valid('conditional', 'oco', 'trigger', 'move_order_stop').optional(),
    mode: Joi.string().valid('paper', 'demo', 'live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxAlgoOrder.fetchPendingAlgoOrders(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 查询历史策略委托
router.get('/algo-orders/history', validateQuery(
  Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).optional(),
    orderType: Joi.string().valid('conditional', 'oco', 'trigger', 'move_order_stop').optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    mode: Joi.string().valid('paper', 'demo', 'live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxAlgoOrder.fetchAlgoOrderHistory(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 风控状态
router.get('/risk/status', async (req, res) => {
  try {
    const status = riskControl.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取风控配置
router.get('/risk/config', async (req, res) => {
  try {
    const persisted = (getConfig && getConfig('risk_control')) || {};
    res.json({ success: true, data: { ...riskControl.config, ...persisted } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新风控配置
router.post('/risk/config', validateBody(
  Joi.object({
    MAX_DAILY_LOSS_PERCENT: Joi.number().min(0).optional(),
    MAX_DRAWDOWN_PERCENT: Joi.number().min(0).optional(),
    MAX_LOSS_PER_TRADE_PERCENT: Joi.number().min(0).optional(),
    MAX_POSITION_RATIO: Joi.number().min(0).max(1).optional(),
    MAX_SLIPPAGE_PERCENT: Joi.number().min(0).optional(),
    MAX_PRICE_DEVIATION_PERCENT: Joi.number().min(0).optional(),
    MAX_CONSECUTIVE_LOSSES: Joi.number().integer().min(0).optional(),
    MIN_CONFIDENCE: Joi.number().min(0).max(100).optional(),
    MIN_VOLUME_24H: Joi.number().min(0).optional(),
    MAX_LEVERAGE: Joi.number().integer().min(1).max(125).optional(),
    MAX_POSITION_HOLD_HOURS: Joi.number().integer().min(1).optional()
  })
), async (req, res) => {
  try {
    const merged = riskControl.updateConfig(req.body || {});
    if (setConfig) setConfig('risk_control', merged);
    res.json({ success: true, data: merged });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 暂停交易
router.post('/risk/pause', async (req, res) => {
  try {
    riskControl.pauseTrading('MANUAL', '手动暂停');
    res.json({ success: true, message: '交易已暂停' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 恢复交易
router.post('/risk/resume', async (req, res) => {
  try {
    riskControl.resumeTrading();
    res.json({ success: true, message: '交易已恢复' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 紧急停止
router.post('/risk/emergency-stop', async (req, res) => {
  try {
    riskControl.emergencyStop();
    orderMonitor.stopAll();
    positionSyncer.stop();
    res.json({ success: true, message: '紧急停止已触发' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 持仓同步状态
router.get('/positions/sync-status', async (req, res) => {
  try {
    const status = positionSyncer.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 同步的持仓列表
router.get('/positions/synced', async (req, res) => {
  try {
    const positions = positionSyncer.getPositions();
    res.json({ success: true, data: positions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 订单监控状态
router.get('/orders/monitored', async (req, res) => {
  try {
    const orders = orderMonitor.getMonitoredOrders();
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 监控服务 API ==========

// 获取完整监控状态
router.get('/monitoring/status', async (req, res) => {
  try {
    const status = await monitoringService.refreshAllStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取监控摘要（仪表盘用）
router.get('/monitoring/summary', async (req, res) => {
  try {
    const summary = monitoringService.getSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取最近的事件日志
router.get('/monitoring/logs', validateQuery(
  Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional()
  })
), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const logs = monitoringService.getRecentLogs(limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 清除日志
router.post('/monitoring/logs/clear', async (req, res) => {
  try {
    monitoringService.clearLogs();
    res.json({ success: true, message: '日志已清除' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
