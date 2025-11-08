const express = require('express');
const router = express.Router();
const runtimeStrategy = require('../services/runtimeStrategy');

// 获取策略配置
router.get('/', (req, res) => {
  res.json({ success: true, data: runtimeStrategy.getConfig() });
});

// 更新策略配置（支持局部更新）
router.post('/', (req, res) => {
  try {
    const { globalRealtime, tickerTTL, indicatorsTTL, aggressiveness, simulatePaperFills, analysisFallbackEnabled } = req.body || {};
    const next = runtimeStrategy.updateConfig({ globalRealtime, tickerTTL, indicatorsTTL, aggressiveness, simulatePaperFills, analysisFallbackEnabled });
    res.json({ success: true, data: next });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;


