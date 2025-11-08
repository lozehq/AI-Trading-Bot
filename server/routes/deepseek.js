const express = require('express');
const router = express.Router();
const deepseekService = require('../services/deepseek');
const dataSourceManager = require('../services/dataSourceManager');
const { validateBody, schemas } = require('../validators');

// 请求超时时间：30秒
const REQUEST_TIMEOUT = 30000;

/**
 * 创建超时Promise
 */
function createTimeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('请求超时')), ms);
  });
}

/**
 * 验证交易对格式
 */
function validateSymbol(symbol) {
  // 格式：BASE/QUOTE，如 BTC/USDT
  const symbolRegex = /^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/;
  if (!symbolRegex.test(symbol)) {
    throw new Error('无效的交易对格式');
  }
  return true;
}

/**
 * 验证支持的交易所
 */
function validateExchange(exchange) {
  const supportedExchanges = ['okx', 'binance', 'bybit', 'bitget'];
  if (!supportedExchanges.includes(exchange)) {
    throw new Error('不支持的交易所');
  }
  return true;
}

/**
 * POST /api/deepseek/analyze
 * AI市场分析（使用统一数据源）
 */
router.post('/analyze', validateBody(schemas.ai.analyze), async (req, res, next) => {
  try {
    const { symbol = 'ETH/USDT', exchange = 'okx', useAI = true, realtime: bodyRealtime } = req.body;

    // 输入验证
    validateSymbol(symbol);
    validateExchange(exchange);

    const realtimeHeader = req.get('X-Realtime');
    const realtimeRaw = req.query.realtime ?? req.body.realtime ?? realtimeHeader;
    const realtime = String(realtimeRaw).toLowerCase() === '1' || String(realtimeRaw).toLowerCase() === 'true';

    console.log(`\n🔍 开始AI分析: ${symbol} (${exchange})`);

    // 1. 使用统一数据源获取实时数据（带超时控制）
    console.log('📊 获取市场数据...');
    const [ticker, ohlcv, indicators] = await Promise.race([
      Promise.all([
        dataSourceManager.getTicker(exchange, symbol),
        dataSourceManager.getOHLCV(exchange, symbol, '1h', 100),
        dataSourceManager.getAllIndicators(exchange, symbol, '1h')
      ]),
      createTimeout(REQUEST_TIMEOUT)
    ]);

    const marketData = {
      symbol,
      exchange,
      price: ticker?.price || ticker?.last || 0,
      change24h: ticker?.change24h || ticker?.percentage || 0,
      volume24h: ticker?.volume24h || ticker?.quoteVolume || 0,
      high24h: ticker?.high24h || ticker?.high || 0,
      low24h: ticker?.low24h || ticker?.low || 0,
      timestamp: new Date().toISOString(),
      realtime
    };

    console.log(`⏱️ 实时旁路: ${realtime ? 'YES' : 'NO'}`);

    console.log(`✅ 市场数据: ${symbol} = $${marketData.price} (${marketData.change24h > 0 ? '+' : ''}${marketData.change24h?.toFixed(2)}%)`);
    console.log(`✅ 技术指标: RSI=${indicators.rsi?.toFixed(2)}, MACD=${indicators.macd?.MACD?.toFixed(2)}`);

    // 2. 如果启用AI，使用AI分析（不使用MCP工具，因为API限制）
    if (useAI) {
      console.log('🤖 调用AI进行深度分析...');

      const analysis = await deepseekService.analyzeMarket(marketData, indicators);

      res.json({
        success: true,
        data: {
          marketData,
          indicators,
          analysis,
          usedMCP: true
        },
        timestamp: new Date().toISOString()
      });
    } else {
      // 仅返回技术分析
      const analysis = await deepseekService.analyzeMarket(marketData, indicators);

      res.json({
        success: true,
        data: {
          marketData,
          indicators,
          analysis,
          usedMCP: false
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ AI分析错误:', error);

    // 安全的错误响应，不泄露敏感信息
    let statusCode = 500;
    let errorMessage = '分析服务暂时不可用';

    if (error.message === '请求超时') {
      statusCode = 504;
      errorMessage = '请求超时，请稍后重试';
    } else if (error.message === '无效的交易对格式') {
      statusCode = 400;
      errorMessage = '交易对格式错误，应为 BASE/QUOTE 格式';
    } else if (error.message === '不支持的交易所') {
      statusCode = 400;
      errorMessage = '不支持该交易所，请使用 okx/binance/bybit/bitget';
    } else if (error.message?.includes('rate limit')) {
      statusCode = 429;
      errorMessage = '请求频率过高，请稍后重试';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/deepseek/stream-analyze
 * 流式AI分析
 */
router.post('/stream-analyze', async (req, res) => {
  try {
    const { marketData, indicators, newsData } = req.body;

    // 基本参数验证
    if (!marketData || !indicators) {
      return res.status(400).json({
        success: false,
        error: '缺少必要的分析数据',
        timestamp: new Date().toISOString()
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 设置流式超时（60秒）
    const streamTimeout = setTimeout(() => {
      res.write('data: {"error": "流式分析超时"}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    }, 60000);

    await deepseekService.streamAnalysis(
      marketData,
      indicators,
      newsData,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
    );

    clearTimeout(streamTimeout);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('流式分析错误:', error);

    // 如果响应头已发送，则通过SSE发送错误
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({
        error: '分析过程中出现错误，请稍后重试'
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // 否则返回标准错误响应
      res.status(500).json({
        success: false,
        error: '流式分析服务暂时不可用',
        timestamp: new Date().toISOString()
      });
    }
  }
});

module.exports = router;

