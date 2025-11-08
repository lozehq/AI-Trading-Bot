const express = require('express');
const router = express.Router();
const networkOptimizer = require('../utils/networkOptimizer');
const axios = {
  get: (url, config = {}) => networkOptimizer.get(url, config)
};
const dataSourceManager = require('../services/dataSourceManager');
const { validateQuery, schemas } = require('../validators');

const DEFAULT_EXCHANGE = process.env.EXCHANGE_NAME || 'okx';
const DEFAULT_SYMBOL = process.env.DEFAULT_SYMBOL || 'BTC/USDT';

// ===== 本地降级函数：直接调用OKX公开API，绕过CCXT/网络受限 =====
function toOkxInstId(symbol) {
  return symbol.replace('/', '-');
}

async function fallbackOkxTicker(symbol) {
  const instId = toOkxInstId(symbol);
  const resp = await axios.get('https://www.okx.com/api/v5/market/ticker', {
    params: { instId },
    timeout: 10000
  });
  const d = resp.data && resp.data.data && resp.data.data[0];
  if (!d) throw new Error('OKX返回空数据');
  const last = parseFloat(d.last);
  const open = d.open24h ? parseFloat(d.open24h) : null;
  const bid = d.bidPx ? parseFloat(d.bidPx) : null;
  const ask = d.askPx ? parseFloat(d.askPx) : null;
  const high = d.high24h ? parseFloat(d.high24h) : null;
  const low = d.low24h ? parseFloat(d.low24h) : null;
  const baseVolume = d.vol24h ? parseFloat(d.vol24h) : null;
  const quoteVolume = d.volCcy24h ? parseFloat(d.volCcy24h) : null;
  const percentage = open ? ((last - open) / open) * 100 : null;
  const change = open ? (last - open) : null;
  const ts = d.ts ? Number(d.ts) : Date.now();

  return {
    symbol,
    timestamp: ts,
    datetime: new Date(ts).toISOString(),
    last,
    bid,
    ask,
    high,
    low,
    open,
    close: last,
    baseVolume,
    quoteVolume,
    percentage,
    change,
  };
}

function mapTfToOkx(tf) {
  const m = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H', '1d': '1D', '1w': '1W' };
  return m[tf] || '1H';
}

async function fallbackOkxOHLCV(symbol, timeframe = '1h', limit = 100) {
  const instId = toOkxInstId(symbol);
  const bar = mapTfToOkx(timeframe);
  const maxTries = 3;
  let collected = [];
  let before = undefined; // OKX: 以毫秒时间戳获取更早数据
  let tries = 0;
  const start = Date.now();
  const budgetMs = 22000; // 控制总耗时，避免前端25s超时

  while (collected.length < limit && tries < maxTries) {
    const need = Math.min(200, limit - collected.length);
    const params = { instId, bar, limit: need };
    if (before) params.before = before;
  const resp = await axios.get('https://www.okx.com/api/v5/market/candles', {
      params,
      timeout: 9000
  });
  const arr = resp.data && resp.data.data;
    if (!Array.isArray(arr) || arr.length === 0) break;
    // OKX 由新到旧返回，reverse 为旧到新
    const page = arr.reverse().map(c => ({
    timestamp: Number(c[0]),
    datetime: new Date(Number(c[0])).toISOString(),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5])
  }));
    // 合并去重（按timestamp）
    const existing = new Set(collected.map(k => k.timestamp));
    page.forEach(k => { if (!existing.has(k.timestamp)) collected.push(k); });
    // 下次向更早时间翻页
    before = arr[0] && arr[0][0] ? Number(arr[0][0]) : undefined;
    if (!before) break;
    tries++;

    // 超过时间预算则立即返回已有数据
    if (Date.now() - start > budgetMs) {
      break;
    }
  }
  // 只返回所需数量的末尾（最新）
  if (collected.length > limit) {
    collected = collected.slice(collected.length - limit);
  }
  return collected;
}

/**
 * GET /api/market/ticker
 * 获取实时价格（使用统一数据源管理器）
 */
router.get('/ticker', validateQuery(schemas.marketData.ticker), async (req, res) => {
  try {
    const { exchange = DEFAULT_EXCHANGE, symbol = DEFAULT_SYMBOL } = req.query;

    console.log(`📊 [API] 获取Ticker: ${symbol} (${exchange})`);

    // ✅ 直接优先使用OKX公开API，绕过CCXT网络问题
    if (exchange === 'okx') {
      try {
        const ticker = await fallbackOkxTicker(symbol);
        console.log(`✅ [API] OKX公开API获取成功: ${symbol}`);
        return res.json({ success: true, data: ticker });
      } catch (e) {
        console.warn(`⚠️ [API] OKX公开API失败，尝试CCXT: ${e.message}`);
      }
    }

    // ✅ 备用：使用CCXT/dataSourceManager
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('请求超时，请检查网络连接')), 25000)
    );

    const ticker = await Promise.race([
      dataSourceManager.getTicker(exchange, symbol),
      timeoutPromise
    ]);

    console.log(`✅ [API] Ticker获取成功: ${symbol}`);

    res.json({
      success: true,
      data: ticker
    });
  } catch (error) {
    console.error('❌ [API] Ticker错误:', error.message);

    const errorMessage = error.message.includes('fetch failed')
      ? '网络连接失败，请检查网络或稍后重试'
      : error.message;

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/market/ohlcv
 * 获取K线数据（使用统一数据源管理器）
 */
router.get('/ohlcv', validateQuery(schemas.marketData.ohlcv), async (req, res) => {
  try {
    const {
      exchange = DEFAULT_EXCHANGE,
      symbol = DEFAULT_SYMBOL,
      timeframe = '1h',
      limit = 100
    } = req.query;

    console.log(`📊 [API] 获取OHLCV: ${symbol} (${exchange}, ${timeframe}, limit=${limit})`);

    // ✅ 直接优先使用OKX公开API
    if (exchange === 'okx') {
      try {
        const ohlcv = await fallbackOkxOHLCV(symbol, timeframe, parseInt(limit));
        console.log(`✅ [API] OKX公开API获取成功(OHLCV): ${symbol}, ${ohlcv.length}条数据`);
        return res.json({ success: true, data: ohlcv });
      } catch (e) {
        console.warn(`⚠️ [API] OKX公开API失败，尝试CCXT: ${e.message}`);
      }
    }

    // ✅ 备用：使用CCXT/dataSourceManager
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('请求超时，请检查网络连接')), 25000)
    );

    const ohlcv = await Promise.race([
      dataSourceManager.getOHLCV(exchange, symbol, timeframe, parseInt(limit)),
      timeoutPromise
    ]);

    console.log(`✅ [API] OHLCV获取成功: ${symbol}, ${ohlcv.length}条数据`);

    res.json({
      success: true,
      data: ohlcv
    });
  } catch (error) {
    console.error('❌ [API] OHLCV错误:', error.message);

    const errorMessage = error.message.includes('fetch failed')
      ? '网络连接失败，请检查网络或稍后重试'
      : error.message;

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/market/orderbook
 * 获取订单簿（使用统一数据源管理器）
 */
router.get('/orderbook', validateQuery(schemas.marketData.orderbook), async (req, res) => {
  try {
    const {
      exchange = DEFAULT_EXCHANGE,
      symbol = DEFAULT_SYMBOL,
      limit = 20
    } = req.query;

    const orderBook = await dataSourceManager.getOrderBook(
      exchange,
      symbol,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: orderBook
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/market/available-symbols
 * 获取可用的交易对列表
 */
router.get('/available-symbols', validateQuery(schemas.marketData.availableSymbols), async (req, res) => {
  try {
    const { exchange = DEFAULT_EXCHANGE, quote = 'USDT' } = req.query;
    const ccxt = require('ccxt');
    
    const exchangeInstance = new ccxt[exchange]();
    await exchangeInstance.loadMarkets();
    
    // 获取所有USDT交易对
    const symbols = Object.keys(exchangeInstance.markets)
      .filter(symbol => symbol.endsWith(`/${quote}`))
      .sort();
    
    // 推荐的热门币种（排在前面）
    const hotSymbols = [
      'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT',
      'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'TRX/USDT'
    ];
    
    // 将热门币种排在前面
    const sortedSymbols = [
      ...hotSymbols.filter(s => symbols.includes(s)),
      ...symbols.filter(s => !hotSymbols.includes(s))
    ];
    
    res.json({
      success: true,
      data: sortedSymbols,
      total: sortedSymbols.length,
      hot: hotSymbols
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
