/**
 * 订单监控器
 * 实时监控订单状态变化，处理成交、部分成交、撤销等情况
 */

const okxTrading = require('./exchange/OkxTradingService');
const EventEmitter = require('events');

class OrderMonitor extends EventEmitter {
  constructor() {
    super();
    this.monitoredOrders = new Map(); // orderId -> { symbol, checkInterval, attempts }
    this.maxAttempts = 60; // 最多检查60次
    this.checkInterval = 2000; // 每2秒检查一次
  }

  /**
   * 开始监控订单
   * @param {string} orderId - 订单ID
   * @param {string} symbol - 交易对
   * @param {string} mode - 交易模式
   * @param {Function} onUpdate - 状态更新回调 (可选)
   */
  async monitorOrder(orderId, symbol, mode, onUpdate) {
    if (this.monitoredOrders.has(orderId)) {
      console.log(`订单 ${orderId} 已在监控中`);
      return;
    }

    console.log(`开始监控订单: ${orderId} (${symbol})`);

    const monitorData = {
      symbol,
      mode,
      attempts: 0,
      onUpdate,
      startTime: Date.now()
    };

    this.monitoredOrders.set(orderId, monitorData);

    // 立即检查一次
    await this.checkOrderStatus(orderId);

    // 设置定时检查
    monitorData.checkInterval = setInterval(async () => {
      await this.checkOrderStatus(orderId);
    }, this.checkInterval);
  }

  /**
   * 检查订单状态
   */
  async checkOrderStatus(orderId) {
    const monitorData = this.monitoredOrders.get(orderId);
    if (!monitorData) return;

    monitorData.attempts++;

    try {
      const order = await okxTrading.fetchOrder({
        id: orderId,
        symbol: monitorData.symbol,
        mode: monitorData.mode
      });

      // 调用自定义回调
      if (monitorData.onUpdate) {
        monitorData.onUpdate(order);
      }

      // 触发事件
      this.emit('orderUpdate', { orderId, order });

      // 根据状态处理
      switch (order.status) {
        case 'open':
        case 'pending':
          // 未成交，继续监控
          console.log(`订单 ${orderId} 等待成交... (尝试 ${monitorData.attempts}/${this.maxAttempts})`);

          // 超时处理
          if (monitorData.attempts >= this.maxAttempts) {
            console.warn(`订单 ${orderId} 监控超时，停止监控`);
            this.stopMonitoring(orderId);
            this.emit('orderTimeout', { orderId, order });
          }
          break;

        case 'closed':
        case 'filled':
          // 完全成交
          console.log(`订单 ${orderId} 已成交`);
          this.emit('orderFilled', { orderId, order });
          this.stopMonitoring(orderId);
          break;

        case 'canceled':
        case 'cancelled':
          // 已撤销
          console.log(`订单 ${orderId} 已撤销`);
          this.emit('orderCanceled', { orderId, order });
          this.stopMonitoring(orderId);
          break;

        case 'partial':
        case 'partially_filled':
          // 部分成交
          const filledPercent = (order.filled / order.amount * 100).toFixed(2);
          console.log(`订单 ${orderId} 部分成交: ${filledPercent}%`);
          this.emit('orderPartialFilled', { orderId, order });
          break;

        case 'rejected':
        case 'expired':
          // 订单被拒绝或过期
          console.error(`订单 ${orderId} 状态异常: ${order.status}`);
          this.emit('orderFailed', { orderId, order });
          this.stopMonitoring(orderId);
          break;

        default:
          console.warn(`订单 ${orderId} 未知状态: ${order.status}`);
      }

    } catch (error) {
      console.error(`检查订单 ${orderId} 状态失败:`, error.message);
      this.emit('orderError', { orderId, error });

      // 重试次数用尽，停止监控
      if (monitorData.attempts >= this.maxAttempts) {
        this.stopMonitoring(orderId);
      }
    }
  }

  /**
   * 停止监控订单
   */
  stopMonitoring(orderId) {
    const monitorData = this.monitoredOrders.get(orderId);
    if (!monitorData) return;

    if (monitorData.checkInterval) {
      clearInterval(monitorData.checkInterval);
    }

    this.monitoredOrders.delete(orderId);
    console.log(`停止监控订单: ${orderId}`);
  }

  /**
   * 停止所有监控
   */
  stopAll() {
    console.log(`停止所有订单监控 (${this.monitoredOrders.size} 个订单)`);
    for (const orderId of this.monitoredOrders.keys()) {
      this.stopMonitoring(orderId);
    }
  }

  /**
   * 获取当前监控的订单列表
   */
  getMonitoredOrders() {
    return Array.from(this.monitoredOrders.entries()).map(([orderId, data]) => ({
      orderId,
      symbol: data.symbol,
      attempts: data.attempts,
      elapsedTime: Date.now() - data.startTime
    }));
  }

  /**
   * 批量监控订单
   */
  async monitorOrders(orders, mode) {
    for (const order of orders) {
      if (order.id && order.symbol) {
        await this.monitorOrder(order.id, order.symbol, mode);
      }
    }
  }
}

// 单例模式
const orderMonitor = new OrderMonitor();

// 全局事件监听示例
orderMonitor.on('orderFilled', ({ orderId, order }) => {
  console.log(`[全局] 订单 ${orderId} 成交，价格: ${order.price}, 数量: ${order.filled}`);
});

orderMonitor.on('orderCanceled', ({ orderId }) => {
  console.log(`[全局] 订单 ${orderId} 已取消`);
});

orderMonitor.on('orderFailed', ({ orderId, order }) => {
  console.error(`[全局] 订单 ${orderId} 失败，状态: ${order.status}`);
});

module.exports = orderMonitor;
