/**
 * MCP工具集成服务
 * 使用MCP.TXT中配置的工具获取数据
 */

const mcpClient = require('./mcpClient');
const mcpService = require('./mcpService'); // 备用方案
const coingeckoMCP = require('./coingeckoMCP'); // CoinGecko MCP

// MCP工具配置（严格按照MCP.TXT）
const MCP_CONFIG = {
  'ccxt-mcp': {
    command: 'npx',
    args: [
      '-y',
      '@lazydino/ccxt-mcp',
      '--config',
      (process.env.CCXT_ACCOUNTS_PATH || 'config/ccxt-accounts.json')
    ],
    env: {},
    working_directory: null
  },
  'playwright': {
    command: 'npx',
    args: ['@playwright/mcp@latest'],
    env: {},
    working_directory: null
  },
  'crypto-indicators-mcp': {
    command: 'node',
    args: [(process.env.CRYPTO_INDICATORS_PATH || '<your-local-path>/crypto-indicators-mcp/index.js')],
    env: {
      EXCHANGE_NAME: 'okx'
    }
  },
  'coingecko_mcp': {
    command: 'npx',
    args: ['mcp-remote', 'https://mcp.api.coingecko.com/mcp'],
    env: {},
    working_directory: null
  }
};

class MCPIntegrationService {
  constructor() {
    // 从环境变量读取配置，支持动态开启/关闭MCP
    this.useMCP = process.env.USE_MCP === 'true' || false;
    this.initialized = false;
    this.cache = new Map();
    this.cacheTimers = new Map(); // 跟踪缓存定时器，防止泄漏
    this.cacheTimeout = parseInt(process.env.MCP_CACHE_TTL) || 60000; // 缓存时间默认60秒
  }

  /**
   * 初始化MCP工具
   */
  async initialize() {
    if (this.initialized) return;

    console.log('🚀 启动完整MCP功能（使用所有工具的所有函数）...\n');
    console.log('ℹ️  MCP进程模式已启用');
    console.log('ℹ️  所有MCP工具的所有功能函数都可用\n');

    try {
      // 启动所有MCP工具进程
      const tools = [
        { name: 'ccxt-mcp', config: MCP_CONFIG['ccxt-mcp'] },
        { name: 'crypto-indicators-mcp', config: MCP_CONFIG['crypto-indicators-mcp'] },
        { name: 'coingecko_mcp', config: MCP_CONFIG['coingecko_mcp'] }
      ];

      try {
        const { MCPConfigService } = require('../database/services/MCPConfigService');
        const customConfigs = MCPConfigService.getAll();
        customConfigs.forEach(cfg => {
          tools.push({
            name: cfg.toolId,
            config: {
              command: cfg.command,
              args: cfg.args,
              env: cfg.env,
              working_directory: cfg.workingDirectory || cfg.working_directory || null
            },
            isCustom: true
          });
        });
      } catch (error) {
        console.warn('⚠️  读取自定义MCP配置失败:', error.message);
      }

      for (const tool of tools) {
        try {
          console.log(`📦 启动 ${tool.name}...`);
          await mcpClient.startMCPTool(tool.name, tool.config);
          console.log(`   ✅ ${tool.name} 已就绪\n`);
        } catch (error) {
          console.warn(`   ⚠️  ${tool.name} 启动失败: ${error.message}`);
          console.warn(`   → 将使用备用方案\n`);
        }
      }
    } catch (error) {
      console.error('⚠️  MCP工具启动失败:', error.message);
      console.log('→ 将使用备用方案（直接API调用）\n');
    }

    this.initialized = true;
    console.log('✅ MCP工具初始化完成\n');
  }

  /**
   * 缓存管理方法
   */
  getCacheKey(method, ...args) {
    return `${method}_${args.join('_')}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
      console.log(`📦 使用缓存数据: ${key}`);
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    // 清除旧的定时器，防止定时器泄漏
    if (this.cacheTimers.has(key)) {
      clearTimeout(this.cacheTimers.get(key));
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // 自动清理过期缓存，并保存定时器引用
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.cacheTimers.delete(key);
    }, this.cacheTimeout);

    this.cacheTimers.set(key, timer);
  }

  /**
   * 清理所有缓存和定时器
   */
  clearAllCache() {
    // 清理所有定时器
    for (const timer of this.cacheTimers.values()) {
      clearTimeout(timer);
    }

    this.cache.clear();
    this.cacheTimers.clear();
    console.log('✅ 已清理所有MCP缓存');
  }

  /**
   * 获取Ticker（优先使用MCP）
   */
  async fetchTicker(exchange, symbol) {
    // 检查缓存
    const cacheKey = this.getCacheKey('ticker', exchange, symbol);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // 尝试使用MCP工具
    if (this.useMCP) {
      try {
        const result = await mcpClient.sendMCPRequest('ccxt-mcp', 'fetchTicker', {
          exchangeId: exchange, // ✅ 修复：使用exchangeId而不是exchange
          symbol
        });
        console.log(`📊 [MCP] 获取Ticker成功: ${symbol}`);

        // 解析MCP响应格式
        let tickerData = result;
        // 如果结果被包装在content字段中
        if (result && result.content) {
          // MCP协议可能返回content数组
          if (Array.isArray(result.content)) {
            const textContent = result.content.find(c => c.type === 'text');
            if (textContent && textContent.text) {
              try {
                tickerData = JSON.parse(textContent.text);
              } catch (e) {
                tickerData = result;
              }
            }
          } else {
            tickerData = result.content;
          }
        }

        // 规范化数据格式
        const normalizedData = {
          symbol: tickerData.symbol || symbol,
          price: tickerData.last || tickerData.price || tickerData.close || 0,
          high24h: tickerData.high || tickerData.high24h || 0,
          low24h: tickerData.low || tickerData.low24h || 0,
          volume24h: tickerData.baseVolume || tickerData.volume24h || tickerData.volume || 0,
          change24h: tickerData.percentage || tickerData.change24h || 0,
          bid: tickerData.bid || 0,
          ask: tickerData.ask || 0,
          timestamp: tickerData.timestamp || Date.now()
        };

        this.setCache(cacheKey, normalizedData); // 保存到缓存
        return normalizedData;
      } catch (error) {
        console.warn(`⚠️  [MCP] 获取Ticker失败，使用备用方案:`, error.message);
      }
    }

    // 备用方案：使用直接调用
    const result = await mcpService.fetchTicker(exchange, symbol);
    this.setCache(cacheKey, result); // 保存到缓存
    return result;
  }

  /**
   * 获取OHLCV（优先使用MCP）
   */
  async fetchOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    if (this.useMCP) {
      try {
        const result = await mcpClient.sendMCPRequest('ccxt-mcp', 'fetchOHLCV', {
          exchangeId: exchange, // ✅ 修复：使用exchangeId
          symbol,
          timeframe,
          limit
        });
        console.log(`📈 [MCP] 获取OHLCV成功: ${symbol}`);
        return result;
      } catch (error) {
        console.warn(`⚠️  [MCP] 获取OHLCV失败，使用备用方案:`, error.message);
      }
    }

    return await mcpService.fetchOHLCV(exchange, symbol, timeframe, limit);
  }

  /**
   * 计算技术指标（优先使用MCP）
   */
  async calculateIndicators(exchange, symbol, timeframe = '1h') {
    if (this.useMCP) {
      try {
        // crypto-indicators-mcp没有calculateAll，需要单独调用每个指标
        // 这里直接使用降级方案更简单
        throw new Error('使用降级方案计算指标（更快）');
      } catch (error) {
        console.warn(`⚠️  [MCP] 计算指标失败，使用备用方案:`, error.message);
      }
    }

    return await mcpService.getAllIndicators(exchange, symbol, timeframe);
  }

  /**
   * 获取所有指标（兼容原接口）
   */
  async getAllIndicators(exchange, symbol, timeframe = '1h') {
    return await this.calculateIndicators(exchange, symbol, timeframe);
  }

  /**
   * 获取订单簿
   */
  async fetchOrderBook(exchange, symbol, limit = 20) {
    if (this.useMCP) {
      try {
        return await mcpClient.sendMCPRequest('ccxt-mcp', 'fetchOrderBook', {
          exchangeId: exchange, // ✅ 修复：使用exchangeId
          symbol,
          limit
        });
      } catch (error) {
        console.warn(`⚠️  [MCP] 获取订单簿失败，使用备用方案:`, error.message);
      }
    }

    return await mcpService.fetchOrderBook(exchange, symbol, limit);
  }

  /**
   * 获取最近成交记录
   */
  async fetchTrades(exchange, symbol, limit = 50) {
    if (this.useMCP) {
      try {
        return await mcpClient.sendMCPRequest('ccxt-mcp', 'fetchTrades', {
          exchangeId: exchange,
          symbol,
          limit
        });
      } catch (error) {
        console.warn(`⚠️  [MCP] 获取交易记录失败，使用备用方案:`, error.message);
      }
    }

    return await mcpService.fetchTrades(exchange, symbol, limit);
  }

  /**
   * 获取账户余额
   */
  async fetchBalance(exchange) {
    if (this.useMCP) {
      try {
        return await mcpClient.sendMCPRequest('ccxt-mcp', 'fetchBalance', {
          exchangeId: exchange
        });
      } catch (error) {
        console.warn(`⚠️  [MCP] 获取余额失败:`, error.message);
      }
    }

    return await mcpService.fetchBalance(exchange);
  }

  /**
   * 批量获取价格
   */
  async fetchTickers(exchange, symbols) {
    if (this.useMCP) {
      try {
        return await mcpClient.sendMCPRequest('ccxt-mcp', 'fetchTickers', {
          exchangeId: exchange,
          symbols
        });
      } catch (error) {
        console.warn(`⚠️  [MCP] 批量获取价格失败:`, error.message);
      }
    }

    return await mcpService.fetchTickers(exchange, symbols);
  }

  /**
   * 关闭MCP工具
   */
  async shutdown() {
    console.log('⏹️  关闭MCP工具...');
    await mcpClient.stopAll();
  }
}

// 导出单例
const mcpIntegration = new MCPIntegrationService();

// 进程退出时清理
process.on('SIGINT', async () => {
  await mcpIntegration.shutdown();
  process.exit(0);
});

module.exports = mcpIntegration;

