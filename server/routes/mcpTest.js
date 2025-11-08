const express = require('express');
const router = express.Router();
const mcpClient = require('../services/mcpClient');
const mcpLogger = require('../services/mcpLogger');

/**
 * GET /api/mcp-test/status
 * 测试MCP工具状态
 */
router.get('/status', (req, res) => {
  const tools = [];
  
  for (const [toolName, tool] of mcpClient.processes) {
    tools.push({
      name: toolName,
      pid: tool.process.pid,
      ready: tool.ready,
      status: '运行中'
    });
  }
  
  res.json({
    success: true,
    data: {
      tools,
      totalTools: tools.length,
      message: tools.length > 0 ? 'MCP工具已启动' : 'MCP工具未启动'
    }
  });
});

/**
 * POST /api/mcp-test/call
 * 测试MCP工具调用
 */
router.post('/call', async (req, res) => {
  try {
    const { toolName, functionName, params = {} } = req.body;
    
    if (!toolName || !functionName) {
      return res.status(400).json({
        success: false,
        error: '缺少toolName或functionName参数'
      });
    }

    mcpLogger.info('mcp-test', `测试调用: ${toolName}.${functionName}`);

    try {
      // 尝试MCP协议调用
      const result = await mcpClient.sendMCPRequest(toolName, functionName, params);
      
      mcpLogger.success('mcp-test', `✓ MCP调用成功`);
      
      res.json({
        success: true,
        data: {
          mode: 'MCP',
          toolName,
          functionName,
          params,
          result: result || '调用成功但结果为空',
          message: 'MCP协议调用成功！'
        }
      });
    } catch (mcpError) {
      mcpLogger.warning('mcp-test', `MCP调用失败: ${mcpError.message}`);
      
      // 返回错误信息
      res.json({
        success: false,
        mode: 'MCP-Failed',
        toolName,
        functionName,
        error: mcpError.message,
        message: 'MCP调用失败，系统会自动使用降级方案'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/mcp-test/list-tools
 * 列出MCP工具的所有可用方法
 */
router.post('/list-tools', async (req, res) => {
  try {
    const { toolName } = req.body;
    
    if (!toolName) {
      return res.status(400).json({
        success: false,
        error: '缺少toolName参数'
      });
    }

    const tool = mcpClient.processes.get(toolName);
    if (!tool || !tool.ready) {
      return res.status(404).json({
        success: false,
        error: `${toolName}未就绪`
      });
    }

    // 发送tools/list请求
    const requestId = ++mcpClient.requestId;
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/list',
      params: {}
    };

    const result = await new Promise((resolve, reject) => {
      let responseData = '';
      const timeout = setTimeout(() => {
        reject(new Error('超时'));
      }, 10000);

      const handler = (data) => {
        responseData += data.toString();
        try {
          const lines = responseData.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const response = JSON.parse(line);
            if (response.id === requestId) {
              clearTimeout(timeout);
              tool.process.stdout.removeListener('data', handler);
              resolve(response.result);
              return;
            }
          }
        } catch (e) {}
      };

      tool.process.stdout.on('data', handler);
      tool.process.stdin.write(JSON.stringify(request) + '\n');
    });

    mcpLogger.success('mcp-test', `列出${toolName}的${result.tools?.length || 0}个工具`);

    res.json({
      success: true,
      data: {
        toolName,
        tools: result.tools,
        total: result.tools?.length || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

