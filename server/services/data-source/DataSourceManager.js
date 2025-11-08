/**
 * 统一数据源管理器（重构版）
 * 支持MCP和CCXT两种数据源，提供统一的数据接口
 *
 * 重构说明:
 * - 拆分为 DataSourceConfig（配置管理）和 DataSourceRouter（数据路由）
 * - 保持与原文件相同的API接口
 */

const axios = require('axios');
const DataSourceConfig = require('./DataSourceConfig');
const DataSourceRouter = require('./DataSourceRouter');

class DataSourceManager {
  constructor() {
    this.config = new DataSourceConfig();
    this.router = new DataSourceRouter(this.config);
  }

  /**
   * 获取当前数据源
   */
  getCurrentSource() {
    return this.config.getCurrentSource();
  }

  /**
   * 切换数据源（带智能资源管理）
   */
  async switchSource(source, autoManageResources = true) {
    this.config.ensureConfigLoaded();

    if (source !== 'mcp' && source !== 'ccxt') {
      throw new Error('无效的数据源，必须是 "mcp" 或 "ccxt"');
    }

    const oldSource = this.config.getCurrentSource();
    this.config.setCurrentSource(source);

    console.log(`🔄 [数据源] 切换: ${oldSource.toUpperCase()} → ${source.toUpperCase()}`);

    // 智能资源管理
    if (autoManageResources) {
      try {
        if (source === 'ccxt' && String(process.env.ALWAYS_ON_MCP || '').toLowerCase() !== 'true') {
          // 切换到CCXT：如未要求常驻MCP，则停止MCP工具以节省资源
          console.log('💡 [数据源] 自动停止MCP工具以节省资源...');
          await axios.post('http://localhost:3000/api/mcp-control/stop-all', {}, {
            timeout: 3000
          });
          console.log('✅ [数据源] MCP工具已停止');
        } else if (source === 'mcp' || String(process.env.ALWAYS_ON_MCP || '').toLowerCase() === 'true') {
          // 切换到MCP 或者启用常驻MCP：确保MCP工具已启动
          console.log('💡 [数据源] 自动启动MCP工具...');
          await axios.post('http://localhost:3000/api/mcp-control/start-all', {}, {
            timeout: 3000
          });
          console.log('✅ [数据源] MCP工具已启动');
        }
      } catch (error) {
        console.warn('⚠️ [数据源] 自动管理MCP工具失败:', error.message);
        // 不抛出错误，因为数据源切换本身已成功
      }
    }

    return {
      success: true,
      oldSource,
      newSource: source,
      message: `数据源已切换到 ${source.toUpperCase()}`,
      resourceManagement: autoManageResources ? 'enabled' : 'disabled'
    };
  }

  /**
   * 检查MCP是否可用
   */
  async checkMCPAvailability() {
    try {
      const response = await axios.get('http://localhost:3000/api/mcp-control/status', {
        timeout: 2000
      });
      return response.data.data.runningTools > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取数据源状态
   */
  async getStatus() {
    this.config.ensureConfigLoaded();

    // 检查MCP实际可用性
    const mcpAvailable = await this.checkMCPAvailability();

    return {
      currentSource: this.config.getCurrentSource(),
      mcpStatus: {
        available: mcpAvailable,
        name: 'MCP工具',
        status: mcpAvailable ? 'running' : 'stopped'
      },
      ccxtStatus: {
        available: true,
        name: 'CCXT',
        status: 'available'
      },
      timestamp: Date.now()
    };
  }

  /**
   * 获取Ticker数据
   */
  async getTicker(exchange, symbol) {
    return await this.router.getTicker(exchange, symbol);
  }

  /**
   * 获取OHLCV数据
   */
  async getOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    return await this.router.getOHLCV(exchange, symbol, timeframe, limit);
  }

  /**
   * 获取所有技术指标
   */
  async getAllIndicators(exchange, symbol, timeframe = '1h') {
    return await this.router.getAllIndicators(exchange, symbol, timeframe);
  }

  /**
   * 获取订单簿
   */
  async getOrderBook(exchange, symbol, limit = 20) {
    return await this.router.getOrderBook(exchange, symbol, limit);
  }

  /**
   * 获取免费API增强数据
   */
  async getFreeAPIEnhancedData() {
    return await this.router.getFreeAPIEnhancedData();
  }

  /**
   * 获取综合市场分析数据 (包含免费API)
   */
  async getComprehensiveMarketData(exchange, symbol) {
    return await this.router.getComprehensiveMarketData(exchange, symbol);
  }

  /**
   * 清理免费API缓存
   */
  clearFreeAPICache() {
    this.router.freeAPI.clearCache();
  }

  /**
   * 获取免费API缓存统计
   */
  getFreeAPICacheStats() {
    return this.router.freeAPI.getCacheStats();
  }

  /**
   * 获取交易记录
   */
  async getTrades(exchange, symbol, limit = 50) {
    return await this.router.getTrades(exchange, symbol, limit);
  }

  /**
   * 获取资金费率
   */
  async getFundingRate(exchange, symbol) {
    return await this.router.getFundingRate(exchange, symbol);
  }

  /**
   * 获取持仓量（Open Interest）
   */
  async getOpenInterest(exchange, symbol) {
    return await this.router.getOpenInterest(exchange, symbol);
  }

  /**
   * 获取清算数据
   */
  async getLiquidations(exchange, symbol, limit = 100) {
    return await this.router.getLiquidations(exchange, symbol, limit);
  }

  /**
   * 获取恐惧贪婪指数
   */
  async getFearGreedIndex() {
    return await this.router.getFearGreedIndex();
  }

  /**
   * 获取完整市场数据
   */
  async getCompleteMarketData(exchange, symbol, timeframe = '1h') {
    return await this.router.getCompleteMarketData(exchange, symbol, timeframe);
  }

  // ==================== 向后兼容方法 ====================

  /**
   * 获取配置状态
   */
  getConfigStatus() {
    return this.config.getConfigStatus();
  }
}

module.exports = new DataSourceManager();
