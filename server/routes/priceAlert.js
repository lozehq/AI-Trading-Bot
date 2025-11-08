const express = require('express');
const router = express.Router();

let alertService = null;

// 延迟初始化，避免启动时错误
function getAlertServiceInstance() {
  if (!alertService) {
    try {
      const { getAlertService } = require('../services/priceAlertService');
      alertService = getAlertService();
    } catch (error) {
      console.error('初始化价格预警服务失败:', error.message);
      return null;
    }
  }
  return alertService;
}

// 获取所有预警
router.get('/alerts', (req, res) => {
  try {
    const service = getAlertServiceInstance();
    if (!service) {
      return res.status(503).json({ success: false, error: '预警服务不可用' });
    }
    const { symbol } = req.query;
    const alerts = service.getAlerts(symbol);
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 创建预警
router.post('/alerts', (req, res) => {
  try {
    const service = getAlertServiceInstance();
    if (!service) {
      return res.status(503).json({ success: false, error: '预警服务不可用' });
    }
    const alert = service.createAlert(req.body);
    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// 更新预警
router.put('/alerts/:id', (req, res) => {
  try {
    const service = getAlertServiceInstance();
    if (!service) {
      return res.status(503).json({ success: false, error: '预警服务不可用' });
    }
    const alert = service.updateAlert(req.params.id, req.body);
    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// 删除预警
router.delete('/alerts/:id', (req, res) => {
  try {
    const service = getAlertServiceInstance();
    if (!service) {
      return res.status(503).json({ success: false, error: '预警服务不可用' });
    }
    const deleted = service.deleteAlert(req.params.id);
    res.json({
      success: true,
      data: deleted
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// 获取价格历史
router.get('/price-history/:symbol', (req, res) => {
  try {
    const service = getAlertServiceInstance();
    if (!service) {
      return res.status(503).json({ success: false, error: '预警服务不可用' });
    }
    const { exchange = 'binance' } = req.query;
    const history = service.getPriceHistory(req.params.symbol, exchange);
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
});

module.exports = router;