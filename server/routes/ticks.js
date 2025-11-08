const express = require('express');
const router = express.Router();
const tickRecorder = require('../services/tickRecorder');
const { getDatabase } = require('../database/database');
const { aggregateTicks } = require('../services/tickUtils');

// 启动指定交易对的tick录制
router.post('/record/start', async (req, res) => {
  try {
    const { symbol } = req.body || {};
    if (!symbol) return res.status(400).json({ success: false, error: '缺少 symbol' });
    tickRecorder.start(symbol);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 停止录制
router.post('/record/stop', async (req, res) => {
  try {
    const { symbol } = req.body || {};
    if (!symbol) return res.status(400).json({ success: false, error: '缺少 symbol' });
    tickRecorder.stop(symbol);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 状态
router.get('/status', (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ success: false, error: '缺少 symbol' });
    const running = tickRecorder.isRunning(symbol);
    const s = tickRecorder.stats(symbol);
    res.json({ success: true, data: { running, count: s.cnt || 0, minTs: s.minTs, maxTs: s.maxTs } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 回填最近成交
router.post('/backfill', async (req, res) => {
  try {
    const { symbol, limit } = req.body || {};
    if (!symbol) return res.status(400).json({ success: false, error: '缺少 symbol' });
    const r = await tickRecorder.backfillRecent(symbol, Number(limit) || 500);
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 查询tick
router.get('/query', (req, res) => {
  try {
    const { symbol, from, to, limit } = req.query;
    if (!symbol) return res.status(400).json({ success: false, error: '缺少 symbol' });
    const db = getDatabase();
    const lim = Math.min(Number(limit) || 1000, 20000);
    const hasFrom = Number.isFinite(Number(from));
    const hasTo = Number.isFinite(Number(to));
    let rows;
    if (hasFrom && hasTo) {
      rows = db.prepare(`SELECT ts, price, size, side FROM tick_trades WHERE symbol = ? AND ts BETWEEN ? AND ? ORDER BY ts ASC LIMIT ?`).all(symbol, Number(from), Number(to), lim);
    } else if (hasFrom) {
      rows = db.prepare(`SELECT ts, price, size, side FROM tick_trades WHERE symbol = ? AND ts >= ? ORDER BY ts ASC LIMIT ?`).all(symbol, Number(from), lim);
    } else if (hasTo) {
      rows = db.prepare(`SELECT ts, price, size, side FROM tick_trades WHERE symbol = ? AND ts <= ? ORDER BY ts DESC LIMIT ?`).all(symbol, Number(to), lim).reverse();
    } else {
      rows = db.prepare(`SELECT ts, price, size, side FROM tick_trades WHERE symbol = ? ORDER BY ts DESC LIMIT ?`).all(symbol, lim).reverse();
    }
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 聚合为bar
router.get('/aggregate', (req, res) => {
  try {
    const { symbol, from, to, limit, timeframe = '1s' } = req.query;
    if (!symbol) return res.status(400).json({ success: false, error: '缺少 symbol' });
    const db = getDatabase();
    const lim = Math.min(Number(limit) || 200000, 500000);
    const hasFrom = Number.isFinite(Number(from));
    const hasTo = Number.isFinite(Number(to));
    let rows;
    if (hasFrom && hasTo) {
      rows = db.prepare(`SELECT ts, price, size, side FROM tick_trades WHERE symbol = ? AND ts BETWEEN ? AND ? ORDER BY ts ASC LIMIT ?`).all(symbol, Number(from), Number(to), lim);
    } else if (hasFrom) {
      rows = db.prepare(`SELECT ts, price, size, side FROM tick_trades WHERE symbol = ? AND ts >= ? ORDER BY ts ASC LIMIT ?`).all(symbol, Number(from), lim);
    } else if (hasTo) {
      rows = db.prepare(`SELECT ts, price, size, side FROM tick_trades WHERE symbol = ? AND ts <= ? ORDER BY ts DESC LIMIT ?`).all(symbol, Number(to), lim).reverse();
    } else {
      rows = db.prepare(`SELECT ts, price, size, side FROM tick_trades WHERE symbol = ? ORDER BY ts DESC LIMIT ?`).all(symbol, lim).reverse();
    }
    const bars = aggregateTicks(rows, timeframe);
    res.json({ success: true, data: bars });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;



