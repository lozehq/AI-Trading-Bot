/**
 * 数据源管理API路由
 */

const express = require('express');
const { ApiResponse } = require('../utils/response');
const router = express.Router();
const dataSourceManager = require('../services/dataSourceManager');

/**
 * GET /api/data-source/status
 * 获取数据源状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = await dataSourceManager.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-source/test
 * 测试当前数据源（包含Ticker、OHLCV和技术指标）
 */
router.get('/test', async (req, res) => {
  try {
    const currentSource = dataSourceManager.getCurrentSource();
    const symbol = req.query.symbol || 'BTC/USDT';
    const exchange = req.query.exchange || 'okx';
    const timeframe = req.query.timeframe || '1h';

    console.log(`🧪 [测试] 测试${currentSource.toUpperCase()}数据源: ${symbol}`);

    const startTime = Date.now();

    // 并行获取所有数据
    const [ticker, ohlcv, indicators] = await Promise.all([
      dataSourceManager.getTicker(exchange, symbol),
      dataSourceManager.getOHLCV(exchange, symbol, timeframe, 100),
      dataSourceManager.getAllIndicators(exchange, symbol, timeframe)
    ]);

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        source: currentSource,
        symbol,
        exchange,
        timeframe,
        duration: `${duration}ms`,
        ticker,
        ohlcv: {
          count: ohlcv.length,
          latest: ohlcv[ohlcv.length - 1],
          oldest: ohlcv[0]
        },
        indicators,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ [测试] 数据源测试失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      source: dataSourceManager.getCurrentSource()
    });
  }
});

/**
 * POST /api/data-source/switch
 * 切换数据源
 * Body: { source: 'mcp' | 'ccxt' }
 */
router.post('/switch', async (req, res) => {
  try {
    const { source, autoManageResources = true } = req.body;

    if (!source) {
      return res.status(400).json({
        success: false,
        error: '缺少参数: source'
      });
    }

    // 切换数据源（带智能资源管理）
    const result = await dataSourceManager.switchSource(source, autoManageResources);
    const status = await dataSourceManager.getStatus();

    res.json({
      success: true,
      data: {
        ...result,
        ...status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-source/ticker/:symbol
 * 获取实时价格（使用当前数据源）
 */
router.get('/ticker/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const exchange = req.query.exchange || 'okx';
    
    const data = await dataSourceManager.getTicker(exchange, symbol);
    
    res.json({
      success: true,
      data,
      source: dataSourceManager.getCurrentSource()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-source/ohlcv/:symbol
 * 获取K线数据（使用当前数据源）
 */
router.get('/ohlcv/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const exchange = req.query.exchange || 'okx';
    const timeframe = req.query.timeframe || '1h';
    const limit = parseInt(req.query.limit) || 100;
    
    const data = await dataSourceManager.getOHLCV(exchange, symbol, timeframe, limit);
    
    res.json({
      success: true,
      data,
      count: data.length,
      source: dataSourceManager.getCurrentSource()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-source/indicators/:symbol
 * 获取技术指标（使用当前数据源）
 */
router.get('/indicators/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const exchange = req.query.exchange || 'okx';
    const timeframe = req.query.timeframe || '1h';
    
    const data = await dataSourceManager.getAllIndicators(exchange, symbol, timeframe);
    
    res.json({
      success: true,
      data,
      source: dataSourceManager.getCurrentSource()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-source/complete/:symbol
 * 获取完整市场数据（使用当前数据源）
 */
router.get('/complete/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.replace('-', '/');
    const exchange = req.query.exchange || 'okx';
    const timeframe = req.query.timeframe || '1h';
    
    const data = await dataSourceManager.getCompleteMarketData(exchange, symbol, timeframe);
    
    res.json({
      success: true,
      data,
      source: dataSourceManager.getCurrentSource()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/data-source/compare
 * 对比两种数据源的性能
 * 修复：不修改全局状态，直接调用底层服务避免竞态条件
 */
router.get('/compare', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'BTC/USDT';
    const exchange = req.query.exchange || 'okx';

    console.log(`\n📊 [对比] 开始对比MCP vs CCXT数据源...\n`);

    const okxDataService = require('../services/okxDataService');
    const mcpService = require('../services/mcpService');

    // 测试CCXT（直接调用服务，不修改全局状态）
    const ccxtStart = Date.now();
    let ccxtData, ccxtError;
    try {
      ccxtData = await okxDataService.getTicker(symbol);
      ccxtData = {
        symbol: ccxtData.symbol,
        price: ccxtData.last,
        high24h: ccxtData.high,
        low24h: ccxtData.low,
        volume24h: ccxtData.baseVolume,
        change24h: ccxtData.percentage
      };
    } catch (error) {
      ccxtError = error.message;
    }
    const ccxtDuration = Date.now() - ccxtStart;

    // 测试MCP（直接调用服务，不修改全局状态）
    const mcpStart = Date.now();
    let mcpData, mcpError;
    try {
      mcpData = await mcpService.fetchTicker(exchange, symbol);
    } catch (error) {
      mcpError = error.message;
    }
    const mcpDuration = Date.now() - mcpStart;

    const comparison = {
      symbol,
      ccxt: {
        duration: `${ccxtDuration}ms`,
        success: !ccxtError,
        error: ccxtError,
        price: ccxtData?.price
      },
      mcp: {
        duration: `${mcpDuration}ms`,
        success: !mcpError,
        error: mcpError,
        price: mcpData?.price
      },
      winner: ccxtDuration < mcpDuration ? 'ccxt' : 'mcp',
      speedup: `${((Math.max(ccxtDuration, mcpDuration) / Math.min(ccxtDuration, mcpDuration)) * 100 - 100).toFixed(1)}%`
    };

    console.log(`\n✅ [对比] 完成！`);
    console.log(`🏆 胜者: ${comparison.winner.toUpperCase()}`);
    console.log(`⚡ 速度提升: ${comparison.speedup}\n`);

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

