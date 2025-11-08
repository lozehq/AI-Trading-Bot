const express = require('express');
const router = express.Router();
const mcpToolsManager = require('../services/mcpToolsManager');
const mcpClient = require('../services/mcpClient');

const RAW_CALL_ENABLED = process.env.NODE_ENV !== 'production' || process.env.MCP_RAW_ALLOW === 'true';

/**
 * GET /api/mcp/tools
 * 获取所有可用的MCP工具
 */
router.get('/tools', (req, res) => {
  try {
    // 兼容老接口：返回工具列表，并包含 methodsCount 字段
    const list = mcpToolsManager.getToolsList();
    const tools = list.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      methodsCount: t.methodCount
    }));

    res.json({
      success: true,
      data: tools
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/tools/:toolId
 * 获取工具的所有方法
 */
router.get('/tools/:toolId', (req, res) => {
  try {
    const { toolId } = req.params;
    const tool = mcpToolsManager.getTool(toolId);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: '工具不存在'
      });
    }

    // 返回方法列表及描述
    const methods = Object.entries(tool.methods || {}).map(([name, meta]) => ({
      name,
      description: meta.description || '',
      params: meta.params || []
    }));

    res.json({
      success: true,
      data: {
        id: toolId,
        name: tool.name,
        description: tool.description,
        methods
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/call
 * 调用MCP工具方法
 */
router.post('/call', async (req, res) => {
  try {
    const { toolId, method, params } = req.body;
    
    if (!toolId || !method) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：toolId 和 method'
      });
    }

    const result = await mcpToolsManager.callTool(toolId, method, params || {});
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp/raw-call
 * 直接通过标准MCP协议调用（tools/call），支持任意工具和方法
 */
router.post('/raw-call', async (req, res) => {
  if (!RAW_CALL_ENABLED) {
    return res.status(403).json({
      success: false,
      error: '原始MCP调用已禁用，请仅在开发环境使用或设置MCP_RAW_ALLOW=true'
    });
  }

  try {
    const { toolName, method, args } = req.body;
    if (!toolName || !method) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：toolName 和 method'
      });
    }

    const result = await mcpClient.sendMCPRequest(toolName, method, args || {});

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/mcp/guide
 * 获取AI工具使用指南
 */
router.get('/guide', (req, res) => {
  try {
    const guide = mcpToolsManager.getToolsGuideForAI();
    
    res.json({
      success: true,
      data: guide
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

