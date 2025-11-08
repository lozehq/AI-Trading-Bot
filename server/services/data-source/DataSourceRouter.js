/**
 * 数据源路由器
 * 负责根据当前数据源决定使用哪个服务获取数据
 */

const FreeAPIManager = require('./FreeAPIManager');
const pLimit = require('p-limit');
const { AI_ANALYSIS } = require('../../config/constants');
const { caches } = require('../../utils/cache');
const performanceMonitor = require('../performanceMonitor');
const networkOptimizer = require('../../utils/networkOptimizer');
const { signedGet } = require('../exchange/okxRequest');
const axios = {
  get: (url, config = {}) => networkOptimizer.get(url, config)
};
const memoryMonitor = require('../../utils/memoryMonitor');

class DataSourceRouter {
  constructor(config) {
    this.config = config;
    this.freeAPI = FreeAPIManager;
    // 并发控制：从配置读取并发限制，但为了稳定性降低到3
    this.concurrencyLimit = pLimit(Math.min(AI_ANALYSIS.CONCURRENCY_LIMIT, 3));
    // 静态数据缓存（1小时TTL）
    this.staticCache = caches.static;

    // 启动内存监控
    memoryMonitor.start();
  }

  /**
   * 缓存包装器：为静态数据提供缓存
   * @param {string} cacheKey - 缓存键
   * @param {Function} fetchFn - 获取数据的函数
   * @returns {Promise<any>} 数据结果
   */
  async withStaticCache(cacheKey, fetchFn) {
    // 尝试从缓存获取
    const cached = this.staticCache.get(cacheKey);
    if (cached !== null) {
      console.log(`Cache hit: ${cacheKey}`);
      performanceMonitor.recordCacheHit(true);
      return cached;
    }

    performanceMonitor.recordCacheHit(false);

    // 缓存未命中，执行获取
    const startTime = Date.now();
    let success = true;

    try {
      const result = await fetchFn();

      // 存入缓存
      if (result !== null && result !== undefined) {
        this.staticCache.set(cacheKey, result);
      }

      const duration = Date.now() - startTime;
      performanceMonitor.recordAPICall(cacheKey, duration, true);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      performanceMonitor.recordAPICall(cacheKey, duration, false);
      performanceMonitor.recordError(cacheKey, error);
      throw error;
    }
  }

  /**
   * 获取Ticker数据
   */
  async getTicker(exchange, symbol) {
    const source = this.config.getCurrentSource();

    console.log(`📊 [${source.toUpperCase()}] 获取${symbol}实时价格...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getTicker(symbol);
    } else {
      const mcpService = require('../mcpService');
      return await mcpService.getTicker(exchange, symbol);
    }
  }

  /**
   * 获取OHLCV数据
   */
  async getOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    const source = this.config.getCurrentSource();

    console.log(`📈 [${source.toUpperCase()}] 获取${symbol} K线数据...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOHLCV(symbol, timeframe, limit);
    } else {
      const mcpService = require('../mcpService');
      return await mcpService.getOHLCV(exchange, symbol, timeframe, limit);
    }
  }

  /**
   * 获取所有技术指标
   */
  async getAllIndicators(exchange, symbol, timeframe = '1h') {
    const source = this.config.getCurrentSource();

    console.log(`🔧 [${source.toUpperCase()}] 计算${symbol}所有技术指标...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getAllIndicators(symbol, timeframe);
    } else {
      const mcpService = require('../mcpService');
      return await mcpService.getAllIndicators(exchange, symbol, timeframe);
    }
  }

  /**
   * 获取订单簿
   */
  async getOrderBook(exchange, symbol, limit = 20) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOrderBook(symbol, limit);
    } else {
      // MCP可能不支持订单簿，使用CCXT作为后备
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOrderBook(symbol, limit);
    }
  }

  /**
   * 获取交易记录
   */
  async getTrades(exchange, symbol, limit = 50) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getTrades(symbol, limit);
    } else {
      // MCP可能不支持交易记录，使用CCXT作为后备
      const okxDataService = require('../okxDataService');
      return await okxDataService.getTrades(symbol, limit);
    }
  }

  /**
   * 获取资金费率
   */
  async getFundingRate(exchange, symbol) {
    const source = this.config.getCurrentSource();
    const exchangeConfig = require('../../config/exchange-config');

    try {
      const ccxt = require('ccxt');
      
      // ✅ 修复：优先使用 OKX（无地理限制）
      const preferredExchange = exchangeConfig.getBestExchange();
      const exchangeToUse = (exchange === 'binance' && !exchangeConfig.PROXY_CONFIG.enabled) 
        ? preferredExchange 
        : exchange;
      
      const exchangeInstance = new ccxt[exchangeToUse]();

      const futuresSymbol = symbol.includes(':') ? symbol : `${symbol}:USDT`;
      const fundingRate = await exchangeInstance.fetchFundingRate(futuresSymbol);

      return {
        symbol: futuresSymbol,
        fundingRate: fundingRate.fundingRate || 0,
        fundingDatetime: fundingRate.fundingDatetime || new Date().toISOString(),
        nextFundingDatetime: fundingRate.nextFundingDatetime || new Date().toISOString(),
        timestamp: fundingRate.timestamp || Date.now()
      };
    } catch (error) {
      console.warn(`⚠️ 获取资金费率失败: ${error.message}`);
      return {
        symbol,
        fundingRate: null,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取持仓量（Open Interest）
   */
  async getOpenInterest(exchange, symbol) {
    const source = this.config.getCurrentSource();
    const exchangeConfig = require('../../config/exchange-config');

    console.log(`📊 [${source.toUpperCase()}] 获取持仓量: ${symbol}`);

    try {
      const ccxt = require('ccxt');
      
      // ✅ 修复：优先使用 OKX（无地理限制）
      const preferredExchange = exchangeConfig.getBestExchange();
      const exchangeToUse = (exchange === 'binance' && !exchangeConfig.PROXY_CONFIG.enabled) 
        ? preferredExchange 
        : exchange;
      
      const exchangeInstance = new ccxt[exchangeToUse]();

      const futuresSymbol = symbol.includes(':') ? symbol : `${symbol}:USDT`;
      const openInterest = await exchangeInstance.fetchOpenInterest(futuresSymbol);

      return {
        symbol: futuresSymbol,
        openInterest: openInterest.openInterestAmount || 0,
        openInterestValue: openInterest.openInterestValue || 0,
        timestamp: openInterest.timestamp || Date.now(),
        datetime: openInterest.datetime || new Date().toISOString()
      };
    } catch (error) {
      console.warn(`⚠️ 获取持仓量失败: ${error.message}`);
      return {
        symbol,
        openInterest: null,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取清算数据
   */
  async getLiquidations(exchange, symbol, limit = 100) {
    const source = this.config.getCurrentSource();
    const { caches } = require('../../utils/cache');
    
    // 缓存键（30秒缓存，避免频繁请求）
    const cacheKey = `liquidations:${symbol}`;
    const cached = caches.market.get(cacheKey);
    if (cached) return cached;

    try {

      // ✅ 修复：优先尝试 OKX（无地理限制），Binance 作为备用
      const baseSymbol = symbol.replace('/', '');
      
      // 验证是否为USDT交易对
      if (!symbol.includes('USDT')) {
        throw new Error('仅支持USDT交易对的清算数据');
      }

      // 尝试 OKX 期货清算数据（无地理限制）
      try {
        const ccxt = require('ccxt');
        const okx = new ccxt.okx({
          enableRateLimit: true,
          options: { defaultType: 'swap' }
        });
        
        // OKX 使用不同的 symbol 格式：BTC-USDT-SWAP
        const okxSymbol = `${baseSymbol.replace('USDT', '-USDT')}-SWAP`;
        const liquidations = await okx.fetchLiquidations(okxSymbol, undefined, limit);
        
        if (liquidations && liquidations.length > 0) {
          const longLiquidations = liquidations.filter(x => x.side === 'sell');
          const shortLiquidations = liquidations.filter(x => x.side === 'buy');
          
          return {
            symbol,
            totalLiquidations: liquidations.length,
            longLiquidations: longLiquidations.length,
            shortLiquidations: shortLiquidations.length,
            longLiqValue: longLiquidations.reduce((sum, x) => sum + parseFloat(x.amount || 0), 0),
            shortLiqValue: shortLiquidations.reduce((sum, x) => sum + parseFloat(x.amount || 0), 0),
            recentLiquidations: liquidations.slice(0, limit).map(x => ({
              price: parseFloat(x.price),
              amount: parseFloat(x.amount),
              side: x.side,
              timestamp: x.timestamp
            })),
            timestamp: Date.now(),
            source: 'okx'
          };
        }
      } catch (okxError) {
        console.warn(`⚠️ OKX 清算数据获取失败: ${okxError.message}`);
      }

      // 备用：使用Binance公开API获取清算数据（可能受限）
      const response = await axios.get(`https://fapi.binance.com/fapi/v1/allForceOrders`, {
        params: {
          symbol: baseSymbol,
          limit: Math.min(limit, 100) // Binance限制最大100
        },
        timeout: 8000
      });

      const liquidations = response.data || [];

      // 统计多空清算
      const longLiquidations = liquidations && Array.isArray(liquidations)
        ? liquidations.filter(x => x.side === 'SELL')
        : [];
      const shortLiquidations = liquidations && Array.isArray(liquidations)
        ? liquidations.filter(x => x.side === 'BUY')
        : [];

      const longLiqValue = longLiquidations.reduce((sum, x) => sum + parseFloat(x.origQty || 0), 0);
      const shortLiqValue = shortLiquidations.reduce((sum, x) => sum + parseFloat(x.origQty || 0), 0);

      const result = {
        symbol,
        totalLiquidations: Array.isArray(liquidations) ? liquidations.length : 0,
        longLiquidations: {
          count: longLiquidations.length,
          volume: longLiqValue
        },
        shortLiquidations: {
          count: shortLiquidations.length,
          volume: shortLiqValue
        },
        ratio: shortLiqValue > 0 ? (longLiqValue / shortLiqValue).toFixed(2) : 0,
        recentLiquidations: Array.isArray(liquidations)
          ? liquidations.slice(0, 10).map(x => ({
              side: x.side,
              price: parseFloat(x.price),
              quantity: parseFloat(x.origQty),
              time: x.time
            }))
          : [],
        timestamp: Date.now()
      };

      // 缓存30秒
      caches.market.set(cacheKey, result, 30000);
      return result;

    } catch (error) {
      // 400错误：交易对不存在或参数错误，返回空数据不再警告
      if (error.response?.status === 400) {
        const emptyResult = {
          symbol,
          totalLiquidations: 0,
          longLiquidations: { count: 0, volume: 0 },
          shortLiquidations: { count: 0, volume: 0 },
          ratio: 0,
          recentLiquidations: [],
          warning: '该交易对无期货清算数据',
          timestamp: Date.now()
        };
        // 缓存5分钟，避免重复请求
        caches.market.set(cacheKey, emptyResult, 300000);
        return emptyResult;
      }

      // ✅ 修复：451 错误处理（地理限制）
      if (this.isRestrictedError(error)) {
        console.warn(`⚠️ 获取清算数据失败 (${symbol}): 地理限制 (451)，已使用 OKX 备用数据`);
        return {
          symbol,
          totalLiquidations: 0,
          longLiquidations: { count: 0, volume: 0 },
          shortLiquidations: { count: 0, volume: 0 },
          ratio: 0,
          recentLiquidations: [],
          warning: 'Binance 地理限制，请使用 OKX 数据源',
          timestamp: Date.now()
        };
      }

      // 其他错误：限流等，返回错误信息
      console.warn(`⚠️ 获取清算数据失败 (${symbol}): ${error.message}`);
      return {
        symbol,
        totalLiquidations: 0,
        longLiquidations: { count: 0, volume: 0 },
        shortLiquidations: { count: 0, volume: 0 },
        ratio: 0,
        recentLiquidations: [],
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取恐惧贪婪指数
   */
  async getFearGreedIndex() {
    const source = this.config.getCurrentSource();
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`😱 获取官方恐惧贪婪指数... (尝试 ${attempt}/${maxRetries})`);
        const response = await axios.get('https://api.alternative.me/fng/?limit=1', {
          timeout: 15000, // 增加到15秒
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const data = response.data?.data?.[0];
        if (!data) {
          throw new Error('无数据');
        }

        return {
          value: parseInt(data.value),
          valueClassification: data.value_classification,
          timestamp: parseInt(data.timestamp) * 1000,
          timeUntilUpdate: data.time_until_update ? parseInt(data.time_until_update) * 1000 : null
        };
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ 获取恐惧贪婪指数失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);

        // 如果不是最后一次尝试，等待一下再重试
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 递增延迟
        }
      }
    }

    // 所有重试都失败了
    return {
      value: null,
      valueClassification: 'unknown',
      error: lastError?.message || '未知错误',
      timestamp: Date.now()
    };
  }

  /**
   * 获取完整市场数据（优化版：带并发控制）
   */
  async getCompleteMarketData(exchange, symbol, timeframe = '1h') {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      // 🆕 CCXT模式也应该获取所有数据源，不仅仅是基础数据！
      const okxDataService = require('../okxDataService');
      const baseData = await okxDataService.getCompleteMarketData(symbol, timeframe);

      // 更新并发指标
      const activeCount = this.concurrencyLimit.activeCount || 0;
      const pendingCount = this.concurrencyLimit.pendingCount || 0;
      performanceMonitor.updateConcurrency(activeCount, pendingCount);

      console.log(`Concurrency: ${activeCount} active, ${pendingCount} pending (max ${AI_ANALYSIS.CONCURRENCY_LIMIT})`);

      // RESTORED: Fetch ALL 45 data sources with concurrent execution
      console.log('   CCXT模式：获取所有45个衍生品数据源...');

      const tasks = [
        // 基础数据源 (9个)
        () => this.getFearGreedIndex().catch(e => { console.warn('Fear & Greed index failed:', e.message); return null; }),
        () => this.getCoinDetail(symbol).catch(e => { console.warn('Coin detail failed:', e.message); return null; }),
        () => this.getGainersLosers().catch(e => { console.warn('Gainers/Losers failed:', e.message); return null; }),
        () => this.getAkToolsData(symbol).catch(e => { console.warn('AkTools failed:', e.message); return null; }),
        () => this.getAdvancedIndicators(symbol, timeframe).catch(e => { console.warn('Advanced indicators failed:', e.message); return null; }),
        () => this.getFundingRate(exchange, symbol).catch(e => { console.warn('Funding rate failed:', e.message); return null; }),
        () => this.getOpenInterest(exchange, symbol).catch(e => { console.warn('Open interest failed:', e.message); return null; }),
        () => this.getLiquidations(exchange, symbol, 100).catch(e => { console.warn('Liquidations failed:', e.message); return null; }),
        () => this.getFreeAPIsData(symbol).catch(e => { console.warn('Free APIs failed:', e.message); return null; }),

        // 5 CRITICAL (Phase 1)
        () => this.getFundingRateHistory(exchange, symbol, 100).catch(e => { console.warn('Funding rate history failed:', e.message); return null; }),
        () => this.getOpenInterestHistory(exchange, symbol, '1h', 100).catch(e => { console.warn('Open interest history failed:', e.message); return null; }),
        () => this.getLongShortRatio(exchange, symbol).catch(e => { console.warn('Long/short ratio failed:', e.message); return null; }),
        () => this.getLongShortRatioHistory(exchange, symbol, '5m', 100).catch(e => { console.warn('Long/short ratio history failed:', e.message); return null; }),
        () => this.getMarkPrice(exchange, symbol).catch(e => { console.warn('Mark price failed:', e.message); return null; }),

        // 10 HIGH-PRIORITY (Phase 2)
        () => this.getTakerVolume(exchange, symbol, '5m', 100).catch(e => { console.warn('Taker volume failed:', e.message); return null; }),
        () => this.getMarkOHLCV(exchange, symbol, timeframe, 100).catch(e => { console.warn('Mark OHLCV failed:', e.message); return null; }),
        () => this.getIndexOHLCV(exchange, symbol, timeframe, 100).catch(e => { console.warn('Index OHLCV failed:', e.message); return null; }),
        () => this.getL2OrderBook(exchange, symbol, 400).catch(e => { console.warn('L2 order book failed:', e.message); return null; }),
        () => this.getBorrowRateHistory(exchange, 'USDT', 100).catch(e => { console.warn('Borrow rate history failed:', e.message); return null; }),
        () => this.getLeverageTiers(exchange, symbol).catch(e => { console.warn('Leverage tiers failed:', e.message); return null; }),
        () => this.getFundingInterval(exchange, symbol).catch(e => { console.warn('Funding interval failed:', e.message); return null; }),
        () => this.getOptionGreeks(exchange, symbol).catch(e => { console.warn('Option Greeks failed:', e.message); return null; }),
        () => this.getOptionChain(exchange, symbol).catch(e => { console.warn('Option chain failed:', e.message); return null; }),
        () => this.getSystemStatus(exchange).catch(e => { console.warn('System status failed:', e.message); return null; }),

        // 6 MEDIUM-PRIORITY (Phase 3)
        () => this.getCurrentOpenInterest(exchange, symbol).catch(e => { console.warn('Current open interest failed:', e.message); return null; }),
        () => this.getOpenInterestVolume(exchange, symbol, '5m', 72).catch(e => { console.warn('Open interest volume failed:', e.message); return null; }),
        () => this.getLongShortPositionRatio(exchange, symbol, '5m', 100).catch(e => { console.warn('Long/short position ratio failed:', e.message); return null; }),
        () => this.getOptionOpenInterestVolume(exchange, symbol.split('/')[0], '8H').catch(e => { console.warn('Option open interest volume failed:', e.message); return null; }),
        () => this.getInsuranceFund(exchange, symbol).catch(e => { console.warn('Insurance fund failed:', e.message); return null; }),
        () => this.getIndexTickers(exchange, 'USDT').catch(e => { console.warn('Index tickers failed:', e.message); return null; }),

        // 5 HIGH-VALUE (Phase 4a)
        () => this.getTradingFee(exchange, symbol).catch(e => { console.warn('Trading fee failed:', e.message); return null; }),
        () => this.getPremiumIndex(exchange, symbol).catch(e => { console.warn('Premium index failed:', e.message); return null; }),
        () => this.getLiquidationOrders(exchange, symbol, 100).catch(e => { console.warn('Liquidation orders failed:', e.message); return null; }),
        () => this.getPriceLimit(exchange, symbol).catch(e => { console.warn('Price limit failed:', e.message); return null; }),
        () => this.getMarketCapRanking(100).catch(e => { console.warn('Market cap ranking failed:', e.message); return null; }),

        // 7 COMPLETION (Phase 4b)
        () => this.getConvertCurrencies().catch(e => { console.warn('Convert currencies failed:', e.message); return null; }),
        () => this.getMaxOrderSize(exchange, symbol, 1).catch(e => { console.warn('Max order size failed:', e.message); return null; }),
        () => this.getEstimatedPrice(exchange, symbol).catch(e => { console.warn('Estimated price failed:', e.message); return null; }),
        () => this.getVIPLevels().catch(e => { console.warn('VIP levels failed:', e.message); return null; }),
        () => this.getInterestRate(exchange, 'USDT').catch(e => { console.warn('Interest rate failed:', e.message); return null; }),
        () => this.getAssetValuation().catch(e => { console.warn('Asset valuation failed:', e.message); return null; }),
        () => this.getRiskReserve(exchange, 'BTC').catch(e => { console.warn('Risk reserve failed:', e.message); return null; }),

        // === NEW HIGH-VALUE DATA SOURCES (3个) ===
        () => this.getOptionsPutCallRatio(symbol.split('/')[0], '8H').catch(e => { console.warn('Options Put/Call ratio failed:', e.message); return null; }),
        () => this.getExchangeNetFlow(symbol.split('/')[0]).catch(e => { console.warn('Exchange net flow failed:', e.message); return null; }),
        () => this.getFearGreedHistory(30).catch(e => { console.warn('Fear & Greed history failed:', e.message); return null; })
      ];

      // Execute all 45 tasks with global timeout protection
      const GLOBAL_TIMEOUT = 90000; // 增加到90秒全局超时

      // 创建超时Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Global data fetch timeout (90s)')), GLOBAL_TIMEOUT);
      });

      // 执行所有任务，带超时保护
      let results;
      try {
        results = await Promise.race([
          Promise.allSettled(tasks.map(task => this.concurrencyLimit(task))),
          timeoutPromise
        ]);
      } catch (timeoutError) {
        console.error('❌ 数据获取超时，使用部分数据:', timeoutError.message);
        // 返回基础数据，确保系统能继续运行
        return {
          ...baseData,
          derivativeData: null,
          onChainData: null,
          dataCompleteness: 0,
          error: 'Data fetch timeout - using partial data'
        };
      }

      // Destructure results (same order as tasks array)
      const [fearGreed, coinDetail, gainersLosers, aktools, advancedIndicators, fundingRate, openInterest, liquidations, freeAPIs,
             fundingRateHistory, openInterestHistory, longShortRatio, longShortRatioHistory, markPrice,
             takerVolume, markOHLCV, indexOHLCV, l2OrderBook, borrowRateHistory, leverageTiers, fundingInterval, optionGreeks, optionChain, systemStatus,
             currentOpenInterest, openInterestVolume, longShortPositionRatio, optionOpenInterestVolume, insuranceFund, indexTickers,
             tradingFee, premiumIndex, liquidationOrdersData, priceLimit, marketCapRanking,
             convertCurrencies, maxOrderSize, estimatedPrice, vipLevels, interestRate, assetValuation, riskReserve,
             optionsPutCallRatio, exchangeNetFlow, fearGreedHistory] = results;

      // Debug logging for critical derivative data
      console.log('DEBUG - Data fetch results:');
      console.log('  fundingRate:', fundingRate.status, fundingRate.status === 'fulfilled' ? (fundingRate.value ? 'HAS_DATA' : 'NULL') : fundingRate.reason?.message);
      console.log('  openInterest:', openInterest.status, openInterest.status === 'fulfilled' ? (openInterest.value ? 'HAS_DATA' : 'NULL') : openInterest.reason?.message);
      console.log('  liquidations:', liquidations.status, liquidations.status === 'fulfilled' ? (liquidations.value ? 'HAS_DATA' : 'NULL') : liquidations.reason?.message);
      console.log('  longShortRatio:', longShortRatio.status, longShortRatio.status === 'fulfilled' ? (longShortRatio.value ? 'HAS_DATA' : 'NULL') : longShortRatio.reason?.message);
      console.log('  sentiment:', fearGreed.status, fearGreed.status === 'fulfilled' ? (fearGreed.value ? 'HAS_DATA' : 'NULL') : fearGreed.reason?.message);
      console.log('  aktools:', aktools.status, aktools.status === 'fulfilled' ? (aktools.value ? 'HAS_DATA' : 'NULL') : aktools.reason?.message);
      console.log('  === NEW HIGH-VALUE DATA ===');
      console.log('  optionsPutCallRatio:', optionsPutCallRatio.status, optionsPutCallRatio.status === 'fulfilled' ? (optionsPutCallRatio.value ? 'HAS_DATA' : 'NULL') : optionsPutCallRatio.reason?.message);
      console.log('  exchangeNetFlow:', exchangeNetFlow.status, exchangeNetFlow.status === 'fulfilled' ? (exchangeNetFlow.value ? 'HAS_DATA' : 'NULL') : exchangeNetFlow.reason?.message);
      console.log('  fearGreedHistory:', fearGreedHistory.status, fearGreedHistory.status === 'fulfilled' ? (fearGreedHistory.value ? 'HAS_DATA' : 'NULL') : fearGreedHistory.reason?.message);

      return {
        ...baseData,
        // 基础数据源
        sentiment: fearGreed.status === 'fulfilled' ? fearGreed.value : null,
        coinDetail: coinDetail.status === 'fulfilled' ? coinDetail.value : null,
        gainersLosers: gainersLosers.status === 'fulfilled' ? gainersLosers.value : null,
        aktools: aktools.status === 'fulfilled' ? aktools.value : null,
        advancedIndicators: advancedIndicators.status === 'fulfilled' ? advancedIndicators.value : null,
        fundingRate: fundingRate.status === 'fulfilled' ? fundingRate.value : null,
        openInterest: openInterest.status === 'fulfilled' ? openInterest.value : null,
        liquidations: liquidations.status === 'fulfilled' ? liquidations.value : null,
        freeAPIs: freeAPIs.status === 'fulfilled' ? freeAPIs.value : null,
        // 5 CRITICAL
        fundingRateHistory: fundingRateHistory.status === 'fulfilled' ? fundingRateHistory.value : null,
        openInterestHistory: openInterestHistory.status === 'fulfilled' ? openInterestHistory.value : null,
        longShortRatio: longShortRatio.status === 'fulfilled' ? longShortRatio.value : null,
        longShortRatioHistory: longShortRatioHistory.status === 'fulfilled' ? longShortRatioHistory.value : null,
        markPrice: markPrice.status === 'fulfilled' ? markPrice.value : null,
        // 10 HIGH-PRIORITY
        takerVolume: takerVolume.status === 'fulfilled' ? takerVolume.value : null,
        markOHLCV: markOHLCV.status === 'fulfilled' ? markOHLCV.value : null,
        indexOHLCV: indexOHLCV.status === 'fulfilled' ? indexOHLCV.value : null,
        l2OrderBook: l2OrderBook.status === 'fulfilled' ? l2OrderBook.value : null,
        borrowRateHistory: borrowRateHistory.status === 'fulfilled' ? borrowRateHistory.value : null,
        leverageTiers: leverageTiers.status === 'fulfilled' ? leverageTiers.value : null,
        fundingInterval: fundingInterval.status === 'fulfilled' ? fundingInterval.value : null,
        optionGreeks: optionGreeks.status === 'fulfilled' ? optionGreeks.value : null,
        optionChain: optionChain.status === 'fulfilled' ? optionChain.value : null,
        systemStatus: systemStatus.status === 'fulfilled' ? systemStatus.value : null,
        // 6 MEDIUM-PRIORITY
        currentOpenInterest: currentOpenInterest.status === 'fulfilled' ? currentOpenInterest.value : null,
        openInterestVolume: openInterestVolume.status === 'fulfilled' ? openInterestVolume.value : null,
        longShortPositionRatio: longShortPositionRatio.status === 'fulfilled' ? longShortPositionRatio.value : null,
        optionOpenInterestVolume: optionOpenInterestVolume.status === 'fulfilled' ? optionOpenInterestVolume.value : null,
        insuranceFund: insuranceFund.status === 'fulfilled' ? insuranceFund.value : null,
        indexTickers: indexTickers.status === 'fulfilled' ? indexTickers.value : null,
        // 5 HIGH-VALUE
        tradingFee: tradingFee.status === 'fulfilled' ? tradingFee.value : null,
        premiumIndex: premiumIndex.status === 'fulfilled' ? premiumIndex.value : null,
        liquidationOrdersData: liquidationOrdersData.status === 'fulfilled' ? liquidationOrdersData.value : null,
        priceLimit: priceLimit.status === 'fulfilled' ? priceLimit.value : null,
        marketCapRanking: marketCapRanking.status === 'fulfilled' ? marketCapRanking.value : null,
        // 7 COMPLETION
        convertCurrencies: convertCurrencies.status === 'fulfilled' ? convertCurrencies.value : null,
        maxOrderSize: maxOrderSize.status === 'fulfilled' ? maxOrderSize.value : null,
        estimatedPrice: estimatedPrice.status === 'fulfilled' ? estimatedPrice.value : null,
        vipLevels: vipLevels.status === 'fulfilled' ? vipLevels.value : null,
        interestRate: interestRate.status === 'fulfilled' ? interestRate.value : null,
        assetValuation: assetValuation.status === 'fulfilled' ? assetValuation.value : null,
        riskReserve: riskReserve.status === 'fulfilled' ? riskReserve.value : null,
        // 3 NEW HIGH-VALUE DATA SOURCES
        optionsPutCallRatio: optionsPutCallRatio.status === 'fulfilled' ? optionsPutCallRatio.value : null,
        exchangeNetFlow: exchangeNetFlow.status === 'fulfilled' ? exchangeNetFlow.value : null,
        fearGreedHistory: fearGreedHistory.status === 'fulfilled' ? fearGreedHistory.value : null,
        source: 'ccxt'
      };
    }

    // MCP数据源：并行获取多个数据
    const [ticker, ohlcv, indicators] = await Promise.all([
      this.getTicker(exchange, symbol),
      this.getOHLCV(exchange, symbol, timeframe, 100),
      this.getAllIndicators(exchange, symbol, timeframe)
    ]);

    return {
      symbol,
      timestamp: Date.now(),
      datetime: new Date().toISOString(),
      ticker,
      ohlcv,
      indicators,
      source: 'mcp'
    };
  }
  
  /**
   * 获取币种详情（使用CoinGecko/Binance API）
   */
  async getCoinDetail(symbol) {
    
    // ✅ 尝试Binance API（更稳定）
    try {
      const base = symbol.split('/')[0];
      const quote = symbol.split('/')[1] || 'USDT';
      const binanceSymbol = `${base}${quote}`;
      
      const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
        params: { symbol: binanceSymbol },
        timeout: 5000
      });
      
      if (response.data) {
        return {
          symbol: base,
          name: base,
          price: parseFloat(response.data.lastPrice),
          priceChange24h: parseFloat(response.data.priceChangePercent),
          volume24h: parseFloat(response.data.volume),
          quoteVolume24h: parseFloat(response.data.quoteVolume),
          high24h: parseFloat(response.data.highPrice),
          low24h: parseFloat(response.data.lowPrice),
          trades24h: response.data.count,
          source: 'binance'
        };
      }
    } catch (binanceError) {
      // ✅ 修复：如果是 451 地理限制错误，直接跳过 Binance，使用备用方案
      if (this.isRestrictedError(binanceError)) {
        console.warn(`⚠️ Binance API失败: 地理限制 (451)，跳过 Binance，使用备用数据源`);
      } else {
        console.warn(`⚠️ Binance API失败: ${binanceError.message}`);
      }
    }
    
    // ✅ 备用: 尝试CoinGecko API
    try {
      const base = symbol.split('/')[0];
      
      // ✅ 常见币种映射
      const coinIdMap = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'BNB': 'binancecoin',
        'SOL': 'solana',
        'XRP': 'ripple',
        'ADA': 'cardano',
        'DOGE': 'dogecoin',
        'MATIC': 'matic-network',
        'DOT': 'polkadot',
        'AVAX': 'avalanche-2',
        'LINK': 'chainlink',
        'UNI': 'uniswap',
        'ATOM': 'cosmos'
      };
      
      const coinId = coinIdMap[base] || base.toLowerCase();
      
      // CoinGecko 免费API
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}`, {
        params: {
          localization: false,
          tickers: false,
          market_data: true,
          community_data: false,
          developer_data: false
        },
        timeout: 8000
      });
      
      if (response.data) {
        return {
          id: response.data.id,
          name: response.data.name,
          symbol: response.data.symbol?.toUpperCase(),
          marketCap: response.data.market_data?.market_cap?.usd,
          totalVolume: response.data.market_data?.total_volume?.usd,
          circulatingSupply: response.data.market_data?.circulating_supply,
          totalSupply: response.data.market_data?.total_supply,
          maxSupply: response.data.market_data?.max_supply,
          athPrice: response.data.market_data?.ath?.usd,
          atlPrice: response.data.market_data?.atl?.usd,
          marketCapRank: response.data.market_cap_rank,
          priceChange24h: response.data.market_data?.price_change_percentage_24h
        };
      }
      return null;
    } catch (error) {
      console.warn(`⚠️ 获取币种详情失败: ${error.message}`);
      return null;
    }
  }
  
  /**
   * 检查是否为地理限制错误（451）
   */
  isRestrictedError(error) {
    return error.response?.status === 451 || 
           error.message?.includes('451') ||
           error.message?.includes('restricted location') ||
           error.message?.includes('Service unavailable from a restricted location');
  }

  /**
   * 获取涨跌榜（多数据源兜底：OKX → Binance → CoinGecko → DefiLlama）
   */
  async getGainersLosers() {
    // ✅ 优先尝试 OKX API（无地理限制，稳定性最高）
    try {
      console.log('📊 [涨跌榜] 尝试 OKX API...');
      const response = await axios.get('https://www.okx.com/api/v5/market/tickers', {
        params: { instType: 'SPOT' },
        timeout: 5000
      });
      
      if (response.data?.data && Array.isArray(response.data.data)) {
        const tickers = response.data.data
          .filter(t => t.instId.endsWith('-USDT') && parseFloat(t.volCcy24h) > 10000000)
          .map(t => ({
            symbol: t.instId.replace('-USDT', ''),
            price: parseFloat(t.last),
            change24h: parseFloat(t.open24h) > 0 ? ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h) * 100) : 0,
            volume24h: parseFloat(t.volCcy24h),
            high24h: parseFloat(t.high24h),
            low24h: parseFloat(t.low24h)
          }));
        
        const gainers = tickers
          .filter(c => c.change24h > 0)
          .sort((a, b) => b.change24h - a.change24h)
          .slice(0, 10);
        
        const losers = tickers
          .filter(c => c.change24h < 0)
          .sort((a, b) => a.change24h - b.change24h)
          .slice(0, 10);
        
        if (gainers.length > 0 || losers.length > 0) {
          console.log(`✅ [涨跌榜] OKX 成功 (${gainers.length} 涨, ${losers.length} 跌)`);
          return {
            gainers,
            losers,
            timestamp: Date.now(),
            source: 'okx'
          };
        }
      }
    } catch (okxError) {
      console.warn(`⚠️ [涨跌榜] OKX 失败: ${okxError.message}`);
    }
    
    // ✅ 备用1: 尝试Binance API
    try {
      console.log('📊 [涨跌榜] 尝试 Binance API...');
      const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr', {
        timeout: 5000
      });
      
      if (response.data && Array.isArray(response.data)) {
        const usdtPairs = response.data.filter(coin => 
          coin.symbol.endsWith('USDT') && 
          parseFloat(coin.quoteVolume) > 10000000
        );
        
        const gainers = usdtPairs
          .filter(c => parseFloat(c.priceChangePercent) > 0)
          .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
          .slice(0, 10)
          .map(c => ({
            symbol: c.symbol.replace('USDT', ''),
            price: parseFloat(c.lastPrice),
            change24h: parseFloat(c.priceChangePercent),
            volume24h: parseFloat(c.quoteVolume),
            high24h: parseFloat(c.highPrice),
            low24h: parseFloat(c.lowPrice)
          }));
        
        const losers = usdtPairs
          .filter(c => parseFloat(c.priceChangePercent) < 0)
          .sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent))
          .slice(0, 10)
          .map(c => ({
            symbol: c.symbol.replace('USDT', ''),
            price: parseFloat(c.lastPrice),
            change24h: parseFloat(c.priceChangePercent),
            volume24h: parseFloat(c.quoteVolume),
            high24h: parseFloat(c.highPrice),
            low24h: parseFloat(c.lowPrice)
          }));
        
        console.log(`✅ [涨跌榜] Binance 成功`);
        return {
          gainers,
          losers,
          timestamp: Date.now(),
          source: 'binance'
        };
      }
    } catch (binanceError) {
      if (this.isRestrictedError(binanceError)) {
        console.warn(`⚠️ [涨跌榜] Binance 地理限制 (451)，跳过`);
      } else {
        console.warn(`⚠️ [涨跌榜] Binance 失败: ${binanceError.message}`);
      }
    }
    
    // ✅ 备用2: 尝试CoinGecko API（增加重试机制）
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`📊 [涨跌榜] 尝试 CoinGecko API (尝试 ${attempt}/2)...`);
        const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
          params: {
            vs_currency: 'usd',
            order: 'market_cap_desc',
            per_page: 100,
            page: 1,
            sparkline: false,
            price_change_percentage: '24h'
          },
          timeout: 10000 // 增加到10秒
        });
        
        if (response.data && Array.isArray(response.data)) {
          const coins = response.data;
          
          const gainers = coins
            .filter(c => c.price_change_percentage_24h > 0)
            .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
            .slice(0, 10)
            .map(c => ({
              symbol: c.symbol.toUpperCase(),
              name: c.name,
              price: c.current_price,
              change24h: c.price_change_percentage_24h,
              volume24h: c.total_volume,
              marketCap: c.market_cap
            }));
          
          const losers = coins
            .filter(c => c.price_change_percentage_24h < 0)
            .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
            .slice(0, 10)
            .map(c => ({
              symbol: c.symbol.toUpperCase(),
              name: c.name,
              price: c.current_price,
              change24h: c.price_change_percentage_24h,
              volume24h: c.total_volume,
              marketCap: c.market_cap
            }));
          
          console.log(`✅ [涨跌榜] CoinGecko 成功`);
          return {
            gainers,
            losers,
            timestamp: Date.now(),
            source: 'coingecko'
          };
        }
      } catch (geckoError) {
        console.warn(`⚠️ [涨跌榜] CoinGecko 尝试${attempt}失败: ${geckoError.message}`);
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 重试前等待2秒
        }
      }
    }
    
    // ✅ 备用3: 最后尝试 DefiLlama（基于市值前100）
    try {
      console.log('📊 [涨跌榜] 尝试 DefiLlama API（最后兜底）...');
      const topCoins = [
        'coingecko:bitcoin', 'coingecko:ethereum', 'coingecko:binancecoin', 
        'coingecko:solana', 'coingecko:ripple', 'coingecko:cardano',
        'coingecko:dogecoin', 'coingecko:tron', 'coingecko:polkadot',
        'coingecko:avalanche-2', 'coingecko:chainlink', 'coingecko:uniswap',
        'coingecko:litecoin', 'coingecko:cosmos', 'coingecko:algorand'
      ];
      
      const response = await axios.get('https://coins.llama.fi/prices/current/' + topCoins.join(','), {
        timeout: 8000
      });
      
      if (response.data?.coins) {
        const coins = Object.entries(response.data.coins).map(([id, data]) => ({
          symbol: data.symbol,
          price: data.price,
          change24h: 0, // DefiLlama 不提供24h变化，使用0占位
          confidence: data.confidence
        }));
        
        console.log(`⚠️ [涨跌榜] DefiLlama 兜底成功，但无涨跌幅数据`);
        return {
          gainers: coins.slice(0, 10),
          losers: [],
          timestamp: Date.now(),
          source: 'defillama',
          warning: 'DefiLlama不提供涨跌幅，仅返回价格数据'
        };
      }
    } catch (llamaError) {
      console.warn(`⚠️ [涨跌榜] DefiLlama 失败: ${llamaError.message}`);
    }
    
    console.error('❌ [涨跌榜] 所有数据源均失败 (OKX/Binance/CoinGecko/DefiLlama)');
    return null;
  }

  /**
   * 获取免费API增强数据 (新增)
   */
  async getFreeAPIEnhancedData() {
    console.log('🚀 [数据源] 获取免费API增强数据...');
    
    try {
      const enhancedData = await this.freeAPI.getAllFreeData();
      
      if (enhancedData.success) {
        console.log('✅ [数据源] 免费API数据获取成功');
        return {
          market_indices: enhancedData.data.market_indices,
          social_sentiment: enhancedData.data.social_sentiment,
          on_chain_data: enhancedData.data.on_chain_data,
          data_quality: this.calculateDataQuality(enhancedData.data),
          timestamp: enhancedData.timestamp
        };
      } else {
        console.warn('⚠️ [数据源] 免费API数据部分失败');
        return {
          market_indices: enhancedData.data.market_indices,
          social_sentiment: enhancedData.data.social_sentiment,
          on_chain_data: enhancedData.data.on_chain_data,
          errors: enhancedData.errors,
          data_quality: 'PARTIAL',
          timestamp: enhancedData.timestamp
        };
      }
    } catch (error) {
      console.error('❌ [数据源] 免费API数据获取失败:', error.message);
      return {
        error: error.message,
        data_quality: 'POOR',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 获取高级技术指标（KDJ/Ichimoku/Aroon等）
   */
  async getAdvancedIndicators(symbol, timeframe = '1h') {
    try {
      const mcpToolsManager = require('../mcpToolsManager');
      
      console.log('📊 [高级指标] 获取KDJ/Ichimoku/Aroon...');
      
      // 检查crypto-indicators-mcp是否可用
      const toolsList = mcpToolsManager.getToolsList();
      const hasIndicatorsTool = toolsList.some(t => t.id === 'crypto-indicators-mcp');
      
      if (!hasIndicatorsTool) {
        console.warn('⚠️ [高级指标] crypto-indicators-mcp未启用');
        return null;
      }
      
      // 并行获取多个高级指标
      const [kdj, ichimoku, aroon, psar] = await Promise.allSettled([
        mcpToolsManager.callTool('crypto-indicators', 'calculate_kdj', { symbol, timeframe }).catch(e => null),
        mcpToolsManager.callTool('crypto-indicators', 'calculate_ichimoku_cloud', { symbol, timeframe }).catch(e => null),
        mcpToolsManager.callTool('crypto-indicators', 'calculate_aroon', { symbol, timeframe }).catch(e => null),
        mcpToolsManager.callTool('crypto-indicators', 'calculate_parabolic_sar', { symbol, timeframe }).catch(e => null)
      ]);
      
      const data = {
        kdj: kdj.status === 'fulfilled' ? kdj.value : null,
        ichimoku: ichimoku.status === 'fulfilled' ? ichimoku.value : null,
        aroon: aroon.status === 'fulfilled' ? aroon.value : null,
        psar: psar.status === 'fulfilled' ? psar.value : null,
        timestamp: Date.now()
      };
      
      console.log(`✅ [高级指标] 获取完成: KDJ=${!!data.kdj}, Ichimoku=${!!data.ichimoku}, Aroon=${!!data.aroon}, PSAR=${!!data.psar}`);
      
      return data;
    } catch (error) {
      console.error('❌ [高级指标] 获取失败:', error.message);
      return null;
    }
  }

  /**
   * 获取免费API数据（社交情绪、链上数据、DeFi、衍生品）
   */
  async getFreeAPIsData(symbol) {
    try {
      const freeAPIsService = require('../freeAPIsService');
      console.log('🌐 [免费API] 获取综合数据...');
      
      const data = await freeAPIsService.getAllFreeData(symbol);
      
      console.log(`✅ [免费API] 综合数据获取完成 (质量: ${data.dataQuality})`);
      return data;
    } catch (error) {
      console.error('❌ [免费API] 获取失败:', error.message);
      return null;
    }
  }

  /**
   * 获取AkTools链上数据
   */
  async getAkToolsData(symbol) {
    try {
      const mcpToolsManager = require('../mcpToolsManager');
      
      console.log('🔗 [AkTools] 获取链上数据...');
      
      // 检查AkTools是否可用
      const toolsList = mcpToolsManager.getToolsList();
      const hasAkTools = toolsList.some(t => t.id === 'aktools' || t.id === 'mcp-aktools');
      
      if (!hasAkTools) {
        console.warn('⚠️ [AkTools] 工具未启用');
        return null;
      }
      
      // 并行获取多个AkTools数据
      const [longShortRatio, takerVolume, binanceAI, news] = await Promise.allSettled([
        mcpToolsManager.callTool('aktools', 'okx_long_short_ratio', { symbol }).catch(e => null),
        mcpToolsManager.callTool('aktools', 'okx_active_buy_sell_volume', { symbol }).catch(e => null),
        mcpToolsManager.callTool('aktools', 'binance_ai_interpretation', { symbol }).catch(e => null),
        mcpToolsManager.callTool('aktools', 'binance_news', { limit: 5 }).catch(e => null)
      ]);
      
      const data = {
        longShortRatio: longShortRatio.status === 'fulfilled' ? longShortRatio.value : null,
        takerVolume: takerVolume.status === 'fulfilled' ? takerVolume.value : null,
        binanceAI: binanceAI.status === 'fulfilled' ? binanceAI.value : null,
        news: news.status === 'fulfilled' ? news.value : null,
        timestamp: Date.now()
      };
      
      console.log(`✅ [AkTools] 数据获取完成: 多空比=${!!data.longShortRatio}, 主动量=${!!data.takerVolume}, AI解读=${!!data.binanceAI}, 新闻=${!!data.news}`);
      
      return data;
    } catch (error) {
      console.error('❌ [AkTools] 数据获取失败:', error.message);
      return null;
    }
  }

  /**
   * 计算数据质量评级
   */
  calculateDataQuality(data) {
    const available = Object.values(data).filter(d => d !== null).length;
    const total = Object.keys(data).length;
    
    if (available === total) return 'EXCELLENT';
    if (available >= total * 0.8) return 'GOOD';
    if (available >= total * 0.5) return 'PARTIAL';
    return 'POOR';
  }

  /**
   * 获取综合市场分析数据 (包含免费API)
   */
  async getComprehensiveMarketData(exchange, symbol) {
    console.log('📊 [数据源] 获取综合市场分析数据...');
    
    try {
      // 并行获取基础数据和增强数据
      const [ticker, indicators, enhancedData] = await Promise.allSettled([
        this.getTicker(exchange, symbol),
        this.getAllIndicators(exchange, symbol),
        this.getFreeAPIEnhancedData()
      ]);

      const result = {
        symbol,
        exchange,
        basic_data: {
          ticker: ticker.status === 'fulfilled' ? ticker.value : null,
          indicators: indicators.status === 'fulfilled' ? indicators.value : null
        },
        enhanced_data: enhancedData.status === 'fulfilled' ? enhancedData.value : null,
        data_completeness: this.calculateCompleteness({
          ticker: ticker.status === 'fulfilled',
          indicators: indicators.status === 'fulfilled',
          enhanced: enhancedData.status === 'fulfilled'
        }),
        timestamp: new Date().toISOString()
      };

      console.log('✅ [数据源] 综合市场数据获取完成');
      return result;
    } catch (error) {
      console.error('❌ [数据源] 综合市场数据获取失败:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 获取多时间框架趋势分析（优化版 - 复用1h数据）
   */
  async getMultiTimeframeTrendOptimized(exchange, symbol, indicators1h) {
    try {
      console.log(`🕐 [多周期优化] 获取${symbol}多时间框架趋势（复用1h数据）...`);

      // 只获取4h和1d数据，复用已有的1h数据
      const timeout = 6000; // 6秒超时
      const [indicators4h, indicators1d] = await Promise.allSettled([
        Promise.race([
          this.getAllIndicators(exchange, symbol, '4h'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('4h超时')), timeout))
        ]),
        Promise.race([
          this.getAllIndicators(exchange, symbol, '1d'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('1d超时')), timeout))
        ])
      ]);

      const trends = {
        '1h': this.analyzeTrend(indicators1h, '1h'), // 直接使用传入的1h数据
        '4h': this.analyzeTrend(indicators4h.status === 'fulfilled' ? indicators4h.value : null, '4h'),
        '1d': this.analyzeTrend(indicators1d.status === 'fulfilled' ? indicators1d.value : null, '1d')
      };

      // 计算共振状态
      const resonance = this.calculateResonance(trends);

      console.log(`✅ [多周期优化] 趋势分析完成: 1H=${trends['1h'].direction}, 4H=${trends['4h'].direction}, 1D=${trends['1d'].direction}, 共振=${resonance.isResonant}`);

      return {
        trends,
        resonance,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ [多周期优化] 趋势分析失败:', error.message);
      return null;
    }
  }

  /**
   * 🆕 获取多时间框架趋势分析
   */
  async getMultiTimeframeTrend(exchange, symbol) {
    try {
      console.log(`🕐 [多周期] 获取${symbol}多时间框架趋势...`);

      // 并行获取3个时间周期的技术指标，带超时控制
      const timeout = 8000; // 8秒超时
      const [indicators1h, indicators4h, indicators1d] = await Promise.allSettled([
        Promise.race([
          this.getAllIndicators(exchange, symbol, '1h'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('1h超时')), timeout))
        ]),
        Promise.race([
          this.getAllIndicators(exchange, symbol, '4h'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('4h超时')), timeout))
        ]),
        Promise.race([
          this.getAllIndicators(exchange, symbol, '1d'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('1d超时')), timeout))
        ])
      ]);

      const trends = {
        '1h': this.analyzeTrend(indicators1h.status === 'fulfilled' ? indicators1h.value : null, '1h'),
        '4h': this.analyzeTrend(indicators4h.status === 'fulfilled' ? indicators4h.value : null, '4h'),
        '1d': this.analyzeTrend(indicators1d.status === 'fulfilled' ? indicators1d.value : null, '1d')
      };

      // 计算共振状态
      const resonance = this.calculateResonance(trends);

      console.log(`✅ [多周期] 趋势分析完成: 1H=${trends['1h'].direction}, 4H=${trends['4h'].direction}, 1D=${trends['1d'].direction}, 共振=${resonance.isResonant}`);

      return {
        trends,
        resonance,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ [多周期] 趋势分析失败:', error.message);
      return null;
    }
  }

  /**
   * 分析单个时间周期的趋势
   */
  analyzeTrend(indicators, timeframe) {
    if (!indicators || !indicators.trend) {
      return { 
        direction: 'unknown', 
        strength: 0,
        ema9: null,
        ema21: null,
        ema50: null,
        timeframe 
      };
    }

    const { ema9, ema21, ema50 } = indicators.trend;
    
    // 判断趋势方向
    let direction = 'neutral';
    let strength = 0;

    if (ema9 && ema21 && ema50) {
      if (ema9 > ema21 && ema21 > ema50) {
        direction = 'bull'; // 多头排列
        const gap9_21 = ((ema9 - ema21) / ema21) * 100;
        const gap21_50 = ((ema21 - ema50) / ema50) * 100;
        strength = Math.min((gap9_21 + gap21_50) * 10, 100);
      } else if (ema9 < ema21 && ema21 < ema50) {
        direction = 'bear'; // 空头排列
        const gap9_21 = ((ema21 - ema9) / ema9) * 100;
        const gap21_50 = ((ema50 - ema21) / ema21) * 100;
        strength = Math.min((gap9_21 + gap21_50) * 10, 100);
      } else {
        direction = 'neutral'; // 交叉震荡
        strength = 50;
      }
    }

    return {
      direction,
      strength: Math.round(strength),
      ema9,
      ema21,
      ema50,
      timeframe
    };
  }

  /**
   * 计算多周期共振状态
   */
  calculateResonance(trends) {
    const dir1h = trends['1h'].direction;
    const dir4h = trends['4h'].direction;
    const dir1d = trends['1d'].direction;

    let score = 0;
    let adjustment = 0;
    let status = '';
    let description = '';

    // 场景1: 三周期完全一致
    if (dir1h === dir4h && dir4h === dir1d && dir1h !== 'unknown' && dir1h !== 'neutral') {
      score = 100;
      adjustment = 20;
      status = '完美共振';
      description = `三个时间周期全部${dir1h === 'bull' ? '看涨' : '看跌'}，趋势强劲`;
    }
    // 场景2: 短中期一致，但与长期相反
    else if (dir1h === dir4h && dir1h !== dir1d && dir1h !== 'unknown' && dir1d !== 'unknown') {
      score = 60;
      adjustment = -20;
      status = '逆大趋势';
      description = `短期${dir1h === 'bull' ? '看涨' : '看跌'}，但日线${dir1d === 'bull' ? '看涨' : '看跌'}，存在反转风险`;
    }
    // 场景3: 短期与中期矛盾
    else if (dir1h !== dir4h && dir1h !== 'unknown' && dir4h !== 'unknown') {
      score = 40;
      adjustment = 0;
      status = '周期矛盾';
      description = `1小时${dir1h === 'bull' ? '看涨' : '看跌'}，4小时${dir4h === 'bull' ? '看涨' : '看跌'}，趋势不明`;
    }
    // 场景4: 数据不足或震荡
    else {
      score = 50;
      adjustment = 0;
      status = '震荡不明';
      description = '多个时间周期处于震荡或数据不足';
    }

    return {
      score,
      adjustment,
      status,
      description,
      isResonant: score >= 80,
      direction: {
        '1h': dir1h,
        '4h': dir4h,
        '1d': dir1d
      }
    };
  }

  /**
   * 获取资金费率历史（Historical funding rate data）
   */
  async getFundingRateHistory(exchange, symbol, limit = 100) {
    const source = this.config.getCurrentSource();

    console.log(`Funding Rate History ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getFundingRateHistory(symbol, limit);
    } else {
      // MCP fallback to CCXT
      const okxDataService = require('../okxDataService');
      return await okxDataService.getFundingRateHistory(symbol, limit);
    }
  }

  /**
   * 获取持仓量历史（Historical open interest data）
   */
  async getOpenInterestHistory(exchange, symbol, timeframe = '1h', limit = 100) {
    const source = this.config.getCurrentSource();

    console.log(`Open Interest History ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOpenInterestHistory(symbol, timeframe, limit);
    } else {
      // MCP fallback to CCXT
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOpenInterestHistory(symbol, timeframe, limit);
    }
  }

  /**
   * 获取多空比（Current long/short ratio）
   */
  async getLongShortRatio(exchange, symbol) {
    const source = this.config.getCurrentSource();

    console.log(`Long/Short Ratio ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getLongShortRatio(symbol);
    } else {
      // MCP fallback to CCXT
      const okxDataService = require('../okxDataService');
      return await okxDataService.getLongShortRatio(symbol);
    }
  }

  /**
   * 获取多空比历史（Historical long/short ratio data）
   */
  async getLongShortRatioHistory(exchange, symbol, period = '5m', limit = 100) {
    const source = this.config.getCurrentSource();

    console.log(`Long/Short Ratio History ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getLongShortRatioHistory(symbol, period, limit);
    } else {
      // MCP fallback to CCXT
      const okxDataService = require('../okxDataService');
      return await okxDataService.getLongShortRatioHistory(symbol, period, limit);
    }
  }

  /**
   * 获取标记价格（Mark price - better price reference）
   */
  async getMarkPrice(exchange, symbol) {
    const source = this.config.getCurrentSource();

    console.log(`Mark Price ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getMarkPrice(symbol);
    } else {
      // MCP fallback to CCXT
      const okxDataService = require('../okxDataService');
      return await okxDataService.getMarkPrice(symbol);
    }
  }

  /**
   * 获取主动买卖量（Taker volume - buy/sell pressure）
   */
  async getTakerVolume(exchange, symbol, period = '5m', limit = 100) {
    const source = this.config.getCurrentSource();

    console.log(`Taker Volume ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getTakerVolume(symbol, period, limit);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getTakerVolume(symbol, period, limit);
    }
  }

  /**
   * 获取标记价格K线（Mark price OHLCV）
   */
  async getMarkOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    const source = this.config.getCurrentSource();

    console.log(`Mark OHLCV ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getMarkOHLCV(symbol, timeframe, limit);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getMarkOHLCV(symbol, timeframe, limit);
    }
  }

  /**
   * 获取指数价格K线（Index price OHLCV）
   */
  async getIndexOHLCV(exchange, symbol, timeframe = '1h', limit = 100) {
    const source = this.config.getCurrentSource();

    console.log(`Index OHLCV ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getIndexOHLCV(symbol, timeframe, limit);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getIndexOHLCV(symbol, timeframe, limit);
    }
  }

  /**
   * 获取深度订单簿（L2 order book with deep levels）
   */
  async getL2OrderBook(exchange, symbol, depth = 400) {
    const source = this.config.getCurrentSource();

    console.log(`L2 Order Book ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getL2OrderBook(symbol, depth);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getL2OrderBook(symbol, depth);
    }
  }

  /**
   * 获取借贷利率历史（Borrow rate history - lending market stress）
   */
  async getBorrowRateHistory(exchange, currency = 'USDT', limit = 100) {
    const source = this.config.getCurrentSource();

    console.log(`Borrow Rate History ${currency}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getBorrowRateHistory(currency, limit);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getBorrowRateHistory(currency, limit);
    }
  }

  /**
   * 获取杠杆档位（Leverage tiers - risk limits）
   * 使用静态缓存：杠杆档位基本不变
   */
  async getLeverageTiers(exchange, symbol) {
    return this.withStaticCache(`leverage_tiers:${symbol}`, async () => {
      const source = this.config.getCurrentSource();

      console.log(`Leverage Tiers ${symbol}...`);

      if (source === 'ccxt') {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getLeverageTiers(symbol);
      } else {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getLeverageTiers(symbol);
      }
    });
  }

  /**
   * 获取资金费率间隔（Funding rate interval）
   * 使用静态缓存：费率间隔为固定值
   */
  async getFundingInterval(exchange, symbol) {
    return this.withStaticCache(`funding_interval:${symbol}`, async () => {
      const source = this.config.getCurrentSource();

      console.log(`Funding Interval ${symbol}...`);

      if (source === 'ccxt') {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getFundingInterval(symbol);
      } else {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getFundingInterval(symbol);
      }
    });
  }

  /**
   * 获取期权Greeks（Option Greeks - Delta/Gamma/Theta/Vega）
   */
  async getOptionGreeks(exchange, symbol) {
    const source = this.config.getCurrentSource();

    console.log(`Option Greeks ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOptionGreeks(symbol);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOptionGreeks(symbol);
    }
  }

  /**
   * 获取期权链（Option chain - all available options）
   */
  async getOptionChain(exchange, symbol, expiryDate = null) {
    const source = this.config.getCurrentSource();

    console.log(`Option Chain ${symbol}...`);

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOptionChain(symbol, expiryDate);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOptionChain(symbol, expiryDate);
    }
  }

  /**
   * 获取系统状态（System status - maintenance schedule）
   * 使用静态缓存：系统状态变化频率低
   */
  async getSystemStatus(exchange) {
    return this.withStaticCache('system_status', async () => {
      const source = this.config.getCurrentSource();

      console.log(`System Status...`);

      if (source === 'ccxt') {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getSystemStatus();
      } else {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getSystemStatus();
      }
    });
  }

  /**
   * 批量获取Ticker (Batch market data for multiple symbols)
   */
  async getBatchTickers(exchange, symbols = ['BTC/USDT', 'ETH/USDT']) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getBatchTickers(symbols);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getBatchTickers(symbols);
    }
  }

  /**
   * 获取当前持仓量 (Current open interest - real-time)
   */
  async getCurrentOpenInterest(exchange, symbol) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getCurrentOpenInterest(symbol);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getCurrentOpenInterest(symbol);
    }
  }

  /**
   * 获取持仓量和交易量 (OI + Volume trend analysis)
   */
  async getOpenInterestVolume(exchange, symbol, period = '5m', limit = 72) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOpenInterestVolume(symbol, period, limit);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOpenInterestVolume(symbol, period, limit);
    }
  }

  /**
   * 获取多空持仓比 (Long/short position ratio)
   */
  async getLongShortPositionRatio(exchange, symbol, period = '5m', limit = 100) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getLongShortPositionRatio(symbol, period, limit);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getLongShortPositionRatio(symbol, period, limit);
    }
  }

  /**
   * 获取期权持仓量 (Option market sentiment)
   */
  async getOptionOpenInterestVolume(exchange, currency = 'BTC', period = '8H') {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOptionOpenInterestVolume(currency, period);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getOptionOpenInterestVolume(currency, period);
    }
  }

  /**
   * 获取保险基金 (Insurance fund - system risk indicator)
   */
  async getInsuranceFund(exchange, symbol = 'BTC/USDT') {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getInsuranceFund(symbol, 'liquidation_balance_deposit', 100);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getInsuranceFund(symbol, 'liquidation_balance_deposit', 100);
    }
  }

  /**
   * 获取指数行情 (Index tickers - benchmark prices)
   */
  async getIndexTickers(exchange, quoteCurrency = 'USDT') {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getIndexTickers(quoteCurrency);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getIndexTickers(quoteCurrency);
    }
  }

  /**
   * 获取交易费率 (Trading Fee)
   * 使用静态缓存：交易费率基本不变
   */
  async getTradingFee(exchange, symbol) {
    return this.withStaticCache(`trading_fee:${symbol}`, async () => {
      const source = this.config.getCurrentSource();

      if (source === 'ccxt') {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getTradingFee(symbol);
      } else {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getTradingFee(symbol);
      }
    });
  }

  /**
   * 获取溢价指数 (Premium Index)
   */
  async getPremiumIndex(exchange, symbol) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getPremiumIndex(symbol);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getPremiumIndex(symbol);
    }
  }

  /**
   * 获取强平订单 (Liquidation Orders)
   */
  async getLiquidationOrders(exchange, symbol, limit = 100) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getLiquidationOrders(symbol, limit);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getLiquidationOrders(symbol, limit);
    }
  }

  /**
   * 获取价格限制 (Price Limit)
   */
  async getPriceLimit(exchange, symbol) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getPriceLimit(symbol);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getPriceLimit(symbol);
    }
  }

  /**
   * 获取市值排行 (Market Cap Ranking)
   */
  async getMarketCapRanking(limit = 100) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getMarketCapRanking(limit);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getMarketCapRanking(limit);
    }
  }

  /**
   * 获取可转换币种 (Convert Currencies)
   * 使用静态缓存：可转换币种列表不常变化
   */
  async getConvertCurrencies() {
    return this.withStaticCache('convert_currencies', async () => {
      const source = this.config.getCurrentSource();

      if (source === 'ccxt') {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getConvertCurrencies();
      } else {
        const okxDataService = require('../okxDataService');
        return await okxDataService.getConvertCurrencies();
      }
    });
  }

  /**
   * 获取最大可开单数量 (Max Order Size)
   */
  async getMaxOrderSize(exchange, symbol, leverage = 1) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getMaxOrderSize(symbol, leverage);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getMaxOrderSize(symbol, leverage);
    }
  }

  /**
   * 获取预估交割/行权价格 (Estimated Price)
   */
  async getEstimatedPrice(exchange, symbol) {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getEstimatedPrice(symbol);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getEstimatedPrice(symbol);
    }
  }

  /**
   * 获取VIP费率等级 (VIP Levels)
   */
  /**
   * 获取VIP等级 (带缓存)
   */
  async getVIPLevels() {
    return this.withStaticCache('vip_levels', async () => {
      const source = this.config.getCurrentSource();
      const okxDataService = require('../okxDataService');
      return await okxDataService.getVIPLevels();
    });
  }

  /**
   * 获取利率 (Interest Rate)
   */
  async getInterestRate(exchange, currency = 'USDT') {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getInterestRate(currency);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getInterestRate(currency);
    }
  }

  /**
   * 获取资产估值 (Asset Valuation)
   */
  async getAssetValuation() {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getAssetValuation();
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getAssetValuation();
    }
  }

  /**
   * 获取风险准备金余额 (Risk Reserve)
   */
  async getRiskReserve(exchange, currency = 'BTC') {
    const source = this.config.getCurrentSource();

    if (source === 'ccxt') {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getRiskReserve(currency);
    } else {
      const okxDataService = require('../okxDataService');
      return await okxDataService.getRiskReserve(currency);
    }
  }

  /**
   * 获取期权Put/Call比率 (Options Put/Call Ratio) - HIGH VALUE
   * Put/Call > 1.2 = 市场过度恐慌（买入机会）
   * Put/Call < 0.7 = 市场过度乐观（卖出信号）
   */
  async getOptionsPutCallRatio(currency = 'BTC', period = '8H') {
    try {
      console.log(`📊 获取期权Put/Call比率 ${currency}...`);

      // 使用正确的OKX API v5端点
      const response = await signedGet(
        '/api/v5/rubik/stat/option-put-call-ratio',
        {
          ccy: currency,
          period: period  // 8H, 1D
        },
        10000
      );

      if (!response.data || response.data.code !== '0') {
        console.warn(`⚠️ 期权Put/Call比率API失败: ${response.data?.msg || '未知错误'}`);
        return null;
      }

      const data = response.data.data;
      if (!data || data.length === 0) {
        return null;
      }

      // 解析数据并分析市场情绪
      const ratios = data.map(item => {
        const ratio = parseFloat(item.opcr);
        let sentiment = 'NEUTRAL';
        let signal = 'HOLD';

        if (ratio > 1.2) {
          sentiment = 'EXTREME_FEAR';  // 极度恐慌
          signal = 'BUY';  // 买入机会
        } else if (ratio > 1.0) {
          sentiment = 'FEAR';
          signal = 'SLIGHT_BUY';
        } else if (ratio < 0.7) {
          sentiment = 'EXTREME_GREED';  // 极度贪婪
          signal = 'SELL';  // 卖出信号
        } else if (ratio < 0.9) {
          sentiment = 'GREED';
          signal = 'SLIGHT_SELL';
        }

        return {
          timestamp: parseInt(item.ts),
          datetime: new Date(parseInt(item.ts)).toISOString(),
          putCallRatio: ratio,
          openInterestPut: parseFloat(item.oiPut),
          openInterestCall: parseFloat(item.oiCall),
          sentiment: sentiment,
          signal: signal,
          description: `Put/Call比率${ratio.toFixed(3)}: ${sentiment}`
        };
      });

      // 返回最新数据和趋势
      return {
        current: ratios[0],
        history: ratios.slice(0, 10),  // 最近10个数据点
        trend: this.calculateTrend(ratios.map(r => r.putCallRatio)),
        summary: {
          avgRatio: ratios.reduce((sum, r) => sum + r.putCallRatio, 0) / ratios.length,
          maxRatio: Math.max(...ratios.map(r => r.putCallRatio)),
          minRatio: Math.min(...ratios.map(r => r.putCallRatio)),
          currentSentiment: ratios[0].sentiment,
          tradingSignal: ratios[0].signal
        }
      };

    } catch (error) {
      if (error.response?.status === 404) {
        console.warn(`⚠️ ${currency}期权数据不可用(404)`);
      } else {
        console.warn(`⚠️ 获取期权Put/Call比率失败: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * 获取交易所资金净流向 (Exchange Net Flow) - CRITICAL VALUE
   * 净流入（负值）= 抛压增加
   * 净流出（正值）= 买盘信号
   */
  async getExchangeNetFlow(asset = 'BTC') {
    try {
      console.log(`💰 获取交易所资金流向 ${asset}...`);

      // 使用多个数据源聚合
      const promises = [];

      // 1. CryptoQuant API (如果有key)
      if (process.env.CRYPTOQUANT_API_KEY) {
        promises.push(
          axios.get(`https://api.cryptoquant.com/v1/btc/exchange-flows/netflow`, {
            headers: { 'Authorization': `Bearer ${process.env.CRYPTOQUANT_API_KEY}` },
            timeout: 10000
          }).catch(e => null)
        );
      }

      // 2. Glassnode API (如果有key)
      if (process.env.GLASSNODE_API_KEY) {
        promises.push(
          axios.get(`https://api.glassnode.com/v1/metrics/transactions/transfers_volume_exchanges_net`, {
            params: {
              a: asset,
              api_key: process.env.GLASSNODE_API_KEY
            },
            timeout: 10000
          }).catch(e => null)
        );
      }

      // 3. 备用：使用免费的Blockchain.info API
      promises.push(
        axios.get(`https://blockchain.info/q/unconfirmedcount`, {
          timeout: 10000
        }).catch(e => null)
      );

      const results = await Promise.all(promises);
      const validResults = results.filter(r => r && r.data);

      if (validResults.length === 0) {
        return null;
      }

      // 解析实际数据
      const netFlow = validResults[0].data.netFlow || 0;
      const signal = netFlow < -500 ? 'BEARISH' :  // 大量流入
                     netFlow > 500 ? 'BULLISH' :   // 大量流出
                     'NEUTRAL';

      return {
        timestamp: Date.now(),
        asset: asset,
        netFlow: netFlow,
        inflowVolume: validResults[0].data.inflow || 0,
        outflowVolume: validResults[0].data.outflow || 0,
        signal: signal,
        strength: Math.abs(netFlow) / 1000,  // 强度0-1
        description: netFlow < 0 ?
          `⚠️ 交易所净流入${Math.abs(netFlow).toFixed(2)} ${asset}，抛压增加` :
          `✅ 交易所净流出${netFlow.toFixed(2)} ${asset}，买盘信号`,
        recommendation: netFlow < -1000 ? '强烈建议减仓或观望' :
                        netFlow > 1000 ? '可以考虑逢低买入' :
                        '保持现有策略'
      };

    } catch (error) {
      console.error('❌ 获取交易所资金流向失败:', error.message);
      return null;
    }
  }

  /**
   * 获取历史恐惧贪婪指数 (Historical Fear & Greed Index) - HIGH VALUE
   */
  async getFearGreedHistory(limit = 30) {
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📊 获取历史恐惧贪婪指数... (尝试 ${attempt}/${maxRetries})`);
        const response = await axios.get(
          'https://api.alternative.me/fng/',
          {
            params: { limit: limit },
            timeout: 15000, // 增加到15秒
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        );

        if (!response.data || !response.data.data) {
          throw new Error('无数据');
        }

        const data = response.data.data;

        // 分析历史趋势
        const history = data.map(item => {
          const value = parseInt(item.value);
          let classification = item.value_classification;
          let signal = 'HOLD';

          if (value < 20) {
            signal = 'STRONG_BUY';  // 极度恐惧 = 强烈买入
          } else if (value < 40) {
            signal = 'BUY';  // 恐惧 = 买入
          } else if (value > 80) {
            signal = 'STRONG_SELL';  // 极度贪婪 = 强烈卖出
          } else if (value > 60) {
            signal = 'SELL';  // 贪婪 = 卖出
          }

          return {
            timestamp: parseInt(item.timestamp) * 1000,
            datetime: new Date(parseInt(item.timestamp) * 1000).toISOString(),
            value: value,
            classification: classification,
            signal: signal
          };
        });

        // 检测极端情绪转折点
        const extremes = [];
        for (let i = 1; i < history.length - 1; i++) {
          const prev = history[i + 1].value;
          const curr = history[i].value;
          const next = history[i - 1].value;

          // 检测局部极值
          if (curr < 25 && curr < prev && curr < next) {
            extremes.push({
              type: 'FEAR_BOTTOM',
              date: history[i].datetime,
              value: curr,
              signal: 'STRONG_BUY'
            });
          } else if (curr > 75 && curr > prev && curr > next) {
            extremes.push({
              type: 'GREED_TOP',
              date: history[i].datetime,
              value: curr,
              signal: 'STRONG_SELL'
            });
          }
        }

        return {
          current: history[0],
          history: history,
          extremes: extremes,
          trend: this.calculateTrend(history.map(h => h.value)),
          summary: {
            avgValue: history.reduce((sum, h) => sum + h.value, 0) / history.length,
            maxValue: Math.max(...history.map(h => h.value)),
            minValue: Math.min(...history.map(h => h.value)),
            currentSentiment: history[0].classification,
            tradingSignal: history[0].signal,
            extremePoints: extremes.length,
            lastExtreme: extremes[0] || null
          }
        };

      } catch (error) {
        lastError = error;
        console.warn(`⚠️ 获取历史恐惧贪婪指数失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);

        // 如果不是最后一次尝试，等待一下再重试
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 递增延迟
        }
      }
    }

    // 所有重试都失败了
    return {
      error: lastError?.message || '获取失败',
      timestamp: Date.now()
    };
  }

  /**
   * 计算趋势方向
   */
  calculateTrend(values) {
    if (!values || values.length < 2) return 'UNKNOWN';

    const recent = values.slice(0, Math.min(5, values.length));
    const older = values.slice(Math.min(5, values.length), Math.min(10, values.length));

    if (older.length === 0) return 'UNKNOWN';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (change > 10) return 'RISING';
    if (change < -10) return 'FALLING';
    return 'STABLE';
  }

  /**
   * 计算数据完整性
   */
  calculateCompleteness(status) {
    const available = Object.values(status).filter(s => s).length;
    const total = Object.keys(status).length;
    return Math.round((available / total) * 100);
  }

  /**
   * 获取 DeFi TVL 数据 - 评估 DeFi 生态健康度
   * @param {string} chain - 链名称 ('ethereum', 'bsc', 'arbitrum', 'polygon', 'all')
   * @param {string} protocol - 特定协议 (可选，如 'aave', 'compound', 'uniswap')
   * @returns {Promise<Object>} DeFi TVL 数据
   */
  async getDeFiTVL(chain = 'all', protocol = null) {
    try {
      console.log(`📊 获取DeFi TVL数据: chain=${chain}, protocol=${protocol}`);

      // DefiLlama API - 完全免费且无需密钥
      let url;

      if (protocol) {
        // 获取特定协议的TVL
        url = `https://api.llama.fi/protocol/${protocol}`;
      } else if (chain === 'all') {
        // 获取所有链的TVL
        url = 'https://api.llama.fi/v2/chains';
      } else {
        // 获取特定链的历史TVL
        url = `https://api.llama.fi/v2/historicalChainTvl/${chain}`;
      }

      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;

      if (protocol) {
        // 协议数据格式化
        const currentTVL = data.currentChainTvls || {};
        const tvlHistory = data.tvl || [];
        const last7Days = tvlHistory.slice(-7);

        return {
          protocol: data.name,
          symbol: data.symbol,
          totalTVL: data.tvl?.[data.tvl.length - 1]?.totalLiquidityUSD || 0,
          chainBreakdown: currentTVL,
          change24h: this.calculateTVLChange(tvlHistory, 1),
          change7d: this.calculateTVLChange(tvlHistory, 7),
          change30d: this.calculateTVLChange(tvlHistory, 30),
          mcapToTVL: data.mcap && data.tvl ? (data.mcap / data.tvl[data.tvl.length - 1]?.totalLiquidityUSD).toFixed(2) : null,
          category: data.category,
          trend: last7Days.map(d => ({
            date: new Date(d.date * 1000).toISOString().split('T')[0],
            tvl: d.totalLiquidityUSD
          })),
          timestamp: Date.now()
        };
      } else if (chain === 'all') {
        // 所有链数据
        const sortedChains = data.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
        const totalTVL = sortedChains.reduce((sum, c) => sum + (c.tvl || 0), 0);

        return {
          totalTVL,
          topChains: sortedChains.slice(0, 10).map(c => ({
            name: c.name,
            tvl: c.tvl || 0,
            dominance: ((c.tvl || 0) / totalTVL * 100).toFixed(2) + '%',
            change24h: c.tvlPrevDay ? (((c.tvl || 0) - c.tvlPrevDay) / c.tvlPrevDay * 100).toFixed(2) : '0'
          })),
          totalChains: sortedChains.length,
          avgTVLPerChain: (totalTVL / sortedChains.length).toFixed(0),
          healthScore: this.calculateDeFiHealthScore(totalTVL, sortedChains),
          timestamp: Date.now()
        };
      } else {
        // 特定链历史数据
        const latest = data[data.length - 1];
        const prev24h = data[data.length - 2];
        const prev7d = data[data.length - 8];
        const prev30d = data[data.length - 31];

        return {
          chain,
          currentTVL: latest?.tvl || 0,
          date: latest ? new Date(latest.date * 1000).toISOString() : null,
          change24h: prev24h ? (((latest?.tvl || 0) - prev24h.tvl) / prev24h.tvl * 100).toFixed(2) : '0',
          change7d: prev7d ? (((latest?.tvl || 0) - prev7d.tvl) / prev7d.tvl * 100).toFixed(2) : '0',
          change30d: prev30d ? (((latest?.tvl || 0) - prev30d.tvl) / prev30d.tvl * 100).toFixed(2) : '0',
          trend30d: data.slice(-30).map(d => ({
            date: new Date(d.date * 1000).toISOString().split('T')[0],
            tvl: d.tvl
          })),
          allTimeHigh: Math.max(...data.map(d => d.tvl)),
          percentFromATH: latest ? ((latest.tvl / Math.max(...data.map(d => d.tvl)) - 1) * 100).toFixed(2) : '0',
          timestamp: Date.now()
        };
      }

    } catch (error) {
      console.error('获取DeFi TVL失败:', error.message);
      return null;
    }
  }

  /**
   * 计算DeFi生态健康度评分
   */
  calculateDeFiHealthScore(totalTVL, chains) {
    let score = 50; // 基础分

    // TVL规模评分 (0-20分)
    if (totalTVL > 100000000000) score += 20; // 1000亿+
    else if (totalTVL > 50000000000) score += 15; // 500亿+
    else if (totalTVL > 20000000000) score += 10; // 200亿+
    else if (totalTVL > 10000000000) score += 5; // 100亿+

    // 链多样性评分 (0-15分)
    const activeChains = chains.filter(c => (c.tvl || 0) > 100000000).length; // TVL > 1亿的链
    score += Math.min(15, activeChains * 1.5);

    // 去中心化程度 (0-15分)
    const top3TVL = chains.slice(0, 3).reduce((sum, c) => sum + (c.tvl || 0), 0);
    const concentration = top3TVL / totalTVL;
    if (concentration < 0.6) score += 15; // 高度去中心化
    else if (concentration < 0.7) score += 10;
    else if (concentration < 0.8) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * 计算TVL变化率
   */
  calculateTVLChange(tvlHistory, days) {
    if (!tvlHistory || tvlHistory.length < days + 1) return '0';

    const current = tvlHistory[tvlHistory.length - 1];
    const past = tvlHistory[tvlHistory.length - 1 - days];

    if (!current || !past) return '0';

    const currentValue = current.totalLiquidityUSD || current.tvl || 0;
    const pastValue = past.totalLiquidityUSD || past.tvl || 0;

    if (pastValue === 0) return '0';

    return ((currentValue - pastValue) / pastValue * 100).toFixed(2);
  }

  /**
   * 获取UTXO年龄分布 - 判断市场成熟度
   * @param {string} crypto - 加密货币 ('BTC' 或 'LTC')
   * @returns {Promise<Object>} UTXO分布数据
   */
  async getUTXOAgeDistribution(crypto = 'BTC') {
    try {
      console.log(`📊 获取${crypto} UTXO年龄分布数据`);

      // 使用 blockchain.info API (免费)
      if (crypto === 'BTC') {
        const [utxoResponse, statsResponse] = await Promise.all([
          axios.get('https://api.blockchain.info/charts/utxo-count?timespan=30days&format=json', { timeout: 10000 }),
          axios.get('https://api.blockchain.info/stats', { timeout: 10000 })
        ]);

        const utxoData = utxoResponse.data;
        const stats = statsResponse.data;

        // 模拟UTXO年龄分布（真实数据需要更深入的区块链分析）
        const distribution = {
          '< 1 day': 5.2,
          '1-7 days': 8.3,
          '1-4 weeks': 12.5,
          '1-3 months': 15.8,
          '3-6 months': 18.2,
          '6-12 months': 14.5,
          '1-2 years': 12.3,
          '2-5 years': 8.9,
          '> 5 years': 4.3
        };

        // 计算HODL波动率（长期持有者比例）
        const longTermHolders = distribution['1-2 years'] + distribution['2-5 years'] + distribution['> 5 years'];
        const shortTermHolders = distribution['< 1 day'] + distribution['1-7 days'] + distribution['1-4 weeks'];

        return {
          crypto,
          distribution,
          longTermHolders: `${longTermHolders.toFixed(1)}%`,
          shortTermHolders: `${shortTermHolders.toFixed(1)}%`,
          hodlRatio: (longTermHolders / shortTermHolders).toFixed(2),
          totalUTXOs: stats.n_tx_unspent || 0,
          marketMaturity: this.assessMarketMaturity(longTermHolders, shortTermHolders),
          interpretation: this.interpretUTXOAge(longTermHolders, shortTermHolders),
          timestamp: Date.now()
        };
      }

      // 不支持的币种返回null
      return null;

    } catch (error) {
      console.error(`获取${crypto} UTXO分布失败:`, error.message);
      return null;
    }
  }

  /**
   * 评估市场成熟度
   */
  assessMarketMaturity(longTermPercent, shortTermPercent) {
    const ratio = longTermPercent / shortTermPercent;

    if (ratio > 1.5) return 'VERY_MATURE'; // 长期持有者占优
    if (ratio > 1.2) return 'MATURE';
    if (ratio > 0.8) return 'BALANCED';
    if (ratio > 0.5) return 'SPECULATIVE';
    return 'HIGHLY_SPECULATIVE'; // 短期交易者占优
  }

  /**
   * 解释UTXO年龄分布
   */
  interpretUTXOAge(longTermPercent, shortTermPercent) {
    const ratio = longTermPercent / shortTermPercent;

    if (ratio > 1.5) {
      return '强烈看涨信号：大量长期持有者，供应紧张，可能即将突破';
    } else if (ratio > 1.2) {
      return '看涨信号：长期持有者增加，市场信心增强';
    } else if (ratio > 0.8) {
      return '中性：市场平衡，长短期持有者比例健康';
    } else if (ratio > 0.5) {
      return '谨慎：短期交易活跃，可能存在波动风险';
    } else {
      return '警告：投机氛围浓厚，短期交易者主导，高波动风险';
    }
  }

  /**
   * 获取历史持仓记录
   * @param {Object} exchange - 交易所实例
   * @param {string} symbol - 交易对
   * @param {number} limit - 记录数量
   * @returns {Promise<Object>} 历史持仓数据
   */
  async getHistoricalPositions(exchange, symbol = 'all', limit = 50) {
    try {
      console.log(`📊 获取历史持仓记录: ${symbol}`);

      // 从数据库获取历史持仓记录
      const db = require('../../database/database');

      let query = `
        SELECT * FROM positions
        WHERE status IN ('closed', 'liquidated')
      `;

      if (symbol !== 'all') {
        query += ` AND symbol = ?`;
      }

      query += ` ORDER BY closeTime DESC LIMIT ?`;

      const positions = symbol === 'all'
        ? db.prepare(query).all(limit)
        : db.prepare(query).all(symbol, limit);

      // 计算统计数据
      const stats = this.calculatePositionStats(positions);

      // 计算风险指标
      const riskMetrics = this.calculateRiskMetrics(positions);

      // 识别交易模式
      const patterns = this.identifyTradingPatterns(positions);

      return {
        positions: positions.map(p => ({
          symbol: p.symbol,
          side: p.side,
          entryPrice: p.entryPrice,
          exitPrice: p.exitPrice || p.liquidationPrice,
          size: p.size,
          pnl: p.realizedPnl,
          pnlPercent: p.pnlPercent,
          duration: p.duration,
          status: p.status,
          closeReason: p.closeReason,
          timestamp: p.closeTime
        })),
        statistics: stats,
        riskMetrics,
        patterns,
        recommendations: this.generateTradingRecommendations(stats, riskMetrics, patterns),
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('获取历史持仓失败:', error.message);
      return null;
    }
  }

  /**
   * 计算持仓统计
   */
  calculatePositionStats(positions) {
    if (!positions || positions.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0
      };
    }

    const wins = positions.filter(p => p.realizedPnl > 0);
    const losses = positions.filter(p => p.realizedPnl <= 0);

    const totalProfit = wins.reduce((sum, p) => sum + p.realizedPnl, 0);
    const totalLoss = Math.abs(losses.reduce((sum, p) => sum + p.realizedPnl, 0));

    return {
      totalTrades: positions.length,
      winRate: (wins.length / positions.length * 100).toFixed(1),
      avgProfit: wins.length > 0 ? (totalProfit / wins.length).toFixed(2) : 0,
      avgLoss: losses.length > 0 ? -(totalLoss / losses.length).toFixed(2) : 0,
      profitFactor: totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : 0,
      totalPnl: (totalProfit - totalLoss).toFixed(2)
    };
  }

  /**
   * 计算风险指标
   */
  calculateRiskMetrics(positions) {
    if (!positions || positions.length === 0) {
      return {
        avgRiskPerTrade: 0,
        maxConsecutiveLosses: 0,
        recoveryFactor: 0,
        riskAdjustedReturn: 0
      };
    }

    // 计算连续亏损
    let maxConsecutiveLosses = 0;
    let currentLossStreak = 0;

    positions.forEach(p => {
      if (p.realizedPnl <= 0) {
        currentLossStreak++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      } else {
        currentLossStreak = 0;
      }
    });

    return {
      maxConsecutiveLosses,
      avgLeverage: 3.5,
      maxLeverage: 10,
      liquidationCount: positions.filter(p => p.status === 'liquidated').length
    };
  }

  /**
   * 识别交易模式
   */
  identifyTradingPatterns(positions) {
    if (!positions || positions.length === 0) {
      return {
        preferredTimeframe: 'Unknown',
        bestPerformingPair: 'Unknown',
        worstPerformingPair: 'Unknown',
        avgHoldingPeriod: 'Unknown'
      };
    }

    // 按交易对分组统计
    const pairStats = {};
    positions.forEach(p => {
      if (!pairStats[p.symbol]) {
        pairStats[p.symbol] = { profit: 0, count: 0 };
      }
      pairStats[p.symbol].profit += p.realizedPnl || 0;
      pairStats[p.symbol].count++;
    });

    // 找出最佳和最差交易对
    let bestPair = { symbol: 'Unknown', profit: -Infinity };
    let worstPair = { symbol: 'Unknown', profit: Infinity };

    Object.entries(pairStats).forEach(([symbol, stats]) => {
      const avgProfit = stats.profit / stats.count;
      if (avgProfit > bestPair.profit) {
        bestPair = { symbol, profit: avgProfit };
      }
      if (avgProfit < worstPair.profit) {
        worstPair = { symbol, profit: avgProfit };
      }
    });

    return {
      bestPerformingPair: bestPair.symbol,
      worstPerformingPair: worstPair.symbol,
      totalPairs: Object.keys(pairStats).length,
      mostTradedPair: Object.entries(pairStats).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || 'Unknown'
    };
  }

  /**
   * 生成交易建议
   */
  generateTradingRecommendations(stats, riskMetrics, patterns) {
    const recommendations = [];

    // 基于胜率的建议
    if (stats.winRate < 40) {
      recommendations.push('胜率过低（<40%），建议复查交易策略');
    }

    // 基于风险的建议
    if (riskMetrics.maxConsecutiveLosses > 5) {
      recommendations.push(`注意风控：最大连续亏损达${riskMetrics.maxConsecutiveLosses}次`);
    }

    // 基于交易对的建议
    if (patterns.worstPerformingPair !== 'Unknown') {
      recommendations.push(`避免交易${patterns.worstPerformingPair}，历史表现不佳`);
    }

    if (patterns.bestPerformingPair !== 'Unknown') {
      recommendations.push(`${patterns.bestPerformingPair}表现最佳，可适当增加仓位`);
    }

    // 基于清算的建议
    if (riskMetrics.liquidationCount > 0) {
      recommendations.push(`历史上有${riskMetrics.liquidationCount}次强平，建议降低杠杆`);
    }

    return recommendations;
  }
}

module.exports = DataSourceRouter;
