// 轻量检查点服务：按需保存市场状态以支持回溯与上下文增强
// 设计原则：
// - 按需创建数据表，不侵入全局Schema
// - 默认节流（同一symbol最短间隔），避免频繁写入
// - 存储紧凑：仅保留关键市场字段 + 精简指标 + 上下文指标

const { getDatabase } = require('../database/database');

function ensureTable() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      exchange TEXT,
      timeframe TEXT,
      price REAL NOT NULL,
      market_data TEXT,           -- 紧凑市场数据(JSON)
      indicators_summary TEXT,    -- 指标摘要(JSON)
      context_metrics TEXT,       -- 上下文指标(JSON): {coverage, issueRate, conflict}
      used_refs TEXT,             -- 引用摘要(JSON数组)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_market_checkpoints_symbol ON market_checkpoints(symbol)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_market_checkpoints_created_at ON market_checkpoints(created_at)');
}

function compactMarketData(marketData) {
  if (!marketData || typeof marketData !== 'object') return null;
  const out = {
    price: Number(marketData.price || marketData.ticker?.last || 0) || 0,
    change24h: Number(marketData.change24h || marketData.ticker?.percentage || 0) || 0,
    volume24h: Number(marketData.volume24h || marketData.ticker?.baseVolume || marketData.ticker?.quoteVolume || 0) || 0,
    high24h: Number(marketData.high24h || marketData.ticker?.high || 0) || 0,
    low24h: Number(marketData.low24h || marketData.ticker?.low || 0) || 0,
  };
  return out;
}

function compactIndicators(indicators) {
  if (!indicators || typeof indicators !== 'object') return null;
  const safe = {};
  // 尽量提取通用字段，均为可选
  const momentum = indicators.momentum || {};
  const trend = indicators.trend || {};
  const volatility = indicators.volatility || {};
  const volume = indicators.volume || {};

  const macd = momentum.macd || indicators.macd || null;
  const rsi = momentum.rsi14 || momentum.rsi || indicators.rsi || null;
  const ema = trend.ema || { ema50: trend.ema50, ema200: trend.ema200 };
  const bb = volatility.bollinger || indicators.bollinger || null;
  const stoch = momentum.stochastic || indicators.stochastic || null;

  if (rsi != null) safe.rsi = Number(rsi);
  if (macd && typeof macd === 'object') safe.macd = { histogram: Number(macd.histogram ?? 0) };
  if (ema && typeof ema === 'object') safe.ema = { ema50: Number(ema.ema50 ?? 0), ema200: Number(ema.ema200 ?? 0) };
  if (bb && typeof bb === 'object') safe.bollinger = { bandwidth: Number(bb.bandwidth ?? 0) };
  if (stoch && typeof stoch === 'object') safe.stochastic = { k: Number(stoch.k ?? 0), d: Number(stoch.d ?? 0) };

  return safe;
}

function summarizeRefs(refs, limit = 5) {
  if (!Array.isArray(refs)) return [];
  return refs.slice(0, limit).map(r => ({ id: r.id, signal: r.signal, confidence: r.confidence, similarity: r.similarity, t: r.timestamp }));
}

function getLastCheckpoint(symbol) {
  ensureTable();
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, price, created_at FROM market_checkpoints
    WHERE symbol = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(symbol);
  return row || null;
}

/**
 * 按条件创建检查点（最短间隔/价格变动阈值）
 */
function maybeCreateCheckpoint(symbol, marketData, indicators, extras = {}) {
  ensureTable();
  const db = getDatabase();

  const exchange = marketData?.exchange || 'unknown';
  const timeframe = marketData?.timeframe || '1h';
  const cm = compactMarketData(marketData) || {};
  const price = Number(cm.price || marketData?.price || 0) || 0;
  const ind = compactIndicators(indicators);
  const metrics = extras.contextMetrics || null;
  const refs = summarizeRefs(extras.usedRefs, 6);

  const minIntervalMs = Number(process.env.CHECKPOINT_MIN_INTERVAL_MS || 5 * 60 * 1000);
  const minPriceChange = Number(process.env.CHECKPOINT_MIN_PRICE_CHANGE || 0.003); // 0.3%

  // 策略：若上次时间太近且价格变化不足阈值，则跳过
  const last = getLastCheckpoint(symbol);
  if (last) {
    const lastTs = new Date(last.created_at).getTime();
    const now = Date.now();
    const withinInterval = (now - lastTs) < minIntervalMs;
    const priceChangeRatio = last.price > 0 ? Math.abs(price - last.price) / last.price : 1;
    if (withinInterval && priceChangeRatio < minPriceChange) return { skipped: true, reason: 'throttled' };
  }

  const stmt = db.prepare(`
    INSERT INTO market_checkpoints (symbol, exchange, timeframe, price, market_data, indicators_summary, context_metrics, used_refs)
    VALUES (@symbol, @exchange, @timeframe, @price, @market_data, @indicators_summary, @context_metrics, @used_refs)
  `);
  const payload = {
    symbol,
    exchange,
    timeframe,
    price,
    market_data: JSON.stringify(cm),
    indicators_summary: JSON.stringify(ind || {}),
    context_metrics: JSON.stringify(metrics || {}),
    used_refs: JSON.stringify(refs || [])
  };
  const result = stmt.run(payload);
  return { skipped: false, id: result.lastInsertRowid };
}

function listCheckpoints(symbol, limit = 50) {
  ensureTable();
  const db = getDatabase();
  return db.prepare(`
    SELECT id, symbol, exchange, timeframe, price, market_data, indicators_summary, context_metrics, used_refs, created_at
    FROM market_checkpoints
    WHERE symbol = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(symbol, limit).map(row => ({
    ...row,
    market_data: safeParse(row.market_data),
    indicators_summary: safeParse(row.indicators_summary),
    context_metrics: safeParse(row.context_metrics),
    used_refs: safeParse(row.used_refs)
  }));
}

function getRange(symbol, startIso, endIso) {
  ensureTable();
  const db = getDatabase();
  return db.prepare(`
    SELECT id, symbol, exchange, timeframe, price, market_data, indicators_summary, context_metrics, used_refs, created_at
    FROM market_checkpoints
    WHERE symbol = @symbol AND created_at >= @start AND created_at <= @end
    ORDER BY created_at ASC
  `).all({ symbol, start: startIso, end: endIso }).map(row => ({
    ...row,
    market_data: safeParse(row.market_data),
    indicators_summary: safeParse(row.indicators_summary),
    context_metrics: safeParse(row.context_metrics),
    used_refs: safeParse(row.used_refs)
  }));
}

function safeParse(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

module.exports = {
  ensureTable,
  maybeCreateCheckpoint,
  listCheckpoints,
  getRange
};


