/**
 * CoinGecko MCP 工具集成
 * 获取币种信息、市场数据、历史数据等
 */

const mcpClient = require('./mcpClient');
const mcpLogger = require('./mcpLogger');
const axios = require('axios');

// CoinGecko MCP配置
const COINGECKO_CONFIG = {
  command: 'npx',
  args: ['mcp-remote', 'https://mcp.api.coingecko.com/mcp'],
  env: {},
  working_directory: null
};

class CoinGeckoMCPService {
  constructor() {
    this.initialized = false;
    this.toolName = 'coingecko_mcp';
    // ✅ 启用MCP模式，使用完整的CoinGecko MCP功能
    this.useMCP = true;
    this.apiBaseUrl = 'https://api.coingecko.com/api/v3';
  }

  /**
   * 初始化CoinGecko MCP
   */
  async initialize() {
    if (this.initialized) return;

    try {
      console.log('🦎 启动CoinGecko MCP工具...');
      await mcpClient.startMCPTool(this.toolName, COINGECKO_CONFIG);
      this.initialized = true;
      console.log('✅ CoinGecko MCP已就绪\n');
    } catch (error) {
      console.warn('⚠️  CoinGecko MCP启动失败:', error.message);
    }
  }

  /**
   * 获取币种市场数据（支持MCP模式和API降级）
   */
  async getCoinsMarkets(vsCurrency = 'usd', options = {}) {
    try {
      mcpLogger.info('coingecko_mcp', `获取币种市场数据 (${vsCurrency})`);
      
      // 优先尝试MCP模式
      if (this.useMCP) {
        try {
          const params = {
            vs_currency: vsCurrency,
            order: options.order || 'market_cap_desc',
            per_page: options.perPage || 20,
            page: options.page || 1,
            sparkline: options.sparkline || false,
            price_change_percentage: '24h'
          };
          
          const result = await mcpClient.sendMCPRequest(
            this.toolName,
            'get_coins_markets',
            params
          );
          
          mcpLogger.success('coingecko_mcp', `✓ 获取${params.per_page}个币种数据 (MCP模式)`);
          return result;
        } catch (error) {
          console.warn(`⚠️ MCP调用失败，使用API降级: ${error.message}`);
        }
      }
      
      // 降级方案：直接调用CoinGecko API（真实数据）
      const params = {
        vs_currency: vsCurrency,
        order: options.order || 'market_cap_desc',
        per_page: options.perPage || 20,
        page: options.page || 1,
        price_change_percentage: '24h'
      };
      
      const response = await axios.get(`${this.apiBaseUrl}/coins/markets`, {
        params,
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });
      
      mcpLogger.success('coingecko_mcp', `✓ 获取${response.data.length}个币种真实数据 (API降级)`);
      return response.data;
    } catch (error) {
      mcpLogger.error('coingecko_mcp', `获取市场数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取单个币种详细信息（支持MCP模式和API降级）
   */
  async getCoinDetail(coinId) {
    try {
      mcpLogger.info('coingecko_mcp', `获取${coinId}详情`);
      
      // 优先尝试MCP模式
      if (this.useMCP) {
        try {
          const result = await mcpClient.sendMCPRequest(
            this.toolName,
            'get_id_coins',
            { id: coinId }
          );
          
          mcpLogger.success('coingecko_mcp', `✓ ${coinId}详情获取成功 (MCP模式)`);
          return result;
        } catch (error) {
          console.warn(`⚠️ MCP调用失败，使用API降级: ${error.message}`);
        }
      }
      
      // 降级方案：直接调用CoinGecko API（真实数据）
      const response = await axios.get(`${this.apiBaseUrl}/coins/${coinId}`, {
        params: {
          localization: false,
          tickers: true,
          market_data: true,
          community_data: true,
          developer_data: false
        },
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });
      
      const data = response.data;
      mcpLogger.success('coingecko_mcp', `✓ ${coinId}: 排名#${data.market_cap_rank} (API降级)`);
      return data;
    } catch (error) {
      mcpLogger.warning('coingecko_mcp', `获取${coinId}详情失败: ${error.message}`);
      return null; // 不中断整个分析流程
    }
  }

  /**
   * 获取涨跌幅榜单（支持MCP模式和API降级）
   */
  async getTopGainersLosers(vsCurrency = 'usd', duration = '24h') {
    try {
      mcpLogger.info('coingecko_mcp', `获取涨跌榜 (${duration})`);
      
      // 优先尝试MCP模式
      if (this.useMCP) {
        try {
          const result = await mcpClient.sendMCPRequest(
            this.toolName,
            'get_coins_top_gainers_losers',
            {
              vs_currency: vsCurrency,
              duration,
              top_coins: '1000'
            }
          );
          
          mcpLogger.success('coingecko_mcp', `✓ 涨跌榜获取成功 (MCP模式)`);
          return result;
        } catch (error) {
          console.warn(`⚠️ MCP调用失败，使用API降级: ${error.message}`);
        }
      }
      
      // 降级方案：通过API获取并排序（真实数据）
      const response = await axios.get(`${this.apiBaseUrl}/coins/markets`, {
        params: {
          vs_currency: vsCurrency,
          order: 'market_cap_desc',
          per_page: 250,
          page: 1,
          price_change_percentage: '24h'
        },
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });
      
      const sorted = response.data.sort((a, b) => 
        (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0)
      );
      
      const result = {
        top_gainers: sorted.slice(0, 30).map(coin => ({
          id: coin.id,
          symbol: coin.symbol?.toUpperCase(),
          name: coin.name,
          usd: coin.current_price,
          usd_24h_change: coin.price_change_percentage_24h
        })),
        top_losers: sorted.slice(-30).reverse().map(coin => ({
          id: coin.id,
          symbol: coin.symbol?.toUpperCase(),
          name: coin.name,
          usd: coin.current_price,
          usd_24h_change: coin.price_change_percentage_24h
        }))
      };
      
      mcpLogger.success('coingecko_mcp', `✓ 涨跌榜: ${result.top_gainers.length}个涨/${result.top_losers.length}个跌 (API降级)`);
      return result;
    } catch (error) {
      mcpLogger.warning('coingecko_mcp', `获取涨跌榜失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取新上市币种（真实CoinGecko数据）
   */
  async getNewCoins() {
    try {
      mcpLogger.info('coingecko_mcp', '获取真实新上市币种');
      
      // 注意：CoinGecko免费API没有专门的"新币"端点
      // 我们获取最近上市且市值较小的币种（这是真实数据，不是模拟）
      const response = await axios.get(`${this.apiBaseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'gecko_desc', // CoinGecko评分排序
          per_page: 50,
          page: 1
        },
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });
      
      // 过滤出市值排名较低的（通常是新币）
      const result = response.data
        .filter(coin => coin.market_cap_rank > 200)
        .slice(0, 20)
        .map(coin => ({
          id: coin.id,
          symbol: coin.symbol?.toUpperCase(),
          name: coin.name,
          market_cap_rank: coin.market_cap_rank
        }));
      
      mcpLogger.success('coingecko_mcp', `✓ 获取${result.length}个真实新币数据`);
      return result;
    } catch (error) {
      mcpLogger.warning('coingecko_mcp', `获取新币失败: ${error.message}`);
      console.warn('获取新币列表失败:', error.message);
      return null;
    }
  }

  /**
   * 获取市场情绪数据
   */
  async getMarketSentiment() {
    try {
      mcpLogger.info('coingecko_mcp', '分析市场情绪');
      // 通过涨跌榜分析市场情绪
      const gainersLosers = await this.getTopGainersLosers();
      
      if (!gainersLosers) {
        return null;
      }
      
      const topGainers = gainersLosers.top_gainers || [];
      const topLosers = gainersLosers.top_losers || [];
      
      const avgGain = topGainers.length > 0 
        ? topGainers.reduce((sum, coin) => sum + (coin.usd_24h_change || 0), 0) / topGainers.length
        : 0;
        
      const avgLoss = topLosers.length > 0
        ? topLosers.reduce((sum, coin) => sum + (coin.usd_24h_change || 0), 0) / topLosers.length
        : 0;

      const sentiment = avgGain + avgLoss > 0 ? 'BULLISH' : 'BEARISH';
      const strength = Math.abs(avgGain + avgLoss);

      const result = {
        sentiment,
        strength,
        avgGain: Number(avgGain.toFixed(2)),
        avgLoss: Number(avgLoss.toFixed(2)),
        topGainers: topGainers.slice(0, 5),
        topLosers: topLosers.slice(0, 5),
        timestamp: Date.now()
      };
      
      mcpLogger.success('coingecko_mcp', `✓ 市场情绪: ${sentiment} (涨${result.avgGain}% 跌${result.avgLoss}%)`);
      return result;
    } catch (error) {
      console.error('获取市场情绪失败:', error.message);
      return null;
    }
  }
}

module.exports = new CoinGeckoMCPService();

