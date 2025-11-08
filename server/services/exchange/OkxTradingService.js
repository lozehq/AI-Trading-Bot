/**
 * OKX 交易服务（实盘/模拟/纸上）
 * - 通过 CCXT 统一下单/撤单/余额查询
 * - 支持 TRADING_MODE: paper | demo | live
 * - 支持 spot（默认），后续可扩展 swap
 */

const ccxt = require('ccxt');
const { TradeService } = require('../../database/services/TradeService');

class OkxTradingService {
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

    // 提示：如果在 live 模式下仍设置了 OKX_SIMULATED=true，会被强制走模拟环境，导致检测不到真实持仓
    if ((mode || '').toLowerCase() === 'live' && process.env.OKX_SIMULATED === 'true') {
      console.warn('⚠️ OKX_SIMULATED=true 生效：当前以模拟环境连接。请取消该环境变量以读取真实持仓。');
    }

    const exchange = new ccxt.okx(opts);

    // Demo帐户（OKX 模拟盘）
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
        throw new Error('未配置 OKX API 凭证。请在 server/.env 设置 OKX_API_KEY, OKX_API_SECRET, OKX_API_PASSPHRASE');
      }
    }
  }

  // ===== 公共辅助 =====
  async fetchTickerPrice(exchange, symbol) {
    const market = await exchange.loadMarkets();
    const marketInfo = market[symbol];
    if (!marketInfo) throw new Error(`不支持的交易对: ${symbol}`);
    const ticker = await exchange.fetchTicker(symbol);
    return { price: ticker.last || ticker.close, marketInfo };
  }

  toPrecision(exchange, marketInfo, amount, price) {
    const precAmount = amount != null ? exchange.amountToPrecision(marketInfo.symbol, amount) : undefined;
    const precPrice = price != null ? exchange.priceToPrecision(marketInfo.symbol, price) : undefined;
    return { amount: precAmount != null ? parseFloat(precAmount) : undefined, price: precPrice != null ? parseFloat(precPrice) : undefined };
  }

  // ===== 纸上交易 =====
  async paperCreateOrder({ symbol, side, type, amount, price }) {
    const exchange = new ccxt.okx({ enableRateLimit: true, timeout: 20000, options: { defaultType: this.defaultMarketType } });
    const { price: mktPrice } = await this.fetchTickerPrice(exchange, symbol);
    const execPrice = type.toUpperCase() === 'MARKET' ? mktPrice : price;

    const tradeId = TradeService.create({
      symbol,
      exchange: this.exchangeId,
      side: side.toUpperCase(),
      type: type.toUpperCase(),
      price: execPrice,
      amount,
      total: execPrice * amount,
      status: 'PAPER',
      strategy: 'manual'
    });

    return { paper: true, tradeId, symbol, side, type, amount, price: execPrice, status: 'FILLED' };
  }

  // ===== 实盘/模拟盘 =====
  async liveCreateOrder({ symbol, side, type, amount, price, params = {}, mode }) {
    if (String(mode).toLowerCase() === 'live' && process.env.ENABLE_REAL_TRADING !== 'true') {
      throw new Error('实盘下单已被服务器禁用：请在环境变量 ENABLE_REAL_TRADING=true 后重启服务以启用实盘交易');
    }
    await this.ensureCredentials(mode);
    const exchange = this.buildExchangeInstance(mode);

    const { price: mktPrice, marketInfo } = await this.fetchTickerPrice(exchange, symbol);
    const execPrice = type.toUpperCase() === 'MARKET' ? mktPrice : price;
    const { amount: pAmount, price: pPrice } = this.toPrecision(exchange, marketInfo, amount, execPrice);

    // 风险控制：最小名义/数量
    if (marketInfo.limits && marketInfo.limits.amount && marketInfo.limits.amount.min && pAmount < marketInfo.limits.amount.min) {
      throw new Error(`下单数量过小，最小数量: ${marketInfo.limits.amount.min}`);
    }

    const order = await exchange.createOrder(symbol, type.toUpperCase(), side.toUpperCase(), pAmount, pPrice, params);

    // 写入本地交易记录
    TradeService.create({
      symbol,
      exchange: this.exchangeId,
      side: side.toUpperCase(),
      type: type.toUpperCase(),
      price: pPrice || mktPrice,
      amount: pAmount,
      total: (pPrice || mktPrice) * pAmount,
      fee: 0,
      status: 'PENDING',
      order_id: order.id,
      strategy: params.strategy || 'manual',
      entry_price: pPrice || mktPrice
    });

    return order;
  }

  async createOrder(payload) {
    const type = String(payload.type || '').toUpperCase();
    if (type === 'LIMIT' && (payload.price == null || Number.isNaN(Number(payload.price)))) {
      throw new Error('限价单需要提供有效的 price');
    }
    const mode = this.getTradingMode(payload.mode);
    if (mode === 'paper') return this.paperCreateOrder(payload);
    return this.liveCreateOrder({ ...payload, mode });
  }

  async cancelOrder({ id, symbol, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') {
      // 纸上单：仅更新本地状态
      return { paper: true, id, symbol, status: 'CANCELLED' };
    }
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);
    return await exchange.cancelOrder(id, symbol);
  }

  async fetchBalance({ mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') return { paper: true, total: {}, free: {}, used: {} };
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);
    return await exchange.fetchBalance();
  }

  async fetchOpenOrders({ symbol, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') return [];
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);
    return await exchange.fetchOpenOrders(symbol);
  }

  async fetchClosedOrders({ symbol, since, limit, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') return [];
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);
    return await exchange.fetchClosedOrders(symbol, since, limit);
  }

  // ===== 扩展功能 =====

  /**
   * 获取账户信息
   */
  async fetchAccountInfo({ mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') {
      return {
        paper: true,
        account: {
          accountType: 'paper',
          level: 1,
          totalEquity: 10000,
          availableBalance: 10000,
          margin: 0
        }
      };
    }
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);
    
    try {
      // OKX 特定的账户信息查询
      const balance = await exchange.fetchBalance();
      const accountInfo = {
        accountType: this.defaultMarketType,
        totalEquity: balance.total.USDT || 0,
        availableBalance: balance.free.USDT || 0,
        usedMargin: balance.used.USDT || 0,
        currencies: Object.keys(balance.total).map(currency => ({
          currency,
          total: balance.total[currency] || 0,
          free: balance.free[currency] || 0,
          used: balance.used[currency] || 0
        }))
      };
      return accountInfo;
    } catch (error) {
      throw new Error(`获取账户信息失败: ${error.message}`);
    }
  }

  /**
   * 获取持仓信息（仅合约）
   */
  async fetchPositions({ symbol, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') return [];
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    try {
      if (typeof exchange.fetchPositions === 'function') {
        // 如果传入的 symbol 不是 OKX 合约格式(如 BTC/USDT:USDT)，则不带过滤直接获取全部，再在本地过滤
        const needsAll = symbol && !symbol.includes(':');
        let result = await exchange.fetchPositions(needsAll ? undefined : (symbol ? [symbol] : undefined));

        // Fallback: 默认是现货且未取到合约仓位 -> 切换为 swap 再取一次
        if ((!result || result.length === 0) && String((exchange.options || {}).defaultType || this.defaultMarketType).toLowerCase() === 'spot') {
          try {
            exchange.options = { ...(exchange.options || {}), defaultType: 'swap' };
            await exchange.loadMarkets();
            result = await exchange.fetchPositions(needsAll ? undefined : (symbol ? [symbol] : undefined));
          } catch (_) {}
        }

        // 本地过滤：按 base/quote 匹配 (如 传入 BTC/USDT, 过滤出 BTC/USDT:USDT)
        if (symbol && needsAll && Array.isArray(result)) {
          const base = symbol.split('/')[0];
          const quote = symbol.split('/')[1] || 'USDT';
          result = result.filter(p => {
            const ps = String(p.symbol || '');
            if (ps === symbol) return true;
            if (ps.startsWith(`${base}/${quote}`)) return true;
            return false;
          });
        }

        return result || [];
      } else {
        return [];
      }
    } catch (error) {
      throw new Error(`获取持仓信息失败: ${error.message}`);
    }
  }

  /**
   * 查询单个订单状态
   */
  async fetchOrder({ id, symbol, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') {
      return { paper: true, id, symbol, status: 'FILLED' };
    }
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);
    return await exchange.fetchOrder(id, symbol);
  }

  /**
   * 获取交易手续费率
   */
  async fetchTradingFees({ symbol, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') {
      return {
        paper: true,
        maker: 0.0008,  // OKX 现货默认 Maker 费率
        taker: 0.001    // OKX 现货默认 Taker 费率
      };
    }
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    try {
      if (typeof exchange.fetchTradingFees === 'function') {
        const fees = await exchange.fetchTradingFees();
        return fees[symbol] || fees;
      } else {
        return { maker: 0.0008, taker: 0.001 };
      }
    } catch (error) {
      console.warn('获取手续费失败，使用默认值:', error.message);
      return { maker: 0.0008, taker: 0.001 };
    }
  }

  /**
   * 获取杠杆信息（仅合约）
   */
  async fetchLeverage({ symbol, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') return { paper: true, leverage: 1 };
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    try {
      if (typeof exchange.fetchLeverage === 'function') {
        return await exchange.fetchLeverage(symbol);
      } else {
        return { leverage: 1 };
      }
    } catch (error) {
      console.warn('获取杠杆信息失败:', error.message);
      return { leverage: 1 };
    }
  }

  /**
   * 设置杠杆（仅合约）
   */
  async setLeverage({ symbol, leverage, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') {
      return { paper: true, symbol, leverage, success: true };
    }
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    try {
      if (typeof exchange.setLeverage === 'function') {
        return await exchange.setLeverage(leverage, symbol);
      } else {
        throw new Error('当前市场类型不支持杠杆设置');
      }
    } catch (error) {
      throw new Error(`设置杠杆失败: ${error.message}`);
    }
  }

  /**
   * 获取资金费率（仅合约）
   */
  async fetchFundingRate({ symbol, mode }) {
    const m = this.getTradingMode(mode);
    if (m === 'paper') {
      return { paper: true, fundingRate: 0.0001, nextFundingTime: Date.now() + 8 * 60 * 60 * 1000 };
    }
    await this.ensureCredentials(m);
    const exchange = this.buildExchangeInstance(m);

    try {
      if (typeof exchange.fetchFundingRate === 'function') {
        return await exchange.fetchFundingRate(symbol);
      } else {
        return null;
      }
    } catch (error) {
      console.warn('获取资金费率失败:', error.message);
      return null;
    }
  }

  /**
   * 批量下单
   */
  async createOrders({ orders, mode }) {
    const m = this.getTradingMode(mode);
    const results = [];

    for (const order of orders) {
      try {
        const result = await this.createOrder({ ...order, mode: m });
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, order });
      }
    }

    return results;
  }

  /**
   * 批量撤单
   */
  async cancelOrders({ orders, mode }) {
    const m = this.getTradingMode(mode);
    const results = [];

    for (const order of orders) {
      try {
        const result = await this.cancelOrder({ ...order, mode: m });
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message, order });
      }
    }

    return results;
  }

  /**
   * 获取市场信息
   */
  async fetchMarkets({ mode }) {
    const exchange = this.buildExchangeInstance(mode || 'paper');
    return await exchange.loadMarkets();
  }

  /**
   * 获取交易对信息
   */
  async fetchSymbol({ symbol, mode }) {
    const exchange = this.buildExchangeInstance(mode || 'paper');
    const markets = await exchange.loadMarkets();
    return markets[symbol] || null;
  }

  /**
   * 测试 API 连接
   */
  async testConnection({ mode }) {
    const m = this.getTradingMode(mode);
    
    if (m === 'paper') {
      return {
        success: true,
        mode: 'paper',
        message: '纸上交易模式，无需API连接'
      };
    }

    try {
      await this.ensureCredentials(m);
      const exchange = this.buildExchangeInstance(m);
      
      // 测试连接：获取余额
      await exchange.fetchBalance();
      
      return {
        success: true,
        mode: m,
        message: 'API 连接成功',
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        mode: m,
        message: `API 连接失败: ${error.message}`,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}

module.exports = new OkxTradingService();


