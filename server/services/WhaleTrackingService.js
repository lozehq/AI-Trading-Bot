/**
 * 巨鲸地址监控服务
 * 追踪大额转账、交易所流入流出、巨鲸持仓变化
 */

const axios = require('axios');
const EventEmitter = require('events');

class WhaleTrackingService extends EventEmitter {
  constructor() {
    super();
    this.recentTransactions = [];
    this.maxTransactions = 100;
    this.minWhaleAmount = {
      BTC: 10,      // 10 BTC 以上算巨鲸
      ETH: 100,     // 100 ETH 以上算巨鲸
      USDT: 1000000 // 100万 USDT 以上算巨鲸
    };
    
    // 已知交易所钱包地址（示例，实际需要更完整的列表）
    this.exchangeAddresses = new Set([
      // Binance
      '0x28C6c06298d514Db089934071355E5743bf21d60',
      '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549',
      // Coinbase
      '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3',
      '0x503828976D22510aad0201ac7EC88293211D23Da',
      // Huobi
      '0xAB5C66752a9e8167967685F1450532fB96d5d24f',
      '0x6748F50f686bfbcA6Fe8ad62b22228b87F31ff2b',
      // OKX
      '0x5041ed759Dd4aFc3a72b8192C143F72f4724081A',
      '0x236F9F97e0E62388479bf9E5BA4889e46B0273C3'
    ]);
    
    // 缓存
    this.cache = {
      whaleAlert: { data: null, timestamp: 0, ttl: 60000 },      // 1分钟
      exchangeFlow: { data: null, timestamp: 0, ttl: 300000 },   // 5分钟
      topHolders: { data: null, timestamp: 0, ttl: 3600000 }     // 1小时
    };
  }

  /**
   * 获取Whale Alert最近交易
   * https://whale-alert.io/
   */
  async getWhaleAlertTransactions(limit = 50) {
    try {
      const now = Date.now();
      if (this.cache.whaleAlert.data && (now - this.cache.whaleAlert.timestamp) < this.cache.whaleAlert.ttl) {
        return this.cache.whaleAlert.data;
      }

      // Whale Alert 免费API（需要注册获取API密钥）
      const apiKey = process.env.WHALE_ALERT_API_KEY;
      
      if (!apiKey) {
        console.warn('⚠️ WHALE_ALERT_API_KEY not configured, using fallback data source');
        return await this.getWhaleAlertFallback();
      }

      const response = await axios.get('https://api.whale-alert.io/v1/transactions', {
        params: {
          api_key: apiKey,
          min_value: 500000, // 最小50万美元
          limit: limit
        },
        timeout: 10000
      });

      if (response.data && response.data.transactions) {
        const transactions = response.data.transactions.map(tx => this.parseWhaleTransaction(tx));
        
        this.cache.whaleAlert.data = transactions;
        this.cache.whaleAlert.timestamp = now;
        
        // 发送告警事件
        transactions.forEach(tx => {
          if (tx.amountUsd > 5000000) { // 500万美元以上
            this.emit('largeTransaction', tx);
          }
        });
        
        return transactions;
      }

      return [];
    } catch (error) {
      console.error('❌ Whale Alert API failed:', error.message);
      return await this.getWhaleAlertFallback();
    }
  }

  /**
   * 解析巨鲸交易
   */
  parseWhaleTransaction(tx) {
    const isExchangeInflow = this.exchangeAddresses.has(tx.to?.owner);
    const isExchangeOutflow = this.exchangeAddresses.has(tx.from?.owner);
    
    let type = 'TRANSFER';
    if (isExchangeInflow) type = 'EXCHANGE_INFLOW';
    if (isExchangeOutflow) type = 'EXCHANGE_OUTFLOW';
    if (isExchangeInflow && isExchangeOutflow) type = 'EXCHANGE_INTERNAL';
    
    return {
      id: tx.id || tx.hash,
      hash: tx.hash,
      blockchain: tx.blockchain,
      symbol: tx.symbol,
      amount: parseFloat(tx.amount),
      amountUsd: parseFloat(tx.amount_usd),
      from: {
        address: tx.from?.address,
        owner: tx.from?.owner || 'unknown',
        ownerType: tx.from?.owner_type || 'unknown'
      },
      to: {
        address: tx.to?.address,
        owner: tx.to?.owner || 'unknown',
        ownerType: tx.to?.owner_type || 'unknown'
      },
      type: type,
      timestamp: tx.timestamp * 1000,
      datetime: new Date(tx.timestamp * 1000).toISOString(),
      signal: this.analyzeWhaleSignal(type, parseFloat(tx.amount_usd), tx.symbol)
    };
  }

  /**
   * 分析巨鲸信号
   */
  analyzeWhaleSignal(type, amountUsd, symbol) {
    let signal = 'NEUTRAL';
    let strength = 'LOW';
    let description = '';
    
    // 判断金额强度
    if (amountUsd > 10000000) strength = 'EXTREME';
    else if (amountUsd > 5000000) strength = 'HIGH';
    else if (amountUsd > 1000000) strength = 'MEDIUM';
    
    // 分析信号
    switch(type) {
      case 'EXCHANGE_INFLOW':
        signal = 'BEARISH';
        description = `${strength} 卖压：${(amountUsd / 1000000).toFixed(2)}M 流入交易所`;
        break;
      case 'EXCHANGE_OUTFLOW':
        signal = 'BULLISH';
        description = `${strength} 买盘：${(amountUsd / 1000000).toFixed(2)}M 流出交易所`;
        break;
      case 'TRANSFER':
        signal = 'NEUTRAL';
        description = `${strength} 转账：${(amountUsd / 1000000).toFixed(2)}M 钱包间转移`;
        break;
    }
    
    return { signal, strength, description };
  }

  /**
   * Whale Alert备用数据源（使用Blockchain.info + 自定义逻辑）
   */
  async getWhaleAlertFallback() {
    try {
      console.log('🐋 Using fallback whale tracking (Blockchain.info)...');
      
      // 获取最近的大额交易
      const response = await axios.get('https://blockchain.info/unconfirmed-transactions?format=json', {
        timeout: 10000
      });
      
      if (response.data && response.data.txs) {
        const largeTxs = response.data.txs
          .filter(tx => {
            // 计算BTC金额（单位：聪）
            const btcAmount = tx.out.reduce((sum, out) => sum + out.value, 0) / 100000000;
            return btcAmount >= this.minWhaleAmount.BTC;
          })
          .slice(0, 20)
          .map(tx => ({
            id: tx.hash,
            hash: tx.hash,
            blockchain: 'bitcoin',
            symbol: 'BTC',
            amount: tx.out.reduce((sum, out) => sum + out.value, 0) / 100000000,
            amountUsd: (tx.out.reduce((sum, out) => sum + out.value, 0) / 100000000) * 100000, // 假设BTC价格
            from: { address: tx.inputs[0]?.prev_out?.addr || 'unknown', owner: 'unknown', ownerType: 'unknown' },
            to: { address: tx.out[0]?.addr || 'unknown', owner: 'unknown', ownerType: 'unknown' },
            type: 'TRANSFER',
            timestamp: tx.time * 1000,
            datetime: new Date(tx.time * 1000).toISOString(),
            signal: { signal: 'NEUTRAL', strength: 'MEDIUM', description: 'Large BTC transaction' },
            source: 'blockchain.info_fallback'
          }));
        
        return largeTxs;
      }
      
      return [];
    } catch (error) {
      console.error('❌ Whale tracking fallback failed:', error.message);
      return [];
    }
  }

  /**
   * 获取交易所净流量（聚合数据）
   */
  async getExchangeNetFlow(asset = 'BTC', period = '24h') {
    try {
      const now = Date.now();
      const cacheKey = `${asset}_${period}`;
      
      if (this.cache.exchangeFlow.data?.[cacheKey] && 
          (now - this.cache.exchangeFlow.timestamp) < this.cache.exchangeFlow.ttl) {
        return this.cache.exchangeFlow.data[cacheKey];
      }

      // 尝试Glassnode API
      if (process.env.GLASSNODE_API_KEY) {
        const response = await axios.get('https://api.glassnode.com/v1/metrics/transactions/transfers_volume_exchanges_net', {
          params: {
            a: asset,
            api_key: process.env.GLASSNODE_API_KEY,
            i: period === '24h' ? '24h' : '1h',
            s: Math.floor((Date.now() - 86400000) / 1000), // 最近24小时
            u: Math.floor(Date.now() / 1000)
          },
          timeout: 15000
        });
        
        if (response.data && response.data.length > 0) {
          const latest = response.data[response.data.length - 1];
          const netFlow = parseFloat(latest.v);
          
          const result = {
            asset,
            period,
            netFlow: netFlow,
            inflowTotal: Math.abs(Math.min(netFlow, 0)),
            outflowTotal: Math.max(netFlow, 0),
            signal: netFlow < -100 ? 'BEARISH' : netFlow > 100 ? 'BULLISH' : 'NEUTRAL',
            timestamp: latest.t * 1000,
            source: 'glassnode'
          };
          
          if (!this.cache.exchangeFlow.data) this.cache.exchangeFlow.data = {};
          this.cache.exchangeFlow.data[cacheKey] = result;
          this.cache.exchangeFlow.timestamp = now;
          
          return result;
        }
      }
      
      // 备用：基于Whale Alert数据计算
      const transactions = await this.getWhaleAlertTransactions();
      const inflow = transactions
        .filter(tx => tx.type === 'EXCHANGE_INFLOW' && tx.symbol === asset)
        .reduce((sum, tx) => sum + tx.amount, 0);
      const outflow = transactions
        .filter(tx => tx.type === 'EXCHANGE_OUTFLOW' && tx.symbol === asset)
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      return {
        asset,
        period: '1h',
        netFlow: inflow - outflow,
        inflowTotal: inflow,
        outflowTotal: outflow,
        signal: (inflow - outflow) > 50 ? 'BEARISH' : (outflow - inflow) > 50 ? 'BULLISH' : 'NEUTRAL',
        timestamp: Date.now(),
        source: 'whale_alert_aggregated'
      };
      
    } catch (error) {
      console.error('❌ Exchange net flow failed:', error.message);
      return null;
    }
  }

  /**
   * 获取持仓前100地址
   */
  async getTopHolders(asset = 'BTC', limit = 100) {
    try {
      const now = Date.now();
      if (this.cache.topHolders.data && (now - this.cache.topHolders.timestamp) < this.cache.topHolders.ttl) {
        return this.cache.topHolders.data;
      }

      // 使用BitInfoCharts API（免费）
      const response = await axios.get(`https://bitinfocharts.com/top-100-richest-${asset.toLowerCase()}-addresses.html`, {
        timeout: 15000
      });
      
      // 注意：需要HTML解析，这里简化处理
      // 生产环境建议使用cheerio或puppeteer解析
      
      return {
        asset,
        topHolders: [],
        message: 'Top holders data requires HTML parsing (use Glassnode API for production)',
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error('❌ Top holders failed:', error.message);
      return null;
    }
  }

  /**
   * 获取完整巨鲸监控报告
   */
  async getWhaleReport(asset = 'BTC') {
    const [transactions, netFlow] = await Promise.all([
      this.getWhaleAlertTransactions(50),
      this.getExchangeNetFlow(asset)
    ]);
    
    // 统计分析
    const last24h = Date.now() - 86400000;
    const recentTxs = transactions.filter(tx => tx.timestamp > last24h);
    
    const stats = {
      totalTransactions: recentTxs.length,
      totalVolume: recentTxs.reduce((sum, tx) => sum + tx.amountUsd, 0),
      exchangeInflowCount: recentTxs.filter(tx => tx.type === 'EXCHANGE_INFLOW').length,
      exchangeOutflowCount: recentTxs.filter(tx => tx.type === 'EXCHANGE_OUTFLOW').length,
      largestTransaction: recentTxs.reduce((max, tx) => tx.amountUsd > max.amountUsd ? tx : max, { amountUsd: 0 }),
      sentiment: netFlow?.signal || 'NEUTRAL'
    };
    
    return {
      asset,
      transactions: recentTxs.slice(0, 20), // 最近20笔
      netFlow,
      stats,
      timestamp: Date.now(),
      alerts: this.generateAlerts(stats, netFlow)
    };
  }

  /**
   * 生成告警
   */
  generateAlerts(stats, netFlow) {
    const alerts = [];
    
    // 大额流入告警
    if (netFlow && netFlow.inflowTotal > 1000) {
      alerts.push({
        type: 'LARGE_INFLOW',
        severity: 'HIGH',
        message: `⚠️ 检测到大额流入：${netFlow.inflowTotal.toFixed(2)} ${netFlow.asset} 流入交易所`,
        recommendation: '市场可能面临卖压，建议谨慎'
      });
    }
    
    // 大额流出告警
    if (netFlow && netFlow.outflowTotal > 1000) {
      alerts.push({
        type: 'LARGE_OUTFLOW',
        severity: 'MEDIUM',
        message: `✅ 检测到大额流出：${netFlow.outflowTotal.toFixed(2)} ${netFlow.asset} 流出交易所`,
        recommendation: '巨鲸囤积，可能看涨'
      });
    }
    
    // 异常活跃告警
    if (stats.totalTransactions > 50) {
      alerts.push({
        type: 'HIGH_ACTIVITY',
        severity: 'MEDIUM',
        message: `📊 巨鲸活动异常频繁：24小时内${stats.totalTransactions}笔大额交易`,
        recommendation: '市场可能有重大变化，密切关注'
      });
    }
    
    return alerts;
  }

  /**
   * 启动实时监控（WebSocket模拟）
   */
  startMonitoring(interval = 60000) {
    console.log('🐋 Starting whale tracking monitoring...');
    
    this.monitoringInterval = setInterval(async () => {
      try {
        const report = await this.getWhaleReport('BTC');
        this.emit('whaleReport', report);
        
        // 发送告警
        if (report.alerts && report.alerts.length > 0) {
          report.alerts.forEach(alert => {
            this.emit('whaleAlert', alert);
          });
        }
      } catch (error) {
        console.error('❌ Whale monitoring error:', error.message);
      }
    }, interval);
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      console.log('🛑 Whale tracking monitoring stopped');
    }
  }
}

// 单例模式
const whaleTrackingService = new WhaleTrackingService();

module.exports = whaleTrackingService;
