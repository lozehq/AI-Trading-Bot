const express = require('express');
const router = express.Router();
const okxTrading = require('../services/exchange/OkxTradingService');
const { validateBody, validateQuery, schemas } = require('../validators');

// 下单
router.post('/order', validateBody(
  // 动态内联校验，避免修改现有schemas影响范围
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    side: require('joi').string().valid('BUY', 'SELL', 'buy', 'sell').required(),
    type: require('joi').string().valid('MARKET', 'LIMIT', 'market', 'limit').required(),
    amount: require('joi').number().positive().required(),
    price: require('joi').number().positive().optional(),
    mode: require('joi').string().valid('paper','demo','live').optional(),
    params: require('joi').object().optional()
  })
), async (req, res) => {
  try {
    const payload = req.body;
    const result = await okxTrading.createOrder(payload);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 撤单
router.post('/cancel', validateBody(
  require('joi').object({
    id: require('joi').string().required(),
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.cancelOrder(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 余额
router.get('/balance', validateQuery(
  require('joi').object({ mode: require('joi').string().valid('paper','demo','live').optional() })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchBalance(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 未成交订单
router.get('/open-orders', validateQuery(
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).optional(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchOpenOrders(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 历史订单
router.get('/closed-orders', validateQuery(
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).optional(),
    since: require('joi').number().integer().optional(),
    limit: require('joi').number().integer().min(1).max(100).optional(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchClosedOrders(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== 扩展功能 =====

// 账户信息
router.get('/account', validateQuery(
  require('joi').object({ mode: require('joi').string().valid('paper','demo','live').optional() })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchAccountInfo(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 持仓信息
router.get('/positions', validateQuery(
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).optional(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchPositions(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 查询单个订单
router.get('/order/:id', validateQuery(
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchOrder({ id: req.params.id, ...req.query });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 交易手续费率
router.get('/fees', validateQuery(
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).optional(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchTradingFees(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取杠杆
router.get('/leverage', validateQuery(
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchLeverage(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 设置杠杆
router.post('/leverage', validateBody(
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    leverage: require('joi').number().integer().min(1).max(125).required(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.setLeverage(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 资金费率
router.get('/funding-rate', validateQuery(
  require('joi').object({
    symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchFundingRate(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 批量下单
router.post('/batch-order', validateBody(
  require('joi').object({
    orders: require('joi').array().items(
      require('joi').object({
        symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required(),
        side: require('joi').string().valid('BUY', 'SELL', 'buy', 'sell').required(),
        type: require('joi').string().valid('MARKET', 'LIMIT', 'market', 'limit').required(),
        amount: require('joi').number().positive().required(),
        price: require('joi').number().positive().optional()
      })
    ).min(1).max(10).required(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.createOrders(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 批量撤单
router.post('/batch-cancel', validateBody(
  require('joi').object({
    orders: require('joi').array().items(
      require('joi').object({
        id: require('joi').string().required(),
        symbol: require('joi').string().pattern(/^[A-Z0-9]+\/[A-Z]+$/).required()
      })
    ).min(1).max(10).required(),
    mode: require('joi').string().valid('paper','demo','live').optional()
  })
), async (req, res) => {
  try {
    const result = await okxTrading.cancelOrders(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取市场信息
router.get('/markets', validateQuery(
  require('joi').object({ mode: require('joi').string().valid('paper','demo','live').optional() })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchMarkets(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取交易对信息
router.get('/symbol/:symbol', validateQuery(
  require('joi').object({ mode: require('joi').string().valid('paper','demo','live').optional() })
), async (req, res) => {
  try {
    const result = await okxTrading.fetchSymbol({ symbol: req.params.symbol, ...req.query });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 测试API连接
router.get('/test', validateQuery(
  require('joi').object({ mode: require('joi').string().valid('paper','demo','live').optional() })
), async (req, res) => {
  try {
    const result = await okxTrading.testConnection(req.query);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;


