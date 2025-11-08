/**
 * 持仓同步器
 * 定期从 OKX 获取真实持仓，与本地数据对账
 */

const okxTrading = require('./exchange/OkxTradingService');
const EventEmitter = require('events');
const eventBus = require('./EventBus');

class PositionSyncer extends EventEmitter {
  constructor() {
    super();
    this.syncInterval = null;
    this.syncFrequency = 30000; // 30秒同步一次
    this.positions = new Map(); // symbol -> position
    this.lastSyncTime = null;
  }

  /**
   * 启动持仓同步
   */
  start(mode = 'paper') {
    if (this.syncInterval) {
      console.log('[持仓同步] 已在运行中');
      return;
    }

    console.log(`[持仓同步] 启动，间隔: ${this.syncFrequency / 1000}秒`);
    this.mode = mode;

    // 立即同步一次
    this.sync();

    // 定时同步
    this.syncInterval = setInterval(() => {
      this.sync();
    }, this.syncFrequency);
  }

  /**
   * 停止持仓同步
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[持仓同步] 已停止');
    }
  }

  /**
   * 执行同步
   */
  async sync() {
    try {
      const positions = await okxTrading.fetchPositions({ mode: this.mode });

      if (positions.paper || !Array.isArray(positions)) {
        this.lastSyncTime = Date.now();
        return;
      }

      // 清空旧数据
      const oldPositions = new Map(this.positions);
      this.positions.clear();

      // 更新新数据
      for (const pos of positions) {
        const symbol = pos.symbol;
        const positionData = {
          symbol,
          side: pos.side,
          contracts: parseFloat(pos.contracts || pos.amount || 0),
          entryPrice: parseFloat(pos.entryPrice || 0),
          markPrice: parseFloat(pos.markPrice || pos.lastPrice || 0),
          unrealizedPnl: parseFloat(pos.unrealizedPnl || 0),
          leverage: parseFloat(pos.leverage || 1),
          liquidationPrice: parseFloat(pos.liquidationPrice || 0),
          margin: parseFloat(pos.initialMargin || 0),
          timestamp: Date.now()
        };

        this.positions.set(symbol, positionData);

        // 检测新开仓位
        if (!oldPositions.has(symbol)) {
          this.emit('positionOpened', positionData);
          try { eventBus.emit('position.opened', { ...positionData, clientOrderId: null }); } catch (_) {}
        }
      }

      // 检测已平仓位
      for (const [symbol, oldPos] of oldPositions) {
        if (!this.positions.has(symbol)) {
          this.emit('positionClosed', { symbol, ...oldPos });
          try { eventBus.emit('position.closed', { symbol, ...oldPos }); } catch (_) {}
        }
      }

      this.lastSyncTime = Date.now();
      this.emit('syncCompleted', { count: this.positions.size, timestamp: this.lastSyncTime });

    } catch (error) {
      console.error('[持仓同步] 同步失败:', error.message);
      this.emit('syncError', { error: error.message });
    }
  }

  /**
   * 获取所有持仓
   */
  getPositions() {
    return Array.from(this.positions.values());
  }

  /**
   * 获取单个持仓
   */
  getPosition(symbol) {
    return this.positions.get(symbol) || null;
  }

  /**
   * 计算总持仓价值
   */
  getTotalPositionValue() {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.contracts * pos.markPrice;
    }
    return total;
  }

  /**
   * 计算总未实现盈亏
   */
  getTotalUnrealizedPnl() {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.unrealizedPnl;
    }
    return total;
  }

  /**
   * 获取同步状态
   */
  getStatus() {
    return {
      isRunning: !!this.syncInterval,
      lastSyncTime: this.lastSyncTime,
      positionCount: this.positions.size,
      totalValue: this.getTotalPositionValue(),
      totalUnrealizedPnl: this.getTotalUnrealizedPnl(),
      mode: this.mode
    };
  }
}

module.exports = new PositionSyncer();
