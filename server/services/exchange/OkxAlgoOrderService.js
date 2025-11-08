/**
 * OKX 策略委托服务
 * 实现止盈止损单、计划委托、移动止损等高级订单
 * 文档: https://www.okx.com/docs-v5/zh/#order-book-trading-algo-trading-post-place-algo-order
 */

const ccxt = require('ccxt');

class OkxAlgoOrderService {
  constructor() {
    this.exchangeId = 'okx';
    this.defaultMarketType = process.env.DEFAULT_MARKET_TYPE || 'spot';
  }

  getTradingMode(overrideMode) {
    const mode = (overrideMode || process.env.TRADING_MODE || 'paper').toLowerCase();
    if (!['paper', 'demo', 'live'].includes(mode)) return 'paper';
    return mode;
  }

  buildExchangeInstance(mode) {
    const apiKey = process.env.OKX_API_KEY || '';
    const secret = process.env.OKX_API_SECRET || '';
    const password = process.env.OKX_API_PASSPHRASE || '';

    const opts = {
      apiKey,
      secret,
      password,
      enableRateLimit: true,
      timeout: 30000,
      options: {
        defaultType: this.defaultMarketType
      }
    };

    const exchange = new ccxt.okx(opts);

    if (mode === 'demo' || process.env.OKX_SIMULATED === 'true') {
      try {
        if (typeof exchange.setSandboxMode === 'function') {
          exchange.setSandboxMode(true);
        }
        exchange.headers = { ...(exchange.headers || {}), 'x-simulated-trading': '1' };
      } catch (_) {}
    }

    return exchange;
  }

  async ensureCredentials(mode) {
    if (mode === 'live' || mode === 'demo') {
      if (!process.env.OKX_API_KEY || !process.env.OKX_API_SECRET || !process.env.OKX_API_PASSPHRASE) {
        throw new Error('未配置 OKX API 凭证');
      }
    }
  }

  /**
   * 创建止盈止损单
   * @param {Object} params
   * @param {string} params.symbol - 交易对 (e.g., 'BTC/USDT')
   * @param {string} params.side - 方向 ('buy' | 'sell')
   * @param {number} params.amount - 数量
   * @param {number} params.stopLossPrice - 止损价格
   * @param {number} params.takeProfitPrice - 止盈价格
   * @param {string} params.mode - 交易模式
   */
  async createStopLossAndTakeProfit({ symbol, side, amount, stopLossPrice, takeProfitPrice, mode }) {
    const m = this.getTradingMode(mode);

    if (m === 'paper') {
      return {
        paper: true,
        stopLoss: { orderId: `sl-${Date.now()}`, price: stopLossPrice, amount },
        takeProfit: { orderId: `tp-${Date.now()}`, price: takeProfitPrice, amount }
      };
    }

    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    const results = {
      stopLoss: null,
      takeProfit: null,
      errors: []
    };

    // 止损单
    if (stopLossPrice) {
      try {
        const slOrder = await this.createAlgoOrder({
          symbol,
          side: side === 'buy' ? 'sell' : 'buy', // 反向平仓
          orderType: 'conditional',
          triggerPrice: stopLossPrice,
          amount,
          mode: m,
          reduceOnly: true
        });
        results.stopLoss = slOrder;
      } catch (error) {
        results.errors.push({ type: 'stopLoss', error: error.message });
      }
    }

    // 止盈单
    if (takeProfitPrice) {
      try {
        const tpOrder = await this.createAlgoOrder({
          symbol,
          side: side === 'buy' ? 'sell' : 'buy', // 反向平仓
          orderType: 'conditional',
          triggerPrice: takeProfitPrice,
          amount,
          mode: m,
          reduceOnly: true
        });
        results.takeProfit = tpOrder;
      } catch (error) {
        results.errors.push({ type: 'takeProfit', error: error.message });
      }
    }

    return results;
  }

  /**
   * 创建策略委托单
   * @param {Object} params
   * @param {string} params.symbol - 交易对
   * @param {string} params.side - 方向
   * @param {string} params.orderType - 订单类型: 'conditional' | 'oco' | 'trigger' | 'move_order_stop' | 'iceberg' | 'twap'
   * @param {number} params.triggerPrice - 触发价格
   * @param {number} params.amount - 数量
   * @param {number} params.orderPrice - 委托价格 (可选，市价单不需要)
   * @param {boolean} params.reduceOnly - 只减仓 (平仓单设为true)
   */
  async createAlgoOrder({ symbol, side, orderType, triggerPrice, amount, orderPrice, mode, reduceOnly = false }) {
    const m = this.getTradingMode(mode);

    if (m === 'paper') {
      return {
        paper: true,
        algoId: `algo-${Date.now()}`,
        symbol,
        side,
        orderType,
        triggerPrice,
        amount,
        status: 'live'
      };
    }

    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    // 使用 CCXT 的 privatePostTradeOrderAlgo 方法
    // OKX 文档: https://www.okx.com/docs-v5/zh/#order-book-trading-algo-trading-post-place-algo-order
    const instId = symbol.replace('/', '-');

    const payload = {
      instId,
      tdMode: this.defaultMarketType === 'spot' ? 'cash' : 'cross', // 现货:cash, 合约:cross/isolated
      side: side.toLowerCase(),
      ordType: orderType,
      sz: String(amount),
      triggerPx: String(triggerPrice)
    };

    // 如果指定了委托价格（限价单）
    if (orderPrice) {
      payload.orderPx = String(orderPrice);
    } else {
      payload.orderPx = '-1'; // -1 表示市价
    }

    // 只减仓标识
    if (reduceOnly) {
      payload.reduceOnly = 'true';
    }

    try {
      const result = await exchange.privatePostTradeOrderAlgo(payload);

      if (result.code !== '0') {
        throw new Error(`OKX API错误 [${result.code}]: ${result.msg}`);
      }

      return {
        algoId: result.data[0].algoId,
        symbol,
        side,
        orderType,
        triggerPrice,
        amount,
        status: 'live',
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`创建策略委托失败: ${error.message}`);
    }
  }

  /**
   * 撤销策略委托
   */
  async cancelAlgoOrder({ algoId, symbol, mode }) {
    const m = this.getTradingMode(mode);

    if (m === 'paper') {
      return { paper: true, algoId, status: 'cancelled' };
    }

    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    const instId = symbol.replace('/', '-');

    try {
      const result = await exchange.privatePostTradeCancelAlgos([
        { instId, algoId }
      ]);

      if (result.code !== '0') {
        throw new Error(`OKX API错误 [${result.code}]: ${result.msg}`);
      }

      return {
        algoId,
        status: 'cancelled',
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`撤销策略委托失败: ${error.message}`);
    }
  }

  /**
   * 查询未完成策略委托
   */
  async fetchPendingAlgoOrders({ symbol, orderType, mode }) {
    const m = this.getTradingMode(mode);

    if (m === 'paper') {
      return [];
    }

    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    const params = {
      ordType: orderType || 'conditional'
    };

    if (symbol) {
      params.instId = symbol.replace('/', '-');
    }

    try {
      const result = await exchange.privateGetTradeOrdersAlgoPending(params);

      if (result.code !== '0') {
        throw new Error(`OKX API错误 [${result.code}]: ${result.msg}`);
      }

      return result.data.map(order => ({
        algoId: order.algoId,
        symbol: order.instId.replace('-', '/'),
        side: order.side,
        orderType: order.ordType,
        triggerPrice: parseFloat(order.triggerPx),
        amount: parseFloat(order.sz),
        status: order.state,
        timestamp: parseInt(order.cTime)
      }));
    } catch (error) {
      throw new Error(`查询策略委托失败: ${error.message}`);
    }
  }

  /**
   * 查询历史策略委托
   */
  async fetchAlgoOrderHistory({ symbol, orderType, limit = 100, mode }) {
    const m = this.getTradingMode(mode);

    if (m === 'paper') {
      return [];
    }

    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    const params = {
      ordType: orderType || 'conditional',
      limit: String(limit)
    };

    if (symbol) {
      params.instId = symbol.replace('/', '-');
    }

    try {
      const result = await exchange.privateGetTradeOrdersAlgoHistory(params);

      if (result.code !== '0') {
        throw new Error(`OKX API错误 [${result.code}]: ${result.msg}`);
      }

      return result.data.map(order => ({
        algoId: order.algoId,
        symbol: order.instId.replace('-', '/'),
        side: order.side,
        orderType: order.ordType,
        triggerPrice: parseFloat(order.triggerPx),
        amount: parseFloat(order.sz),
        status: order.state,
        timestamp: parseInt(order.cTime),
        triggerTime: order.triggerTime ? parseInt(order.triggerTime) : null
      }));
    } catch (error) {
      throw new Error(`查询历史策略委托失败: ${error.message}`);
    }
  }

  /**
   * 创建移动止损单（追踪止损）
   */
  async createTrailingStop({ symbol, side, amount, callbackRatio, activationPrice, mode }) {
    const m = this.getTradingMode(mode);

    if (m === 'paper') {
      return {
        paper: true,
        algoId: `trailing-${Date.now()}`,
        symbol,
        callbackRatio,
        activationPrice
      };
    }

    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    const instId = symbol.replace('/', '-');

    const payload = {
      instId,
      tdMode: this.defaultMarketType === 'spot' ? 'cash' : 'cross',
      side: side === 'buy' ? 'sell' : 'buy', // 反向平仓
      ordType: 'move_order_stop',
      sz: String(amount),
      callbackRatio: String(callbackRatio), // 回调幅度 (如 0.01 = 1%)
      reduceOnly: 'true'
    };

    if (activationPrice) {
      payload.activePx = String(activationPrice);
    }

    try {
      const result = await exchange.privatePostTradeOrderAlgo(payload);

      if (result.code !== '0') {
        throw new Error(`OKX API错误 [${result.code}]: ${result.msg}`);
      }

      return {
        algoId: result.data[0].algoId,
        symbol,
        side,
        orderType: 'move_order_stop',
        callbackRatio,
        activationPrice,
        amount,
        status: 'live',
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`创建移动止损失败: ${error.message}`);
    }
  }
}

module.exports = new OkxAlgoOrderService();
