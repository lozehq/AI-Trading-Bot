/**
 * 账户状态服务 - 聚合账户余额、持仓、交易绩效等信息
 * 用于AI分析时提供完整的账户上下文
 */

const dayjs = require('dayjs');

class AccountStateService {
  constructor() {
    this.okxTradingService = null; // 延迟加载，避免循环依赖
    this.db = null;
  }

  /**
   * 获取完整的账户状态信息
   * @param {string} exchange - 交易所名称（默认 'okx'）
   * @param {string} symbol - 交易对符号（用于获取当前持仓）
   * @returns {Object} 账户状态对象
   */
  async getAccountState(exchange = 'okx', symbol = null) {
    try {
      console.log(`开始获取账户状态 - 交易所: ${exchange}, 交易对: ${symbol || '全部'}`);
      
      // 延迟加载服务，避免循环依赖
      if (!this.okxTradingService) {
        this.okxTradingService = require('./exchange/OkxTradingService');
      }
      if (!this.db) {
        const { getDatabase } = require('../database/database');
        this.db = getDatabase();
      }

      const accountState = {
        balance: null,
        positions: [],
        recentTrades: [],
        riskControl: null,
        positionSummary: null,
        executionQuality: null
      };

      const mode = (process.env.TRADING_MODE || 'paper').toLowerCase();

      // 1. 获取账户余额信息
      try {
        console.log('获取账户余额信息...');
        const balance = await this.fetchBalance(exchange, mode);
        accountState.balance = balance;
        console.log('账户余额获取成功:', balance ? '有数据' : '无数据');
      } catch (error) {
        console.warn('获取账户余额失败:', error.message);
      }

      // 2. 获取当前持仓
      try {
        console.log('获取持仓信息...');
        const positions = await this.fetchPositions(exchange, symbol, mode);
        accountState.positions = positions;
        console.log(`持仓信息获取成功: ${positions.length} 个持仓`);
      } catch (error) {
        console.warn('获取持仓信息失败:', error.message);
      }

      // 3. 获取最近交易记录（用于计算胜率等绩效指标）
      try {
        console.log('获取交易记录...');
        const recentTrades = await this.fetchRecentTrades(10);
        accountState.recentTrades = recentTrades;
        console.log(`交易记录获取成功: ${recentTrades.length} 条记录`);
      } catch (error) {
        console.warn('获取交易记录失败:', error.message);
      }

      // 4. 增强持仓数据（实时盈亏监控）
      if (accountState.positions && accountState.positions.length > 0) {
        try {
          console.log('增强持仓数据...');
          const positionMonitor = require('./positionMonitorService');

          // 获取当前价格
          const currentPrices = await this.fetchCurrentPrices(accountState.positions, exchange);
          console.log(`获取到 ${Object.keys(currentPrices).length} 个交易对的价格`);

          // 增强持仓数据
          accountState.positions = positionMonitor.enhancePositions(
            accountState.positions,
            currentPrices
          );

          // 计算持仓汇总
          accountState.positionSummary = positionMonitor.calculatePositionSummary(
            accountState.positions
          );
          console.log('持仓数据增强完成');
        } catch (error) {
          console.warn('增强持仓数据失败:', error.message);
        }
      }

      // 5. 增强余额数据（资金管理监控）
      if (accountState.balance) {
        try {
          console.log('增强余额数据...');
          const fundManagement = require('./fundManagementService');
          accountState.balance = fundManagement.enhanceBalance(
            accountState.balance,
            accountState.positions
          );
          console.log('余额数据增强完成');
        } catch (error) {
          console.warn('增强余额数据失败:', error.message);
        }
      }

      // 6. 计算高级风险控制指标
      try {
        console.log('计算风险控制指标...');
        const riskControl = require('./riskControlService');
        accountState.riskControl = riskControl.calculateRiskMetrics(
          accountState.balance,
          accountState.positions,
          accountState.recentTrades
        );
        console.log('风险控制指标计算完成');
      } catch (error) {
        console.warn('计算高级风险指标失败:', error.message);
      }

      // 7. 获取执行质量统计
      try {
        console.log('获取执行质量统计...');
        const executionQuality = require('./executionQualityService');
        accountState.executionQuality = executionQuality.getExecutionStatistics('24h');
        console.log('执行质量统计获取完成');
      } catch (error) {
        console.warn('获取执行质量统计失败:', error.message);
      }

      console.log('账户状态获取完成');
      return accountState;

    } catch (error) {
      console.error('获取账户状态失败:', error);
      return null;
    }
  }

  /**
   * 获取账户余额信息
   */
  async fetchBalance(exchange, mode = 'paper') {
    // paper/demo 模式：读取本地TradingEngine账户
    const isPaper = (mode || '').toLowerCase() === 'paper' || (mode || '').toLowerCase() === 'demo';
    if (isPaper) {
      try {
        const getTradingEngine = require('./tradingEngineInstance');
        const engine = getTradingEngine();
        const total = Number(engine.accountBalance || 0) || 0;
        return {
          totalEquity: total,
          availableBalance: total, // 简化：无保证金占用
          usedMargin: 0,
          marginRatio: 0,
          leverage: 1,
          timestamp: Date.now()
        };
      } catch (e) {
        console.warn('paper/demo 模式读取本地余额失败:', e.message);
      }
    }

    if (exchange === 'okx') {
      try {
        // 调用OKX交易服务获取真实余额
        const okxTradingService = require('./exchange/OkxTradingService');
        const balance = await okxTradingService.fetchBalance({ mode: 'live' });
        
        if (balance && !balance.paper) {
          // 真实账户数据
          return {
            totalEquity: balance.total || balance.totalEquity || 0,
            availableBalance: balance.free?.USDT || balance.availableBalance || 0,
            usedMargin: balance.used?.USDT || balance.usedMargin || 0,
            marginRatio: balance.marginRatio || 0,
            leverage: balance.leverage || 1,
            timestamp: Date.now()
          };
        }
        // 如果返回paper模式数据，视为无效
        return null;
      } catch (error) {
        console.error('获取OKX余额失败:', error.message);
        return null;
      }
    }
    throw new Error(`不支持的交易所: ${exchange}`);
  }

  /**
   * 获取当前持仓列表
   */
  async fetchPositions(exchange, symbol, mode = 'paper') {
    const isPaper = (mode || '').toLowerCase() === 'paper' || (mode || '').toLowerCase() === 'demo';
    if (isPaper) {
      try {
        const getTradingEngine = require('./tradingEngineInstance');
        const engine = getTradingEngine();
        const raw = engine.getPositions ? engine.getPositions() : (engine.positions || []);
        const formatted = raw.map(t => this.formatPosition({
          symbol: t.symbol,
          side: (t.side || '').toString().toLowerCase() === 'sell' ? 'short' : 'long',
          contracts: t.amount,
          entryPrice: t.entryPrice,
          currentPrice: t.currentPrice,
          unrealizedPnl: t.unrealizedPnl || 0,
          leverage: t.leverage || 1,
          liquidationPrice: t.liquidationPrice,
          openTime: t.timestamp
        }));
        return formatted;
      } catch (e) {
        console.warn('paper/demo 模式读取本地持仓失败:', e.message);
        return [];
      }
    }

    if (exchange === 'okx') {
      try {
        console.log(`从OKX获取持仓 - 交易对: ${symbol || '全部'}`);
        // 调用OKX服务获取持仓
        const positions = await this.okxTradingService.fetchPositions({ symbol, mode: 'live' });
        console.log(`从OKX获取到 ${positions?.length || 0} 个持仓`);

        // 格式化持仓数据
        const formattedPositions = positions.map(pos => this.formatPosition(pos));
        console.log('持仓数据格式化完成');
        return formattedPositions;
      } catch (error) {
        console.warn('从OKX获取持仓失败:', error.message);
        return [];
      }
    }
    console.warn(`不支持的交易所: ${exchange}`);
    return [];
  }

  /**
   * 格式化持仓数据
   */
  formatPosition(position) {
    const holdTime = position.openTime
      ? this.calculateHoldTime(position.openTime)
      : '未知';

    return {
      symbol: position.symbol,
      side: position.side, // 'long' or 'short'
      size: position.contracts || position.amount,
      entryPrice: position.entryPrice || position.avgPrice,
      currentPrice: position.markPrice || position.currentPrice,
      unrealizedPnl: position.unrealizedPnl || 0,
      unrealizedPnlPercent: position.unrealizedPnlPercent ||
        (position.unrealizedPnl && position.entryPrice
          ? (position.unrealizedPnl / (position.entryPrice * position.contracts)) * 100
          : 0),
      leverage: position.leverage,
      liquidationPrice: position.liquidationPrice,
      holdTime
    };
  }

  /**
   * 计算持仓时长
   */
  calculateHoldTime(openTime) {
    const now = dayjs();
    const open = dayjs(openTime);
    const hours = now.diff(open, 'hour');
    const minutes = now.diff(open, 'minute') % 60;

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}天${hours % 24}小时`;
    } else if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    } else {
      return `${minutes}分钟`;
    }
  }

  /**
   * 获取当前价格（用于实时盈亏计算）
   */
  async fetchCurrentPrices(positions, exchange) {
    const currentPrices = {};

    if (!positions || positions.length === 0) {
      console.log('没有持仓需要获取价格');
      return currentPrices;
    }

    try {
      const dataSourceManager = require('./dataSourceManager');
      console.log(`开始获取 ${positions.length} 个持仓的当前价格`);

      for (const position of positions) {
        try {
          console.log(`获取 ${position.symbol} 价格...`);
          const ticker = await dataSourceManager.getTicker(exchange, position.symbol);
          const price = ticker?.last || ticker?.price;
          if (price && typeof price === 'number' && price > 0) {
            currentPrices[position.symbol] = price;
            console.log(`获取 ${position.symbol} 价格成功: ${price}`);
          } else if (position.currentPrice) {
            // 回退：使用持仓中的当前价格
            currentPrices[position.symbol] = position.currentPrice;
            console.log(`使用持仓中的价格 ${position.symbol}: ${position.currentPrice}`);
          } else {
            console.warn(`无法获取 ${position.symbol} 的价格，跳过`);
          }
        } catch (error) {
          console.warn(`获取 ${position.symbol} 价格失败:`, error.message);
          // 回退：使用持仓中的当前价格
          if (position.currentPrice) {
            currentPrices[position.symbol] = position.currentPrice;
            console.log(`使用持仓中的价格作为回退 ${position.symbol}: ${position.currentPrice}`);
          }
        }
      }
    } catch (error) {
      console.warn('获取当前价格失败:', error.message);
    }

    console.log(`成功获取 ${Object.keys(currentPrices).length} 个交易对的价格`);
    return currentPrices;
  }

  /**
   * 获取最近N笔已平仓交易记录
   */
  async fetchRecentTrades(limit = 10) {
    try {
      // 检查数据库是否已初始化
      if (!this.db) {
        console.warn('数据库未初始化，无法获取交易记录');
        return [];
      }

      // 从数据库获取最近的交易记录
      const trades = this.db.prepare(`
        SELECT
          symbol,
          side,
          entry_price as entryPrice,
          exit_price as exitPrice,
          pnl,
          pnl_percent as pnlPercent,
          exit_time as exitTime,
          exit_reason as exitReason
        FROM trade_history
        WHERE exit_time IS NOT NULL
        ORDER BY exit_time DESC
        LIMIT ?
      `).all(Math.max(1, parseInt(limit, 10) || 10));

      return trades;
    } catch (error) {
      console.warn('从数据库获取交易记录失败:', error.message);
      // 如果是表不存在的错误，给出更明确的提示
      if (error.message && error.message.includes('no such table')) {
        console.warn('trade_history 表不存在，请先创建该表');
      }
      return [];
    }
  }

  /**
   * 计算风险控制指标
   */
  async calculateRiskMetrics(accountState) {
    const { balance, recentTrades } = accountState;

    const metrics = {
      maxDrawdown: 0,
      currentDrawdown: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      dailyPnl: 0,
      dailyPnlPercent: 0
    };

    if (!recentTrades || recentTrades.length === 0) {
      return metrics;
    }

    // 计算连续盈亏
    let currentStreak = 0;
    let isWinning = null;
    for (const trade of recentTrades) {
      if (trade.pnl > 0) {
        if (isWinning === true) {
          currentStreak++;
        } else {
          isWinning = true;
          currentStreak = 1;
        }
      } else if (trade.pnl < 0) {
        if (isWinning === false) {
          currentStreak++;
        } else {
          isWinning = false;
          currentStreak = 1;
        }
      }
    }

    if (isWinning === true) {
      metrics.consecutiveWins = currentStreak;
    } else if (isWinning === false) {
      metrics.consecutiveLosses = currentStreak;
    }

    // 计算今日盈亏
    const today = dayjs().format('YYYY-MM-DD');
    const todayTrades = recentTrades.filter(trade => {
      return trade.exitTime && dayjs(trade.exitTime).format('YYYY-MM-DD') === today;
    });

    metrics.dailyPnl = todayTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    if (balance && balance.totalEquity) {
      metrics.dailyPnlPercent = (metrics.dailyPnl / balance.totalEquity) * 100;
    }

    // 计算最大回撤（简化版，基于最近交易）
    let peak = 0;
    let currentEquity = balance?.totalEquity || 0;
    recentTrades.forEach(trade => {
      currentEquity -= (trade.pnl || 0);
      peak = Math.max(peak, currentEquity);
    });
    if (peak > 0) {
      metrics.currentDrawdown = ((peak - (balance?.totalEquity || 0)) / peak) * 100;
      metrics.maxDrawdown = metrics.currentDrawdown; // 简化：这里应该从历史最高点计算
    }

    return metrics;
  }
}

module.exports = new AccountStateService();
