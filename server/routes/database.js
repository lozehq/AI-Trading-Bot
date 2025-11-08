/**
 * 数据库管理API路由
 */

const express = require('express');
const { ApiResponse } = require('../utils/response');
const router = express.Router();
const {
  getDatabaseStats,
  backupDatabase,
  cleanupOldData,
  exportToJSON,
  importFromJSON
} = require('../database/database');
const {
  TradeService,
  SettingService,
  MCPLogService
} = require('../database/services/index');
const aiMemoryService = require('../services/aiMemoryService');
const { validateQuery, validateBody, schemas } = require('../validators'); // ✅ 添加输入验证

/**
 * 获取数据库统计信息
 * GET /api/database/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = getDatabaseStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取数据库统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 备份数据库
 * POST /api/database/backup
 */
router.post('/backup', async (req, res) => {
  try {
    const backupPath = backupDatabase();
    res.json({
      success: true,
      message: '数据库备份成功',
      backup_path: backupPath
    });
  } catch (error) {
    console.error('数据库备份失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 清理旧数据
 * POST /api/database/cleanup
 */
router.post('/cleanup',
  validateBody(schemas.database.cleanup), // ✅ 添加输入验证
  async (req, res) => {
    try {
      const { days = 30 } = req.body;
      cleanupOldData(days);
      res.json({
        success: true,
        message: `已清理${days}天前的数据`
      });
    } catch (error) {
      console.error('清理数据失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * 导出数据
 * GET /api/database/export/:table
 */
router.get('/export/:table', async (req, res) => {
  try {
    const { table } = req.params;
    
    // 安全性：白名单验证表名
    const EXPORTABLE_TABLES = [
      'trades', 'ai_analyses', 'positions', 'strategy_performance',
      'market_snapshots', 'price_alerts', 'checkpoints', 'chat_messages',
      'tick_trades', 'whale_addresses', 'whale_transactions'
    ];
    
    if (!EXPORTABLE_TABLES.includes(table)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid table name',
        allowed: EXPORTABLE_TABLES
      });
    }
    
    const json = exportToJSON(table);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${table}_export.json"`);
    res.send(json);
  } catch (error) {
    console.error('导出数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取交易历史
 * GET /api/database/trades
 */
router.get('/trades',
  validateQuery(schemas.database.queryAnalyses), // ✅ 添加输入验证
  async (req, res) => {
    try {
      const { symbol, exchange, status, limit = 100, offset = 0 } = req.query;

      const trades = TradeService.query({
        symbol,
        exchange,
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    
    const total = TradeService.getCount({ symbol, exchange, status });
    
    res.json({
      success: true,
      data: trades,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('获取交易历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取交易统计
 * GET /api/database/trades/statistics
 */
router.get('/trades/statistics', async (req, res) => {
  try {
    const { symbol, exchange } = req.query;
    const statistics = TradeService.getStatistics(symbol, exchange);
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('获取交易统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取配置
 * GET /api/database/settings
 */
router.get('/settings', async (req, res) => {
  try {
    const { category } = req.query;
    const settings = SettingService.getAllAsObject(category);
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 更新配置
 * PUT /api/database/settings
 */
router.put('/settings', async (req, res) => {
  try {
    const settings = req.body;
    const count = SettingService.setBatch(settings);
    
    res.json({
      success: true,
      message: `已更新${count}个配置项`
    });
  } catch (error) {
    console.error('更新配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取MCP日志
 * GET /api/database/mcp-logs
 */
router.get('/mcp-logs', async (req, res) => {
  try {
    const { tool_name, method, status, limit = 50 } = req.query;
    
    const logs = MCPLogService.query({
      tool_name,
      method,
      status,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('获取MCP日志失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取MCP统计
 * GET /api/database/mcp-logs/statistics
 */
router.get('/mcp-logs/statistics', async (req, res) => {
  try {
    const { tool_name } = req.query;
    const statistics = MCPLogService.getStatistics(tool_name);
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('获取MCP统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取AI分析历史
 * GET /api/database/ai-analysis
 */
router.get('/ai-analysis', async (req, res) => {
  try {
    const { symbol, limit = 20 } = req.query;

    const analyses = await aiMemoryService.getRecentAnalyses(
      symbol,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: analyses
    });
  } catch (error) {
    console.error('获取AI分析历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取AI分析统计
 * GET /api/database/ai-analysis/statistics
 */
router.get('/ai-analysis/statistics', async (req, res) => {
  try {
    const { symbol } = req.query;
    const statistics = await aiMemoryService.getTradingStats(symbol);

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('获取AI分析统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取信号分布
 * GET /api/database/ai-analysis/signal-distribution
 */
router.get('/ai-analysis/signal-distribution', async (req, res) => {
  try {
    const { days = 7, symbol } = req.query;
    const analyses = await aiMemoryService.getRecentAnalyses(symbol, parseInt(days));

    const distribution = analyses.reduce((acc, analysis) => {
      const key = analysis.signal || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: distribution
    });
  } catch (error) {
    console.error('获取信号分布失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

