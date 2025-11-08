const express = require('express');
const router = express.Router();

/**
 * GET /api/data-sources/status
 * 获取所有数据源状态
 */
router.get('/status', async (req, res) => {
  try {
    const { getDatabase } = require('../database/database');
    const db = getDatabase();

    // 尝试获取最近一次AI分析记录
    let dataCoverage = null;
    let latestAnalysis = null;

    try {
      const analysisQuery = db.prepare(`
        SELECT analysis_result, created_at, symbol
        FROM ai_analyses
        ORDER BY created_at DESC
        LIMIT 1
      `);
      latestAnalysis = analysisQuery.get();

      if (latestAnalysis && latestAnalysis.analysis_result) {
        try {
          const result = JSON.parse(latestAnalysis.analysis_result);
          dataCoverage = result.dataCoverage || null;
        } catch (e) {
          console.warn('Failed to parse analysis_result:', e.message);
        }
      }
    } catch (dbError) {
      console.warn('Failed to query ai_analyses:', dbError.message);
      // Continue without analysis data
    }

    // 定义所有数据源
    const dataSources = {
      // 核心基础数据 (5个)
      core: [
        { id: 'ticker', name: '实时价格', critical: true, category: 'core' },
        { id: 'indicators', name: '技术指标', critical: true, category: 'core' },
        { id: 'ohlcv', name: 'K线数据', critical: true, category: 'core' },
        { id: 'orderBook', name: '订单簿', critical: false, category: 'core' },
        { id: 'trades', name: '成交记录', critical: false, category: 'core' }
      ],

      // 市场数据 (8个)
      market: [
        { id: 'multiTimeframe', name: '多时间框架', critical: true, category: 'market' },
        { id: 'sentiment', name: '市场情绪(恐惧贪婪)', critical: false, category: 'market' },
        { id: 'coinDetail', name: '币种详情', critical: false, category: 'market' },
        { id: 'gainersLosers', name: '涨跌榜', critical: false, category: 'market' },
        { id: 'aktools', name: 'AkTools数据', critical: false, category: 'market' },
        { id: 'freeAPIs', name: '免费API数据', critical: false, category: 'market' },
        { id: 'advancedIndicators', name: '高级指标', critical: false, category: 'market' },
        { id: 'marketCapRanking', name: '市值排行', critical: false, category: 'market' }
      ],

      // Phase 1: CRITICAL (5个)
      phase1: [
        { id: 'fundingRateHistory', name: '资金费率历史', critical: true, category: 'phase1' },
        { id: 'openInterestHistory', name: '未平仓历史', critical: true, category: 'phase1' },
        { id: 'longShortRatio', name: '多空比', critical: true, category: 'phase1' },
        { id: 'longShortRatioHistory', name: '多空比历史', critical: true, category: 'phase1' },
        { id: 'markPrice', name: '标记价格', critical: true, category: 'phase1' }
      ],

      // Phase 2: HIGH-PRIORITY (10个)
      phase2: [
        { id: 'takerVolume', name: 'Taker成交量', critical: false, category: 'phase2' },
        { id: 'markOHLCV', name: '标记价K线', critical: false, category: 'phase2' },
        { id: 'indexOHLCV', name: '指数K线', critical: false, category: 'phase2' },
        { id: 'l2OrderBook', name: 'L2订单簿', critical: false, category: 'phase2' },
        { id: 'borrowRateHistory', name: '借币利率历史', critical: false, category: 'phase2' },
        { id: 'leverageTiers', name: '杠杆梯度', critical: false, category: 'phase2' },
        { id: 'fundingInterval', name: '资金费率间隔', critical: false, category: 'phase2' },
        { id: 'optionGreeks', name: '期权希腊值', critical: false, category: 'phase2' },
        { id: 'optionChain', name: '期权链', critical: false, category: 'phase2' },
        { id: 'systemStatus', name: '系统状态', critical: false, category: 'phase2' }
      ],

      // Phase 3: MEDIUM-PRIORITY (6个)
      phase3: [
        { id: 'currentOpenInterest', name: '当前持仓量', critical: false, category: 'phase3' },
        { id: 'openInterestVolume', name: '持仓量成交量', critical: false, category: 'phase3' },
        { id: 'longShortPositionRatio', name: '多空持仓比', critical: false, category: 'phase3' },
        { id: 'optionOpenInterestVolume', name: '期权持仓成交量', critical: false, category: 'phase3' },
        { id: 'insuranceFund', name: '保险基金', critical: false, category: 'phase3' },
        { id: 'indexTickers', name: '指数行情', critical: false, category: 'phase3' }
      ],

      // Phase 4: COMPLETION (14个)
      phase4: [
        { id: 'fundingRate', name: '资金费率', critical: false, category: 'phase4' },
        { id: 'openInterest', name: '未平仓合约', critical: false, category: 'phase4' },
        { id: 'liquidations', name: '清算数据', critical: false, category: 'phase4' },
        { id: 'tradingFee', name: '交易手续费', critical: false, category: 'phase4' },
        { id: 'premiumIndex', name: '溢价指数', critical: false, category: 'phase4' },
        { id: 'liquidationOrdersData', name: '清算订单数据', critical: false, category: 'phase4' },
        { id: 'priceLimit', name: '价格限制', critical: false, category: 'phase4' },
        { id: 'convertCurrencies', name: '币种转换', critical: false, category: 'phase4' },
        { id: 'maxOrderSize', name: '最大下单量', critical: false, category: 'phase4' },
        { id: 'estimatedPrice', name: '预估价格', critical: false, category: 'phase4' },
        { id: 'vipLevels', name: 'VIP等级', critical: false, category: 'phase4' },
        { id: 'interestRate', name: '利率', critical: false, category: 'phase4' },
        { id: 'assetValuation', name: '资产估值', critical: false, category: 'phase4' },
        { id: 'riskReserve', name: '风险准备金', critical: false, category: 'phase4' }
      ]
    };

    // 添加状态信息
    const present = dataCoverage?.present || {};

    const addStatus = (sources) => {
      return sources.map(source => ({
        ...source,
        available: present[source.id] === true,
        used: present[source.id] === true,
        lastCheck: latestAnalysis?.created_at || null
      }));
    };

    const result = {
      core: addStatus(dataSources.core),
      market: addStatus(dataSources.market),
      phase1: addStatus(dataSources.phase1),
      phase2: addStatus(dataSources.phase2),
      phase3: addStatus(dataSources.phase3),
      phase4: addStatus(dataSources.phase4),
      summary: {
        total: Object.values(dataSources).flat().length,
        available: Object.keys(present).filter(k => present[k]).length,
        critical: Object.values(dataSources).flat().filter(s => s.critical).length,
        coveragePercent: dataCoverage?.coverage || 0,
        lastAnalysis: latestAnalysis ? {
          symbol: latestAnalysis.symbol,
          time: latestAnalysis.created_at
        } : null
      }
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取数据源状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
