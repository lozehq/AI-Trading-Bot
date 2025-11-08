const express = require('express');
const router = express.Router();

const checkpointService = require('../services/checkpointService');

// GET /api/checkpoints?symbol=ETH/USDT&limit=50
router.get('/', (req, res) => {
  try {
    const symbol = req.query.symbol;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const rows = checkpointService.listCheckpoints(symbol, limit);
    return res.json({ symbol, count: rows.length, items: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/checkpoints/range?symbol=ETH/USDT&start=2025-10-01T00:00:00.000Z&end=2025-10-28T00:00:00.000Z
router.get('/range', (req, res) => {
  try {
    const { symbol, start, end } = req.query;
    if (!symbol || !start || !end) return res.status(400).json({ error: 'symbol, start, end are required' });
    const rows = checkpointService.getRange(symbol, start, end);
    return res.json({ symbol, items: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;


