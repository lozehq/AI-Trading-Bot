/**
 * 高级市场数据服务
 * 包含：USDT溢价率、做市商深度、隐含波动率、跨交易所套利
 */

const axios = require('axios');
const { caches } = require('../utils/cache');

class AdvancedMarketDataService {
  constructor() {
    this.cache = {
      usdtPremium: { data: null, timestamp: 0, ttl: 30000 },       // 30秒
      marketMakerDepth: { data: null, timestamp: 0, ttl: 10000 },  // 10秒
      impliedVolatility: { data: null, timestamp: 0, ttl: 60000 }, // 1分钟
      crossExchange: { data: null, timestamp: 0, ttl: 5000 }       // 5秒
    };
  }

  /**
   * 1. USDT溢价率 - 判断市场风险情绪
   * 溢价率 > 2% = 市场恐慌，资金外逃
   * 溢价率 < -2% = 市场乐观，资金流入
   */
  async getUSDTPremium() {
    try {
      const now = Date.now();
      if (this.cache.usdtPremium.data && (now - this.cache.usdtPremium.timestamp) < this.cache.usdtPremium.ttl) {
        return this.cache.usdtPremium.data;
      }

      console.log('💵 计算USDT溢价率...');

      // 获取离岸人民币汇率（USD/CNY）
      const fxRate = await this.getUSDCNYRate();
      
      // 获取多个交易所的USDT/CNY价格
      const [okxPrice, huobiPrice, binancePrice] = await Promise.allSettled([
        this.getOKXUSDTPrice(),
        this.getHuobiUSDTPrice(),
        this.getBinanceUSDTPrice()
      ]);

      const prices = [];
      if (okxPrice.status === 'fulfilled' && okxPrice.value) {
        prices.push({ exchange: 'OKX', price: okxPrice.value });
      }
      if (huobiPrice.status === 'fulfilled' && huobiPrice.value) {
        prices.push({ exchange: 'Huobi', price: huobiPrice.value });
      }
      if (binancePrice.status === 'fulfilled' && binancePrice.value) {
        prices.push({ exchange: 'Binance', price: binancePrice.value });
      }

      if (prices.length === 0) {
        throw new Error('无法获取USDT/CNY价格');
      }

      // 计算平均价格和溢价率
      const avgUSDTPrice = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
      const premium = ((avgUSDTPrice - fxRate) / fxRate) * 100;

      // 分析信号
      let signal = 'NEUTRAL';
      let sentiment = '正常';
      let recommendation = '无明显风险信号';

      if (premium > 3) {
        signal = 'PANIC';
        sentiment = '极度恐慌';
        recommendation = '市场恐慌情绪严重，资金外逃，谨慎做多';
      } else if (premium > 1.5) {
        signal = 'FEAR';
        sentiment = '恐慌';
        recommendation = '市场存在恐慌情绪，注意风险';
      } else if (premium < -3) {
        signal = 'EXTREME_GREED';
        sentiment = '极度贪婪';
        recommendation = '市场过度乐观，警惕泡沫破裂';
      } else if (premium < -1.5) {
        signal = 'GREED';
        sentiment = '贪婪';
        recommendation = '市场乐观情绪高涨，注意回调风险';
      }

      const result = {
        avgUSDTPrice: avgUSDTPrice.toFixed(4),
        fxRate: fxRate.toFixed(4),
        premium: premium.toFixed(3),
        signal,
        sentiment,
        recommendation,
        exchanges: prices,
        timestamp: Date.now()
      };

      this.cache.usdtPremium.data = result;
      this.cache.usdtPremium.timestamp = now;

      return result;
    } catch (error) {
      console.error('❌ USDT溢价率计算失败:', error.message);
      return null;
    }
  }

  /**
   * 获取USD/CNY汇率
   */
  async getUSDCNYRate() {
    try {
      // 方案1: 使用免费汇率API
      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
        timeout: 5000
      });
      
      if (response.data?.rates?.CNY) {
        return response.data.rates.CNY;
      }

      // 方案2: 备用 - 使用固定汇率（需定期更新）
      return 7.25; // 2024年大致汇率
    } catch (error) {
      console.warn('汇率API失败，使用默认汇率');
      return 7.25;
    }
  }

  /**
   * 获取OKX的USDT/CNY价格
   */
  async getOKXUSDTPrice() {
    try {
      const response = await axios.get('https://www.okx.com/api/v5/market/ticker', {
        params: { instId: 'USDT-CNY' },
        timeout: 5000
      });
      
      if (response.data?.data?.[0]?.last) {
        return parseFloat(response.data.data[0].last);
      }
      return null;
    } catch (error) {
      console.warn('OKX USDT/CNY获取失败');
      return null;
    }
  }

  /**
   * 获取Huobi的USDT/CNY价格
   */
  async getHuobiUSDTPrice() {
    try {
      const response = await axios.get('https://api.huobi.pro/market/detail/merged', {
        params: { symbol: 'usdtcny' },
        timeout: 5000
      });
      
      if (response.data?.tick?.close) {
        return parseFloat(response.data.tick.close);
      }
      return null;
    } catch (error) {
      console.warn('Huobi USDT/CNY获取失败');
      return null;
    }
  }

  /**
   * 获取Binance的USDT/CNY价格（通过中间计算）
   */
  async getBinanceUSDTPrice() {
    try {
      // Binance没有直接的USDT/CNY，通过USDT/USDC和USDC/CNY计算
      // 简化处理：使用BTC/USDT反推
      return null; // 暂时跳过
    } catch (error) {
      return null;
    }
  }

  /**
   * 2. 做市商深度分析 - 评估真实流动性
   * 分析订单簿中的大额挂单，识别支撑位和阻力位
   */
  async getMarketMakerDepth(symbol = 'BTC/USDT', exchange = 'okx') {
    try {
      const now = Date.now();
      const cacheKey = `${exchange}_${symbol}`;
      
      if (this.cache.marketMakerDepth.data?.[cacheKey] && 
          (now - this.cache.marketMakerDepth.timestamp) < this.cache.marketMakerDepth.ttl) {
        return this.cache.marketMakerDepth.data[cacheKey];
      }

      console.log('📊 分析做市商深度...');

      // 获取深度订单簿（Level 2）
      const orderBook = await this.getL2OrderBook(symbol, exchange, 400);
      
      if (!orderBook) {
        throw new Error('无法获取订单簿数据');
      }

      // 分析大额挂单
      const largeOrderThreshold = this.calculateLargeOrderThreshold(orderBook);
      
      // 买单分析
      const buyWalls = this.findOrderWalls(orderBook.bids, largeOrderThreshold, 'buy');
      const buySupport = buyWalls.map(w => w.price);
      
      // 卖单分析
      const sellWalls = this.findOrderWalls(orderBook.asks, largeOrderThreshold, 'sell');
      const sellResistance = sellWalls.map(w => w.price);
      
      // 计算买卖压力比
      const totalBidSize = orderBook.bids.reduce((sum, bid) => sum + bid[1], 0);
      const totalAskSize = orderBook.asks.reduce((sum, ask) => sum + ask[1], 0);
      const pressureRatio = totalBidSize / totalAskSize;
      
      // 分析结论
      let signal = 'NEUTRAL';
      let description = '';
      
      if (pressureRatio > 1.5) {
        signal = 'BULLISH';
        description = '买盘压力强劲，支撑充足';
      } else if (pressureRatio < 0.67) {
        signal = 'BEARISH';
        description = '卖盘压力较大，阻力明显';
      } else {
        description = '买卖力量均衡';
      }

      const result = {
        symbol,
        exchange,
        pressureRatio: pressureRatio.toFixed(3),
        signal,
        description,
        buyWalls: buyWalls.slice(0, 5), // 前5个买墙
        sellWalls: sellWalls.slice(0, 5), // 前5个卖墙
        support: buySupport.slice(0, 3), // 前3个支撑位
        resistance: sellResistance.slice(0, 3), // 前3个阻力位
        totalBidSize: totalBidSize.toFixed(2),
        totalAskSize: totalAskSize.toFixed(2),
        timestamp: Date.now()
      };

      if (!this.cache.marketMakerDepth.data) this.cache.marketMakerDepth.data = {};
      this.cache.marketMakerDepth.data[cacheKey] = result;
      this.cache.marketMakerDepth.timestamp = now;

      return result;
    } catch (error) {
      console.error('❌ 做市商深度分析失败:', error.message);
      return null;
    }
  }

  /**
   * 获取L2订单簿
   */
  async getL2OrderBook(symbol, exchange, depth = 400) {
    try {
      const instId = symbol.replace('/', '-');
      const response = await axios.get(`https://www.okx.com/api/v5/market/books`, {
        params: { instId, sz: depth },
        timeout: 8000
      });
      
      if (response.data?.data?.[0]) {
        return {
          bids: response.data.data[0].bids.map(b => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: response.data.data[0].asks.map(a => [parseFloat(a[0]), parseFloat(a[1])])
        };
      }
      return null;
    } catch (error) {
      console.error('获取订单簿失败:', error.message);
      return null;
    }
  }

  /**
   * 计算大单阈值（平均订单大小的3倍）
   */
  calculateLargeOrderThreshold(orderBook) {
    const allOrders = [...orderBook.bids, ...orderBook.asks];
    const avgSize = allOrders.reduce((sum, order) => sum + order[1], 0) / allOrders.length;
    return avgSize * 3;
  }

  /**
   * 查找订单墙（大额挂单聚集）
   */
  findOrderWalls(orders, threshold, side) {
    const walls = [];
    
    for (let i = 0; i < orders.length; i++) {
      const [price, size] = orders[i];
      
      if (size >= threshold) {
        walls.push({
          price: price,
          size: size.toFixed(4),
          side: side,
          strength: size >= threshold * 2 ? 'STRONG' : 'MEDIUM'
        });
      }
    }
    
    return walls.sort((a, b) => parseFloat(b.size) - parseFloat(a.size));
  }

  /**
   * 3. 隐含波动率 - 预判未来波动
   * 从期权市场获取IV数据
   */
  async getImpliedVolatility(asset = 'BTC') {
    try {
      const now = Date.now();
      if (this.cache.impliedVolatility.data && 
          (now - this.cache.impliedVolatility.timestamp) < this.cache.impliedVolatility.ttl) {
        return this.cache.impliedVolatility.data;
      }

      console.log('📈 获取隐含波动率...');

      // OKX期权IV数据
      const response = await axios.get('https://www.okx.com/api/v5/public/open-interest', {
        params: { instType: 'OPTION', uly: `${asset}-USD` },
        timeout: 10000
      });

      if (!response.data?.data || response.data.data.length === 0) {
        console.warn('期权数据不可用，使用历史波动率估算');
        return await this.getHistoricalVolatilityFallback(asset);
      }

      // 计算平均IV（简化处理）
      // 生产环境应该使用Deribit或专业期权API
      const ivEstimate = await this.estimateIVFromOptions(asset);

      const result = {
        asset,
        impliedVolatility: ivEstimate.iv,
        ivPercentile: ivEstimate.percentile,
        signal: ivEstimate.signal,
        description: ivEstimate.description,
        timestamp: Date.now()
      };

      this.cache.impliedVolatility.data = result;
      this.cache.impliedVolatility.timestamp = now;

      return result;
    } catch (error) {
      console.error('❌ 隐含波动率获取失败:', error.message);
      return await this.getHistoricalVolatilityFallback(asset);
    }
  }

  /**
   * 从期权数据估算IV
   */
  async estimateIVFromOptions(asset) {
    // 简化版：使用历史波动率作为IV的代理
    // 生产环境应该使用Black-Scholes模型反推
    const hvData = await this.calculateHistoricalVolatility(asset, 30);
    
    let signal = 'NEUTRAL';
    let description = '';
    
    if (hvData.volatility > 80) {
      signal = 'EXTREME_VOLATILITY';
      description = '市场极度波动，风险极高';
    } else if (hvData.volatility > 60) {
      signal = 'HIGH_VOLATILITY';
      description = '高波动环境，适合震荡策略';
    } else if (hvData.volatility < 30) {
      signal = 'LOW_VOLATILITY';
      description = '低波动环境，可能突破在即';
    } else {
      description = '正常波动水平';
    }

    return {
      iv: hvData.volatility,
      percentile: hvData.percentile,
      signal,
      description
    };
  }

  /**
   * 计算历史波动率
   */
  async calculateHistoricalVolatility(asset, days = 30) {
    try {
      // 获取历史价格数据
      const response = await axios.get('https://www.okx.com/api/v5/market/candles', {
        params: {
          instId: `${asset}-USDT`,
          bar: '1D',
          limit: days
        },
        timeout: 10000
      });

      if (!response.data?.data || response.data.data.length === 0) {
        return { volatility: 50, percentile: 50 }; // 默认值
      }

      const closes = response.data.data.map(candle => parseFloat(candle[4]));
      
      // 计算日收益率
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        returns.push(Math.log(closes[i] / closes[i-1]));
      }
      
      // 计算标准差（波动率）
      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      
      // 年化波动率（%）
      const annualizedVol = stdDev * Math.sqrt(365) * 100;
      
      return {
        volatility: annualizedVol.toFixed(2),
        percentile: 50 // 简化处理
      };
    } catch (error) {
      return { volatility: 50, percentile: 50 };
    }
  }

  /**
   * 历史波动率备用方案
   */
  async getHistoricalVolatilityFallback(asset) {
    const hvData = await this.calculateHistoricalVolatility(asset, 30);
    
    return {
      asset,
      impliedVolatility: hvData.volatility,
      ivPercentile: hvData.percentile,
      signal: 'NEUTRAL',
      description: '使用历史波动率估算（期权数据不可用）',
      timestamp: Date.now(),
      source: 'historical_volatility_fallback'
    };
  }

  /**
   * 4. 跨交易所套利机会
   * 对比不同交易所价格，发现套利空间
   */
  async getCrossExchangeArbitrage(symbol = 'BTC/USDT') {
    try {
      const now = Date.now();
      const cacheKey = symbol;
      
      if (this.cache.crossExchange.data?.[cacheKey] && 
          (now - this.cache.crossExchange.timestamp) < this.cache.crossExchange.ttl) {
        return this.cache.crossExchange.data[cacheKey];
      }

      console.log('💱 分析跨交易所套利机会...');

      // 并发获取多个交易所价格
      const [okxPrice, binancePrice, bybitPrice] = await Promise.allSettled([
        this.getExchangePrice('OKX', symbol),
        this.getExchangePrice('Binance', symbol),
        this.getExchangePrice('Bybit', symbol)
      ]);

      const prices = [];
      if (okxPrice.status === 'fulfilled' && okxPrice.value) {
        prices.push({ exchange: 'OKX', ...okxPrice.value });
      }
      if (binancePrice.status === 'fulfilled' && binancePrice.value) {
        prices.push({ exchange: 'Binance', ...binancePrice.value });
      }
      if (bybitPrice.status === 'fulfilled' && bybitPrice.value) {
        prices.push({ exchange: 'Bybit', ...bybitPrice.value });
      }

      if (prices.length < 2) {
        throw new Error('至少需要2个交易所数据');
      }

      // 找出最高价和最低价
      const sorted = prices.sort((a, b) => a.price - b.price);
      const lowest = sorted[0];
      const highest = sorted[sorted.length - 1];
      
      // 计算套利空间（扣除手续费）
      const spreadPct = ((highest.price - lowest.price) / lowest.price) * 100;
      const tradingFee = 0.1; // 假设0.1%手续费
      const netSpread = spreadPct - (tradingFee * 2);

      // 判断是否有套利机会
      let opportunity = 'NONE';
      let recommendation = '无明显套利空间';
      
      if (netSpread > 0.5) {
        opportunity = 'STRONG';
        recommendation = `强烈推荐：在${lowest.exchange}买入，在${highest.exchange}卖出`;
      } else if (netSpread > 0.2) {
        opportunity = 'MODERATE';
        recommendation = `可考虑：在${lowest.exchange}买入，在${highest.exchange}卖出`;
      } else if (netSpread > 0) {
        opportunity = 'WEAK';
        recommendation = '套利空间较小，需考虑滑点和转账成本';
      }

      const result = {
        symbol,
        prices,
        buyFrom: lowest,
        sellTo: highest,
        spreadPercent: spreadPct.toFixed(4),
        netSpreadPercent: netSpread.toFixed(4),
        opportunity,
        recommendation,
        timestamp: Date.now()
      };

      if (!this.cache.crossExchange.data) this.cache.crossExchange.data = {};
      this.cache.crossExchange.data[cacheKey] = result;
      this.cache.crossExchange.timestamp = now;

      return result;
    } catch (error) {
      console.error('❌ 跨交易所套利分析失败:', error.message);
      return null;
    }
  }

  /**
   * 获取交易所价格
   */
  async getExchangePrice(exchange, symbol) {
    try {
      switch(exchange) {
        case 'OKX':
          return await this.getOKXPrice(symbol);
        case 'Binance':
          return await this.getBinancePrice(symbol);
        case 'Bybit':
          return await this.getBybitPrice(symbol);
        default:
          return null;
      }
    } catch (error) {
      console.warn(`${exchange}价格获取失败:`, error.message);
      return null;
    }
  }

  async getOKXPrice(symbol) {
    const instId = symbol.replace('/', '-');
    const response = await axios.get('https://www.okx.com/api/v5/market/ticker', {
      params: { instId },
      timeout: 5000
    });
    
    if (response.data?.data?.[0]) {
      const data = response.data.data[0];
      return {
        price: parseFloat(data.last),
        bid: parseFloat(data.bidPx),
        ask: parseFloat(data.askPx),
        volume: parseFloat(data.volCcy24h)
      };
    }
    return null;
  }

  async getBinancePrice(symbol) {
    const binanceSymbol = symbol.replace('/', '');
    const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
      params: { symbol: binanceSymbol },
      timeout: 5000
    });
    
    if (response.data?.lastPrice) {
      return {
        price: parseFloat(response.data.lastPrice),
        bid: parseFloat(response.data.bidPrice),
        ask: parseFloat(response.data.askPrice),
        volume: parseFloat(response.data.quoteVolume)
      };
    }
    return null;
  }

  async getBybitPrice(symbol) {
    const bybitSymbol = symbol.replace('/', '');
    const response = await axios.get('https://api.bybit.com/v5/market/tickers', {
      params: { category: 'spot', symbol: bybitSymbol },
      timeout: 5000
    });
    
    if (response.data?.result?.list?.[0]) {
      const data = response.data.result.list[0];
      return {
        price: parseFloat(data.lastPrice),
        bid: parseFloat(data.bid1Price),
        ask: parseFloat(data.ask1Price),
        volume: parseFloat(data.turnover24h)
      };
    }
    return null;
  }

  /**
   * 获取所有高级数据
   */
  async getAllAdvancedData(symbol = 'BTC/USDT', asset = 'BTC') {
    const [usdtPremium, marketMakerDepth, impliedVolatility, crossExchangeArb] = await Promise.allSettled([
      this.getUSDTPremium(),
      this.getMarketMakerDepth(symbol),
      this.getImpliedVolatility(asset),
      this.getCrossExchangeArbitrage(symbol)
    ]);

    return {
      usdtPremium: usdtPremium.status === 'fulfilled' ? usdtPremium.value : null,
      marketMakerDepth: marketMakerDepth.status === 'fulfilled' ? marketMakerDepth.value : null,
      impliedVolatility: impliedVolatility.status === 'fulfilled' ? impliedVolatility.value : null,
      crossExchangeArbitrage: crossExchangeArb.status === 'fulfilled' ? crossExchangeArb.value : null,
      timestamp: Date.now()
    };
  }
}

// 单例模式
const advancedMarketDataService = new AdvancedMarketDataService();

module.exports = advancedMarketDataService;
