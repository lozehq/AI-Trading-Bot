/**
 * MCP工具统计API
 * 提供工具调用成功率、性能指标、错误分析等统计数据
 */

const express = require('express');
const { ApiResponse } = require('../utils/response');
const router = express.Router();
const { MCPLogService } = require('../database/services/MCPLogService');

/**
 * GET /api/mcp-stats/success-rate/:toolName
 * 获取指定工具的成功率
 */
router.get('/success-rate/:toolName', (req, res) => {
  try {
    const { toolName } = req.params;
    const { timeRange = '24h' } = req.query;

    // ✅ 输入验证：toolName
    if (!toolName || typeof toolName !== 'string' || toolName.length > 100) {
      return res.status(400).json({
        success: false,
        error: '无效的工具名称'
      });
    }

    // ✅ 输入验证：timeRange
    const validTimeRanges = ['1h', '6h', '12h', '24h', '7d', '30d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: `无效的时间范围，支持: ${validTimeRanges.join(', ')}`
      });
    }

    const stats = MCPLogService.getSuccessRateByTimeRange(toolName, timeRange);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ 获取成功率失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp-stats/all-tools
 * 获取所有工具的成功率汇总
 */
router.get('/all-tools', (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;

    // ✅ 输入验证：timeRange
    const validTimeRanges = ['1h', '6h', '12h', '24h', '7d', '30d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: `无效的时间范围，支持: ${validTimeRanges.join(', ')}`
      });
    }

    const stats = MCPLogService.getAllToolsSuccessRate(timeRange);

    res.json({
      success: true,
      data: stats,
      summary: {
        totalTools: stats.length,
        totalCalls: stats.reduce((sum, s) => sum + s.total, 0),
        totalSuccess: stats.reduce((sum, s) => sum + s.success, 0),
        totalFailed: stats.reduce((sum, s) => sum + s.failed, 0),
        overallSuccessRate: stats.length > 0
          ? ((stats.reduce((sum, s) => sum + s.success, 0) / stats.reduce((sum, s) => sum + s.total, 0)) * 100).toFixed(2)
          : 0
      }
    });
  } catch (error) {
    console.error('❌ 获取工具统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp-stats/performance/:toolName
 * 获取指定工具的性能指标（P50, P95, P99延迟）
 */
router.get('/performance/:toolName', (req, res) => {
  try {
    const { toolName } = req.params;
    const { timeRange = '24h' } = req.query;

    // ✅ 输入验证：toolName
    if (!toolName || typeof toolName !== 'string' || toolName.length > 100) {
      return res.status(400).json({
        success: false,
        error: '无效的工具名称'
      });
    }

    // ✅ 输入验证：timeRange
    const validTimeRanges = ['1h', '6h', '12h', '24h', '7d', '30d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: `无效的时间范围，支持: ${validTimeRanges.join(', ')}`
      });
    }

    const metrics = MCPLogService.getPerformanceMetrics(toolName, timeRange);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('❌ 获取性能指标失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp-stats/errors
 * 获取错误分类统计
 */
router.get('/errors', (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;

    // ✅ 输入验证：timeRange
    const validTimeRanges = ['1h', '6h', '12h', '24h', '7d', '30d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: `无效的时间范围，支持: ${validTimeRanges.join(', ')}`
      });
    }

    const errors = MCPLogService.getErrorCategoryStats(timeRange);

    res.json({
      success: true,
      data: errors,
      summary: {
        totalErrors: errors.reduce((sum, e) => sum + e.count, 0),
        uniqueErrors: errors.length
      }
    });
  } catch (error) {
    console.error('❌ 获取错误统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp-stats/dashboard
 * 获取完整的统计仪表板数据
 */
router.get('/dashboard', (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;

    // ✅ 输入验证：timeRange
    const validTimeRanges = ['1h', '6h', '12h', '24h', '7d', '30d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: `无效的时间范围，支持: ${validTimeRanges.join(', ')}`
      });
    }

    // 获取所有工具统计
    const allTools = MCPLogService.getAllToolsSuccessRate(timeRange);

    // 获取错误统计
    const errors = MCPLogService.getErrorCategoryStats(timeRange);

    // 计算总体指标
    const totalCalls = allTools.reduce((sum, s) => sum + s.total, 0);
    const totalSuccess = allTools.reduce((sum, s) => sum + s.success, 0);
    const totalFailed = allTools.reduce((sum, s) => sum + s.failed, 0);
    const overallSuccessRate = totalCalls > 0 ? ((totalSuccess / totalCalls) * 100).toFixed(2) : 0;

    // 获取每个工具的性能指标
    const performanceMetrics = allTools.map(tool => {
      return MCPLogService.getPerformanceMetrics(tool.toolName, timeRange);
    });

    // 识别问题工具（成功率 < 80%）
    const problematicTools = allTools.filter(t => parseFloat(t.successRate) < 80);

    // 识别慢工具（P95 > 5000ms）
    const slowTools = performanceMetrics.filter(p => p.p95 > 5000);

    res.json({
      success: true,
      data: {
        timeRange,
        overview: {
          totalCalls,
          totalSuccess,
          totalFailed,
          overallSuccessRate,
          totalTools: allTools.length,
          problematicToolsCount: problematicTools.length,
          slowToolsCount: slowTools.length
        },
        tools: allTools,
        performance: performanceMetrics,
        errors: {
          topErrors: errors.slice(0, 10),
          totalErrors: errors.reduce((sum, e) => sum + e.count, 0),
          uniqueErrors: errors.length
        },
        alerts: {
          problematicTools,
          slowTools
        }
      }
    });
  } catch (error) {
    console.error('❌ 获取仪表板数据失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp-stats/recent-failures
 * 获取最近的失败记录
 */
router.get('/recent-failures', (req, res) => {
  try {
    const { limit = 50 } = req.query;

    // ✅ 输入验证：limit
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      return res.status(400).json({
        success: false,
        error: '无效的limit参数，必须是1-1000之间的整数'
      });
    }

    const failures = MCPLogService.getFailures(parsedLimit);

    res.json({
      success: true,
      data: failures
    });
  } catch (error) {
    console.error('❌ 获取失败记录失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp-stats/health-check
 * 健康检查：评估所有工具的整体健康状况
 */
router.get('/health-check', (req, res) => {
  try {
    const timeRange = '1h'; // 最近1小时
    const allTools = MCPLogService.getAllToolsSuccessRate(timeRange);

    // 健康评分标准
    const healthScore = (successRate, avgDuration) => {
      let score = 100;
      
      // 成功率影响（权重60%）
      if (successRate < 50) score -= 60;
      else if (successRate < 70) score -= 40;
      else if (successRate < 90) score -= 20;
      else if (successRate < 95) score -= 10;
      
      // 延迟影响（权重40%）
      if (avgDuration > 10000) score -= 40;
      else if (avgDuration > 5000) score -= 30;
      else if (avgDuration > 3000) score -= 20;
      else if (avgDuration > 1000) score -= 10;
      
      return Math.max(0, score);
    };

    const toolsHealth = allTools.map(tool => {
      const score = healthScore(parseFloat(tool.successRate), tool.avgDuration);
      let status = 'healthy';
      if (score < 50) status = 'critical';
      else if (score < 70) status = 'warning';
      else if (score < 90) status = 'degraded';

      return {
        toolName: tool.toolName,
        status,
        score,
        successRate: tool.successRate,
        avgDuration: tool.avgDuration,
        total: tool.total
      };
    });

    // 整体健康状态
    const avgScore = toolsHealth.length > 0
      ? toolsHealth.reduce((sum, t) => sum + t.score, 0) / toolsHealth.length
      : 100;

    let overallStatus = 'healthy';
    if (avgScore < 50) overallStatus = 'critical';
    else if (avgScore < 70) overallStatus = 'warning';
    else if (avgScore < 90) overallStatus = 'degraded';

    res.json({
      success: true,
      data: {
        overallStatus,
        overallScore: Math.round(avgScore),
        tools: toolsHealth,
        summary: {
          healthy: toolsHealth.filter(t => t.status === 'healthy').length,
          degraded: toolsHealth.filter(t => t.status === 'degraded').length,
          warning: toolsHealth.filter(t => t.status === 'warning').length,
          critical: toolsHealth.filter(t => t.status === 'critical').length
        }
      }
    });
  } catch (error) {
    console.error('❌ 健康检查失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

