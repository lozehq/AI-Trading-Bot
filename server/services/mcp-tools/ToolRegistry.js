/**
 * MCP工具注册表
 * 负责管理所有MCP工具的定义和元数据
 */

class ToolRegistry {
  constructor() {
    this.tools = {};
    this.initializeTools();
  }

  /**
   * 初始化所有MCP工具
   */
  initializeTools() {
    // CoinGecko MCP工具
    this.tools.coingecko = {
      name: 'CoinGecko',
      description: '获取加密货币市场数据、价格、历史数据',
      methods: {
        getCoinsMarkets: {
          description: '获取币种市场数据（价格、市值、成交量）',
          params: ['vsCurrency', 'order', 'perPage', 'page'],
          example: { vsCurrency: 'usd', perPage: 20 }
        },
        getMarketsData: {
          description: '获取市场数据列表',
          params: ['vsCurrency', 'order', 'perPage'],
          example: { vsCurrency: 'usd', order: 'market_cap_desc', perPage: 10 }
        },
        getCoinDetail: {
          description: '获取单个币种详细信息',
          params: ['coinId'],
          example: { coinId: 'bitcoin' }
        },
        getTopGainersLosers: {
          description: '获取涨跌幅排行榜',
          params: ['vsCurrency', 'duration'],
          example: { vsCurrency: 'usd', duration: '24h' }
        },
        getNewCoins: {
          description: '获取新上市币种',
          params: [],
          example: {}
        },
        getMarketSentiment: {
          description: '分析市场情绪（多空倾向）',
          params: [],
          example: {}
        },
        getAssetPlatforms: {
          description: '获取区块链平台列表',
          params: [],
          example: {}
        },
        getCoinsCategories: {
          description: '获取币种分类',
          params: [],
          example: {}
        }
      }
    };

    // CCXT MCP工具（交易所数据）
    this.tools.ccxt = {
      name: 'CCXT',
      description: '获取交易所实时数据',
      methods: {
        fetchTicker: {
          description: '获取实时价格',
          params: ['exchange', 'symbol'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT' }
        },
        fetchOHLCV: {
          description: '获取K线数据',
          params: ['exchange', 'symbol', 'timeframe', 'limit'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h', limit: 100 }
        },
        fetchOrderBook: {
          description: '获取订单簿深度',
          params: ['exchange', 'symbol', 'limit'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', limit: 20 }
        },
        fetchTrades: {
          description: '获取最近成交记录',
          params: ['exchange', 'symbol', 'limit'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', limit: 50 }
        },
        fetchBalance: {
          description: '获取账户余额',
          params: ['exchange'],
          example: { exchange: 'huobi' }
        },
        fetchTickers: {
          description: '批量获取多个交易对价格',
          params: ['exchange', 'symbols'],
          example: { exchange: 'huobi', symbols: ['BTC/USDT', 'ETH/USDT'] }
        },
        fetchTechnicalIndicators: {
          description: '获取技术指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        }
      }
    };

    // 技术指标工具
    this.tools.indicators = {
      name: 'Technical Indicators',
      description: '计算技术指标',
      methods: {
        getAllIndicators: {
          description: '获取所有基础技术指标（RSI、MACD、布林带、EMA）',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateKDJ: {
          description: 'KDJ随机指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateWilliamsR: {
          description: '威廉指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateParabolicSAR: {
          description: '抛物线SAR',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateATR: {
          description: '平均真实波幅',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateCCI: {
          description: '商品通道指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateIchimoku: {
          description: '一目均衡表',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateAroon: {
          description: 'Aroon指标',
          params: ['exchange', 'symbol', 'timeframe', 'period'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h', period: 25 }
        },
        calculateStochastic: {
          description: '随机指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateADX: {
          description: '平均趋向指数',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateOBV: {
          description: '能量潮指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateMFI: {
          description: '资金流量指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        }
      }
    };

    // AkTools MCP工具
    this.tools.aktools = {
      name: 'AkTools',
      description: 'AkTools高级数据工具',
      methods: {
        getOKXPrices: {
          description: '获取OKX K线数据',
          params: [],
          example: {}
        },
        getOKXLoanRatios: {
          description: '获取OKX多空借贷比',
          params: [],
          example: {}
        },
        getOKXTakerVolume: {
          description: '获取OKX主动交易量',
          params: [],
          example: {}
        },
        getBinanceAiReport: {
          description: '获取币安AI市场报告',
          params: [],
          example: {}
        },
        getCryptoNews: {
          description: '获取加密货币快讯',
          params: [],
          example: {}
        }
      }
    };

    // 扩展指标工具
    this.tools.mcp_extended_indicators = {
      name: 'MCP Extended Indicators',
      description: 'MCP扩展指标工具',
      methods: {
        calculateKDJ: {
          description: 'KDJ随机指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateWilliamsR: {
          description: '威廉指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateParabolicSAR: {
          description: '抛物线SAR',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateATR: {
          description: '平均真实波幅',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        },
        calculateCCI: {
          description: '商品通道指标',
          params: ['exchange', 'symbol', 'timeframe'],
          example: { exchange: 'huobi', symbol: 'ETH/USDT', timeframe: '1h' }
        }
      }
    };

    // Crypto Indicators MCP工具（高级技术指标）
    this.tools['crypto-indicators-mcp'] = {
      name: 'Crypto Indicators MCP',
      description: '加密货币高级技术指标（KDJ、Ichimoku、Aroon、PSAR）',
      methods: {
        calculate_kdj: {
          description: 'KDJ随机指标（K值、D值、J值）',
          params: ['symbol', 'timeframe'],
          example: { symbol: 'BTC/USDT', timeframe: '1h' }
        },
        calculate_ichimoku_cloud: {
          description: '一目均衡表（Ichimoku云图）',
          params: ['symbol', 'timeframe'],
          example: { symbol: 'BTC/USDT', timeframe: '1h' }
        },
        calculate_aroon: {
          description: 'Aroon指标（上升下降趋势）',
          params: ['symbol', 'timeframe'],
          example: { symbol: 'BTC/USDT', timeframe: '1h' }
        },
        calculate_parabolic_sar: {
          description: '抛物线SAR（趋势跟踪）',
          params: ['symbol', 'timeframe'],
          example: { symbol: 'BTC/USDT', timeframe: '1h' }
        }
      }
    };
  }

  /**
   * 获取所有工具列表
   */
  getToolsList() {
    return Object.keys(this.tools).map(toolId => ({
      id: toolId,
      name: this.tools[toolId].name,
      description: this.tools[toolId].description,
      methodCount: Object.keys(this.tools[toolId].methods).length
    }));
  }

  /**
   * 获取指定工具的信息
   */
  getTool(toolId) {
    return this.tools[toolId];
  }

  /**
   * 获取指定方法的信息
   */
  getMethod(toolId, methodName) {
    const tool = this.tools[toolId];
    if (!tool) {
      return null;
    }
    return tool.methods[methodName];
  }

  /**
   * 检查工具是否存在
   */
  hasTool(toolId) {
    return !!this.tools[toolId];
  }

  /**
   * 检查方法是否存在
   */
  hasMethod(toolId, methodName) {
    const tool = this.tools[toolId];
    if (!tool) {
      return false;
    }
    return !!tool.methods[methodName];
  }

  /**
   * 生成AI工具指南
   */
  getToolsGuideForAI() {
    let guide = '# MCP工具使用指南\n\n';
    guide += '你可以通过callTool函数调用以下工具：\n\n';

    for (const [toolId, tool] of Object.entries(this.tools)) {
      guide += `## ${tool.name} (${toolId})\n`;
      guide += `${tool.description}\n\n`;

      for (const [methodKey, method] of Object.entries(tool.methods)) {
        guide += `### ${methodKey}\n`;
        guide += `${method.description}\n`;
        guide += `参数: ${method.params.join(', ') || '无'}\n`;
        guide += `示例: callTool('${toolId}', '${methodKey}', ${JSON.stringify(method.example)})\n\n`;
      }

      guide += '\n';
    }

    return guide;
  }

  /**
   * 获取工具使用统计
   */
  getToolStats() {
    const stats = {};
    for (const [toolId, tool] of Object.entries(this.tools)) {
      stats[toolId] = {
        name: tool.name,
        methodCount: Object.keys(tool.methods).length,
        methods: Object.keys(tool.methods)
      };
    }
    return stats;
  }
}

module.exports = ToolRegistry;
