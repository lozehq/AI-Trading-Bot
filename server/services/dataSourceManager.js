/**
 * 统一数据源管理器（修复版）
 * 支持MCP和CCXT两种数据源，提供统一的数据接口
 *
 * 修复内容:
 * - 解决循环依赖问题
 * - 增强配置加载的健壮性
 */

const axios = require('axios');

class DataSourceManager {
  constructor() {
    this._config = null;
    this._router = null;
    this._initialized = false;
  }

  /**
   * 延迟初始化，避免循环依赖
   */
  _initialize() {
    if (this._initialized) return;

    const DataSourceConfig = require('./data-source/DataSourceConfig');
    const DataSourceRouter = require('./data-source/DataSourceRouter');

    this._config = new DataSourceConfig();
    this._router = new DataSourceRouter(this._config);
    this._initialized = true;
  }

  /**
   * 获取当前数据源
   */
  getCurrentSource() {
    this._initialize();
    return this._config.getCurrentSource();
  }

  /**
   * 切换数据源（带智能资源管理）
   */
  async switchSource(source, autoManageResources = true) {
    this._initialize();

    if (source !== 'mcp' && source !== 'ccxt') {
      throw new Error('无效的数据源，必须是 "mcp" 或 "ccxt"');
    }

    const oldSource = this._config.getCurrentSource();
    this._config.setCurrentSource(source);

    console.log(`🔄 [数据源] 切换: ${oldSource.toUpperCase()} → ${source.toUpperCase()}`);

    // 智能资源管理
    if (autoManageResources) {
      try {
        if (source === 'ccxt') {
          // 切换到CCXT：停止MCP工具以节省资源
          console.log('💡 [数据源] 自动停止MCP工具以节省资源...');
          await axios.post('http://localhost:3000/api/mcp-control/stop-all', {}, {
            timeout: 3000
          });
          console.log('✅ [数据源] MCP工具已停止');
        } else if (source === 'mcp') {
          // 切换到MCP：启动MCP工具
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
    this._initialize();
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
    this._initialize();
    const mcpAvailable = await this.checkMCPAvailability();

    return {
      currentSource: this._config.getCurrentSource(),
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
    this._initialize();
    return await this._router.getTicker(exchange, symbol);
  }

  /**
   * 获取OHLCV数据
   */
  async getOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    this._initialize();
    return await this._router.getOHLCV(exchange, symbol, timeframe, limit);
  }

  /**
   * 获取所有技术指标
   */
  async getAllIndicators(exchange, symbol, timeframe = '1h') {
    this._initialize();
    return await this._router.getAllIndicators(exchange, symbol, timeframe);
  }

  /**
   * 获取订单簿
   */
  async getOrderBook(exchange, symbol, limit = 20) {
    this._initialize();
    return await this._router.getOrderBook(exchange, symbol, limit);
  }

  /**
   * 获取交易记录
   */
  async getTrades(exchange, symbol, limit = 50) {
    this._initialize();
    return await this._router.getTrades(exchange, symbol, limit);
  }

  /**
   * 获取资金费率
   */
  async getFundingRate(exchange, symbol) {
    this._initialize();
    return await this._router.getFundingRate(exchange, symbol);
  }

  /**
   * 获取持仓量（Open Interest）
   */
  async getOpenInterest(exchange, symbol) {
    this._initialize();
    return await this._router.getOpenInterest(exchange, symbol);
  }

  /**
   * 获取清算数据
   */
  async getLiquidations(exchange, symbol, limit = 100) {
    this._initialize();
    return await this._router.getLiquidations(exchange, symbol, limit);
  }

  /**
   * 获取恐惧贪婪指数
   */
  async getFearGreedIndex() {
    this._initialize();
    return await this._router.getFearGreedIndex();
  }

  /**
   * 获取完整市场数据
   */
  async getCompleteMarketData(exchange, symbol, timeframe = '1h') {
    this._initialize();
    return await this._router.getCompleteMarketData(exchange, symbol, timeframe);
  }

  /**
   * 部分数据源重试：按名称仅获取指定的数据源
   */
  async getPartialMarketData(exchange, symbol, timeframe = '1h', names = []) {
    this._initialize();
    return await this._router.getPartialMarketData(exchange, symbol, timeframe, names);
  }


  /**
   * 🆕 获取多时间框架趋势分析（优化版）
   */
  async getMultiTimeframeTrendOptimized(exchange, symbol, indicators1h) {
    this._initialize();
    return await this._router.getMultiTimeframeTrendOptimized(exchange, symbol, indicators1h);
  }

  /**
   * 🆕 获取多时间框架趋势分析
   */
  async getMultiTimeframeTrend(exchange, symbol) {
    this._initialize();
    return await this._router.getMultiTimeframeTrend(exchange, symbol);
  }

  /**
   * 获取配置状态
   */
  getConfigStatus() {
    this._initialize();
    return this._config.getConfigStatus();
  }

  // ========== 高级OKX数据方法 ==========

  async getFundingRateHistory(exchange, symbol, limit = 100) {
    this._initialize();
    return await this._router.getFundingRateHistory(exchange, symbol, limit);
  }

  async getOpenInterestHistory(exchange, symbol, timeframe = '1h', limit = 100) {
    this._initialize();
    return await this._router.getOpenInterestHistory(exchange, symbol, timeframe, limit);
  }

  async getLongShortRatio(exchange, symbol) {
    this._initialize();
    return await this._router.getLongShortRatio(exchange, symbol);
  }

  async getLongShortRatioHistory(exchange, symbol, period = '5m', limit = 100) {
    this._initialize();
    return await this._router.getLongShortRatioHistory(exchange, symbol, period, limit);
  }

  async getMarkPrice(exchange, symbol) {
    this._initialize();
    return await this._router.getMarkPrice(exchange, symbol);
  }

  async getTakerVolume(exchange, symbol) {
    this._initialize();
    return await this._router.getTakerVolume(exchange, symbol);
  }

  async getMarkOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    this._initialize();
    return await this._router.getMarkOHLCV(exchange, symbol, timeframe, limit);
  }

  async getIndexOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    this._initialize();
    return await this._router.getIndexOHLCV(exchange, symbol, timeframe, limit);
  }

  async getL2OrderBook(exchange, symbol, limit = 400) {
    this._initialize();
    return await this._router.getL2OrderBook(exchange, symbol, limit);
  }

  async getBorrowRateHistory(exchange, currency = 'USDT', limit = 100) {
    this._initialize();
    return await this._router.getBorrowRateHistory(exchange, currency, limit);
  }

  async getLeverageTiers(exchange, symbol) {
    this._initialize();
    return await this._router.getLeverageTiers(exchange, symbol);
  }

  async getFundingInterval(exchange, symbol) {
    this._initialize();
    return await this._router.getFundingInterval(exchange, symbol);
  }

  async getOptionGreeks(exchange, symbol) {
    this._initialize();
    return await this._router.getOptionGreeks(exchange, symbol);
  }

  async getOptionChain(exchange, symbol, expiryDate = null) {
    this._initialize();
    return await this._router.getOptionChain(exchange, symbol, expiryDate);
  }

  async getSystemStatus(exchange) {
    this._initialize();
    return await this._router.getSystemStatus(exchange);
  }

  async getInsuranceFund(exchange, symbol = 'BTC/USDT') {
    this._initialize();
    return await this._router.getInsuranceFund(exchange, symbol);
  }

  async getPremiumIndex(exchange, symbol) {
    this._initialize();
    return await this._router.getPremiumIndex(exchange, symbol);
  }

  // ========== 情绪和市场数据方法 ==========

  /**
   * 获取Fear & Greed历史
   */
  async getFearGreedHistory() {
    this._initialize();
    return await this._router.getFearGreedHistory();
  }

  /**
   * 获取币种详情
   */
  async getCoinDetail(symbol) {
    this._initialize();
    return await this._router.getCoinDetail(symbol);
  }

  /**
   * 获取涨跌榜
   */
  async getGainersLosers() {
    this._initialize();
    return await this._router.getGainersLosers();
  }

  /**
   * 获取市场情绪
   */
  async getSentiment(symbol) {
    this._initialize();
    return await this._router.getSentiment(symbol);
  }

  /**
   * 获取趋势币种
   */
  async getTrendingCoins() {
    this._initialize();
    return await this._router.getTrendingCoins();
  }

  /**
   * 获取涨幅榜
   */
  async getTopGainers() {
    this._initialize();
    return await this._router.getTopGainers();
  }

  /**
   * 获取跌幅榜
   */
  async getTopLosers() {
    this._initialize();
    return await this._router.getTopLosers();
  }

  /**
   * 获取Twitter情绪
   */
  async getTwitterSentiment(symbol) {
    this._initialize();
    return await this._router.getTwitterSentiment(symbol);
  }

  /**
   * 获取Reddit情绪
   */
  async getRedditSentiment(symbol) {
    this._initialize();
    return await this._router.getRedditSentiment(symbol);
  }

  /**
   * 获取Telegram情绪
   */
  async getTelegramSentiment(symbol) {
    this._initialize();
    return await this._router.getTelegramSentiment(symbol);
  }

  /**
   * 获取高级技术指标
   */
  async getAdvancedIndicators(symbol, timeframe = '1h') {
    this._initialize();
    return await this._router.getAdvancedIndicators(symbol, timeframe);
  }
}

module.exports = new DataSourceManager();
