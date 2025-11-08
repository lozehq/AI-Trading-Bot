/**
 * MCP客户端服务
 * 通过MCP协议调用外部工具获取数据
 */

const { spawn } = require('child_process');
const path = require('path');
const mcpLogger = require('./mcpLogger');

const ALLOWED_COMMAND_REGEX = /^[A-Za-z0-9._\-/\\:]+$/;
const FORBIDDEN_ARG_CHARS = /[;&|><`$]/;

function normalizeArgs(args) {
  if (!args) return [];
  if (!Array.isArray(args)) {
    throw new Error('MCP工具配置中的 args 必须是字符串数组');
  }
  return args.map((arg, index) => {
    if (typeof arg !== 'string') {
      throw new Error(`MCP工具配置中的第 ${index + 1} 个参数不是字符串`);
    }
    if (FORBIDDEN_ARG_CHARS.test(arg)) {
      throw new Error(`参数包含非法字符: ${arg}`);
    }
    return arg;
  });
}

function sanitizeEnv(env) {
  if (!env) return {};
  if (typeof env !== 'object') {
    throw new Error('MCP工具配置中的 env 必须是对象');
  }
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') {
      throw new Error(`环境变量 ${key} 的值必须是字符串`);
    }
    result[key] = value;
  }
  return result;
}

function validateCommandConfig(toolName, config) {
  if (!config || typeof config.command !== 'string' || !config.command.trim()) {
    throw new Error(`MCP工具 ${toolName} 未设置合法的 command`);
  }
  if (!ALLOWED_COMMAND_REGEX.test(config.command)) {
    throw new Error(`MCP工具 ${toolName} 的 command 含有非法字符`);
  }

  return {
    command: config.command.trim(),
    args: normalizeArgs(config.args),
    env: sanitizeEnv(config.env),
    working_directory: config.working_directory
  };
}

// ✅ 常量定义：消除魔法数字
const MCP_INIT_WAIT_MS = 2000; // MCP初始化等待时间（毫秒）
const BASE_RETRY_DELAY_MS = 1000; // 基础重试延迟（毫秒）
const RATE_LIMIT_RETRY_DELAY_MS = 5000; // 限流重试延迟（毫秒）
const NOT_INITIALIZED_RETRY_DELAY_MS = 2000; // 未初始化重试延迟（毫秒）

class MCPClient {
  constructor() {
    this.processes = new Map();
    this.requestId = 0;
  }

  /**
   * 启动MCP工具进程
   */
  async startMCPTool(toolName, config) {
    if (this.processes.has(toolName)) {
      console.log(`✅ MCP工具 ${toolName} 已经在运行`);
      return this.processes.get(toolName);
    }

    const sanitizedConfig = validateCommandConfig(toolName, config);

    return new Promise((resolve, reject) => {
      mcpLogger.info(toolName, '正在启动...');

      const childProcess = spawn(sanitizedConfig.command, sanitizedConfig.args, {
        env: { ...process.env, ...sanitizedConfig.env },
        cwd: sanitizedConfig.working_directory || __dirname,
        shell: false,
        windowsHide: true
      });

      // 增加最大监听器数量以支持并行调用（避免MaxListenersExceededWarning）
      childProcess.stdout.setMaxListeners(20);
      childProcess.stderr.setMaxListeners(20);
      childProcess.stdin.setMaxListeners(20);

      let stdoutData = '';
      let stderrData = '';
      let resolved = false;

      childProcess.stdout.on('data', (data) => {
        const message = data.toString().trim();
        stdoutData += message;
        if (message) {
          mcpLogger.info(toolName, message);
        }
      });

      childProcess.stderr.on('data', (data) => {
        const message = data.toString().trim();
        stderrData += message;
        if (message) {
          mcpLogger.warning(toolName, message);
        }
      });

      // 监听进程退出
      childProcess.on('exit', (code, signal) => {
        mcpLogger.warning(toolName, `进程退出 (code: ${code}, signal: ${signal})`);
        this.processes.delete(toolName);
      });

      childProcess.on('error', (error) => {
        mcpLogger.error(toolName, `启动失败: ${error.message}`);
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      // 添加超时机制
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          childProcess.kill();
          mcpLogger.error(toolName, '启动超时');
          reject(new Error(`${toolName} 启动超时`));
        }
      }, 10000); // 10秒超时

      // 等待进程启动
      setTimeout(() => {
        if (childProcess.pid && !resolved) {
          clearTimeout(timeout);
          resolved = true;

          const toolInfo = {
            process: childProcess,
            config,
            ready: true,
            initialized: false,
            initializing: null
          };

          this.processes.set(toolName, toolInfo);

          mcpLogger.success(toolName, `启动成功 (PID: ${childProcess.pid})`);
          resolve(toolInfo);
        } else if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          mcpLogger.error(toolName, '未能启动');
          reject(new Error(`${toolName} 未能启动`));
        }
      }, 2000);
    });
  }

  /**
   * 停止MCP工具进程
   */
  stopMCPTool(toolName) {
    const tool = this.processes.get(toolName);
    if (tool && tool.process) {
      tool.process.kill();
      this.processes.delete(toolName);
      mcpLogger.info(toolName, '已停止');
      return true;
    }
    return false;
  }

  /**
   * 停止所有MCP工具进程
   */
  stopAllTools() {
    for (const [toolName, tool] of this.processes.entries()) {
      if (tool.process) {
        tool.process.kill();
      }
    }
    this.processes.clear();
    mcpLogger.info('mcp-client', '所有MCP工具已停止');
  }

  /**
   * 通过MCP协议发送请求（使用标准MCP协议）
   * 添加重试机制处理初始化未完成的情况
   * 增强错误分类与降级策略
   */
  async sendMCPRequest(toolName, method, params = {}, retries = 3) {
    const tool = this.processes.get(toolName);

    if (!tool || !tool.ready) {
      const error = new Error(`MCP工具 ${toolName} 未就绪`);
      error.code = 'TOOL_NOT_READY';
      error.category = 'SETUP_ERROR';
      throw error;
    }

    // 确保已初始化
    try {
      await this.ensureInitialized(toolName);
    } catch (error) {
      error.code = 'INIT_FAILED';
      error.category = 'SETUP_ERROR';
      throw error;
    }

    // 如果是标准MCP方法（带/），直接调用对应方法
    if (method.includes('/')) {
      return this._sendRequest(toolName, method, params);
    }

    // 带重试的工具调用
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this._sendRequest(toolName, 'tools/call', {
          name: method,
          arguments: params
        });
      } catch (error) {
        lastError = error;

        // 错误分类
        const errorCategory = this._classifyError(error);
        error.category = errorCategory;

        // 根据错误类型决定是否重试
        const shouldRetry = this._shouldRetry(errorCategory, attempt, retries);

        if (shouldRetry) {
          const delay = this._getRetryDelay(attempt, errorCategory);
          mcpLogger.warning(toolName, `${errorCategory} 错误，${delay}ms后重试 (${attempt}/${retries}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // 不应重试的错误，直接抛出
        mcpLogger.error(toolName, `${errorCategory} 错误，不重试: ${error.message}`);
        throw error;
      }
    }

    // 所有重试都失败
    lastError.retriesExhausted = true;
    throw lastError;
  }

  /**
   * 错误分类
   */
  _classifyError(error) {
    const message = error.message || '';

    // 4xx类错误（客户端错误，通常不应重试）
    if (message.includes('Invalid request parameters') ||
        message.includes('invalid parameters') ||
        message.includes('validation failed')) {
      return 'INVALID_PARAMS'; // 参数错误
    }

    if (message.includes('not found') ||
        message.includes('unknown method')) {
      return 'NOT_FOUND'; // 方法不存在
    }

    if (message.includes('unauthorized') ||
        message.includes('forbidden')) {
      return 'AUTH_ERROR'; // 权限错误
    }

    // 5xx类错误（服务端错误，可以重试）
    if (message.includes('initialization') ||
        message.includes('not ready')) {
      return 'NOT_INITIALIZED'; // 初始化未完成
    }

    if (message.includes('timeout') ||
        message.includes('ETIMEDOUT')) {
      return 'TIMEOUT'; // 超时
    }

    if (message.includes('ECONNREFUSED') ||
        message.includes('ECONNRESET')) {
      return 'CONNECTION_ERROR'; // 连接错误
    }

    if (message.includes('rate limit') ||
        message.includes('too many requests')) {
      return 'RATE_LIMIT'; // 限流
    }

    // 默认为服务错误
    return 'SERVICE_ERROR';
  }

  /**
   * 判断是否应该重试
   */
  _shouldRetry(errorCategory, attempt, maxRetries) {
    if (attempt >= maxRetries) {
      return false;
    }

    // 不应重试的错误类型
    const noRetryCategories = ['INVALID_PARAMS', 'NOT_FOUND', 'AUTH_ERROR'];
    if (noRetryCategories.includes(errorCategory)) {
      return false;
    }

    // 应该重试的错误类型
    const retryCategories = ['NOT_INITIALIZED', 'TIMEOUT', 'CONNECTION_ERROR', 'RATE_LIMIT', 'SERVICE_ERROR'];
    return retryCategories.includes(errorCategory);
  }

  /**
   * 获取重试延迟（指数退避）
   */
  _getRetryDelay(attempt, errorCategory) {
    // 基础延迟
    let baseDelay = BASE_RETRY_DELAY_MS;

    // 根据错误类型调整延迟
    if (errorCategory === 'RATE_LIMIT') {
      baseDelay = RATE_LIMIT_RETRY_DELAY_MS; // 限流错误等待更久
    } else if (errorCategory === 'NOT_INITIALIZED') {
      baseDelay = NOT_INITIALIZED_RETRY_DELAY_MS; // 初始化错误等待更久
    }

    // 指数退避：1s, 2s, 4s, 8s...
    return baseDelay * Math.pow(2, attempt - 1);
  }

  async ensureInitialized(toolName) {
    const tool = this.processes.get(toolName);
    if (!tool || !tool.ready) {
      throw new Error(`MCP工具 ${toolName} 未就绪`);
    }

    // 如果已经初始化完成，直接返回
    if (tool.initialized) {
      return;
    }

    // 如果正在初始化，等待初始化完成
    if (tool.initializing) {
      await tool.initializing;
      return;
    }

    // 开始初始化
    tool.initializing = (async () => {
      try {
        mcpLogger.info(toolName, '开始初始化MCP协议...');

        const result = await this._sendRequest(toolName, 'initialize', {
          protocolVersion: '2025-06-18',
          clientInfo: {
            name: 'AutoTradingAI',
            version: '1.0.0'
          },
          capabilities: {
            experimental: {},
            prompts: {},
            resources: {}
          },
          workspaceFolders: []
        });

        // 等待更长时间确保服务器完全就绪
        mcpLogger.info(toolName, '等待服务器完全就绪...');
        await new Promise(resolve => setTimeout(resolve, MCP_INIT_WAIT_MS));

        tool.initialized = true;
        tool.initializedAt = Date.now();

        mcpLogger.success(toolName, 'MCP协议初始化完成，服务器已就绪');

        return result;
      } catch (error) {
        mcpLogger.error(toolName, `初始化失败: ${error.message}`);
        throw error;
      } finally {
        tool.initializing = null;
      }
    })();

    await tool.initializing;
  }

  async _sendRequest(toolName, methodName, params) {
    const tool = this.processes.get(toolName);
    if (!tool || !tool.ready) {
      throw new Error(`MCP工具 ${toolName} 未就绪`);
    }

    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;

      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: methodName,
        params
      };

      let responseData = '';

      const timeout = setTimeout(() => {
        tool.process.stdout.removeListener('data', dataHandler);
        mcpLogger.warning(toolName, `MCP调用超时: ${methodName}`);
        reject(new Error(`MCP请求超时: ${methodName}`));
      }, 30000);

      const dataHandler = (data) => {
        responseData += data.toString();

        try {
          const lines = responseData.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const response = JSON.parse(line);
              if (response.id === requestId) {
                clearTimeout(timeout);
                tool.process.stdout.removeListener('data', dataHandler);

                if (response.error) {
                  mcpLogger.error(toolName, `MCP错误: ${response.error.message}`);
                  reject(new Error(response.error.message));
                } else {
                  mcpLogger.success(toolName, `MCP调用成功: ${methodName}`);
                  resolve(response.result);
                }
                return;
              }
            } catch (e) {
              // ignore parse errors until full message arrives
            }
          }
        } catch (e) {
          // continue accumulating data
        }
      };

      tool.process.stdout.on('data', dataHandler);

      // 发送请求
      try {
        tool.process.stdin.write(JSON.stringify(request) + '\n');
        mcpLogger.info(toolName, `发送MCP请求: ${request.method}`);
      } catch (error) {
        clearTimeout(timeout);
        tool.process.stdout.removeListener('data', dataHandler);
        reject(error);
      }
    });
  }

  /**
   * 停止MCP工具
   */
  async stopMCPTool(toolName) {
    const tool = this.processes.get(toolName);
    if (tool && tool.process) {
      tool.process.kill();
      this.processes.delete(toolName);
      mcpLogger.info(toolName, '已停止');
    }
  }

  /**
   * 停止所有MCP工具
   */
  async stopAll() {
    for (const [toolName] of this.processes) {
      await this.stopMCPTool(toolName);
    }
  }
}

// 导出单例
const mcpClient = new MCPClient();

// 进程退出时清理
process.on('exit', () => {
  mcpClient.stopAll();
});

module.exports = mcpClient;

