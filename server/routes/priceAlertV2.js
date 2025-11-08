const express = require('express');
const router = express.Router();
const priceAlertService = require('../services/priceAlertServiceV2');
const { validateBody, validateQuery, schemas } = require('../validators');
const Joi = require('joi');

// ========== 验证模式 ==========

const alertSchemas = {
  // 创建预警
  create: Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    exchange: Joi.string().valid('okx', 'binance', 'bybit', 'huobi').default('okx'),
    type: Joi.string().valid('above', 'below', 'cross_above', 'cross_below', 'both').required(),
    targetPrice: Joi.number().positive().required(),
    message: Joi.string().max(500).optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    source: Joi.string().valid('manual', 'ai', 'auto').default('manual'),
    repeat: Joi.boolean().default(false),
    notifyBrowser: Joi.boolean().default(true),
    notifySound: Joi.boolean().default(true),
    notifyEmail: Joi.boolean().default(false),
    notifyWebhook: Joi.boolean().default(false),
    email: Joi.string().email().optional(),
    webhookUrl: Joi.string().uri().optional(),
    reasoning: Joi.string().optional(),
    confidence: Joi.number().min(0).max(100).optional(),
    cooldownSeconds: Joi.number().integer().min(10).max(3600).default(60),
    contextId: Joi.number().integer().optional().allow(null)
  }),

  // 更新预警
  update: Joi.object({
    enabled: Joi.boolean().optional(),
    targetPrice: Joi.number().positive().optional(),
    repeat: Joi.boolean().optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional()
  }),

  // 查询预警列表
  list: Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).optional(),
    enabled: Joi.boolean().optional(),
    triggered: Joi.boolean().optional(),
    limit: Joi.number().integer().min(1).max(1000).default(100),
    contextId: Joi.number().integer().optional()
  }),

  // 批量清理
  clear: Joi.object({
    symbol: Joi.string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    source: Joi.string().valid('ai','auto','manual').default('ai'),
    contextId: Joi.number().integer().optional()
  })
};

// ========== 路由 ==========

/**
 * POST /api/price-alert-v2/create
 * 创建价格预警
 */
router.post('/create', validateBody(alertSchemas.create), async (req, res) => {
  try {
    const result = await priceAlertService.createAlert(req.body);
    
    if (result.success) {
      res.json({
        success: true,
        message: '预警创建成功',
        data: {
          alertId: result.alertId,
          alert: result.alert
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('创建预警失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/price-alert-v2/list
 * 获取预警列表
 */
router.get('/list', validateQuery(alertSchemas.list), async (req, res) => {
  try {
    const filters = {};
    
    if (req.query.symbol) filters.symbol = req.query.symbol;
    if (req.query.enabled !== undefined) filters.enabled = req.query.enabled === 'true';
    if (req.query.triggered !== undefined) filters.triggered = req.query.triggered === 'true';
    if (req.query.limit) filters.limit = parseInt(req.query.limit);
    if (req.query.contextId) filters.contextId = parseInt(req.query.contextId);
    
    const alerts = priceAlertService.getAllAlerts(filters);
    
    res.json({
      success: true,
      data: {
        alerts,
        count: alerts.length
      }
    });
  } catch (error) {
    console.error('获取预警列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/price-alert-v2/stats
 * 获取预警统计（需放在 `/:id` 之前，避免被误匹配）
 */
router.get('/stats/:symbol(*)?', async (req, res) => {
  try {
    const symbol = req.params.symbol || req.query.symbol || null;
    const contextId = req.query.contextId ? parseInt(req.query.contextId) : null;
    const stats = priceAlertService.getStats(symbol, contextId);
    
    res.json({
      success: true,
      data: { stats }
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
 * DELETE /api/price-alert-v2/clear
 * 批量清理（软删除）预警
 */
router.delete('/clear', validateQuery(alertSchemas.clear), async (req, res) => {
  try {
    const { symbol, source = 'ai', contextId } = req.query;
    const result = await priceAlertService.clearAlerts({ symbol, source, contextId: contextId ? parseInt(contextId) : null });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || '清理失败' });
    }
    res.json({ success: true, data: { deleted: result.deleted } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/price-alert-v2/:id
 * 获取预警详情
 */
router.get('/:id', async (req, res) => {
  try {
    const alert = priceAlertService.getAlert(req.params.id);
    
    if (alert) {
      res.json({
        success: true,
        data: { alert }
      });
    } else {
      res.status(404).json({
        success: false,
        error: '预警不存在'
      });
    }
  } catch (error) {
    console.error('获取预警详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/price-alert-v2/:id
 * 更新预警
 */
router.put('/:id', validateBody(alertSchemas.update), async (req, res) => {
  try {
    const result = await priceAlertService.updateAlert(req.params.id, req.body);
    
    if (result.success) {
      res.json({
        success: true,
        message: '预警更新成功'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('更新预警失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/price-alert-v2/:id
 * 删除预警
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await priceAlertService.deleteAlert(req.params.id);
    
    if (result.success) {
      res.json({
        success: true,
        message: '预警删除成功'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('删除预警失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/price-alert-v2/start-monitoring
 * 启动价格监控
 */
router.post('/start-monitoring', async (req, res) => {
  try {
    priceAlertService.startMonitoring();
    
    res.json({
      success: true,
      message: '价格监控已启动'
    });
  } catch (error) {
    console.error('启动监控失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/price-alert-v2/stop-monitoring
 * 停止价格监控
 */
router.post('/stop-monitoring', async (req, res) => {
  try {
    priceAlertService.stopMonitoring();
    
    res.json({
      success: true,
      message: '价格监控已停止'
    });
  } catch (error) {
    console.error('停止监控失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// (moved above)

/**
 * POST /api/price-alert-v2/cleanup
 * 清理历史预警
 */
router.post('/cleanup', async (req, res) => {
  try {
    await priceAlertService.cleanupOldAlerts();
    
    res.json({
      success: true,
      message: '历史预警清理完成'
    });
  } catch (error) {
    console.error('清理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/price-alert-v2/triggers/:alertId
 * 获取预警触发历史
 */
router.get('/triggers/:alertId', async (req, res) => {
  try {
    const { getDB } = require('../database/database');
    const db = getDB();
    
    const stmt = db.prepare(`
      SELECT * FROM alert_triggers 
      WHERE alert_id = ? 
      ORDER BY triggered_at DESC 
      LIMIT 100
    `);
    
    const triggers = stmt.all(req.params.alertId);
    
    res.json({
      success: true,
      data: {
        triggers,
        count: triggers.length
      }
    });
  } catch (error) {
    console.error('获取触发历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

