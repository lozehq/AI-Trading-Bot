/**
 * OKX完整数据获取服务 (重构版)
 * 使用CCXT免费公开API获取所有市场数据和技术指标
 * 无需API密钥
 * 支持代理配置，解决国内访问问题
 *
 * 重构说明:
 * - 拆分为多个模块: ExchangePoolManager, ExchangeManager, DataFetcher, TechnicalIndicators
 * - 保持与原文件相同的API接口
 */

const ExchangeManager = require('./ExchangeManager');
const DataFetcher = require('./DataFetcher');

class OKXDataService {
  constructor() {
    this.exchangeManager = new ExchangeManager();
    this.dataFetcher = new DataFetcher(this.exchangeManager);
  }

  /**
   * 1. 获取实时价格数据（Ticker）
   */
  async getTicker(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getTicker(symbol);
  }

  /**
   * 2. 获取K线数据（OHLCV）
   */
  async getOHLCV(symbol = 'BTC/USDT', timeframe = '1h', limit = 100) {
    return await this.dataFetcher.getOHLCV(symbol, timeframe, limit);
  }

  /**
   * 3. 获取订单簿（Order Book）
   */
  async getOrderBook(symbol = 'BTC/USDT', limit = 20) {
    return await this.dataFetcher.getOrderBook(symbol, limit);
  }

  /**
   * 4. 获取最近成交记录（Trades）
   */
  async getTrades(symbol = 'BTC/USDT', limit = 50) {
    return await this.dataFetcher.getTrades(symbol, limit);
  }

  /**
   * 5. 获取所有交易对列表
   */
  async getMarkets() {
    return await this.dataFetcher.getMarkets();
  }

  /**
   * 6. 批量获取多个交易对价格
   */
  async getTickers(symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT']) {
    return await this.dataFetcher.getTickers(symbols);
  }

  /**
   * 7. 计算所有技术指标
   */
  async getAllIndicators(symbol = 'BTC/USDT', timeframe = '1h') {
    return await this.dataFetcher.getAllIndicators(symbol, timeframe);
  }

  /**
   * 8. 获取完整市场数据（一次性获取所有数据）
   */
  async getCompleteMarketData(symbol = 'BTC/USDT', timeframe = '1h') {
    return await this.dataFetcher.getCompleteMarketData(symbol, timeframe);
  }

  /**
   * 9. 获取资金费率历史
   */
  async getFundingRateHistory(symbol = 'BTC/USDT', limit = 100) {
    return await this.dataFetcher.getFundingRateHistory(symbol, limit);
  }

  /**
   * 10. 获取持仓量历史
   */
  async getOpenInterestHistory(symbol = 'BTC/USDT', timeframe = '1h', limit = 100) {
    return await this.dataFetcher.getOpenInterestHistory(symbol, timeframe, limit);
  }

  /**
   * 11. 获取多空比
   */
  async getLongShortRatio(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getLongShortRatio(symbol);
  }

  /**
   * 12. 获取多空比历史
   */
  async getLongShortRatioHistory(symbol = 'BTC/USDT', period = '5m', limit = 100) {
    return await this.dataFetcher.getLongShortRatioHistory(symbol, period, limit);
  }

  /**
   * 13. 获取标记价格
   */
  async getMarkPrice(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getMarkPrice(symbol);
  }

  /**
   * 14. 获取主动买卖量
   */
  async getTakerVolume(symbol = 'BTC/USDT', period = '5m', limit = 100) {
    return await this.dataFetcher.getTakerVolume(symbol, period, limit);
  }

  /**
   * 15. 获取标记价格K线
   */
  async getMarkOHLCV(symbol = 'BTC/USDT', timeframe = '1h', limit = 100) {
    return await this.dataFetcher.getMarkOHLCV(symbol, timeframe, limit);
  }

  /**
   * 16. 获取指数价格K线
   */
  async getIndexOHLCV(symbol = 'BTC/USDT', timeframe = '1h', limit = 100) {
    return await this.dataFetcher.getIndexOHLCV(symbol, timeframe, limit);
  }

  /**
   * 17. 获取���度订单簿
   */
  async getL2OrderBook(symbol = 'BTC/USDT', depth = 400) {
    return await this.dataFetcher.getL2OrderBook(symbol, depth);
  }

  /**
   * 18. 获取借贷利率历史
   */
  async getBorrowRateHistory(currency = 'USDT', limit = 100) {
    return await this.dataFetcher.getBorrowRateHistory(currency, limit);
  }

  /**
   * 19. 获取杠杆档位
   */
  async getLeverageTiers(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getLeverageTiers(symbol);
  }

  /**
   * 20. 获取资金费率间隔
   */
  async getFundingInterval(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getFundingInterval(symbol);
  }

  /**
   * 21. 获取期权Greeks
   */
  async getOptionGreeks(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getOptionGreeks(symbol);
  }

  /**
   * 22. 获取期权链
   */
  async getOptionChain(symbol = 'BTC/USDT', expiryDate = null) {
    return await this.dataFetcher.getOptionChain(symbol, expiryDate);
  }

  /**
   * 23. 获取系统状态
   */
  async getSystemStatus() {
    return await this.dataFetcher.getSystemStatus();
  }

  /**
   * 24. 批量获取Ticker
   */
  async getBatchTickers(symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT']) {
    return await this.dataFetcher.getBatchTickers(symbols);
  }

  /**
   * 25. 获取历史K线
   */
  async getHistoryCandles(symbol = 'BTC/USDT', timeframe = '1d', after = null, limit = 100) {
    return await this.dataFetcher.getHistoryCandles(symbol, timeframe, after, limit);
  }

  /**
   * 26. 获取历史标记价格K线
   */
  async getHistoryMarkCandles(symbol = 'BTC/USDT', timeframe = '1d', after = null, limit = 100) {
    return await this.dataFetcher.getHistoryMarkCandles(symbol, timeframe, after, limit);
  }

  /**
   * 27. 获取历史指数价格K线
   */
  async getHistoryIndexCandles(symbol = 'BTC/USDT', timeframe = '1d', after = null, limit = 100) {
    return await this.dataFetcher.getHistoryIndexCandles(symbol, timeframe, after, limit);
  }

  /**
   * 28. 获取当前持仓量
   */
  async getCurrentOpenInterest(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getCurrentOpenInterest(symbol);
  }

  /**
   * 29. 获取持仓量和交易量
   */
  async getOpenInterestVolume(symbol = 'BTC/USDT', period = '5m', limit = 72) {
    return await this.dataFetcher.getOpenInterestVolume(symbol, period, limit);
  }

  /**
   * 30. 获取多空持仓比
   */
  async getLongShortPositionRatio(symbol = 'BTC/USDT', period = '5m', limit = 100) {
    return await this.dataFetcher.getLongShortPositionRatio(symbol, period, limit);
  }

  /**
   * 31. 获取期权持仓量
   */
  async getOptionOpenInterestVolume(currency = 'BTC', period = '8H') {
    return await this.dataFetcher.getOptionOpenInterestVolume(currency, period);
  }

  /**
   * 32. 获取保险基金
   */
  async getInsuranceFund(symbol = 'BTC/USDT', type = 'liquidation_balance_deposit', limit = 100) {
    return await this.dataFetcher.getInsuranceFund(symbol, type, limit);
  }

  /**
   * 33. 获取交割行权历史
   */
  async getDeliveryExerciseHistory(instType = 'FUTURES', underlying = 'BTC-USDT', limit = 100) {
    return await this.dataFetcher.getDeliveryExerciseHistory(instType, underlying, limit);
  }

  /**
   * 34. 获取标的指数
   */
  async getUnderlyingIndex(instType = 'FUTURES') {
    return await this.dataFetcher.getUnderlyingIndex(instType);
  }

  /**
   * 35. 获取指数行情
   */
  async getIndexTickers(quoteCurrency = 'USDT') {
    return await this.dataFetcher.getIndexTickers(quoteCurrency);
  }

  /**
   * 36. 获取大宗交易行情
   */
  async getBlockTickers(instType = 'SPOT') {
    return await this.dataFetcher.getBlockTickers(instType);
  }

  /**
   * 37. 获取大宗成交记录
   */
  async getBlockTrades(symbol = 'BTC/USDT', limit = 100) {
    return await this.dataFetcher.getBlockTrades(symbol, limit);
  }

  /**
   * 38. 获取24小时总交易量
   */
  async get24hrTotalVolume() {
    return await this.dataFetcher.get24hrTotalVolume();
  }

  /**
   * 39. 获取账户余额
   */
  async getBalance() {
    return await this.dataFetcher.getBalance();
  }

  /**
   * 40. 获取持仓信息
   */
  async getPositions(symbols = null) {
    return await this.dataFetcher.getPositions(symbols);
  }

  /**
   * 41. 获取所有订单
   */
  async getOrders(symbol = 'BTC/USDT', since = null, limit = 100) {
    return await this.dataFetcher.getOrders(symbol, since, limit);
  }

  /**
   * 42. 获取未完成订单
   */
  async getOpenOrders(symbol = null, since = null, limit = 100) {
    return await this.dataFetcher.getOpenOrders(symbol, since, limit);
  }

  /**
   * 43. 获取已完成订单
   */
  async getClosedOrders(symbol = 'BTC/USDT', since = null, limit = 100) {
    return await this.dataFetcher.getClosedOrders(symbol, since, limit);
  }

  /**
   * 44. 获取我的交易记录
   */
  async getMyTrades(symbol = 'BTC/USDT', since = null, limit = 100) {
    return await this.dataFetcher.getMyTrades(symbol, since, limit);
  }

  /**
   * 45. 获取服务器时间
   */
  async getServerTime() {
    return await this.dataFetcher.getServerTime();
  }

  /**
   * 46. 获取币种信息
   */
  async getCurrencies() {
    return await this.dataFetcher.getCurrencies();
  }

  /**
   * 47. 获取充值记录
   */
  async getDeposits(code = null, since = null, limit = 100) {
    return await this.dataFetcher.getDeposits(code, since, limit);
  }

  /**
   * 48. 获取提现记录
   */
  async getWithdrawals(code = null, since = null, limit = 100) {
    return await this.dataFetcher.getWithdrawals(code, since, limit);
  }

  /**
   * 49. 获取交易费率
   */
  async getTradingFees(symbol = null) {
    return await this.dataFetcher.getTradingFees(symbol);
  }

  /**
   * 50. 获取单个交易对费率
   */
  async getTradingFee(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getTradingFee(symbol);
  }

  /**
   * 51. 获取充值地址
   */
  async getDepositAddress(currency = 'USDT', network = null) {
    return await this.dataFetcher.getDepositAddress(currency, network);
  }

  /**
   * 52. 获取账本记录
   */
  async getLedger(currency = null, since = null, limit = 100) {
    return await this.dataFetcher.getLedger(currency, since, limit);
  }

  /**
   * 53. 获取资金划转记录
   */
  async getTransfers(currency = null, since = null, limit = 100) {
    return await this.dataFetcher.getTransfers(currency, since, limit);
  }

  /**
   * 54. 获取杠杆倍数
   */
  async getLeverage(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getLeverage(symbol);
  }

  /**
   * 55. 获取保证金模式
   */
  async getMarginMode(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getMarginMode(symbol);
  }

  /**
   * 56. 获取借贷利率
   */
  async getBorrowRate(currency = 'USDT') {
    return await this.dataFetcher.getBorrowRate(currency);
  }

  /**
   * 57. 获取所有币种借贷利率
   */
  async getBorrowRates(currencies = null) {
    return await this.dataFetcher.getBorrowRates(currencies);
  }

  /**
   * 58. 获取交易所状态
   */
  async getExchangeStatus() {
    return await this.dataFetcher.getExchangeStatus();
  }

  /**
   * 59. 获取市值排行
   */
  async getMarketCapRanking(limit = 100) {
    return await this.dataFetcher.getMarketCapRanking(limit);
  }

  /**
   * 60. 获取交易对详细信息
   */
  async getInstrumentInfo(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getInstrumentInfo(symbol);
  }

  /**
   * 61. 获取溢价指数
   */
  async getPremiumIndex(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getPremiumIndex(symbol);
  }

  /**
   * 62. 获取可转换币种
   */
  async getConvertCurrencies() {
    return await this.dataFetcher.getConvertCurrencies();
  }

  /**
   * 63. 获取强平订单
   */
  async getLiquidationOrders(symbol = 'BTC/USDT', limit = 100) {
    return await this.dataFetcher.getLiquidationOrders(symbol, limit);
  }

  /**
   * 64. 获取最大可开单数量
   */
  async getMaxOrderSize(symbol = 'BTC/USDT', leverage = 1) {
    return await this.dataFetcher.getMaxOrderSize(symbol, leverage);
  }

  /**
   * 65. 获取价格限制
   */
  async getPriceLimit(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getPriceLimit(symbol);
  }

  /**
   * 66. 获取预估交割/行权价格
   */
  async getEstimatedPrice(symbol = 'BTC/USDT') {
    return await this.dataFetcher.getEstimatedPrice(symbol);
  }

  /**
   * 67. 获取VIP费率等级
   */
  async getVIPLevels() {
    return await this.dataFetcher.getVIPLevels();
  }

  /**
   * 68. 获取利率
   */
  async getInterestRate(currency = 'USDT') {
    return await this.dataFetcher.getInterestRate(currency);
  }

  /**
   * 69. 获取资产估值
   */
  async getAssetValuation() {
    return await this.dataFetcher.getAssetValuation();
  }

  /**
   * 70. 获取风险准备金余额
   */
  async getRiskReserve(currency = 'BTC') {
    return await this.dataFetcher.getRiskReserve(currency);
  }

  /**
   * 71. 获取成交明细
   */
  async getFillsHistory(symbol = 'BTC/USDT', limit = 100) {
    return await this.dataFetcher.getFillsHistory(symbol, limit);
  }

  /**
   * 72. 获取账户配置
   */
  async getAccountConfig() {
    return await this.dataFetcher.getAccountConfig();
  }

  // ==================== 辅助方法 ====================

  /**
   * 设置当前交易所
   */
  setExchange(exchangeName) {
    this.exchangeManager.setExchange(exchangeName);
  }

  /**
   * 获取当前交易所名称
   */
  getExchangeName() {
    return this.exchangeManager.getExchangeName();
  }

  /**
   * 获取所有支持的交易所列表
   */
  getSupportedExchanges() {
    return this.exchangeManager.getSupportedExchanges();
  }

  /**
   * 获取连接池统计信息
   */
  getPoolStats() {
    return this.exchangeManager.getPoolStats();
  }

  /**
   * 清空连接池
   */
  clearPool() {
    this.exchangeManager.clearPool();
  }

  /**
   * 执行操作（向后兼容）
   */
  async executeWithFallback(operation, operationName) {
    return await this.exchangeManager.executeWithFallback(operation, operationName);
  }

  // ==================== 保留的便捷方法 ====================

  /**
   * 获取价格数据
   * @deprecated 使用 getTicker 代替
   */
  async fetchTicker(symbol) {
    return await this.getTicker(symbol);
  }

  /**
   * 获取OHLCV数据
   * @deprecated 使用 getOHLCV 代替
   */
  async fetchOHLCV(symbol, timeframe, limit) {
    return await this.getOHLCV(symbol, timeframe, limit);
  }

  /**
   * 获取批量价格数据
   * @deprecated 使用 getTickers 代替
   */
  async fetchTickers(symbols) {
    return await this.getTickers(symbols);
  }
}

module.exports = new OKXDataService();
