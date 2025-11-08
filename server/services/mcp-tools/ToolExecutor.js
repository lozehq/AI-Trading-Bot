/**
 * MCP工具执行器
 * 负责调用各种MCP工具的方法
 */

const coingeckoMCP = require('../coingeckoMCP');
const dataSourceManager = require('../dataSourceManager');

class ToolExecutor {
  constructor() {
    this.executorConfig = {
      timeout: 30000,
      retries: 3
    };
  }

  /**
   * 通用工具调用入口
   */
  async callTool(toolId, methodName, params = {}) {
    console.log(`🔧 [MCP工具] 调用${toolId}.${methodName}`, params);

    switch (toolId) {
      case 'coingecko':
        return await this.callCoinGeckoMethod(methodName, params);

      case 'ccxt':
        return await this.callCCXTMethod(methodName, params);

      case 'indicators':
        return await this.callIndicatorsMethod(methodName, params);

      case 'aktools':
        return await this.callAkToolsMethod(methodName, params);

      case 'mcp_extended_indicators':
        return await this.callMCPIndicator(methodName, params);

      default:
        throw new Error(`未知的工具ID: ${toolId}`);
    }
  }

  /**
   * 调用AkTools方法
   */
  async callAkToolsMethod(methodName, params) {
    const { MCPConfigService } = require('../../database/services/MCPConfigService');
    const config = MCPConfigService.getByToolId('mcp-aktools');
    if (!config) {
      throw new Error('未检测到mcp-aktools配置');
    }

    const mcpClient = require('../mcpClient');

    await mcpClient.startMCPTool('mcp-aktools', {
      command: config.command,
      args: config.args,
      env: config.env,
      working_directory: config.workingDirectory || config.working_directory || null
    });

    const result = await mcpClient.sendMCPRequest('mcp-aktools', methodName, params);

    if (result && result.content) {
      const textContent = Array.isArray(result.content)
        ? result.content.find(item => item.type === 'text')
        : result.content;
      if (textContent && textContent.text) {
        return textContent.text;
      }
    }

    return result;
  }

  /**
   * 调用CoinGecko方法
   */
  async callCoinGeckoMethod(methodName, params) {
    switch (methodName) {
      case 'getCoinsMarkets':
      case 'getMarketsData':
        return await coingeckoMCP.getCoinsMarkets(
          params.vsCurrency || 'usd',
          params
        );

      case 'getCoinDetail':
        return await coingeckoMCP.getCoinDetail(params.coinId);

      case 'getTopGainersLosers':
        return await coingeckoMCP.getTopGainersLosers(
          params.vsCurrency || 'usd',
          params.duration || '24h'
        );

      case 'getNewCoins':
        return await coingeckoMCP.getNewCoins();

      case 'getMarketSentiment':
        return await coingeckoMCP.getMarketSentiment();

      case 'getAssetPlatforms':
        // 暂时返回空数组，可以后续实现
        return [];

      case 'getCoinsCategories':
        // 暂时返回空数组，可以后续实现
        return [];

      default:
        throw new Error(`未知的CoinGecko方法: ${methodName}`);
    }
  }

  /**
   * 调用CCXT方法
   * 使用dataSourceManager统一管理数据源
   */
  async callCCXTMethod(methodName, params) {
    const exchange = params.exchange || process.env.EXCHANGE_NAME || 'binance';
    const symbol = params.symbol || 'ETH/USDT';

    switch (methodName) {
      case 'fetchTicker':
        return await dataSourceManager.getTicker(exchange, symbol);

      case 'fetchOHLCV':
        return await dataSourceManager.getOHLCV(
          exchange,
          symbol,
          params.timeframe || '1h',
          params.limit || 100
        );

      case 'fetchOrderBook':
        return await dataSourceManager.getOrderBook(
          exchange,
          symbol,
          params.limit || 20
        );

      case 'fetchTrades':
        return await dataSourceManager.getTrades(
          exchange,
          symbol,
          params.limit || 50
        );

      case 'fetchBalance':
        // 获取账户余额（需要交易所API密钥）
        try {
          const ccxt = require('ccxt');
          const exchangeInstance = new ccxt[exchange]();
          if (!exchangeInstance.apiKey) {
            throw new Error(`${exchange} 交易所未配置API密钥`);
          }
          return await exchangeInstance.fetchBalance();
        } catch (error) {
          throw new Error(`获取余额失败: ${error.message}`);
        }

      case 'fetchTickers':
        return await dataSourceManager.getTickers(
          params.symbols || ['BTC/USDT', 'ETH/USDT']
        );

      case 'fetchTechnicalIndicators':
        return await dataSourceManager.getAllIndicators(
          exchange,
          symbol,
          params.timeframe || '1h'
        );

      default:
        throw new Error(`未知的CCXT方法: ${methodName}`);
    }
  }

  /**
   * 调用技术指标方法
   */
  async callIndicatorsMethod(methodName, params) {
    const exchange = params.exchange || 'binance';
    const symbol = params.symbol || 'ETH/USDT';
    const timeframe = params.timeframe || '1h';

    switch (methodName) {
      case 'getAllIndicators':
        return await dataSourceManager.getAllIndicators(exchange, symbol, timeframe);

      case 'calculateKDJ':
        // 暂时返回空对象，可以后续实现
        return { k: null, d: null, j: null };

      case 'calculateWilliamsR':
        return { value: null };

      case 'calculateParabolicSAR':
        return { value: null };

      case 'calculateATR':
        return { value: null };

      case 'calculateCCI':
        return { value: null };

      case 'calculateIchimoku':
        return {
          conversion: null,
          base: null,
          spanA: null,
          spanB: null,
          lagging: null
        };

      case 'calculateAroon':
        return {
          up: null,
          down: null
        };

      case 'calculateStochastic':
        return { k: null, d: null };

      case 'calculateADX':
        return { adx: null, plusDI: null, minusDI: null };

      case 'calculateOBV':
        return { value: null };

      case 'calculateMFI':
        return { value: null };

      default:
        throw new Error(`未知的技术指标方法: ${methodName}`);
    }
  }

  /**
   * 调用MCP扩展指标
   */
  async callMCPIndicator(methodName, params) {
    // 这些方法需要MCP扩展指标工具支持
    // 目前暂时返回空对象，后续可以集成真实的MCP服务

    console.log(`⚠️ [MCP指标] ${methodName} 方法暂时不可用，返回空数据`);

    switch (methodName) {
      case 'calculateKDJ':
        return { k: null, d: null, j: null, error: '需要mcp_extended_indicators工具支持' };

      case 'calculateWilliamsR':
        return { value: null, error: '需要mcp_extended_indicators工具支持' };

      case 'calculateParabolicSAR':
        return { value: null, error: '需要mcp_extended_indicators工具支持' };

      case 'calculateATR':
        return { value: null, error: '需要mcp_extended_indicators工具支持' };

      case 'calculateCCI':
        return { value: null, error: '需要mcp_extended_indicators工具支持' };

      default:
        throw new Error(`未知的MCP扩展指标方法: ${methodName}`);
    }
  }

  /**
   * 验证工具参数
   */
  validateParams(toolId, methodName, params) {
    const ToolRegistry = require('./ToolRegistry');
    const registry = new ToolRegistry();
    const method = registry.getMethod(toolId, methodName);

    if (!method) {
      throw new Error(`方法不存在: ${toolId}.${methodName}`);
    }

    // 检查必需参数
    for (const param of method.params) {
      if (params[param] === undefined) {
        throw new Error(`缺少必需参数: ${param}`);
      }
    }

    return true;
  }

  /**
   * 获取工具执行统计
   */
  getExecutionStats() {
    return {
      executorType: 'ToolExecutor',
      supportedTools: [
        'coingecko',
        'ccxt',
        'indicators',
        'aktools',
        'mcp_extended_indicators'
      ],
      config: this.executorConfig
    };
  }
}

module.exports = ToolExecutor;
