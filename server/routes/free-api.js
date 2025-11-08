/**
 * 免费API数据路由
 * 提供Yahoo Finance、Reddit、Blockchain等免费数据源的API接口
 */

const express = require('express');
const router = express.Router();
const dataSourceManager = require('../services/data-source/DataSourceManager');

/**
 * GET /api/free-api/market-indices
 * 获取美股指数数据 (标普500、纳斯达克、美元指数)
 */
router.get('/market-indices', async (req, res) => {
  try {
    console.log('📊 [免费API] 请求美股指数数据...');
    
    const data = await dataSourceManager.router.freeAPI.getMarketIndices();
    
    if (data) {
      res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: '无法获取美股指数数据',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ [免费API] 美股指数接口错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/free-api/crypto-sentiment
 * 获取Reddit加密货币情绪数据
 */
router.get('/crypto-sentiment', async (req, res) => {
  try {
    console.log('📊 [免费API] 请求Reddit情绪数据...');
    
    const data = await dataSourceManager.router.freeAPI.getCryptoSentiment();
    
    if (data) {
      res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: '无法获取Reddit情绪数据',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ [免费API] Reddit情绪接口错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/free-api/bitcoin-onchain
 * 获取比特币链上数据
 */
router.get('/bitcoin-onchain', async (req, res) => {
  try {
    console.log('📊 [免费API] 请求比特币链上数据...');
    
    const data = await dataSourceManager.router.freeAPI.getBitcoinOnChain();
    
    if (data) {
      res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: '无法获取比特币链上数据',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ [免费API] 比特币链上接口错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/free-api/enhanced-data
 * 获取所有免费API增强数据
 */
router.get('/enhanced-data', async (req, res) => {
  try {
    console.log('🚀 [免费API] 请求所有增强数据...');
    
    const data = await dataSourceManager.getFreeAPIEnhancedData();
    
    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [免费API] 增强数据接口错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/free-api/comprehensive/:symbol
 * 获取综合市场分析数据 (包含免费API)
 */
router.get('/comprehensive/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const exchange = req.query.exchange || 'binance';
    
    console.log(`📊 [免费API] 请求${symbol}综合分析数据...`);
    
    const data = await dataSourceManager.getComprehensiveMarketData(exchange, symbol);
    
    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [免费API] 综合分析接口错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/free-api/cache/clear
 * 清理免费API缓存
 */
router.post('/cache/clear', async (req, res) => {
  try {
    console.log('🧹 [免费API] 清理缓存...');
    
    dataSourceManager.clearFreeAPICache();
    
    res.json({
      success: true,
      message: '免费API缓存已清理',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [免费API] 清理缓存错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/free-api/cache/stats
 * 获取免费API缓存统计
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = dataSourceManager.getFreeAPICacheStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [免费API] 缓存统计错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/free-api/health
 * 免费API健康检查
 */
router.get('/health', async (req, res) => {
  try {
    console.log('🏥 [免费API] 执行健康检查...');
    
    // 测试各个API的可用性
    const [indicesTest, sentimentTest, onchainTest] = await Promise.allSettled([
      dataSourceManager.router.freeAPI.getMarketIndices(),
      dataSourceManager.router.freeAPI.getCryptoSentiment(),
      dataSourceManager.router.freeAPI.getBitcoinOnChain()
    ]);
    
    const health = {
      yahoo_finance: indicesTest.status === 'fulfilled' && indicesTest.value !== null,
      reddit_api: sentimentTest.status === 'fulfilled' && sentimentTest.value !== null,
      blockchain_info: onchainTest.status === 'fulfilled' && onchainTest.value !== null,
      overall_status: 'unknown'
    };
    
    const workingCount = Object.values(health).filter(v => v === true).length;
    const totalCount = Object.keys(health).length - 1; // 排除overall_status
    
    if (workingCount === totalCount) {
      health.overall_status = 'healthy';
    } else if (workingCount > 0) {
      health.overall_status = 'partial';
    } else {
      health.overall_status = 'unhealthy';
    }
    
    res.json({
      success: true,
      data: {
        health,
        working_apis: `${workingCount}/${totalCount}`,
        cache_stats: dataSourceManager.getFreeAPICacheStats()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [免费API] 健康检查错误:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
