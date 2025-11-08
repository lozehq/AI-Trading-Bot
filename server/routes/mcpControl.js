const express = require('express');
const router = express.Router();
const mcpLogger = require('../services/mcpLogger');
const { getConfig, setConfig } = require('../database/database');
const { MCPConfigService } = require('../database/services/MCPConfigService');

// MCP工具定义
const MCP_TOOLS_DEFINITION = {
  'ccxt-mcp': {
    name: 'CCXT',
    description: '交易所数据（通过npm包直接调用）',
    defaultStatus: 'active',
    mode: 'direct'
  },
  'playwright': {
    name: 'Playwright',
    description: '网页数据抓取（可选功能）',
    defaultStatus: 'inactive',
    mode: 'process'
  },
  'crypto-indicators-mcp': {
    name: '技术指标',
    description: '技术指标计算（通过本地函数）',
    defaultStatus: 'active',
    mode: 'direct'
  },
  'coingecko_mcp': {
    name: 'CoinGecko',
    description: '市场数据（通过API调用）',
    defaultStatus: 'active',
    mode: 'direct'
  }
};

/**
 * 从数据库加载MCP工具状态
 */
function loadMCPToolsStatus() {
  const savedStatus = getConfig('mcp_tools_status');

  if (savedStatus) {
    return savedStatus;
  }

  // 如果没有保存的状态，使用默认值
  const defaultStatus = {};
  Object.keys(MCP_TOOLS_DEFINITION).forEach(toolId => {
    defaultStatus[toolId] = MCP_TOOLS_DEFINITION[toolId].defaultStatus;
  });

  return defaultStatus;
}

/**
 * 保存MCP工具状态到数据库
 */
function saveMCPToolsStatus(status) {
  setConfig('mcp_tools_status', status);
}

/**
 * 获取自定义MCP工具配置
 */
function getCustomToolsConfig() {
  try {
    const { MCPConfigService } = require('../database/services/MCPConfigService');
    return MCPConfigService.getAll();
  } catch (error) {
    console.warn('⚠️  加载自定义MCP配置失败:', error.message);
    return [];
  }
}

/**
 * 获取MCP工具状态映射
 */
function getMCPToolsStatusMap() {
  const status = loadMCPToolsStatus();
  const tools = { ...status };
  return tools;
}

/**
 * 获取MCP工具完整信息
 */
function getMCPTools() {
  const status = getMCPToolsStatusMap();
  const tools = {};

  Object.keys(MCP_TOOLS_DEFINITION).forEach(toolId => {
    tools[toolId] = {
      ...MCP_TOOLS_DEFINITION[toolId],
      status: status[toolId] || MCP_TOOLS_DEFINITION[toolId].defaultStatus,
      isCustom: false
    };
  });

  const customConfigs = getCustomToolsConfig();

  customConfigs.forEach(cfg => {
    if (!tools[cfg.toolId]) {
      tools[cfg.toolId] = {
        name: cfg.toolId,
        description: cfg.description || '自定义MCP工具',
        defaultStatus: 'inactive',
        mode: 'custom',
        isCustom: true,
        command: cfg.command,
        args: cfg.args || [],
        env: cfg.env || {},
        status: status[cfg.toolId] || 'inactive'
      };
    } else {
      tools[cfg.toolId].isCustom = true;
      tools[cfg.toolId].command = cfg.command;
      tools[cfg.toolId].args = cfg.args || [];
      tools[cfg.toolId].env = cfg.env || {};
    }

    if (!status[cfg.toolId]) {
      status[cfg.toolId] = 'inactive';
    }
  });

  saveMCPToolsStatus(status);

  return tools;
}

/**
 * GET /api/mcp-control/status
 * 获取MCP工具状态
 */
router.get('/status', (req, res) => {
  try {
    const MCP_TOOLS = getMCPTools();
    const status = Object.keys(MCP_TOOLS).map(toolId => ({
      id: toolId,
      name: MCP_TOOLS[toolId].name,
      description: MCP_TOOLS[toolId].description,
      status: MCP_TOOLS[toolId].status === 'active' ? 'running' : 'stopped',
      mode: MCP_TOOLS[toolId].mode,
      ready: MCP_TOOLS[toolId].status === 'active',
      isCustom: !!MCP_TOOLS[toolId].isCustom
    }));

    const runningTools = status.filter(t => t.status === 'running').length;

    res.json({
      success: true,
      data: {
        tools: status,
        totalTools: status.length,
        runningTools
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
 * GET /api/mcp-control/logs
 * 获取日志
 */
router.get('/logs', (req, res) => {
  try {
    const { toolId, limit = 100, level, search } = req.query;
    
    const logs = mcpLogger.queryLogs({
      toolId,
      limit: parseInt(limit),
      level,
      search
    });

    res.json({
      success: true,
      data: {
        logs,
        total: logs.length
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
 * DELETE /api/mcp-control/logs
 * 清除日志
 */
router.delete('/logs', (req, res) => {
  try {
    const { toolId } = req.query;
    mcpLogger.clearLogs(toolId);
    
    res.json({
      success: true,
      message: toolId ? `${toolId}的日志已清除` : '所有日志已清除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp-control/start/:toolId
 * 模拟启动（实际是直接调用模式，无需启动）
 */
router.post('/start/:toolId', async (req, res) => {
  try {
    const { toolId } = req.params;
    const MCP_TOOLS = getMCPTools();

    if (!MCP_TOOLS[toolId]) {
      return res.status(404).json({
        success: false,
        error: `未找到工具: ${toolId}`
      });
    }

    // 更新状态并保存到数据库
    const currentStatus = loadMCPToolsStatus();
    currentStatus[toolId] = 'active';
    saveMCPToolsStatus(currentStatus);

    if (MCP_TOOLS[toolId].isCustom) {
      const { MCPConfigService } = require('../database/services/MCPConfigService');
      const config = MCPConfigService.getByToolId(toolId);
      if (!config) {
        return res.status(404).json({
          success: false,
          error: `未找到自定义工具配置: ${toolId}`
        });
      }
      const mcpClient = require('../services/mcpClient');
      await mcpClient.startMCPTool(toolId, {
        command: config.command,
        args: config.args,
        env: config.env,
        working_directory: config.working_directory || config.workingDirectory || null
      });
    }

    mcpLogger.success(toolId, '已启用（直接调用模式）');

    res.json({
      success: true,
      message: `${MCP_TOOLS[toolId].name} 已启用`,
      mode: 'direct'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp-control/stop/:toolId
 * 模拟停止
 */
router.post('/stop/:toolId', async (req, res) => {
  try {
    const { toolId } = req.params;
    const MCP_TOOLS = getMCPTools();

    if (!MCP_TOOLS[toolId]) {
      return res.status(404).json({
        success: false,
        error: `未找到工具: ${toolId}`
      });
    }

    // 更新状态并保存到数据库
    const currentStatus = loadMCPToolsStatus();
    currentStatus[toolId] = 'inactive';
    saveMCPToolsStatus(currentStatus);

    if (MCP_TOOLS[toolId].isCustom) {
      const mcpClient = require('../services/mcpClient');
      await mcpClient.stopMCPTool(toolId);
    }

    mcpLogger.info(toolId, '已停用');

    res.json({
      success: true,
      message: `${MCP_TOOLS[toolId].name} 已停用`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp-control/restart/:toolId
 * 模拟重启
 */
router.post('/restart/:toolId', (req, res) => {
  try {
    const { toolId } = req.params;
    const MCP_TOOLS = getMCPTools();
    if (!MCP_TOOLS[toolId]) {
      return res.status(404).json({
        success: false,
        error: `未找到工具: ${toolId}`
      });
    }

    mcpLogger.info(toolId, '重启完成');

    res.json({
      success: true,
      message: `${MCP_TOOLS[toolId].name} 重启成功`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp-control/start-all
 * 启用所有工具
 */
router.post('/start-all', (req, res) => {
  try {
    const currentStatus = loadMCPToolsStatus();

    Object.keys(MCP_TOOLS_DEFINITION).forEach(toolId => {
      currentStatus[toolId] = 'active';
    });

    saveMCPToolsStatus(currentStatus);
    mcpLogger.success('system', '所有工具已启用');

    res.json({
      success: true,
      message: '所有工具已启用'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp-control/stop-all
 * 停用所有工具
 */
router.post('/stop-all', (req, res) => {
  try {
    const currentStatus = loadMCPToolsStatus();

    Object.keys(MCP_TOOLS_DEFINITION).forEach(toolId => {
      currentStatus[toolId] = 'inactive';
    });

    saveMCPToolsStatus(currentStatus);
    mcpLogger.info('system', '所有工具已停用');

    res.json({
      success: true,
      message: '所有工具已停用'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
