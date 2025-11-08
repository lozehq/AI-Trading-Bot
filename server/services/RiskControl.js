/**
 * 风险控制系统
 * 实现日损失限制、最大回撤、单笔损失、滑点保护等15项风控
 */

const okxTrading = require('./exchange/OkxTradingService');
const EventEmitter = require('events');
const { getConfig, setConfig } = require('../database/database');
const SafeNumber = require('../utils/safeNumber');

class RiskControl extends EventEmitter {
  constructor() {
    super();

    // 风控配置 (可从环境变量或数据库读取)
    const persisted = (() => {
      try {
        return getConfig && getConfig('risk_control');
      } catch(e) {
        console.error('[风控] 读取持久化配置失败:', e.message);
        return null;
      }
    })() || {};
    this.config = {
      // 资金安全层 (P0)
      MAX_DAILY_LOSS_PERCENT: persisted.MAX_DAILY_LOSS_PERCENT ?? SafeNumber.parseFloat(process.env.MAX_DAILY_LOSS_PERCENT, 2.0),
      MAX_DRAWDOWN_PERCENT: persisted.MAX_DRAWDOWN_PERCENT ?? SafeNumber.parseFloat(process.env.MAX_DRAWDOWN_PERCENT, 10.0),
      MAX_LOSS_PER_TRADE_PERCENT: persisted.MAX_LOSS_PER_TRADE_PERCENT ?? SafeNumber.parseFloat(process.env.MAX_LOSS_PER_TRADE_PERCENT, 1.0),
      MAX_POSITION_RATIO: persisted.MAX_POSITION_RATIO ?? SafeNumber.parseFloat(process.env.MAX_POSITION_RATIO, 0.8),
      MAX_DAILY_TRADES: persisted.MAX_DAILY_TRADES ?? SafeNumber.parseInt(process.env.MAX_DAILY_TRADES, 20),

      // 订单执行层 (P1)
      MAX_SLIPPAGE_PERCENT: persisted.MAX_SLIPPAGE_PERCENT ?? SafeNumber.parseFloat(process.env.MAX_SLIPPAGE_PERCENT, 0.5),
      MAX_PRICE_DEVIATION_PERCENT: persisted.MAX_PRICE_DEVIATION_PERCENT ?? SafeNumber.parseFloat(process.env.MAX_PRICE_DEVIATION_PERCENT, 5.0),
      MAX_CONSECUTIVE_LOSSES: persisted.MAX_CONSECUTIVE_LOSSES ?? SafeNumber.parseInt(process.env.MAX_CONSECUTIVE_LOSSES, 5),
      MIN_CONFIDENCE: persisted.MIN_CONFIDENCE ?? SafeNumber.parseFloat(process.env.MIN_CONFIDENCE, 70),

      // 市场监控层 (P2)
      MIN_VOLUME_24H: persisted.MIN_VOLUME_24H ?? SafeNumber.parseFloat(process.env.MIN_VOLUME_24H, 1000000),
      MAX_LEVERAGE: persisted.MAX_LEVERAGE ?? SafeNumber.parseInt(process.env.MAX_LEVERAGE, 3),
      MAX_POSITION_HOLD_HOURS: persisted.MAX_POSITION_HOLD_HOURS ?? SafeNumber.parseInt(process.env.MAX_POSITION_HOLD_HOURS, 72)
    };

    // 运行时状态
    this.state = {
      initialBalance: 10000,           // 初始余额
      currentBalance: 10000,           // 当前余额
      dailyStartBalance: 10000,        // 今日开始余额
      peakBalance: 10000,              // 历史最高余额
      consecutiveLosses: 0,            // 连续亏损次数
      lastPrices: new Map(),           // 最近价格记录
      tradingPaused: false,            // 交易暂停标识
      pauseReason: null,               // 暂停原因
      dailyTrades: 0,                  // 今日交易次数
      dailyProfitLoss: 0               // 今日盈亏
    };

    // 每日重置定时器
    this.startDailyReset();
  }

  /**
   * 更新风控配置（持久化）
   */
  updateConfig(newConfig = {}) {
    const allowedKeys = [
      'MAX_DAILY_LOSS_PERCENT','MAX_DRAWDOWN_PERCENT','MAX_LOSS_PER_TRADE_PERCENT','MAX_POSITION_RATIO',
      'MAX_SLIPPAGE_PERCENT','MAX_PRICE_DEVIATION_PERCENT','MAX_CONSECUTIVE_LOSSES','MIN_CONFIDENCE',
      'MIN_VOLUME_24H','MAX_LEVERAGE','MAX_POSITION_HOLD_HOURS'
    ];
    for (const k of Object.keys(newConfig || {})) {
      if (allowedKeys.includes(k) && Number.isFinite(Number(newConfig[k]))) {
        const v = Number(newConfig[k]);
        this.config[k] = v;
      }
    }
    try {
      if (setConfig) setConfig('risk_control', this.config);
    } catch(error) {
      console.error('[风控] 保存配置失败:', error.message);
      // 配置保存失败不应阻止系统运行，但需要记录
    }
    return this.config;
  }

  /**
   * 启动每日重置
   */
  startDailyReset() {
    // 清理旧定时器
    if (this.dailyResetTimeout) {
      clearTimeout(this.dailyResetTimeout);
      this.dailyResetTimeout = null;
    }
    if (this.dailyResetInterval) {
      clearInterval(this.dailyResetInterval);
      this.dailyResetInterval = null;
    }

    // 每天凌晨重置统计
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeUntilMidnight = tomorrow - now;

    this.dailyResetTimeout = setTimeout(() => {
      this.resetDailyStats();
      // 每24小时重置一次
      this.dailyResetInterval = setInterval(() => this.resetDailyStats(), 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);
  }

  /**
   * 清理资源
   */
  destroy() {
    // 清理定时器
    if (this.dailyResetTimeout) {
      clearTimeout(this.dailyResetTimeout);
      this.dailyResetTimeout = null;
    }
    if (this.dailyResetInterval) {
      clearInterval(this.dailyResetInterval);
      this.dailyResetInterval = null;
    }
    // 移除所有事件监听器
    this.removeAllListeners();
  }

  /**
   * 重置每日统计
   */
  resetDailyStats() {
    console.log('[风控] 重置每日统计');
    this.state.dailyStartBalance = this.state.currentBalance;
    this.state.dailyTrades = 0;
    this.state.dailyProfitLoss = 0;

    // 如果昨天因为日损失暂停，今天重新开启
    if (this.state.pauseReason === 'DAILY_LOSS_LIMIT') {
      this.resumeTrading();
    }
  }

  /**
   * 更新账户余额
   */
  async updateBalance(mode) {
    try {
      const balance = await okxTrading.fetchBalance({ mode });

      if (!balance.paper) {
        // 真实账户，计算 USDT 余额
        const usdtBalance = balance.free.USDT || 0;
        this.state.currentBalance = usdtBalance;

        // 更新历史最高余额
        if (usdtBalance > this.state.peakBalance) {
          this.state.peakBalance = usdtBalance;
        }
      }
    } catch (error) {
      console.error('[风控] 更新余额失败:', error.message);
    }
  }

  /**
   * 交易前风控检查
   * @returns {Object} { allowed: boolean, reason: string }
   */
  async checkBeforeTrade(signal, symbol, amount, mode) {
    // 1. 检查交易是否暂停
    if (this.state.tradingPaused) {
      return {
        allowed: false,
        reason: `交易已暂停: ${this.state.pauseReason}`,
        code: 'TRADING_PAUSED'
      };
    }

    // 2. 更新余额
    await this.updateBalance(mode);

    // 3. 检查日损失限制
    const dailyLossCheck = this.checkDailyLoss();
    if (!dailyLossCheck.allowed) {
      this.pauseTrading('DAILY_LOSS_LIMIT', dailyLossCheck.reason);
      return dailyLossCheck;
    }

    // 3.1 检查当日开单上限
    const dailyTradesCheck = this.checkDailyTrades();
    if (!dailyTradesCheck.allowed) {
      this.pauseTrading('DAILY_TRADE_LIMIT', dailyTradesCheck.reason);
      return dailyTradesCheck;
    }

    // 4. 检查最大回撤
    const drawdownCheck = this.checkMaxDrawdown();
    if (!drawdownCheck.allowed) {
      this.pauseTrading('MAX_DRAWDOWN', drawdownCheck.reason);
      return drawdownCheck;
    }

    // 5. 检查单笔损失限制
    const tradeLossCheck = this.checkSingleTradeLoss(signal);
    if (!tradeLossCheck.allowed) {
      return tradeLossCheck;
    }

    // 6. 检查总仓位限制
    const positionCheck = await this.checkTotalPosition(amount, signal.entryPrice || signal.currentPrice, mode);
    if (!positionCheck.allowed) {
      return positionCheck;
    }

    // 7. 检查置信度
    const confidenceCheck = this.checkConfidence(signal);
    if (!confidenceCheck.allowed) {
      return confidenceCheck;
    }

    // 8. 检查连续亏损
    const consecutiveLossCheck = this.checkConsecutiveLosses();
    if (!consecutiveLossCheck.allowed) {
      this.pauseTrading('CONSECUTIVE_LOSSES', consecutiveLossCheck.reason);
      return consecutiveLossCheck;
    }

    // 9. 检查市场流动性
    const liquidityCheck = await this.checkLiquidity(symbol, mode);
    if (!liquidityCheck.allowed) {
      return liquidityCheck;
    }

    // 10. 检查价格偏离
    const priceDeviationCheck = await this.checkPriceDeviation(symbol, signal.currentPrice, mode);
    if (!priceDeviationCheck.allowed) {
      return priceDeviationCheck;
    }

    // 11. 预估滑点保护（以当前市价 vs 期望入场价）
    const preSlippageCheck = await this.checkPreTradeSlippage(symbol, signal, mode);
    if (!preSlippageCheck.allowed) {
      return preSlippageCheck;
    }

    // 所有检查通过
    return {
      allowed: true,
      reason: '风控检查通过',
      code: 'APPROVED'
    };
  }

  /**
   * 检查当日开单次数限制
   */
  checkDailyTrades() {
    if (Number.isFinite(this.config.MAX_DAILY_TRADES) && this.config.MAX_DAILY_TRADES > 0) {
      if (this.state.dailyTrades >= this.config.MAX_DAILY_TRADES) {
        return {
          allowed: false,
          reason: `当日开单已达上限: ${this.state.dailyTrades} / ${this.config.MAX_DAILY_TRADES}`,
          code: 'DAILY_TRADE_LIMIT'
        };
      }
    }
    return { allowed: true };
  }

  /**
   * 预交易滑点检查（当前市价 vs 期望入场价）
   */
  async checkPreTradeSlippage(symbol, signal, mode) {
    try {
      if (!signal || !signal.entryPrice) return { allowed: true };
      const exchange = mode === 'paper' ? null : okxTrading.buildExchangeInstance(mode);
      if (!exchange) return { allowed: true };
      const ticker = await exchange.fetchTicker(symbol);
      const mktPrice = ticker.last || ticker.close;
      if (!mktPrice || !signal.entryPrice) return { allowed: true };
      const slippagePct = Math.abs(mktPrice - signal.entryPrice) / signal.entryPrice * 100;
      if (slippagePct > this.config.MAX_SLIPPAGE_PERCENT) {
        return {
          allowed: false,
          reason: `预计滑点过大: ${slippagePct.toFixed(2)}% > ${this.config.MAX_SLIPPAGE_PERCENT}%（市价 ${mktPrice} vs 期望 ${signal.entryPrice}）`,
          code: 'SLIPPAGE_PRETRADE',
          data: { slippagePct, limit: this.config.MAX_SLIPPAGE_PERCENT }
        };
      }
      return { allowed: true };
    } catch (error) {
      console.warn('[风控] 预交易滑点检查失败:', error.message);
      return { allowed: true };
    }
  }

  /**
   * 检查日损失限制
   */
  checkDailyLoss() {
    const dailyLoss = this.state.dailyStartBalance - this.state.currentBalance;
    const lossPercent = SafeNumber.percentage(dailyLoss, this.state.dailyStartBalance);

    if (lossPercent >= this.config.MAX_DAILY_LOSS_PERCENT) {
      return {
        allowed: false,
        reason: `触发日损失限制: ${lossPercent.toFixed(2)}% >= ${this.config.MAX_DAILY_LOSS_PERCENT}%`,
        code: 'DAILY_LOSS_LIMIT',
        data: { lossPercent, limit: this.config.MAX_DAILY_LOSS_PERCENT }
      };
    }

    return { allowed: true };
  }

  /**
   * 检查最大回撤
   */
  checkMaxDrawdown() {
    const drawdown = this.state.peakBalance - this.state.currentBalance;
    const drawdownPercent = SafeNumber.percentage(drawdown, this.state.peakBalance);

    if (drawdownPercent >= this.config.MAX_DRAWDOWN_PERCENT) {
      return {
        allowed: false,
        reason: `触发最大回撤保护: ${drawdownPercent.toFixed(2)}% >= ${this.config.MAX_DRAWDOWN_PERCENT}%`,
        code: 'MAX_DRAWDOWN',
        data: { drawdownPercent, limit: this.config.MAX_DRAWDOWN_PERCENT }
      };
    }

    return { allowed: true };
  }

  /**
   * 检查单笔损失限制
   */
  checkSingleTradeLoss(signal) {
    if (!signal.stopLoss || !signal.entryPrice) {
      return { allowed: true }; // 没有止损价，跳过检查
    }

    const potentialLossPerUnit = Math.abs(signal.entryPrice - signal.stopLoss);
    const potentialLossPercent = SafeNumber.percentage(potentialLossPerUnit, signal.entryPrice);

    if (potentialLossPercent >= this.config.MAX_LOSS_PER_TRADE_PERCENT) {
      return {
        allowed: false,
        reason: `单笔潜在损失过大: ${potentialLossPercent.toFixed(2)}% >= ${this.config.MAX_LOSS_PER_TRADE_PERCENT}%`,
        code: 'SINGLE_TRADE_LOSS',
        data: { potentialLossPercent, limit: this.config.MAX_LOSS_PER_TRADE_PERCENT }
      };
    }

    return { allowed: true };
  }

  /**
   * 检查总仓位限制
   */
  async checkTotalPosition(newAmount, price, mode) {
    try {
      const positions = await okxTrading.fetchPositions({ mode });

      // 计算当前总仓位价值
      let totalPositionValue = 0;
      if (!positions.paper && Array.isArray(positions)) {
        totalPositionValue = positions.reduce((sum, pos) => {
          return sum + (parseFloat(pos.contracts || pos.amount || 0) * parseFloat(pos.markPrice || pos.entryPrice || 0));
        }, 0);
      }

      // 加上新订单价值
      totalPositionValue += newAmount * price;

      const positionRatio = totalPositionValue / this.state.currentBalance;

      if (positionRatio > this.config.MAX_POSITION_RATIO) {
        return {
          allowed: false,
          reason: `总仓位超限: ${(positionRatio * 100).toFixed(2)}% > ${(this.config.MAX_POSITION_RATIO * 100).toFixed(2)}%`,
          code: 'MAX_POSITION',
          data: { positionRatio, limit: this.config.MAX_POSITION_RATIO }
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('[风控] 检查仓位失败:', error.message);
      return { allowed: true }; // 检查失败，放行（可根据需求改为拒绝）
    }
  }

  /**
   * 检查置信度
   */
  checkConfidence(signal) {
    if (signal.confidence < this.config.MIN_CONFIDENCE) {
      return {
        allowed: false,
        reason: `置信度不足: ${signal.confidence}% < ${this.config.MIN_CONFIDENCE}%`,
        code: 'LOW_CONFIDENCE',
        data: { confidence: signal.confidence, minConfidence: this.config.MIN_CONFIDENCE }
      };
    }

    return { allowed: true };
  }

  /**
   * 检查连续亏损
   */
  checkConsecutiveLosses() {
    if (this.state.consecutiveLosses >= this.config.MAX_CONSECUTIVE_LOSSES) {
      return {
        allowed: false,
        reason: `连续亏损次数过多: ${this.state.consecutiveLosses} >= ${this.config.MAX_CONSECUTIVE_LOSSES}`,
        code: 'CONSECUTIVE_LOSSES',
        data: { consecutiveLosses: this.state.consecutiveLosses, limit: this.config.MAX_CONSECUTIVE_LOSSES }
      };
    }

    return { allowed: true };
  }

  /**
   * 检查市场流动性
   */
  async checkLiquidity(symbol, mode) {
    try {
      const exchange = mode === 'paper' ? null : okxTrading.buildExchangeInstance(mode);
      if (!exchange) return { allowed: true };

      const ticker = await exchange.fetchTicker(symbol);
      const volume24h = ticker.quoteVolume || 0;

      if (volume24h < this.config.MIN_VOLUME_24H) {
        return {
          allowed: false,
          reason: `流动性不足: 24h成交量 $${volume24h.toLocaleString()} < $${this.config.MIN_VOLUME_24H.toLocaleString()}`,
          code: 'LOW_LIQUIDITY',
          data: { volume24h, minVolume: this.config.MIN_VOLUME_24H }
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('[风控] 检查流动性失败:', error.message);
      return { allowed: true };
    }
  }

  /**
   * 检查价格偏离
   */
  async checkPriceDeviation(symbol, currentPrice, mode) {
    const lastPrice = this.state.lastPrices.get(symbol);

    if (lastPrice) {
      const deviation = Math.abs(currentPrice - lastPrice) / lastPrice * 100;

      if (deviation > this.config.MAX_PRICE_DEVIATION_PERCENT) {
        return {
          allowed: false,
          reason: `价格异常波动: ${deviation.toFixed(2)}% > ${this.config.MAX_PRICE_DEVIATION_PERCENT}%`,
          code: 'PRICE_DEVIATION',
          data: { deviation, limit: this.config.MAX_PRICE_DEVIATION_PERCENT }
        };
      }
    }

    // 更新最近价格
    this.state.lastPrices.set(symbol, currentPrice);

    return { allowed: true };
  }

  /**
   * 记录交易结果
   */
  recordTrade(profitLoss) {
    this.state.dailyTrades++;
    this.state.dailyProfitLoss += profitLoss;
    this.state.currentBalance += profitLoss;

    // 更新峰值
    if (this.state.currentBalance > this.state.peakBalance) {
      this.state.peakBalance = this.state.currentBalance;
    }

    // 更新连续亏损计数
    if (profitLoss < 0) {
      this.state.consecutiveLosses++;
      this.emit('tradeLoss', { consecutiveLosses: this.state.consecutiveLosses, profitLoss });
    } else {
      this.state.consecutiveLosses = 0;
      this.emit('tradeWin', { profitLoss });
    }
  }

  /**
   * 暂停交易
   */
  pauseTrading(reason, message) {
    this.state.tradingPaused = true;
    this.state.pauseReason = reason;
    console.error(`[风控] 交易已暂停: ${message || reason}`);
    this.emit('tradingPaused', { reason, message });
  }

  /**
   * 恢复交易
   */
  resumeTrading() {
    this.state.tradingPaused = false;
    this.state.pauseReason = null;
    console.log('[风控] 交易已恢复');
    this.emit('tradingResumed');
  }

  /**
   * 紧急停止所有交易
   */
  emergencyStop() {
    this.pauseTrading('EMERGENCY_STOP', '紧急停止所有交易');
    this.emit('emergencyStop');
  }

  /**
   * 获取风控状态
   */
  getStatus() {
    const dailyLoss = this.state.dailyStartBalance - this.state.currentBalance;
    const dailyLossPercent = (dailyLoss / this.state.dailyStartBalance) * 100;

    const drawdown = this.state.peakBalance - this.state.currentBalance;
    const drawdownPercent = (drawdown / this.state.peakBalance) * 100;

    return {
      tradingPaused: this.state.tradingPaused,
      pauseReason: this.state.pauseReason,
      currentBalance: this.state.currentBalance,
      dailyProfitLoss: this.state.dailyProfitLoss,
      dailyLossPercent: dailyLossPercent.toFixed(2),
      drawdownPercent: drawdownPercent.toFixed(2),
      consecutiveLosses: this.state.consecutiveLosses,
      dailyTrades: this.state.dailyTrades,
      limits: {
        maxDailyLoss: this.config.MAX_DAILY_LOSS_PERCENT,
        maxDrawdown: this.config.MAX_DRAWDOWN_PERCENT,
        maxConsecutiveLosses: this.config.MAX_CONSECUTIVE_LOSSES
      }
    };
  }
}

module.exports = new RiskControl();
