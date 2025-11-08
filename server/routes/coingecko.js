const express = require('express');
const router = express.Router();
const coingeckoMCP = require('../services/coingeckoMCP');

/**
 * GET /api/coingecko/markets
 * 获取币种市场数据
 */
router.get('/markets', async (req, res) => {
  try {
    const {
      vs_currency = 'usd',
      order = 'market_cap_desc',
      per_page = 20,
      page = 1
    } = req.query;

    const markets = await coingeckoMCP.getCoinsMarkets(vs_currency, {
      order,
      perPage: parseInt(per_page),
      page: parseInt(page)
    });

    res.json({
      success: true,
      data: markets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/coingecko/coin/:id
 * 获取单个币种详情
 */
router.get('/coin/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const coinDetail = await coingeckoMCP.getCoinDetail(id);

    res.json({
      success: true,
      data: coinDetail
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/coingecko/gainers-losers
 * 获取涨跌幅榜单
 */
router.get('/gainers-losers', async (req, res) => {
  try {
    const { vs_currency = 'usd', duration = '24h' } = req.query;
    const data = await coingeckoMCP.getTopGainersLosers(vs_currency, duration);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/coingecko/new-coins
 * 获取新上市币种
 */
router.get('/new-coins', async (req, res) => {
  try {
    const newCoins = await coingeckoMCP.getNewCoins();

    res.json({
      success: true,
      data: newCoins
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/coingecko/sentiment
 * 获取市场情绪分析
 */
router.get('/sentiment', async (req, res) => {
  try {
    const sentiment = await coingeckoMCP.getMarketSentiment();

    res.json({
      success: true,
      data: sentiment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

