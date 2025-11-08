const express = require('express');
const router = express.Router();
const SCMEngine = require('../services/causal/SCMEngine');
const { getConfig, setConfig } = require('../database/database');

// POST /api/causal/what-if
// body: { symbol, intervention: { var: value }, model?: { variables: { ... } } }
router.post('/what-if', async (req, res) => {
  try {
    const { symbol, intervention = {}, model = null } = req.body || {};
    if (!symbol) return res.status(400).json({ success: false, error: '缺少 symbol' });

    // 基础变量：尽量拉最新 ticker 与关键指标
    const dataSourceManager = require('../services/dataSourceManager');
    const exchange = process.env.EXCHANGE_NAME || 'okx';
    const base = {};
    try {
      const ticker = await dataSourceManager.getTicker(exchange, symbol);
      if (ticker && Number.isFinite(ticker.last)) base.price = Number(ticker.last);
    } catch (_) {}
    try {
      const indicators = await dataSourceManager.getAllIndicators(exchange, symbol, '1h');
      const rsi = indicators?.momentum?.rsi14;
      if (Number.isFinite(rsi)) base.rsi = Number(rsi);
      const atr = indicators?.volatility?.atr14;
      if (Number.isFinite(atr)) base.atr = Number(atr);
    } catch (_) {}

    const engine = new SCMEngine(model);
    const before = { ...base };
    const { values: after } = engine.forward(base, intervention);

    // 仅返回变化过的键
    const delta = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach(k => {
      const a = Number(after[k]);
      const b = Number(before[k]);
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) delta[k] = a - b;
    });

    return res.json({ success: true, data: { symbol, before, after, delta } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

// === 持久化因果模型 ===
// GET /api/causal/model?symbol=ETH/USDT
router.get('/model', (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ success: false, error: '缺少 symbol' });
    const key = `causal_model:${symbol}`;
    const model = getConfig(key) || { variables: {} };
    res.json({ success: true, data: { symbol, model } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/causal/model  body: { symbol, model }
router.put('/model', (req, res) => {
  try {
    const { symbol, model } = req.body || {};
    if (!symbol || !model) return res.status(400).json({ success: false, error: '缺少 symbol 或 model' });
    const key = `causal_model:${symbol}`;
    setConfig(key, model);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


