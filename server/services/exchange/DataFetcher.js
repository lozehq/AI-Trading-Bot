/**
 * 数据获取器
 * 负责从交易所获取市场数据
 */

const TechnicalIndicators = require('../indicators/TechnicalIndicators');
const networkOptimizer = require('../../utils/networkOptimizer');
const { signedGet } = require('./okxRequest');

const axios = {
  get: (url, config = {}) => networkOptimizer.get(url, config)
};

const normalizeOkxSymbol = (symbol = 'BTC/USDT') => {
  if (!symbol) return 'BTC-USDT';
  return symbol.trim().replace(/\s+/g, '').replace('/', '-').toUpperCase();
};

const toOkxInstId = (symbol = 'BTC/USDT', instType = 'SPOT') => {
  const normalized = normalizeOkxSymbol(symbol);
  switch (instType) {
    case 'SWAP':
      if (/-SWAP$/.test(normalized) || /-PERP$/.test(normalized)) {
        return normalized;
      }
      return `${normalized}-SWAP`;
    case 'FUTURES':
      if (/-FUTURES$/.test(normalized)) {
        return normalized;
      }
      return `${normalized}-FUTURES`;
    case 'INDEX':
      return normalized.replace(/-(SWAP|FUTURES|SPOT)$/,'');
    case 'SPOT':
    default:
      return normalized.replace(/-(SWAP|FUTURES|SPOT)$/,'');
  }
};

const toOkxUnderlying = (symbol = 'BTC/USDT') => {
  return normalizeOkxSymbol(symbol).replace(/-(SWAP|FUTURES|SPOT|PERP)$/,'');
};

class DataFetcher {
  constructor(exchangeManager) {
    this.exchangeManager = exchangeManager;
  }

  /**
   * 获取实时价格数据（Ticker）
   */
  async getTicker(symbol = 'BTC/USDT') {
    const fetchOkxPublicTicker = async () => {
      const instId = toOkxInstId(symbol, 'SPOT');
      const resp = await axios.get('https://www.okx.com/api/v5/market/ticker', { params: { instId }, timeout: 8000 });
      const d = resp.data && resp.data.data && resp.data.data[0];
      if (!d) throw new Error('OKX返回空Ticker');
      const last = parseFloat(d.last);
      const open = d.open24h ? parseFloat(d.open24h) : null;
      const bid = d.bidPx ? parseFloat(d.bidPx) : null;
      const ask = d.askPx ? parseFloat(d.askPx) : null;
      const high = d.high24h ? parseFloat(d.high24h) : null;
      const low = d.low24h ? parseFloat(d.low24h) : null;
      const baseVolume = d.vol24h ? parseFloat(d.vol24h) : null;
      const quoteVolume = d.volCcy24h ? parseFloat(d.volCcy24h) : null;
      const percentage = open ? ((last - open) / open) * 100 : null;
      const change = open ? (last - open) : null;
      const ts = d.ts ? Number(d.ts) : Date.now();
      return {
        symbol,
        timestamp: ts,
        datetime: new Date(ts).toISOString(),
        last,
        bid,
        ask,
        high,
        low,
        open,
        close: last,
        baseVolume,
        quoteVolume,
        percentage,
        change,
        vwap: null,
        previousClose: null
      };
    };

    return await this.exchangeManager.executeWithFallback(async () => {
      const ex = this.exchangeManager.getExchangeName();
      console.log(`📊 [${ex.toUpperCase()}] 获取${symbol}实时价格...`);
      let ticker;
      try {
        ticker = await this.exchangeManager.getExchange().fetchTicker(symbol);
      } catch (err) {
        const msg = String(err.message || '');
        const isNetworkError = /fetch failed|ENOTFOUND|ECONNRESET|EAI_AGAIN|getaddrinfo|network|timeout|binannce|appi|v55/i.test(msg);
        const isRateLimited = /throttle queue is over maxCapacity|418|Way too much request weight/i.test(msg);
        if (ex === 'okx' && (isRateLimited || isNetworkError)) {
          // 直接使用OKX公开API进行兜底
          ticker = await fetchOkxPublicTicker();
        } else {
          throw err;
        }
      }

      return {
        symbol: ticker.symbol,
        timestamp: ticker.timestamp,
        datetime: ticker.datetime,
        // 价格数据
        last: ticker.last,           // 最新价
        bid: ticker.bid,             // 买一价
        ask: ticker.ask,             // 卖一价
        high: ticker.high,           // 24h最高价
        low: ticker.low,             // 24h最低价
        open: ticker.open,           // 开盘价
        close: ticker.close,         // 收盘价
        // 成交量
        baseVolume: ticker.baseVolume,   // 基础货币成交量
        quoteVolume: ticker.quoteVolume, // 计价货币成交量
        // 涨跌幅
        percentage: ticker.percentage,   // 涨跌幅百分比
        change: ticker.change,           // 涨跌额
        // 其他
        vwap: ticker.vwap,           // 成交量加权平均价
        previousClose: ticker.previousClose
      };
    }, `获取${symbol}价格`);
  }

  /**
   * 获取K线数据（OHLCV）
   */
  async getOHLCV(symbol = 'BTC/USDT', timeframe = '1h', limit = 100) {
    const numericLimit = Math.max(1, Number(limit) || 100);
    const fetchOkxPublicOHLCV = async () => {
      const instId = toOkxInstId(symbol, 'SPOT');
      const mapTf = (tf) => ({ '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','6h':'6H','12h':'12H','1d':'1D','1w':'1W' }[tf] || '1H');
      const bar = mapTf(timeframe);
      const targetLimit = numericLimit;
      const maxPerPage = 200;
      const maxAttempts = Math.max(3, Math.ceil(targetLimit / maxPerPage) + 1);
      let attempts = 0;
      let before;
      let candles = [];

      while (candles.length < targetLimit && attempts < maxAttempts) {
        const remaining = targetLimit - candles.length;
        const size = Math.min(maxPerPage, remaining);
        const params = { instId, bar, limit: size };
        if (before) params.before = before;

        const resp = await axios.get('https://www.okx.com/api/v5/market/candles', {
          params,
          timeout: 25000
        });

        const arr = resp.data && resp.data.data;
        if (!Array.isArray(arr) || arr.length === 0) {
          break;
        }

        const page = arr
          .reverse()
          .map(c => ({
            timestamp: Number(c[0]),
            datetime: new Date(Number(c[0])).toISOString(),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5])
          }));

        const existing = new Set(candles.map(c => c.timestamp));
        for (const candle of page) {
          if (!existing.has(candle.timestamp)) {
            candles.push(candle);
          }
        }

        candles.sort((a, b) => a.timestamp - b.timestamp);
        before = arr[0] && arr[0][0] ? Number(arr[0][0]) : undefined;
        attempts += 1;
        if (!before) break;
      }

      if (candles.length > targetLimit) {
        candles = candles.slice(candles.length - targetLimit);
      }

      if (candles.length < targetLimit) {
        console.warn(`⚠️ OKX公开API仅返回 ${candles.length}/${targetLimit} 条K线 (${symbol} ${timeframe})`);
      }

      return candles;
    };

    return await this.exchangeManager.executeWithFallback(async () => {
      const ex = this.exchangeManager.getExchangeName();
      console.log(`📈 [${ex.toUpperCase()}] 获取${symbol} K线数据 (${timeframe}, ${numericLimit}条)...`);
      try {
        const ohlcv = await this.exchangeManager.getExchange().fetchOHLCV(symbol, timeframe, undefined, numericLimit);
        return ohlcv.map(candle => ({
          timestamp: candle[0],
          datetime: new Date(candle[0]).toISOString(),
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5]
        }));
      } catch (err) {
        const msg = String(err.message || '');
        const isNetworkError = /fetch failed|ENOTFOUND|ECONNRESET|EAI_AGAIN|getaddrinfo|network|timeout|binannce|appi|v55/i.test(msg);
        const isRateLimited = /429|too many requests|throttle|over max/i.test(msg);
        if (ex === 'okx' && (isNetworkError || isRateLimited)) {
          return await fetchOkxPublicOHLCV();
        }
        throw err;
      }
    }, `获取${symbol} K线数据`);
  }

  /**
   * 获取订单簿（Order Book）
   */
  async getOrderBook(symbol = 'BTC/USDT', limit = 20) {
    try {
      console.log(`📖 [OKX] 获取${symbol}订单簿 (深度${limit})...`);
      const orderBook = await this.exchangeManager.getExchange().fetchOrderBook(symbol, limit);

      return {
        symbol,
        timestamp: orderBook.timestamp,
        datetime: orderBook.datetime,
        bids: orderBook.bids.map(bid => ({
          price: bid[0],
          amount: bid[1]
        })),
        asks: orderBook.asks.map(ask => ({
          price: ask[0],
          amount: ask[1]
        })),
        // 计算买卖压力
        bidVolume: orderBook.bids.reduce((sum, bid) => sum + bid[1], 0),
        askVolume: orderBook.asks.reduce((sum, ask) => sum + ask[1], 0),
        spread: orderBook.asks[0][0] - orderBook.bids[0][0], // 买卖价差
        spreadPercent: ((orderBook.asks[0][0] - orderBook.bids[0][0]) / orderBook.bids[0][0] * 100).toFixed(4)
      };
    } catch (error) {
      console.error(`❌ 获取订单簿失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取最近成交记录（Trades）
   */
  async getTrades(symbol = 'BTC/USDT', limit = 50) {
    try {
      console.log(`💱 [OKX] 获取${symbol}最近成交 (${limit}条)...`);
      const trades = await this.exchangeManager.getExchange().fetchTrades(symbol, undefined, limit);

      return trades.map(trade => ({
        id: trade.id,
        timestamp: trade.timestamp,
        datetime: trade.datetime,
        symbol: trade.symbol,
        side: trade.side,      // 'buy' or 'sell'
        price: trade.price,
        amount: trade.amount,
        cost: trade.cost       // price * amount
      }));
    } catch (error) {
      console.error(`❌ 获取成交记录失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取所有交易对列表
   */
  async getMarkets() {
    try {
      console.log(`🌐 [OKX] 获取所有交易对...`);
      const markets = await this.exchangeManager.getExchange().fetchMarkets();

      return markets.map(market => ({
        id: market.id,
        symbol: market.symbol,
        base: market.base,
        quote: market.quote,
        active: market.active,
        type: market.type,
        spot: market.spot,
        margin: market.margin,
        future: market.future,
        swap: market.swap,
        // 交易限制
        limits: {
          amount: market.limits.amount,
          price: market.limits.price,
          cost: market.limits.cost
        },
        // 精度
        precision: {
          amount: market.precision.amount,
          price: market.precision.price
        }
      }));
    } catch (error) {
      console.error(`❌ 获取交易对列表失败:`, error.message);
      throw error;
    }
  }

  /**
   * 批量获取多个交易对价格
   */
  async getTickers(symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT']) {
    try {
      console.log(`📊 [OKX] 批量获取价格 (${symbols.length}个交易对)...`);
      const tickers = await this.exchangeManager.getExchange().fetchTickers(symbols);

      const result = {};
      for (const symbol of symbols) {
        if (tickers[symbol]) {
          result[symbol] = {
            last: tickers[symbol].last,
            high: tickers[symbol].high,
            low: tickers[symbol].low,
            volume: tickers[symbol].baseVolume,
            percentage: tickers[symbol].percentage,
            change: tickers[symbol].change
          };
        }
      }
      return result;
    } catch (error) {
      console.error(`❌ 批量获取价格失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取资金费率历史（Critical for leverage analysis）
   */
  async getFundingRateHistory(symbol = 'BTC/USDT', limit = 100) {
    try {
      console.log(`Funding Rate History ${symbol} (${limit} records)...`);

      // Use direct OKX API to avoid ccxt symbol conversion issues
      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = toOkxInstId(symbol, 'SWAP');
        const response = await axios.get('https://www.okx.com/api/v5/public/funding-rate-history', {
          params: {
            instId,
            limit
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(item => ({
            timestamp: Number(item.fundingTime),
            datetime: new Date(Number(item.fundingTime)).toISOString(),
            fundingRate: parseFloat(item.fundingRate),
            realizedRate: parseFloat(item.realizedRate),
            symbol,
            instId
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get funding rate history:`, error.message);
      return null;
    }
  }

  /**
   * 获取持仓量历史（Critical for trend strength validation）
   */
  async getOpenInterestHistory(symbol = 'BTC/USDT', timeframe = '1h', limit = 100) {
    try {
      console.log(`Open Interest History ${symbol} (${timeframe}, ${limit} records)...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchOpenInterestHistory']) {
        console.warn(`Exchange does not support fetchOpenInterestHistory`);
        return null;
      }

      const history = await exchange.fetchOpenInterestHistory(symbol, timeframe, undefined, limit);

      return history.map(item => ({
        timestamp: item.timestamp,
        datetime: new Date(item.timestamp).toISOString(),
        openInterest: item.openInterestAmount || item.openInterestValue,
        symbol: item.symbol
      }));
    } catch (error) {
      console.error(`Failed to get open interest history:`, error.message);
      return null;
    }
  }

  /**
   * 获取多空比（Critical for sentiment analysis）
   */
  async getLongShortRatio(symbol = 'BTC/USDT') {
    try {
      console.log(`Long/Short Ratio ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      // OKX specific endpoint
      if (this.exchangeManager.getExchangeName() === 'okx') {
        // OKX API requires ccy (currency code) not instId
        const ccy = symbol.split('/')[0]; // Extract base currency (e.g., ETH from ETH/USDT)
        const response = await signedGet('/api/v5/rubik/stat/contracts/long-short-account-ratio', { ccy, period: '5m', limit: 1 }, 8000);

        if (response.data && response.data.data && response.data.data.length > 0) {
          const latest = response.data.data[0];
          return {
            timestamp: Number(latest[0]),
            datetime: new Date(Number(latest[0])).toISOString(),
            longShortRatio: parseFloat(latest[1]),
            symbol,
            ccy
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get long/short ratio:`, error.message);
      return null;
    }
  }

  /**
   * 获取多空比历史（Critical for extreme sentiment detection）
   */
  async getLongShortRatioHistory(symbol = 'BTC/USDT', period = '5m', limit = 100) {
    try {
      console.log(`Long/Short Ratio History ${symbol} (${period}, ${limit} records)...`);

      // OKX specific endpoint
      if (this.exchangeManager.getExchangeName() === 'okx') {
        // OKX API requires ccy (currency code) not instId
        const ccy = symbol.split('/')[0]; // Extract base currency
        const response = await signedGet('/api/v5/rubik/stat/contracts/long-short-account-ratio', {
          ccy,
          period,
          limit
        }, 10000);

        if (response.data && response.data.data) {
          return response.data.data.map(item => ({
            timestamp: Number(item[0]),
            datetime: new Date(Number(item[0])).toISOString(),
            longShortRatio: parseFloat(item[1]),
            symbol,
            ccy
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get long/short ratio history:`, error.message);
      return null;
    }
  }

  /**
   * 获取标记价格（Better price reference than last price）
   */
  async getMarkPrice(symbol = 'BTC/USDT') {
    try {
      console.log(`Mark Price ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      // OKX specific endpoint
      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = toOkxInstId(symbol, 'SWAP');
        const response = await axios.get('https://www.okx.com/api/v5/public/mark-price', {
          params: {
            instType: 'SWAP',
            instId
          },
          timeout: 8000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
          const data = response.data.data[0];
          return {
            symbol,
            timestamp: Number(data.ts),
            datetime: new Date(Number(data.ts)).toISOString(),
            markPrice: parseFloat(data.markPx),
            indexPrice: parseFloat(data.idxPx)
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get mark price:`, error.message);
      return null;
    }
  }

  /**
   * 6. 获取主动买卖量（Taker Buy/Sell Volume）
   */
  async getTakerVolume(symbol = 'BTC/USDT', period = '5m', limit = 100) {
    try {
      console.log(`Taker Volume ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        // OKX API requires ccy and instType=CONTRACTS
        const ccy = symbol.split('/')[0]; // Extract base currency
        const response = await signedGet('/api/v5/rubik/stat/taker-volume', {
          ccy,
          instType: 'CONTRACTS',
          period,
          limit
        }, 10000);

        if (response.data && response.data.data) {
          return response.data.data.map(item => ({
            timestamp: Number(item[0]),
            datetime: new Date(Number(item[0])).toISOString(),
            buyVolume: parseFloat(item[1]),
            sellVolume: parseFloat(item[2]),
            buyRatio: parseFloat(item[1]) / (parseFloat(item[1]) + parseFloat(item[2])),
            symbol,
            ccy
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get taker volume:`, error.message);
      return null;
    }
  }

  /**
   * 7. 获取标记价格K线（Mark Price OHLCV）
   */
  async getMarkOHLCV(symbol = 'BTC/USDT', timeframe = '1h', limit = 100) {
    try {
      console.log(`Mark OHLCV ${symbol} (${timeframe})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = toOkxInstId(symbol, 'SWAP');
        const mapTf = (tf) => ({ '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','6h':'6H','12h':'12H','1d':'1D','1w':'1W' }[tf] || '1H');
        const bar = mapTf(timeframe);

        const response = await axios.get('https://www.okx.com/api/v5/market/mark-price-candles', {
          params: {
            instId,
            bar,
            limit
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.reverse().map(c => ({
            timestamp: Number(c[0]),
            datetime: new Date(Number(c[0])).toISOString(),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            confirm: c[5] === '1'
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get mark OHLCV:`, error.message);
      return null;
    }
  }

  /**
   * 8. 获取指数价格K线（Index Price OHLCV）
   */
  async getIndexOHLCV(symbol = 'BTC/USDT', timeframe = '1h', limit = 100) {
    try {
      console.log(`Index OHLCV ${symbol} (${timeframe})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = toOkxInstId(symbol, 'INDEX');
        const mapTf = (tf) => ({ '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','2h':'2H','4h':'4H','6h':'6H','12h':'12H','1d':'1D','1w':'1W' }[tf] || '1H');
        const bar = mapTf(timeframe);

        const response = await axios.get('https://www.okx.com/api/v5/market/index-candles', {
          params: {
            instId,
            bar,
            limit
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.reverse().map(c => ({
            timestamp: Number(c[0]),
            datetime: new Date(Number(c[0])).toISOString(),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            confirm: c[5] === '1'
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get index OHLCV:`, error.message);
      return null;
    }
  }

  /**
   * 9. 获取深度订单簿（L2 Order Book with more depth）
   */
  async getL2OrderBook(symbol = 'BTC/USDT', depth = 400) {
    try {
      console.log(`L2 Order Book ${symbol} (depth: ${depth})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = toOkxInstId(symbol, 'SWAP');
        const response = await axios.get('https://www.okx.com/api/v5/market/books', {
          params: {
            instId,
            sz: Math.min(depth, 400)
          },
          timeout: 8000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
          const data = response.data.data[0];
          return {
            symbol,
            timestamp: Number(data.ts),
            datetime: new Date(Number(data.ts)).toISOString(),
            bids: data.bids.map(b => ({ price: parseFloat(b[0]), amount: parseFloat(b[1]), orders: parseInt(b[2]) || 0 })),
            asks: data.asks.map(a => ({ price: parseFloat(a[0]), amount: parseFloat(a[1]), orders: parseInt(a[2]) || 0 })),
            bidVolume: data.bids.reduce((sum, b) => sum + parseFloat(b[1]), 0),
            askVolume: data.asks.reduce((sum, a) => sum + parseFloat(a[1]), 0)
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get L2 order book:`, error.message);
      return null;
    }
  }

  /**
   * 10. 获取借贷利率历史（Borrow Rate History）
   */
  async getBorrowRateHistory(currency = 'USDT', limit = 100) {
    try {
      console.log(`Borrow Rate History ${currency}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchBorrowRateHistory']) {
        console.warn(`Exchange does not support fetchBorrowRateHistory`);
        return null;
      }

      const history = await exchange.fetchBorrowRateHistory(currency, undefined, limit);

      return history.map(item => ({
        timestamp: item.timestamp,
        datetime: item.datetime,
        currency: item.currency,
        rate: item.rate,
        period: item.period
      }));
    } catch (error) {
      console.error(`Failed to get borrow rate history:`, error.message);
      return null;
    }
  }

  /**
   * 11. 获取杠杆档位（Market Leverage Tiers）
   */
  async getLeverageTiers(symbol = 'BTC/USDT') {
    try {
      console.log(`Leverage Tiers ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        // OKX API requires uly (underlying) parameter
        const uly = toOkxUnderlying(symbol); // ETH-USDT
        const response = await axios.get('https://www.okx.com/api/v5/public/position-tiers', {
          params: {
            instType: 'SWAP',
            uly,
            tdMode: 'cross'
          },
          timeout: 8000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(tier => ({
            tier: parseInt(tier.tier),
            minSize: parseFloat(tier.minSz),
            maxSize: parseFloat(tier.maxSz),
            maxLeverage: parseFloat(tier.maxLever),
            maintenanceMarginRate: parseFloat(tier.mmr),
            symbol,
            underlying: uly
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get leverage tiers:`, error.message);
      return null;
    }
  }

  /**
   * 12. 获取资金费率间隔（Funding Rate Interval）
   */
  async getFundingInterval(symbol = 'BTC/USDT') {
    try {
      console.log(`Funding Interval ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = toOkxInstId(symbol, 'SWAP');
        const response = await axios.get('https://www.okx.com/api/v5/public/funding-rate', {
          params: {
            instId
          },
          timeout: 8000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
          const data = response.data.data[0];
          return {
            symbol,
            fundingRate: parseFloat(data.fundingRate),
            nextFundingRate: parseFloat(data.nextFundingRate),
            fundingTime: Number(data.fundingTime),
            nextFundingTime: Number(data.nextFundingTime),
            interval: '8h',
            timestamp: Number(data.ts)
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get funding interval:`, error.message);
      return null;
    }
  }

  /**
   * 13. 获取期权Greeks（Option Greeks - Delta/Gamma/Theta/Vega）
   */
  async getOptionGreeks(symbol = 'BTC/USDT') {
    try {
      console.log(`Option Greeks ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const uly = toOkxUnderlying(symbol);

        try {
          const response = await axios.get('https://www.okx.com/api/v5/public/option-summary', {
            params: {
              uly
            },
            timeout: 10000
          });

          if (response.data && response.data.data) {
            return response.data.data.map(opt => ({
              instrument: opt.instId,
              delta: parseFloat(opt.delta),
              gamma: parseFloat(opt.gamma),
              theta: parseFloat(opt.theta),
              vega: parseFloat(opt.vega),
              impliedVolatility: parseFloat(opt.vol),
              markPrice: parseFloat(opt.markPx),
              underlying: uly,
              timestamp: Number(opt.ts)
            }));
          }
        } catch (apiError) {
          // Option Greeks may require options trading permissions
          if (apiError.response && (apiError.response.status === 404 || apiError.response.status === 403)) {
            console.warn(`Option Greeks not available for ${symbol} (may require options trading permissions)`);
            return null;
          }
          throw apiError;
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get option Greeks:`, error.message);
      return null;
    }
  }

  /**
   * 14. 获取期权链（Option Chain）
   */
  async getOptionChain(symbol = 'BTC/USDT', expiryDate = null) {
    try {
      console.log(`Option Chain ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const uly = toOkxUnderlying(symbol);
        const params = { uly, instType: 'OPTION' };
        if (expiryDate) params.expTime = expiryDate;

        const response = await axios.get('https://www.okx.com/api/v5/public/instruments', {
          params,
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(opt => ({
            instrument: opt.instId,
            underlying: opt.uly,
            strikePrice: parseFloat(opt.stk),
            optionType: opt.optType,
            expiryTime: Number(opt.expTime),
            state: opt.state,
            listTime: Number(opt.listTime),
            leverage: parseFloat(opt.lever),
            tickSize: parseFloat(opt.tickSz),
            lotSize: parseFloat(opt.lotSz)
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get option chain:`, error.message);
      return null;
    }
  }

  /**
   * 15. 获取系统状态（System Status）
   */
  async getSystemStatus() {
    try {
      console.log(`System Status...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/system/status', {
          params: {
            state: 'scheduled'
          },
          timeout: 5000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(status => ({
            title: status.title,
            state: status.state,
            begin: Number(status.begin),
            end: Number(status.end),
            href: status.href,
            serviceType: status.serviceType,
            system: status.system,
            scheDesc: status.scheDesc
          }));
        }
      }

      return [];
    } catch (error) {
      console.error(`Failed to get system status:`, error.message);
      return null;
    }
  }

  /**
   * 16. 批量获取Ticker（Batch Tickers）
   */
  async getBatchTickers(symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT']) {
    try {
      console.log(`Batch Tickers (${symbols.length} symbols)...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instIds = symbols.map(s => s.replace('/', '-')).join(',');
        const response = await axios.get('https://www.okx.com/api/v5/market/tickers', {
          params: {
            instType: 'SPOT',
            instId: instIds
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(ticker => ({
            symbol: ticker.instId.replace('-', '/'),
            last: parseFloat(ticker.last),
            bid: parseFloat(ticker.bidPx),
            ask: parseFloat(ticker.askPx),
            high24h: parseFloat(ticker.high24h),
            low24h: parseFloat(ticker.low24h),
            volume24h: parseFloat(ticker.vol24h),
            volumeCcy24h: parseFloat(ticker.volCcy24h),
            timestamp: Number(ticker.ts)
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get batch tickers:`, error.message);
      return null;
    }
  }

  /**
   * 17. 获取历史K线（History Candles - older data）
   */
  async getHistoryCandles(symbol = 'BTC/USDT', timeframe = '1d', after = null, limit = 100) {
    try {
      console.log(`History Candles ${symbol} (${timeframe})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = symbol.replace('/', '-');
        const mapTf = (tf) => ({ '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D','1w':'1W' }[tf] || '1D');
        const bar = mapTf(timeframe);

        const params = { instId, bar, limit };
        if (after) params.after = after;

        const response = await axios.get('https://www.okx.com/api/v5/market/history-candles', {
          params,
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.reverse().map(c => ({
            timestamp: Number(c[0]),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            volumeCcy: parseFloat(c[6])
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get history candles:`, error.message);
      return null;
    }
  }

  /**
   * 18. 获取历史标记价格K线（History Mark Candles）
   */
  async getHistoryMarkCandles(symbol = 'BTC/USDT', timeframe = '1d', after = null, limit = 100) {
    try {
      console.log(`History Mark Candles ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = symbol.replace('/', '-');
        const mapTf = (tf) => ({ '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D' }[tf] || '1D');
        const bar = mapTf(timeframe);

        const params = { instId, bar, limit };
        if (after) params.after = after;

        const response = await axios.get('https://www.okx.com/api/v5/market/history-mark-price-candles', {
          params,
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.reverse().map(c => ({
            timestamp: Number(c[0]),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4])
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get history mark candles:`, error.message);
      return null;
    }
  }

  /**
   * 19. 获取历史指数价格K线（History Index Candles）
   */
  async getHistoryIndexCandles(symbol = 'BTC/USDT', timeframe = '1d', after = null, limit = 100) {
    try {
      console.log(`History Index Candles ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = symbol.replace('/', '-');
        const mapTf = (tf) => ({ '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D' }[tf] || '1D');
        const bar = mapTf(timeframe);

        const params = { instId, bar, limit };
        if (after) params.after = after;

        const response = await axios.get('https://www.okx.com/api/v5/market/history-index-candles', {
          params,
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.reverse().map(c => ({
            timestamp: Number(c[0]),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4])
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get history index candles:`, error.message);
      return null;
    }
  }

  /**
   * 20. 获取当前持仓量（Current Open Interest）
   */
  async getCurrentOpenInterest(symbol = 'BTC/USDT') {
    try {
      console.log(`Current Open Interest ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        try {
          const instId = toOkxInstId(symbol, 'SWAP');
          const response = await axios.get('https://www.okx.com/api/v5/market/open-interest', {
            params: {
              instType: 'SWAP',
              instId
            },
            timeout: 8000
          });

          if (response.data && response.data.data && response.data.data.length > 0) {
            const data = response.data.data[0];
            return {
              symbol,
              openInterest: parseFloat(data.oi),
              openInterestCcy: parseFloat(data.oiCcy),
              timestamp: Number(data.ts)
            };
          }
        } catch (apiError) {
          // If 404 error, fallback to using openInterestHistory to get latest value
          if (apiError.response && apiError.response.status === 404) {
            console.warn(`Direct API deprecated, using openInterestHistory fallback...`);
            const history = await this.getOpenInterestHistory(symbol, '1h', 1);
            if (history && history.length > 0) {
              const latest = history[0];
              return {
                symbol,
                openInterest: latest.openInterest,
                openInterestCcy: null,
                timestamp: latest.timestamp,
                source: 'history_fallback'
              };
            }
          }
          throw apiError;
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get current open interest:`, error.message);
      return null;
    }
  }

  /**
   * 21. 获取持仓量和交易量（Open Interest Volume）
   */
  async getOpenInterestVolume(symbol = 'BTC/USDT', period = '5m', limit = 72) {
    try {
      console.log(`Open Interest Volume ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const ccy = symbol.split('/')[0];
        const response = await signedGet('/api/v5/rubik/stat/contracts/open-interest-volume', {
          ccy,
          period,
          limit
        }, 10000);

        if (response.data && response.data.data) {
          return response.data.data.map(item => ({
            timestamp: Number(item.ts),
            openInterest: parseFloat(item.oi),
            volume: parseFloat(item.vol),
            symbol
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get open interest volume:`, error.message);
      return null;
    }
  }

  /**
   * 22. 获取多空持仓比（Long/Short Position Ratio）
   */
  async getLongShortPositionRatio(symbol = 'BTC/USDT', period = '5m', limit = 100) {
    try {
      console.log(`Long/Short Position Ratio ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        // OKX API requires ccy (currency code) not instId
        const ccy = symbol.split('/')[0]; // Extract base currency (e.g., ETH from ETH/USDT)
        const response = await signedGet('/api/v5/rubik/stat/contracts/long-short-account-ratio', {
          ccy,
          period,
          limit
        }, 10000);

        if (response.data && response.data.data) {
          return response.data.data.map(item => ({
            timestamp: Number(item[0]),
            datetime: new Date(Number(item[0])).toISOString(),
            longShortRatio: parseFloat(item[1]),
            symbol,
            ccy
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get long/short position ratio:`, error.message);
      return null;
    }
  }

  /**
   * 23. 获取期权持仓量（Option Open Interest Volume）
   */
  async getOptionOpenInterestVolume(currency = 'BTC', period = '8H') {
    try {
      console.log(`Option Open Interest Volume ${currency}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await signedGet('/api/v5/rubik/stat/option/open-interest-volume', {
          ccy: currency,
          period
        }, 10000);

        if (response.data && response.data.data) {
          return response.data.data.map(item => ({
            timestamp: Number(item.ts),
            callOpenInterest: parseFloat(item.callOi),
            putOpenInterest: parseFloat(item.putOi),
            callVolume: parseFloat(item.callVol),
            putVolume: parseFloat(item.putVol),
            putCallRatio: parseFloat(item.putOi) / parseFloat(item.callOi),
            currency
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get option open interest volume:`, error.message);
      return null;
    }
  }

  /**
   * 24. 获取保险基金（Insurance Fund）
   */
  async getInsuranceFund(symbol = 'BTC/USDT', type = 'liquidation_balance_deposit', limit = 100) {
    try {
      console.log(`Insurance Fund ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        // OKX API requires uly (underlying) parameter
        const uly = toOkxUnderlying(symbol);
        const response = await axios.get('https://www.okx.com/api/v5/public/insurance-fund', {
          params: {
            instType: 'SWAP',
            uly,
            type,
            limit
          },
          timeout: 10000
        });

        if (response.data && response.data.data && response.data.data[0] && response.data.data[0].details) {
          return response.data.data[0].details.map(item => ({
            timestamp: Number(item.ts),
            balance: parseFloat(item.balance),
            amount: parseFloat(item.amt),
            type: item.type,
            currency: item.ccy,
            symbol,
            underlying: uly
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get insurance fund:`, error.message);
      return null;
    }
  }

  /**
   * 25. 获取交割行权历史（Delivery Exercise History）
   */
  async getDeliveryExerciseHistory(instType = 'FUTURES', underlying = 'BTC-USDT', limit = 100) {
    try {
      console.log(`Delivery Exercise History (${underlying})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/public/delivery-exercise-history', {
          params: {
            instType,
            uly: underlying,
            limit
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(item => ({
            timestamp: Number(item.ts),
            instrument: item.instId,
            price: parseFloat(item.px),
            type: item.type,
            underlying: item.uly
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get delivery exercise history:`, error.message);
      return null;
    }
  }

  /**
   * 26. 获取标的指数（Underlying Index）
   */
  async getUnderlyingIndex(instType = 'FUTURES') {
    try {
      console.log(`Underlying Index (${instType})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/public/underlying', {
          params: {
            instType
          },
          timeout: 8000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(item => ({
            underlying: item.uly,
            instruments: item.instId ? item.instId.split(',') : []
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get underlying index:`, error.message);
      return null;
    }
  }

  /**
   * 27. 获取指数行情（Index Tickers）
   */
  async getIndexTickers(quoteCurrency = 'USDT') {
    try {
      console.log(`Index Tickers (${quoteCurrency})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/market/index-tickers', {
          params: {
            quoteCcy: quoteCurrency
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(ticker => ({
            index: ticker.instId,
            indexPrice: parseFloat(ticker.idxPx),
            high24h: parseFloat(ticker.high24h),
            low24h: parseFloat(ticker.low24h),
            open24h: parseFloat(ticker.open24h),
            timestamp: Number(ticker.ts)
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get index tickers:`, error.message);
      return null;
    }
  }

  /**
   * 28. 获取大宗交易行情（Block Tickers）
   */
  async getBlockTickers(instType = 'SPOT') {
    try {
      console.log(`Block Tickers (${instType})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/market/block-tickers', {
          params: {
            instType
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(ticker => ({
            instrument: ticker.instId,
            volume24h: parseFloat(ticker.vol24h),
            volumeCcy24h: parseFloat(ticker.volCcy24h),
            timestamp: Number(ticker.ts)
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get block tickers:`, error.message);
      return null;
    }
  }

  /**
   * 29. 获取大宗成交记录（Block Trades）
   */
  async getBlockTrades(symbol = 'BTC/USDT', limit = 100) {
    try {
      console.log(`Block Trades ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = symbol.replace('/', '-');
        const response = await axios.get('https://www.okx.com/api/v5/market/block-trades', {
          params: {
            instId,
            limit
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(trade => ({
            tradeId: trade.tradeId,
            price: parseFloat(trade.px),
            size: parseFloat(trade.sz),
            side: trade.side,
            timestamp: Number(trade.ts),
            instrument: trade.instId
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get block trades:`, error.message);
      return null;
    }
  }

  /**
   * 30. 获取24小时总交易量（24hr Total Volume）
   */
  async get24hrTotalVolume() {
    try {
      console.log(`24hr Total Volume...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/market/tickers', {
          params: {
            instType: 'SPOT'
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          const totalVolume = response.data.data.reduce((sum, ticker) => {
            return sum + parseFloat(ticker.volCcy24h || 0);
          }, 0);

          const topVolume = response.data.data
            .map(ticker => ({
              symbol: ticker.instId,
              volume: parseFloat(ticker.volCcy24h || 0)
            }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 20);

          return {
            totalVolume,
            totalPairs: response.data.data.length,
            topVolume,
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get 24hr total volume:`, error.message);
      return null;
    }
  }

  /**
   * 31. 获取账户余额 (Account Balance)
   */
  async getBalance() {
    try {
      console.log(`Balance...`);
      const exchange = this.exchangeManager.getExchange();

      const balance = await exchange.fetchBalance();

      return {
        totalEquity: balance.total,
        free: balance.free,
        used: balance.used,
        timestamp: Date.now(),
        datetime: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to get balance:`, error.message);
      return null;
    }
  }

  /**
   * 32. 获取持仓信息 (Positions)
   */
  async getPositions(symbols = null) {
    try {
      console.log(`Positions...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchPositions']) {
        console.warn(`Exchange does not support fetchPositions`);
        return null;
      }

      const positions = await exchange.fetchPositions(symbols);

      return positions.map(pos => ({
        symbol: pos.symbol,
        side: pos.side,
        contracts: pos.contracts,
        contractSize: pos.contractSize,
        entryPrice: pos.entryPrice,
        markPrice: pos.markPrice,
        notional: pos.notional,
        leverage: pos.leverage,
        unrealizedPnl: pos.unrealizedPnl,
        percentage: pos.percentage,
        marginMode: pos.marginMode,
        timestamp: pos.timestamp
      }));
    } catch (error) {
      console.error(`Failed to get positions:`, error.message);
      return null;
    }
  }

  /**
   * 33. 获取所有订单 (All Orders)
   */
  async getOrders(symbol = 'BTC/USDT', since = null, limit = 100) {
    try {
      console.log(`Orders ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchOrders']) {
        console.warn(`Exchange does not support fetchOrders`);
        return null;
      }

      const orders = await exchange.fetchOrders(symbol, since, limit);

      return orders.map(order => ({
        id: order.id,
        symbol: order.symbol,
        type: order.type,
        side: order.side,
        price: order.price,
        amount: order.amount,
        filled: order.filled,
        remaining: order.remaining,
        status: order.status,
        timestamp: order.timestamp,
        datetime: order.datetime
      }));
    } catch (error) {
      console.error(`Failed to get orders:`, error.message);
      return null;
    }
  }

  /**
   * 34. 获取未完成订单 (Open Orders)
   */
  async getOpenOrders(symbol = null, since = null, limit = 100) {
    try {
      console.log(`Open Orders ${symbol || 'all symbols'}...`);
      const exchange = this.exchangeManager.getExchange();

      const orders = await exchange.fetchOpenOrders(symbol, since, limit);

      return orders.map(order => ({
        id: order.id,
        symbol: order.symbol,
        type: order.type,
        side: order.side,
        price: order.price,
        amount: order.amount,
        filled: order.filled,
        remaining: order.remaining,
        status: order.status,
        timestamp: order.timestamp
      }));
    } catch (error) {
      console.error(`Failed to get open orders:`, error.message);
      return null;
    }
  }

  /**
   * 35. 获取已完成订单 (Closed Orders)
   */
  async getClosedOrders(symbol = 'BTC/USDT', since = null, limit = 100) {
    try {
      console.log(`Closed Orders ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchClosedOrders']) {
        console.warn(`Exchange does not support fetchClosedOrders`);
        return null;
      }

      const orders = await exchange.fetchClosedOrders(symbol, since, limit);

      return orders.map(order => ({
        id: order.id,
        symbol: order.symbol,
        type: order.type,
        side: order.side,
        price: order.price,
        amount: order.amount,
        filled: order.filled,
        cost: order.cost,
        status: order.status,
        timestamp: order.timestamp
      }));
    } catch (error) {
      console.error(`Failed to get closed orders:`, error.message);
      return null;
    }
  }

  /**
   * 36. 获取我的交易记录 (My Trades)
   */
  async getMyTrades(symbol = 'BTC/USDT', since = null, limit = 100) {
    try {
      console.log(`My Trades ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      const trades = await exchange.fetchMyTrades(symbol, since, limit);

      return trades.map(trade => ({
        id: trade.id,
        orderId: trade.order,
        symbol: trade.symbol,
        side: trade.side,
        price: trade.price,
        amount: trade.amount,
        cost: trade.cost,
        fee: trade.fee,
        timestamp: trade.timestamp,
        datetime: trade.datetime
      }));
    } catch (error) {
      console.error(`Failed to get my trades:`, error.message);
      return null;
    }
  }

  /**
   * 37. 获取服务器时间 (Server Time)
   */
  async getServerTime() {
    try {
      console.log(`Server Time...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchTime']) {
        console.warn(`Exchange does not support fetchTime`);
        return null;
      }

      const serverTime = await exchange.fetchTime();

      return {
        serverTime,
        localTime: Date.now(),
        diff: Date.now() - serverTime,
        datetime: new Date(serverTime).toISOString()
      };
    } catch (error) {
      console.error(`Failed to get server time:`, error.message);
      return null;
    }
  }

  /**
   * 38. 获取币种信息 (Currencies)
   */
  async getCurrencies() {
    try {
      console.log(`Currencies...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchCurrencies']) {
        console.warn(`Exchange does not support fetchCurrencies`);
        return null;
      }

      const currencies = await exchange.fetchCurrencies();

      return Object.entries(currencies).map(([code, currency]) => ({
        code,
        name: currency.name,
        active: currency.active,
        fee: currency.fee,
        precision: currency.precision,
        limits: currency.limits
      }));
    } catch (error) {
      console.error(`Failed to get currencies:`, error.message);
      return null;
    }
  }

  /**
   * 39. 获取充值记录 (Deposits)
   */
  async getDeposits(code = null, since = null, limit = 100) {
    try {
      console.log(`Deposits ${code || 'all currencies'}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchDeposits']) {
        console.warn(`Exchange does not support fetchDeposits`);
        return null;
      }

      const deposits = await exchange.fetchDeposits(code, since, limit);

      return deposits.map(deposit => ({
        id: deposit.id,
        txid: deposit.txid,
        currency: deposit.currency,
        amount: deposit.amount,
        status: deposit.status,
        address: deposit.address,
        timestamp: deposit.timestamp,
        datetime: deposit.datetime
      }));
    } catch (error) {
      console.error(`Failed to get deposits:`, error.message);
      return null;
    }
  }

  /**
   * 40. 获取提现记录 (Withdrawals)
   */
  async getWithdrawals(code = null, since = null, limit = 100) {
    try {
      console.log(`Withdrawals ${code || 'all currencies'}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchWithdrawals']) {
        console.warn(`Exchange does not support fetchWithdrawals`);
        return null;
      }

      const withdrawals = await exchange.fetchWithdrawals(code, since, limit);

      return withdrawals.map(withdrawal => ({
        id: withdrawal.id,
        txid: withdrawal.txid,
        currency: withdrawal.currency,
        amount: withdrawal.amount,
        status: withdrawal.status,
        address: withdrawal.address,
        fee: withdrawal.fee,
        timestamp: withdrawal.timestamp,
        datetime: withdrawal.datetime
      }));
    } catch (error) {
      console.error(`Failed to get withdrawals:`, error.message);
      return null;
    }
  }

  /**
   * 41. 获取交易费率 (Trading Fees)
   */
  async getTradingFees(symbol = null) {
    try {
      console.log(`Trading Fees ${symbol || 'all symbols'}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchTradingFees']) {
        console.warn(`Exchange does not support fetchTradingFees`);
        return null;
      }

      const fees = await exchange.fetchTradingFees();

      if (symbol && fees[symbol]) {
        return {
          symbol,
          maker: fees[symbol].maker,
          taker: fees[symbol].taker,
          timestamp: Date.now()
        };
      }

      return fees;
    } catch (error) {
      console.error(`Failed to get trading fees:`, error.message);
      return null;
    }
  }

  /**
   * 42. 获取单个交易对费率 (Trading Fee for Symbol)
   */
  async getTradingFee(symbol = 'BTC/USDT') {
    try {
      console.log(`Trading Fee ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchTradingFee']) {
        return await this.getTradingFees(symbol);
      }

      const fee = await exchange.fetchTradingFee(symbol);

      return {
        symbol,
        maker: fee.maker,
        taker: fee.taker,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Failed to get trading fee:`, error.message);
      return null;
    }
  }

  /**
   * 43. 获取充值地址 (Deposit Address)
   */
  async getDepositAddress(currency = 'USDT', network = null) {
    try {
      console.log(`Deposit Address ${currency}${network ? ` (${network})` : ''}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchDepositAddress']) {
        console.warn(`Exchange does not support fetchDepositAddress`);
        return null;
      }

      const params = network ? { network } : {};
      const address = await exchange.fetchDepositAddress(currency, params);

      return {
        currency,
        address: address.address,
        tag: address.tag,
        network: address.network,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Failed to get deposit address:`, error.message);
      return null;
    }
  }

  /**
   * 44. 获取账本记录 (Ledger - Account History)
   */
  async getLedger(currency = null, since = null, limit = 100) {
    try {
      console.log(`Ledger ${currency || 'all currencies'}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchLedger']) {
        console.warn(`Exchange does not support fetchLedger`);
        return null;
      }

      const ledger = await exchange.fetchLedger(currency, since, limit);

      return ledger.map(entry => ({
        id: entry.id,
        currency: entry.currency,
        account: entry.account,
        type: entry.type,
        amount: entry.amount,
        before: entry.before,
        after: entry.after,
        status: entry.status,
        timestamp: entry.timestamp,
        datetime: entry.datetime
      }));
    } catch (error) {
      console.error(`Failed to get ledger:`, error.message);
      return null;
    }
  }

  /**
   * 45. 获取资金划转记录 (Transfer History)
   */
  async getTransfers(currency = null, since = null, limit = 100) {
    try {
      console.log(`Transfers ${currency || 'all currencies'}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchTransfers']) {
        console.warn(`Exchange does not support fetchTransfers`);
        return null;
      }

      const transfers = await exchange.fetchTransfers(currency, since, limit);

      return transfers.map(transfer => ({
        id: transfer.id,
        currency: transfer.currency,
        amount: transfer.amount,
        fromAccount: transfer.fromAccount,
        toAccount: transfer.toAccount,
        status: transfer.status,
        timestamp: transfer.timestamp,
        datetime: transfer.datetime
      }));
    } catch (error) {
      console.error(`Failed to get transfers:`, error.message);
      return null;
    }
  }

  /**
   * 46. 获取杠杆倍数 (Current Leverage)
   */
  async getLeverage(symbol = 'BTC/USDT') {
    try {
      console.log(`Leverage ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchLeverage']) {
        console.warn(`Exchange does not support fetchLeverage`);
        return null;
      }

      const leverage = await exchange.fetchLeverage(symbol);

      return {
        symbol,
        longLeverage: leverage.longLeverage,
        shortLeverage: leverage.shortLeverage,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Failed to get leverage:`, error.message);
      return null;
    }
  }

  /**
   * 47. 获取保证金模式 (Margin Mode)
   */
  async getMarginMode(symbol = 'BTC/USDT') {
    try {
      console.log(`Margin Mode ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchMarginMode']) {
        console.warn(`Exchange does not support fetchMarginMode`);
        return null;
      }

      const marginMode = await exchange.fetchMarginMode(symbol);

      return {
        symbol,
        marginMode: marginMode.marginMode,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Failed to get margin mode:`, error.message);
      return null;
    }
  }

  /**
   * 48. 获取借贷利率 (Borrow Rate)
   */
  async getBorrowRate(currency = 'USDT') {
    try {
      console.log(`Borrow Rate ${currency}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchBorrowRate']) {
        console.warn(`Exchange does not support fetchBorrowRate`);
        return null;
      }

      const rate = await exchange.fetchBorrowRate(currency);

      return {
        currency,
        rate: rate.rate,
        period: rate.period,
        timestamp: rate.timestamp
      };
    } catch (error) {
      console.error(`Failed to get borrow rate:`, error.message);
      return null;
    }
  }

  /**
   * 49. 获取所有币种借贷利率 (All Borrow Rates)
   */
  async getBorrowRates(currencies = null) {
    try {
      console.log(`Borrow Rates ${currencies ? currencies.join(',') : 'all'}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchBorrowRates']) {
        console.warn(`Exchange does not support fetchBorrowRates`);
        return null;
      }

      const rates = await exchange.fetchBorrowRates(currencies);

      return Object.entries(rates).map(([currency, rate]) => ({
        currency,
        rate: rate.rate,
        period: rate.period,
        timestamp: rate.timestamp
      }));
    } catch (error) {
      console.error(`Failed to get borrow rates:`, error.message);
      return null;
    }
  }

  /**
   * 50. 获取交易所状态 (Exchange Status)
   */
  async getExchangeStatus() {
    try {
      console.log(`Exchange Status...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchStatus']) {
        console.warn(`Exchange does not support fetchStatus`);
        return null;
      }

      const status = await exchange.fetchStatus();

      return {
        status: status.status,
        updated: status.updated,
        eta: status.eta,
        url: status.url,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Failed to get exchange status:`, error.message);
      return null;
    }
  }

  /**
   * 51. 获取市值排行 (Market Cap Ranking)
   */
  async getMarketCapRanking(limit = 100) {
    try {
      console.log(`Market Cap Ranking (top ${limit})...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/market/tickers', {
          params: {
            instType: 'SPOT'
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          const tickers = response.data.data
            .filter(t => t.instId.endsWith('-USDT'))
            .map(t => ({
              symbol: t.instId.replace('-USDT', ''),
              price: parseFloat(t.last),
              volume24h: parseFloat(t.volCcy24h || 0),
              change24h: parseFloat(t.open24h) > 0
                ? ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h) * 100)
                : 0
            }))
            .sort((a, b) => b.volume24h - a.volume24h)
            .slice(0, limit);

          return {
            rankings: tickers,
            timestamp: Date.now(),
            source: 'okx'
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get market cap ranking:`, error.message);
      return null;
    }
  }

  /**
   * 52. 获取交易对详细信息 (Instrument Specifications)
   */
  async getInstrumentInfo(symbol = 'BTC/USDT') {
    try {
      console.log(`Instrument Info ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = symbol.replace('/', '-');
        const response = await axios.get('https://www.okx.com/api/v5/public/instruments', {
          params: {
            instType: 'SPOT',
            instId
          },
          timeout: 8000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
          const data = response.data.data[0];
          return {
            symbol,
            baseCurrency: data.baseCcy,
            quoteCurrency: data.quoteCcy,
            minOrderSize: parseFloat(data.minSz),
            lotSize: parseFloat(data.lotSz),
            tickSize: parseFloat(data.tickSz),
            state: data.state,
            listTime: Number(data.listTime),
            timestamp: Number(data.ts)
          };
        }
      }

      const exchange = this.exchangeManager.getExchange();
      const markets = await exchange.loadMarkets();
      const market = markets[symbol];

      if (market) {
        return {
          symbol,
          baseCurrency: market.base,
          quoteCurrency: market.quote,
          minOrderSize: market.limits.amount.min,
          maxOrderSize: market.limits.amount.max,
          minPrice: market.limits.price.min,
          maxPrice: market.limits.price.max,
          pricePrecision: market.precision.price,
          amountPrecision: market.precision.amount,
          active: market.active,
          timestamp: Date.now()
        };
      }

      return null;
    } catch (error) {
      console.error(`Failed to get instrument info:`, error.message);
      return null;
    }
  }

  /**
   * 53. 获取溢价指数 (Premium Index - Futures Premium)
   */
  async getPremiumIndex(symbol = 'BTC/USDT') {
    try {
      console.log(`Premium Index ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = toOkxInstId(symbol, 'SWAP');

        try {
          const response = await axios.get('https://www.okx.com/api/v5/public/premium-index', {
            params: {
              instId
            },
            timeout: 8000
          });

          if (response.data && response.data.data && response.data.data.length > 0) {
            const data = response.data.data[0];
            return {
              symbol,
              premiumIndex: parseFloat(data.premiumIndex),
              markPrice: parseFloat(data.markPx),
              indexPrice: parseFloat(data.idxPx),
              timestamp: Number(data.ts)
            };
          }
        } catch (apiError) {
          // Premium index may not be available for all instruments
          if (apiError.response && (apiError.response.status === 404 || apiError.response.status === 400)) {
            console.warn(`Premium index not available for ${symbol} (not all instruments support this)`);
            return null;
          }
          throw apiError;
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get premium index:`, error.message);
      return null;
    }
  }

  /**
   * 54. 获取可转换币种 (Convert Currencies - 使用公开API)
   */
  async getConvertCurrencies() {
    try {
      console.log(`Convert Currencies...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        // ✅ 优先使用公开instruments API获取所有可交易币种
        try {
          const response = await axios.get('https://www.okx.com/api/v5/public/instruments', {
            params: { instType: 'SPOT' },
            timeout: 10000
          });

          if (response.data && response.data.data && response.data.data.length > 0) {
            // 提取所有独特的基础币种
            const currencies = new Set();
            response.data.data.forEach(instrument => {
              if (instrument.baseCcy) currencies.add(instrument.baseCcy);
              if (instrument.quoteCcy) currencies.add(instrument.quoteCcy);
            });
            
            return Array.from(currencies).sort().map(ccy => ({
              currency: ccy,
              tradingPairs: response.data.data
                .filter(i => i.baseCcy === ccy || i.quoteCcy === ccy)
                .length,
              source: 'public_instruments'
            }));
          }
        } catch (publicError) {
          console.warn(`Public instruments API failed, trying authenticated endpoint: ${publicError.message}`);
          
          // 备用：尝试认证API
          try {
            const response = await signedGet('/api/v5/asset/convert/currencies', {}, 8000);

            if (response.data && response.data.data) {
              return response.data.data.map(item => ({
                currency: item.ccy,
                name: item.name,
                minConvertAmount: parseFloat(item.min),
                maxConvertAmount: parseFloat(item.max),
                source: 'authenticated_api'
              }));
            }
          } catch (apiError) {
            if (apiError.response && (apiError.response.status === 401 || apiError.response.status === 403)) {
              console.warn(`Convert currencies authenticated endpoint requires API key`);
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get convert currencies:`, error.message);
      return null;
    }
  }

  /**
   * 55. 获取强平订单 (Liquidation Orders)
   */
  async getLiquidationOrders(symbol = 'BTC/USDT', limit = 100) {
    try {
      console.log(`Liquidation Orders ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        // OKX API requires uly (underlying) parameter
        const uly = toOkxUnderlying(symbol);
        const response = await axios.get('https://www.okx.com/api/v5/public/liquidation-orders', {
          params: {
            instType: 'SWAP',
            uly,
            state: 'filled',  // Use 'filled' instead of '2' for better compatibility
            limit
          },
          timeout: 10000
        });

        if (response.data && response.data.data && response.data.data[0] && response.data.data[0].details) {
          return response.data.data[0].details.map(order => ({
            instrument: order.instId,
            side: order.side,
            price: parseFloat(order.bkPx),
            size: parseFloat(order.sz),
            loss: parseFloat(order.bkLoss),
            timestamp: Number(order.ts),
            symbol,
            underlying: uly
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get liquidation orders:`, error.message);
      return null;
    }
  }

  /**
   * 56. 获取最大可开单数量 (Max Order Size)
   */
  async getMaxOrderSize(symbol = 'BTC/USDT', leverage = 1) {
    try {
      console.log(`Max Order Size ${symbol} (${leverage}x)...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        try {
          // Try authenticated endpoint first
          const instId = toOkxInstId(symbol, 'SWAP');
          const response = await signedGet('/api/v5/trade/max-size', {
            instId,
            tdMode: 'cross'
          }, 8000);

          if (response.data && response.data.data && response.data.data.length > 0) {
            const data = response.data.data[0];
            return {
              symbol,
              maxBuySize: parseFloat(data.maxBuy),
              maxSellSize: parseFloat(data.maxSell),
              currency: data.ccy,
              timestamp: Date.now()
            };
          }
        } catch (apiError) {
          // Fallback to public instruments endpoint
          if (apiError.response && (apiError.response.status === 401 || apiError.response.status === 404)) {
            console.warn(`Authenticated endpoint not available, using public instruments fallback...`);
            const instId = toOkxInstId(symbol, 'SWAP');
            const instrumentResponse = await axios.get('https://www.okx.com/api/v5/public/instruments', {
              params: {
                instType: 'SWAP',
                instId
              },
              timeout: 8000
            });

            if (instrumentResponse.data && instrumentResponse.data.data && instrumentResponse.data.data.length > 0) {
              const instrument = instrumentResponse.data.data[0];
              return {
                symbol,
                maxBuySize: parseFloat(instrument.maxLmtSz) || null,
                maxSellSize: parseFloat(instrument.maxLmtSz) || null,
                maxMarketSize: parseFloat(instrument.maxMktSz) || null,
                minSize: parseFloat(instrument.minSz) || null,
                currency: instrument.quoteCcy,
                timestamp: Date.now(),
                source: 'instruments_fallback'
              };
            }
          }
          throw apiError;
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get max order size:`, error.message);
      return null;
    }
  }

  /**
   * 57. 获取价格限制 (Price Limit - Trading Bands)
   */
  async getPriceLimit(symbol = 'BTC/USDT') {
    try {
      console.log(`Price Limit ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const instId = toOkxInstId(symbol, 'SWAP');
        const response = await axios.get('https://www.okx.com/api/v5/public/price-limit', {
          params: {
            instId
          },
          timeout: 8000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
          const data = response.data.data[0];
          return {
            symbol,
            buyLimit: parseFloat(data.buyLmt),
            sellLimit: parseFloat(data.sellLmt),
            timestamp: Number(data.ts)
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get price limit:`, error.message);
      return null;
    }
  }

  /**
   * 58. 获取预估交割/行权价格 (Estimated Settlement Price)
   */
  async getEstimatedPrice(symbol = 'BTC/USDT') {
    try {
      console.log(`Estimated Price ${symbol}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        try {
          const instId = toOkxInstId(symbol, 'SWAP');
          const response = await axios.get('https://www.okx.com/api/v5/public/estimated-price', {
            params: {
              instId
            },
            timeout: 8000
          });

          if (response.data && response.data.data && response.data.data.length > 0) {
            const data = response.data.data[0];
            return {
              symbol,
              estimatedPrice: parseFloat(data.settlePx),
              timestamp: Number(data.ts)
            };
          }
        } catch (apiError) {
          // Estimated price only works for FUTURES (with expiry), not SWAP (perpetual)
          // Fallback to mark price for perpetual swaps
          if (apiError.response && (apiError.response.status === 400 || apiError.response.status === 404)) {
            console.warn(`Estimated price not available for perpetual swap, using mark price fallback...`);
            const markPrice = await this.getMarkPrice(symbol);
            if (markPrice) {
              return {
                symbol,
                estimatedPrice: markPrice.markPrice,
                timestamp: markPrice.timestamp,
                source: 'mark_price_fallback'
              };
            }
          }
          throw apiError;
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get estimated price:`, error.message);
      return null;
    }
  }

  /**
   * 59. 获取VIP费率等级 (VIP Fee Tiers)
   */
  async getVIPLevels() {
    try {
      console.log(`VIP Fee Levels...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/public/vip-interest-rate-loan-quota', {
          timeout: 8000
        });

        if (response.data && response.data.data) {
          return response.data.data.map(tier => ({
            level: tier.level,
            loanQuota: tier.loanQuota,
            irDiscount: parseFloat(tier.irDiscount)
          }));
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get VIP levels:`, error.message);
      return null;
    }
  }

  /**
   * 60. 获取利率 (Interest Rate - 使用公开API)
   */
  async getInterestRate(currency = 'USDT') {
    try {
      console.log(`Interest Rate ${currency}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        // ✅ 优先使用公开API
        try {
          const response = await axios.get('https://www.okx.com/api/v5/public/interest-rate-loan-quota', {
            timeout: 8000
          });

          if (response.data && response.data.data && response.data.data.length > 0) {
            const data = response.data.data[0];
            
            // 查找指定币种的利率
            const basicRates = data.basic || [];
            const targetRate = basicRates.find(r => r.ccy === currency);
            
            if (targetRate) {
              return {
                currency: targetRate.ccy,
                interestRate: parseFloat(targetRate.rate),
                quota: parseFloat(targetRate.quota),
                timestamp: Date.now(),
                source: 'public_api'
              };
            }
            
            // 如果找不到特定币种，返回所有币种
            return {
              currency: currency,
              rates: basicRates.map(r => ({
                ccy: r.ccy,
                rate: parseFloat(r.rate),
                quota: parseFloat(r.quota)
              })),
              timestamp: Date.now(),
              source: 'public_api'
            };
          }
        } catch (publicError) {
          console.warn(`Public interest rate API failed, trying authenticated endpoint: ${publicError.message}`);
          
          // 备用：尝试认证API
          try {
            const response = await signedGet('/api/v5/account/interest-rate', { ccy: currency }, 8000);

            if (response.data && response.data.data) {
              return response.data.data.map(rate => ({
                currency: rate.ccy,
                interestRate: parseFloat(rate.interestRate),
                level: rate.level,
                source: 'authenticated_api'
              }));
            }
          } catch (apiError) {
            if (apiError.response && (apiError.response.status === 401 || apiError.response.status === 403)) {
              console.warn(`Interest rate authenticated endpoint requires API key`);
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get interest rate:`, error.message);
      return null;
    }
  }

  /**
   * 61. 获取资产估值 (Asset Valuation in USD)
   */
  async getAssetValuation() {
    try {
      console.log(`Asset Valuation...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchBalance']) {
        return null;
      }

      const balance = await exchange.fetchBalance();

      if (this.exchangeManager.getExchangeName() === 'okx') {
        try {
          const response = await signedGet('/api/v5/account/balance', {}, 8000);

          if (response.data && response.data.data && response.data.data.length > 0) {
            const data = response.data.data[0];
            return {
              totalEquityUSD: parseFloat(data.totalEq),
              availableBalanceUSD: parseFloat(data.availBal || 0),
              frozenBalanceUSD: parseFloat(data.frozenBal || 0),
              timestamp: Number(data.uTime)
            };
          }
        } catch (apiError) {
          // Handle authentication errors gracefully
          if (apiError.response && (apiError.response.status === 401 || apiError.response.status === 403)) {
            console.warn(`Asset valuation requires API authentication`);
            return null;
          }
          throw apiError;
        }
      }

      return {
        totalEquity: balance.total,
        availableBalance: balance.free,
        usedBalance: balance.used,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Failed to get asset valuation:`, error.message);
      return null;
    }
  }

  /**
   * 62. 获取风险准备金余额 (Risk Reserve)
   */
  async getRiskReserve(currency = 'BTC') {
    try {
      console.log(`Risk Reserve ${currency}...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/public/insurance-fund', {
          params: {
            instType: 'SWAP',
            type: 'liquidation_balance_deposit',
            uly: `${currency}-USDT`,
            limit: 1
          },
          timeout: 8000
        });

        if (response.data && response.data.data && response.data.data[0]) {
          const fundData = response.data.data[0];
          // Use total balance if details are empty
          if (fundData.total) {
            return {
              currency,
              balance: parseFloat(fundData.total),
              instFamily: fundData.instFamily,
              timestamp: Date.now()
            };
          }
          // Fallback to details if available
          if (fundData.details && fundData.details.length > 0) {
            const latest = fundData.details[0];
            return {
              currency,
              balance: parseFloat(latest.balance),
              amount: parseFloat(latest.amt),
              timestamp: Number(latest.ts)
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get risk reserve:`, error.message);
      return null;
    }
  }

  /**
   * 63. 获取成交明细 (Fill Details)
   */
  async getFillsHistory(symbol = 'BTC/USDT', limit = 100) {
    try {
      console.log(`Fills History ${symbol}...`);
      const exchange = this.exchangeManager.getExchange();

      if (!exchange.has['fetchMyTrades']) {
        console.warn(`Exchange does not support fetchMyTrades`);
        return null;
      }

      const fills = await exchange.fetchMyTrades(symbol, undefined, limit);

      return fills.map(fill => ({
        id: fill.id,
        orderId: fill.order,
        symbol: fill.symbol,
        side: fill.side,
        price: fill.price,
        amount: fill.amount,
        fee: fill.fee ? fill.fee.cost : 0,
        feeCurrency: fill.fee ? fill.fee.currency : null,
        timestamp: fill.timestamp,
        datetime: fill.datetime
      }));
    } catch (error) {
      console.error(`Failed to get fills history:`, error.message);
      return null;
    }
  }

  /**
   * 64. 获取账户配置 (Account Configuration)
   */
  async getAccountConfig() {
    try {
      console.log(`Account Configuration...`);

      if (this.exchangeManager.getExchangeName() === 'okx') {
        const response = await axios.get('https://www.okx.com/api/v5/account/config', {
          timeout: 8000
        });

        if (response.data && response.data.data && response.data.data.length > 0) {
          const data = response.data.data[0];
          return {
            accountLevel: data.acctLv,
            positionMode: data.posMode,
            autoLoan: data.autoLoan === 'true',
            marginMode: data.mgnIsoMode,
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Failed to get account config:`, error.message);
      return null;
    }
  }

  /**
   * 计算所有技术指标
   */
  async getAllIndicators(symbol = 'BTC/USDT', timeframe = '1h') {
    return await this.exchangeManager.executeWithFallback(async () => {
      console.log(`🔧 [${this.exchangeManager.getExchangeName().toUpperCase()}] 计算${symbol}所有技术指标...`);

      // 获取K线数据（获取更多数据以计算长周期指标）
      const ohlcv = await this.getOHLCV(symbol, timeframe, 500);
      const closes = ohlcv.map(c => c.close);
      const highs = ohlcv.map(c => c.high);
      const lows = ohlcv.map(c => c.low);
      const opens = ohlcv.map(c => c.open);
      const volumes = ohlcv.map(c => c.volume);

      return {
        symbol,
        timeframe,
        timestamp: Date.now(),
        dataPoints: ohlcv.length,

        // ==================== 趋势指标 ====================
        trend: {
          // 简单移动平均线 (SMA)
          sma5: TechnicalIndicators.calculateSMA(closes, 5),
          sma10: TechnicalIndicators.calculateSMA(closes, 10),
          sma20: TechnicalIndicators.calculateSMA(closes, 20),
          sma30: TechnicalIndicators.calculateSMA(closes, 30),
          sma50: TechnicalIndicators.calculateSMA(closes, 50),
          sma100: TechnicalIndicators.calculateSMA(closes, 100),
          sma200: TechnicalIndicators.calculateSMA(closes, 200),

          // 指数移动平均线 (EMA)
          ema5: TechnicalIndicators.calculateEMA(closes, 5),
          ema9: TechnicalIndicators.calculateEMA(closes, 9),
          ema12: TechnicalIndicators.calculateEMA(closes, 12),
          ema21: TechnicalIndicators.calculateEMA(closes, 21),
          ema26: TechnicalIndicators.calculateEMA(closes, 26),
          ema50: TechnicalIndicators.calculateEMA(closes, 50),
          ema100: TechnicalIndicators.calculateEMA(closes, 100),
          ema200: TechnicalIndicators.calculateEMA(closes, 200),

          // 加权移动平均线 (WMA)
          wma10: TechnicalIndicators.calculateWMA(closes, 10),
          wma20: TechnicalIndicators.calculateWMA(closes, 20),
          wma50: TechnicalIndicators.calculateWMA(closes, 50),

          // 趋势强度
          adx: TechnicalIndicators.calculateADX(highs, lows, closes, 14),

          // 抛物线SAR
          sar: TechnicalIndicators.calculateSAR(highs, lows, closes)
        },

        // ==================== 动量指标 ====================
        momentum: {
          // 相对强弱指标 (RSI)
          rsi6: TechnicalIndicators.calculateRSI(closes, 6),
          rsi7: TechnicalIndicators.calculateRSI(closes, 7),
          rsi14: TechnicalIndicators.calculateRSI(closes, 14),
          rsi21: TechnicalIndicators.calculateRSI(closes, 21),
          rsi28: TechnicalIndicators.calculateRSI(closes, 28),

          // MACD
          macd: TechnicalIndicators.calculateMACD(closes, 12, 26, 9),
          macdFast: TechnicalIndicators.calculateMACD(closes, 5, 13, 5),
          macdSlow: TechnicalIndicators.calculateMACD(closes, 19, 39, 9),

          // 随机指标 (Stochastic)
          stochastic: TechnicalIndicators.calculateStochastic(highs, lows, closes, 14),
          stochasticFast: TechnicalIndicators.calculateStochastic(highs, lows, closes, 5),
          stochasticSlow: TechnicalIndicators.calculateStochastic(highs, lows, closes, 21),

          // 威廉指标 (Williams %R)
          williamsR: TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 14),
          williamsR7: TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 7),
          williamsR21: TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 21),

          // 变动率 (ROC)
          roc: TechnicalIndicators.calculateROC(closes, 12),
          roc9: TechnicalIndicators.calculateROC(closes, 9),
          roc25: TechnicalIndicators.calculateROC(closes, 25),

          // 动量指标 (Momentum)
          momentum: TechnicalIndicators.calculateMomentum(closes, 10),
          momentum14: TechnicalIndicators.calculateMomentum(closes, 14),

          // 商品通道指数 (CCI)
          cci: TechnicalIndicators.calculateCCI(highs, lows, closes, 20),
          cci14: TechnicalIndicators.calculateCCI(highs, lows, closes, 14)
        },

        // ==================== 波动率指标 ====================
        volatility: {
          // 布林带 (Bollinger Bands)
          bollingerBands: TechnicalIndicators.calculateBollingerBands(closes, 20, 2),
          bollingerBands10: TechnicalIndicators.calculateBollingerBands(closes, 10, 1.5),
          bollingerBands50: TechnicalIndicators.calculateBollingerBands(closes, 50, 2.5),

          // 真实波动幅度 (ATR)
          atr: TechnicalIndicators.calculateATR(highs, lows, closes, 14),
          atr7: TechnicalIndicators.calculateATR(highs, lows, closes, 7),
          atr21: TechnicalIndicators.calculateATR(highs, lows, closes, 21),

          // 肯特纳通道 (Keltner Channels)
          keltnerChannels: TechnicalIndicators.calculateKeltnerChannels(highs, lows, closes, 20, 2),
          keltnerChannels10: TechnicalIndicators.calculateKeltnerChannels(highs, lows, closes, 10, 1.5),

          // 唐奇安通道 (Donchian Channels)
          donchianChannels: TechnicalIndicators.calculateDonchianChannels(highs, lows, 20),
          donchianChannels10: TechnicalIndicators.calculateDonchianChannels(highs, lows, 10),
          donchianChannels50: TechnicalIndicators.calculateDonchianChannels(highs, lows, 50),

          // 历史波动率
          historicalVolatility: TechnicalIndicators.calculateHistoricalVolatility(closes, 20),
          historicalVolatility10: TechnicalIndicators.calculateHistoricalVolatility(closes, 10),
          historicalVolatility30: TechnicalIndicators.calculateHistoricalVolatility(closes, 30)
        },

        // ==================== 成交量指标 ====================
        volume: {
          // 能量潮 (OBV)
          obv: TechnicalIndicators.calculateOBV(closes, volumes),

          // 成交量加权平均价 (VWAP)
          vwap: TechnicalIndicators.calculateVWAP(ohlcv),

          // 成交量移动平均
          volumeSMA5: TechnicalIndicators.calculateSMA(volumes, 5),
          volumeSMA10: TechnicalIndicators.calculateSMA(volumes, 10),
          volumeSMA20: TechnicalIndicators.calculateSMA(volumes, 20),
          volumeSMA50: TechnicalIndicators.calculateSMA(volumes, 50),

          // 成交量比率 (Volume Ratio)
          volumeRatio: TechnicalIndicators.calculateVolumeRatio(volumes, 20),

          // 资金流量指标 (MFI)
          mfi: TechnicalIndicators.calculateMFI(highs, lows, closes, volumes, 14),
          mfi7: TechnicalIndicators.calculateMFI(highs, lows, closes, volumes, 7),
          mfi21: TechnicalIndicators.calculateMFI(highs, lows, closes, volumes, 21),

          // 累积/派发线 (A/D Line)
          adLine: TechnicalIndicators.calculateADLine(highs, lows, closes, volumes),

          // 价量趋势 (PVT)
          pvt: TechnicalIndicators.calculatePVT(closes, volumes)
        },

        // ==================== 支撑/阻力指标 ====================
        supportResistance: {
          pivotPoints: TechnicalIndicators.calculatePivotPoints(highs, lows, closes),
          fibonacciLevels: TechnicalIndicators.calculateFibonacciLevels(highs, lows),
          highLow20: TechnicalIndicators.calculateHighLow(highs, lows, 20),
          highLow50: TechnicalIndicators.calculateHighLow(highs, lows, 50)
        },

        // ==================== 价格形态 ====================
        patterns: {
          // 蜡烛图形态
          candlePatterns: TechnicalIndicators.detectCandlePatterns(opens, highs, lows, closes),

          // 趋势形态
          trendPattern: TechnicalIndicators.detectTrendPattern(closes, 20),

          // 背离检测
          divergence: TechnicalIndicators.detectDivergence(closes, TechnicalIndicators.calculateRSI(closes, 14))
        },

        // ==================== 市场情绪 ====================
        sentiment: {
          // 恐惧贪婪指数（简化版）
          fearGreedIndex: TechnicalIndicators.calculateFearGreedIndex(closes, volumes, TechnicalIndicators.calculateRSI(closes, 14)),

          // 多空比
          bullBearRatio: TechnicalIndicators.calculateBullBearRatio(closes, volumes),

          // 市场强度
          marketStrength: TechnicalIndicators.calculateMarketStrength(closes, volumes)
        },

        // 当前价格
        currentPrice: closes[closes.length - 1],
        previousClose: closes[closes.length - 2],

        // 市场状态
        marketState: TechnicalIndicators.analyzeMarketState(closes, volumes)
      };
    }, `计算${symbol}技术指标`);
  }

  /**
   * 获取完整市场数据（完整版：超慢速串行获取，避免OKX API频率限制）
   */
  async getCompleteMarketData(symbol = 'BTC/USDT', timeframe = '1h') {
    try {
      console.log(`\n🚀 [OKX] 获取${symbol}完整市场数据（超慢速串行模式）...\n`);

      // Helper function for delay
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // ULTRA-SLOW SERIAL fetching to avoid rate limits
      // Total: 5 API calls with 500ms delays = ~2.5 seconds for base data

      // 1. Get ticker (most critical - current price)
      const ticker = await this.getTicker(symbol);
      console.log('   ✓ Ticker fetched');
      await sleep(500); // 500ms delay

      // 2. Get indicators (will internally fetch OHLCV with 500 candles)
      const indicators = await this.getAllIndicators(symbol, timeframe);
      console.log('   ✓ Indicators calculated (includes OHLCV 500)');
      await sleep(500); // 500ms delay

      // 3. Get a smaller OHLCV for display (100 candles)
      const ohlcv = await this.getOHLCV(symbol, timeframe, 100);
      console.log('   ✓ OHLCV fetched (100 for display)');
      await sleep(500); // 500ms delay

      // 4. Get orderBook (20 levels)
      const orderBook = await this.getOrderBook(symbol, 20);
      console.log('   ✓ OrderBook fetched');
      await sleep(500); // 500ms delay

      // 5. Get trades (50 recent)
      const trades = await this.getTrades(symbol, 50);
      console.log('   ✓ Trades fetched');

      console.log(`\n✅ [OKX] 完整数据获取成功（超慢速模式）！\n`);

      return {
        symbol,
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        // 实时数据
        ticker,
        // K线数据
        ohlcv,
        // 订单簿
        orderBook,
        // 成交记录
        trades,
        // 技术指标
        indicators,
        // 市场摘要
        summary: {
          price: ticker.last,
          change24h: ticker.percentage,
          volume24h: ticker.baseVolume,
          high24h: ticker.high,
          low24h: ticker.low,
          bidAskSpread: orderBook.spread,
          rsi: indicators.momentum.rsi14,
          macd: indicators.momentum.macd.histogram,
          trend: TechnicalIndicators.determineTrend(indicators)
        }
      };
    } catch (error) {
      console.error(`❌ 获取完整市场数据失败:`, error.message);
      throw error;
    }
  }
}

module.exports = DataFetcher;
