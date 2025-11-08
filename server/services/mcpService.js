/**
 * @deprecated 此服务已被 mcpIntegration.js 替代
 *
 * 仅作为备用方案保留，不建议直接使用
 *
 * 请使用: require('./mcpIntegration')
 *
 * 保留原因：
 * - mcpIntegration.js 在MCP工具失败时会降级到此服务
 * - dataSourceManager.js 仍在使用此服务作为备用方案
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const mcpLogger = require('./mcpLogger');

class MCPService {
  constructor() {
    this.ccxtPath = 'npx -y @lazydino/ccxt-mcp';
    this.indicatorsPath = process.env.CRYPTO_INDICATORS_PATH || 'd:/AIGC-dm/MCP/指标mcp/crypto-indicators-mcp/index.js';
  }

  /**
   * 获取市场ticker数据
   */
  async fetchTicker(exchange, symbol, retries = 3) {
    const ccxt = require('ccxt');
    const exchangeConfig = require('../config/exchange-config');

    // ✅ 修复：优先使用 OKX（无地理限制），Binance 作为最后备选
    // 备用交易所列表（按优先级排序，排除可能受限的）
    const fallbackExchanges = exchangeConfig.getFallbackExchanges();
    const exchangesToTry = [exchange, ...fallbackExchanges.filter(e => e !== exchange)];

    let lastError = null;

    // 尝试多个交易所
    for (const currentExchange of exchangesToTry) {
      // 每个交易所尝试多次
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          mcpLogger.info('ccxt-mcp', `获取${symbol}价格 (${currentExchange}) [尝试 ${attempt}/${retries}]`);

          const exchangeInstance = new ccxt[currentExchange]({
            timeout: 30000, // 增加到30秒
            enableRateLimit: true,
            options: {
              defaultType: 'spot' // 现货市场
            }
          });

          const ticker = await exchangeInstance.fetchTicker(symbol);
          mcpLogger.success('ccxt-mcp', `✓ ${symbol}: $${ticker.last?.toFixed(2)} (${ticker.percentage?.toFixed(2)}%)`);

          return {
            symbol: ticker.symbol,
            price: ticker.last || ticker.close || 0,
            high24h: ticker.high || 0,
            low24h: ticker.low || 0,
            volume24h: ticker.baseVolume || ticker.volume || 0,
            change24h: ticker.percentage || 0,
            bid: ticker.bid || 0,
            ask: ticker.ask || 0,
            timestamp: ticker.timestamp || Date.now(),
            source: currentExchange // 记录数据来源
          };
        } catch (error) {
          lastError = error;
          mcpLogger.warn('ccxt-mcp', `获取失败 (${currentExchange}, 尝试 ${attempt}/${retries}): ${error.message}`);

          // 如果不是最后一次尝试，等待后重试
          if (attempt < retries) {
            const waitTime = attempt * 1000; // 递增等待时间：1秒、2秒、3秒
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      // 如果当前交易所所有尝试都失败，尝试下一个交易所
      mcpLogger.warn('ccxt-mcp', `${currentExchange} 所有尝试失败，尝试备用交易所...`);
    }

    // 所有交易所都失败
    mcpLogger.error('ccxt-mcp', `所有交易所获取Ticker失败: ${lastError?.message}`);
    throw new Error(`无法从任何交易所获取${symbol}价格: ${lastError?.message}`);
  }

  /**
   * 获取OHLCV数据
   */
  async fetchOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    const ccxt = require('ccxt');
    try {
      mcpLogger.info('ccxt-mcp', `获取${symbol} K线数据 (${timeframe}, ${limit}条)`);
      const exchangeInstance = new ccxt[exchange]();
      const ohlcv = await exchangeInstance.fetchOHLCV(symbol, timeframe, undefined, limit);
      mcpLogger.success('ccxt-mcp', `✓ 获取${limit}条K线数据`);
      return ohlcv.map(candle => ({
        timestamp: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
    } catch (error) {
      mcpLogger.error('ccxt-mcp', `获取OHLCV失败: ${error.message}`);
      console.error('获取OHLCV失败:', error.message);
      throw error;
    }
  }

  /**
   * 计算RSI指标
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) {
      return null;
    }

    let gains = 0;
    let losses = 0;

    // 计算初始平均涨跌
    for (let i = 1; i <= period; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference >= 0) {
        gains += difference;
      } else {
        losses -= difference;
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // 计算后续RSI
    for (let i = period + 1; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];
      
      if (difference >= 0) {
        avgGain = (avgGain * (period - 1) + difference) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - difference) / period;
      }
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * 计算MACD指标
   */
  calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const emaFast = this.calculateEMA(prices, fastPeriod);
    const emaSlow = this.calculateEMA(prices, slowPeriod);
    
    const macdLine = emaFast - emaSlow;
    
    // 计算信号线需要MACD历史数据，这里简化处理
    const signal = macdLine * 0.9; // 简化版本
    const histogram = macdLine - signal;

    return {
      MACD: macdLine,
      signal: signal,
      histogram: histogram
    };
  }

  /**
   * 计算EMA
   */
  calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  /**
   * 计算布林带
   */
  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (prices.length < period) return null;

    const slice = prices.slice(-period);
    const sma = slice.reduce((a, b) => a + b) / period;
    
    const squaredDiffs = slice.map(price => Math.pow(price - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }

  /**
   * 获取所有技术指标
   */
  async getAllIndicators(exchange, symbol, timeframe = '1h') {
    try {
      mcpLogger.info('crypto-indicators-mcp', `计算${symbol}技术指标 (${timeframe})`);
      const ohlcv = await this.fetchOHLCV(exchange, symbol, timeframe, 100);
      const closePrices = ohlcv.map(candle => candle.close);
      
      const rsi = this.calculateRSI(closePrices, 14);
      const macd = this.calculateMACD(closePrices);
      const bollinger = this.calculateBollingerBands(closePrices);
      
      const ema9 = this.calculateEMA(closePrices, 9);
      const ema21 = this.calculateEMA(closePrices, 21);
      const ema50 = this.calculateEMA(closePrices, 50);

      mcpLogger.success('crypto-indicators-mcp', `✓ RSI:${rsi?.toFixed(2)} MACD:${macd.MACD?.toFixed(2)} BB:${bollinger.middle?.toFixed(2)}`);

      return {
        rsi,
        macd,
        bollinger,
        ema: {
          ema9,
          ema21,
          ema50
        },
        currentPrice: closePrices[closePrices.length - 1],
        timestamp: Date.now()
      };
    } catch (error) {
      mcpLogger.error('crypto-indicators-mcp', `计算指标失败: ${error.message}`);
      console.error('计算指标失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取市场深度
   */
  async fetchOrderBook(exchange, symbol, limit = 20) {
    const ccxt = require('ccxt');
    try {
      const exchangeInstance = new ccxt[exchange]();
      const orderBook = await exchangeInstance.fetchOrderBook(symbol, limit);
      return {
        bids: orderBook.bids.slice(0, limit),
        asks: orderBook.asks.slice(0, limit),
        timestamp: orderBook.timestamp
      };
    } catch (error) {
      console.error('获取订单簿失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取最近成交记录
   */
  async fetchTrades(exchange, symbol, limit = 50) {
    const ccxt = require('ccxt');
    try {
      const exchangeInstance = new ccxt[exchange]();
      const trades = await exchangeInstance.fetchTrades(symbol, undefined, limit);
      return trades.map(trade => ({
        id: trade.id,
        timestamp: trade.timestamp,
        datetime: trade.datetime,
        symbol: trade.symbol,
        side: trade.side,
        price: trade.price,
        amount: trade.amount,
        cost: trade.cost
      }));
    } catch (error) {
      console.error(`获取交易记录失败:`, error.message);
      return [];
    }
  }

  /**
   * 获取账户余额
   */
  async fetchBalance(exchange) {
    const ccxt = require('ccxt');
    try {
      const exchangeInstance = new ccxt[exchange]();
      const balance = await exchangeInstance.fetchBalance();
      return balance;
    } catch (error) {
      console.error(`获取余额失败:`, error.message);
      return null;
    }
  }

  /**
   * 批量获取价格
   */
  async fetchTickers(exchange, symbols) {
    const ccxt = require('ccxt');
    try {
      const exchangeInstance = new ccxt[exchange]();
      const tickers = await exchangeInstance.fetchTickers(symbols);
      return tickers;
    } catch (error) {
      console.error(`批量获取价格失败:`, error.message);
      return {};
    }
  }

  /**
   * 获取资金费率（合约）
   */
  async fetchFundingRate(exchange, symbol) {
    const ccxt = require('ccxt');
    try {
      const exchangeInstance = new ccxt[exchange]();
      if (exchangeInstance.has['fetchFundingRate']) {
        const fundingRate = await exchangeInstance.fetchFundingRate(symbol);
        return fundingRate.fundingRate;
      }
      return null;
    } catch (error) {
      console.error('获取资金费率失败:', error.message);
      return null;
    }
  }
}

module.exports = new MCPService();

