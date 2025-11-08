/**
 * 免费API数据服务
 * 集成真正免费的API：DefiLlama、CryptoCompare、CoinPaprika
 * 无需API key，完全免费
 */

const axios = require('axios');

class FreeAPIsService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = {
      defi: 300000,        // 5分钟
      market: 300000,      // 5分钟
      crypto: 180000       // 3分钟
    };
  }

  /**
   * 带重试的HTTP请求辅助函数
   * @param {Function} requestFn - 返回Promise的请求函数
   * @param {Object} options - 重试选项
   * @returns {Promise} - 请求结果
   */
  async retryRequest(requestFn, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 2000,
      backoff = true
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        const delay = backoff ? retryDelay * attempt : retryDelay;

        if (attempt < maxRetries) {
          console.warn(`   ⚠️ 尝试 ${attempt}/${maxRetries} 失败: ${error.message}, ${delay}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * 获取缓存数据
   */
  getCached(key, ttl) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  }

  /**
   * 设置缓存
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 1. CryptoCompare - 市场数据和社交统计（完全免费）
   * 无需API key
   */
  async getMarketStats(symbol) {
    try {
      const coin = symbol.split('/')[0]; // BTC/USDT -> BTC
      const cacheKey = `market_${coin}`;

      const cached = this.getCached(cacheKey, this.cacheTTL.market);
      if (cached) return cached;

      console.log(`📊 [CryptoCompare] 获取${coin}市场统计...`);

      // CryptoCompare 币种ID映射（某些币种需要特定ID）
      const coinIdMap = {
        'BTC': '1182',   // Bitcoin
        'ETH': '7605',   // Ethereum
        'BNB': '4679',   // Binance Coin
        'SOL': '5864',   // Solana
        'ADA': '4085',   // Cardano
        'XRP': '5031',   // Ripple
        'DOGE': '4432',  // Dogecoin
        'DOT': '5805',   // Polkadot
        'MATIC': '8925', // Polygon
        'AVAX': '5805',  // Avalanche
        'LTC': '3808',   // Litecoin
        'LINK': '3306'   // Chainlink
      };

      const coinId = coinIdMap[coin] || coin;

      // 获取社交统计和市场数据
      const response = await axios.get('https://min-api.cryptocompare.com/data/social/coin/latest', {
        params: {
          coinId: coinId
        },
        timeout: 8000
      });

      if (response.data && response.data.Data) {
        const data = response.data.Data;
        const result = {
          symbol: coin,
          // 社交数据
          twitterFollowers: data.Twitter?.followers || null,
          twitterLists: data.Twitter?.lists || null,
          redditSubscribers: data.Reddit?.subscribers || null,
          redditActiveUsers: data.Reddit?.active_users || null,
          // GitHub数据（如果有）
          githubStars: data.Github?.stars || null,
          githubForks: data.Github?.forks || null,
          // 综合评分
          codeRepoStars: data.CodeRepository?.List?.[0]?.stars || null,
          timestamp: Date.now()
        };

        // 检查是否所有数据都为null
        const hasValidData = Object.values(result).some(v => v !== null && v !== coin && typeof v !== 'number' || v > 0);

        if (!hasValidData) {
          console.warn(`⚠️ [CryptoCompare] ${coin}社交数据为空（可能该币种无社交数据）`);
        }

        this.setCache(cacheKey, result);
        console.log(`✅ [CryptoCompare] ${coin}市场统计获取成功`);
        return result;
      }

      return null;
    } catch (error) {
      console.error(`❌ [CryptoCompare] 获取失败:`, error.message);
      return null;
    }
  }

  /**
   * 2. CoinPaprika - 加密货币详细信息（完全免费）
   * 无需API key
   */
  async getCryptoDetails(symbol) {
    try {
      const coin = symbol.split('/')[0].toLowerCase(); // btc
      const cacheKey = `crypto_${coin}`;
      
      const cached = this.getCached(cacheKey, this.cacheTTL.crypto);
      if (cached) return cached;

      console.log(`🪙 [CoinPaprika] 获取${coin}详细信息...`);

      // 币种ID映射
      const coinIdMap = {
        'btc': 'btc-bitcoin',
        'eth': 'eth-ethereum',
        'bnb': 'bnb-binance-coin',
        'sol': 'sol-solana',
        'xrp': 'xrp-xrp',
        'ada': 'ada-cardano',
        'doge': 'doge-dogecoin'
      };
      
      const coinId = coinIdMap[coin] || `${coin}-${coin}`;
      
      // 获取币种详细信息
      const response = await axios.get(`https://api.coinpaprika.com/v1/coins/${coinId}`, {
        timeout: 10000
      });

      if (response.data) {
        const data = response.data;
        const result = {
          symbol: coin.toUpperCase(),
          name: data.name || null,
          rank: data.rank || null,
          type: data.type || null,
          isActive: data.is_active || false,
          isNew: data.is_new || false,
          // 团队信息
          teamSize: data.team?.length || null,
          // 开发活跃度
          openSource: data.open_source || false,
          developmentStatus: data.development_status || null,
          // 链接
          whitepaper: data.whitepaper?.link || null,
          websiteStatus: data.links?.website?.length > 0,
          timestamp: Date.now()
        };

        this.setCache(cacheKey, result);
        console.log(`✅ [CoinPaprika] ${coin}详细信息获取成功`);
        return result;
      }

      return null;
    } catch (error) {
      console.error(`❌ [CoinPaprika] 获取失败:`, error.message);
      return null;
    }
  }

  /**
   * 3. DefiLlama - DeFi数据（完全免费）
   * 文档: https://defillama.com/docs/api
   */
  async getDefiData(symbol) {
    try {
      const coin = symbol.split('/')[0].toLowerCase(); // btc
      const cacheKey = `defi_${coin}`;

      const cached = this.getCached(cacheKey, this.cacheTTL.defi);
      if (cached) return cached;

      console.log(`💰 [DefiLlama] 获取${coin} DeFi数据...`);

      // 使用重试逻辑（3次重试，指数退避）
      const response = await this.retryRequest(
        () => axios.get(`https://coins.llama.fi/prices/current/coingecko:${coin}`, {
          timeout: 15000
        }),
        {
          maxRetries: 3,
          retryDelay: 2000,
          backoff: true
        }
      );

      if (response.data && response.data.coins) {
        const coinKey = `coingecko:${coin}`;
        const coinData = response.data.coins[coinKey];

        if (coinData) {
          const result = {
            symbol: coin.toUpperCase(),
            price: coinData.price || null,
            confidence: coinData.confidence || null,
            timestamp: coinData.timestamp || Date.now()
          };

          this.setCache(cacheKey, result);
          console.log(`✅ [DefiLlama] ${coin} DeFi数据获取成功`);
          return result;
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ [DefiLlama] 最终获取失败 (${error.message})`);
      return null;
    }
  }

  /**
   * 4. Blockchain.com - 比特币链上数据（完全免费）
   * 无需API key
   */
  async getBlockchainInfo(symbol) {
    try {
      const coin = symbol.split('/')[0].toUpperCase();
      
      // 只支持BTC
      if (coin !== 'BTC') {
        return null;
      }
      
      const cacheKey = 'blockchain_btc';
      const cached = this.getCached(cacheKey, this.cacheTTL.crypto);
      if (cached) return cached;

      console.log('⛓️  [Blockchain.com] 获取BTC链上数据...');

      // 并行获取多个链上数据
      const [stats, latestBlock, ticker] = await Promise.allSettled([
        axios.get('https://blockchain.info/stats?format=json', { timeout: 10000 }),
        axios.get('https://blockchain.info/latestblock', { timeout: 10000 }),
        axios.get('https://blockchain.info/ticker', { timeout: 10000 })
      ]);

      const result = {
        symbol: 'BTC',
        // 网络统计
        totalBTC: stats.status === 'fulfilled' ? stats.value.data.totalbc / 1e8 : null,
        marketPriceUSD: stats.status === 'fulfilled' ? stats.value.data.market_price_usd : null,
        hashRate: stats.status === 'fulfilled' ? stats.value.data.hash_rate : null,
        difficulty: stats.status === 'fulfilled' ? stats.value.data.difficulty : null,
        minutesBetweenBlocks: stats.status === 'fulfilled' ? stats.value.data.minutes_between_blocks : null,
        totalFees: stats.status === 'fulfilled' ? stats.value.data.total_fees_btc : null,
        // 最新区块
        blockHeight: latestBlock.status === 'fulfilled' ? latestBlock.value.data.height : null,
        blockTime: latestBlock.status === 'fulfilled' ? latestBlock.value.data.time : null,
        // 价格数据（多交易所）
        prices: ticker.status === 'fulfilled' ? ticker.value.data : null,
        timestamp: Date.now()
      };

      this.setCache(cacheKey, result);
      console.log('✅ [Blockchain.com] BTC链上数据获取成功');
      return result;
    } catch (error) {
      console.error('❌ [Blockchain.com] 获取失败:', error.message);
      return null;
    }
  }

  /**
   * 5. Blockchair API - 多链数据（免费额度）
   * 1440次/天免费
   */
  async getBlockchairData(symbol) {
    try {
      const coin = symbol.split('/')[0].toLowerCase();
      
      // 支持的链
      const chainMap = {
        'btc': 'bitcoin',
        'eth': 'ethereum',
        'ltc': 'litecoin',
        'bch': 'bitcoin-cash',
        'doge': 'dogecoin'
      };
      
      const chain = chainMap[coin];
      if (!chain) {
        return null;
      }
      
      const cacheKey = `blockchair_${coin}`;
      const cached = this.getCached(cacheKey, this.cacheTTL.crypto);
      if (cached) return cached;

      console.log(`🪑 [Blockchair] 获取${coin.toUpperCase()}链上统计...`);

      const response = await axios.get(`https://api.blockchair.com/${chain}/stats`, {
        timeout: 10000
      });

      if (response.data && response.data.data) {
        const data = response.data.data;
        const result = {
          symbol: coin.toUpperCase(),
          chain: chain,
          // 区块链统计
          blocks: data.blocks || null,
          transactions: data.transactions || null,
          circulation: data.circulation || null,
          blockchainSize: data.blockchain_size || null,
          // 网络活动
          transactionsPerDay: data.transactions_24h || null,
          volume24h: data.volume_24h || null,
          // 挖矿数据
          difficulty: data.difficulty || null,
          hashrate: data.hashrate_24h || null,
          // 市场数据
          marketPriceUSD: data.market_price_usd || null,
          timestamp: Date.now()
        };

        this.setCache(cacheKey, result);
        console.log(`✅ [Blockchair] ${coin.toUpperCase()}链上统计获取成功`);
        return result;
      }

      return null;
    } catch (error) {
      console.error('❌ [Blockchair] 获取失败:', error.message);
      return null;
    }
  }

  /**
   * 获取所有免费API数据（完全免费，无需API key）
   */
  async getAllFreeData(symbol) {
    console.log(`\n🌐 [免费API] 开始获取${symbol}所有免费数据...`);

    const [marketStats, cryptoDetails, defi, blockchainInfo, blockchairData] = await Promise.allSettled([
      this.getMarketStats(symbol),
      this.getCryptoDetails(symbol),
      this.getDefiData(symbol),
      this.getBlockchainInfo(symbol),
      this.getBlockchairData(symbol)
    ]);

    const result = {
      marketStats: marketStats.status === 'fulfilled' ? marketStats.value : null,
      cryptoDetails: cryptoDetails.status === 'fulfilled' ? cryptoDetails.value : null,
      defi: defi.status === 'fulfilled' ? defi.value : null,
      blockchainInfo: blockchainInfo.status === 'fulfilled' ? blockchainInfo.value : null,
      blockchairData: blockchairData.status === 'fulfilled' ? blockchairData.value : null,
      timestamp: Date.now(),
      dataQuality: this.calculateDataQuality({
        marketStats: marketStats.status === 'fulfilled' && marketStats.value !== null,
        cryptoDetails: cryptoDetails.status === 'fulfilled' && cryptoDetails.value !== null,
        defi: defi.status === 'fulfilled' && defi.value !== null,
        blockchainInfo: blockchainInfo.status === 'fulfilled' && blockchainInfo.value !== null,
        blockchairData: blockchairData.status === 'fulfilled' && blockchairData.value !== null
      })
    };

    console.log(`✅ [免费API] 数据获取完成 (质量: ${result.dataQuality})`);
    
    return result;
  }

  /**
   * 计算数据质量
   */
  calculateDataQuality(status) {
    const available = Object.values(status).filter(v => v).length;
    const total = Object.keys(status).length;
    const percentage = (available / total) * 100;

    if (percentage >= 100) return 'EXCELLENT';
    if (percentage >= 75) return 'GOOD';
    if (percentage >= 50) return 'PARTIAL';
    return 'POOR';
  }

  /**
   * 获取增强数据（所有免费API数据的汇总）
   */
  async getEnhancedData(symbol = 'BTC/USDT') {
    try {
      const [defi, marketStats, cryptoDetails] = await Promise.allSettled([
        this.getDefiData(symbol),
        this.getMarketStats(symbol),
        this.getCryptoDetails(symbol)
      ]);

      return {
        defi: defi.status === 'fulfilled' ? defi.value : null,
        marketStats: marketStats.status === 'fulfilled' ? marketStats.value : null,
        cryptoDetails: cryptoDetails.status === 'fulfilled' ? cryptoDetails.value : null,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('   [免费API] 获取增强数据失败:', error.message);
      return null;
    }
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️  [免费API] 缓存已清除');
  }
}

module.exports = new FreeAPIsService();
