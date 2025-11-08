const express = require('express');
const router = express.Router();
const mcpToolsManager = require('../services/mcpToolsManager');
const deepseekService = require('../services/deepseek');
const monitoringService = require('../services/MonitoringService');
const mcpLogger = require('../services/mcpLogger');
const aiMemoryService = require('../services/aiMemoryService');
const backtestEngine = require('../services/backtestEngine');
const { getDatabase, getConfig, setConfig } = require('../database/database');
const { validateBody, schemas } = require('../validators');
const dataSourceManager = require('../services/dataSourceManager');
const divergenceDetector = require('../services/divergenceDetector');
const priceActionService = require('../services/priceActionService');
const dataFreshnessValidator = require('../services/dataFreshnessValidator');
const { AI_ANALYSIS } = require('../config/constants');

/**
 * 延迟函数
 */
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 智能重试函数（带指数退避）
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = AI_ANALYSIS.OKX_RATE_LIMIT.RETRY_MAX_ATTEMPTS,
    initialDelay = AI_ANALYSIS.OKX_RATE_LIMIT.RETRY_INITIAL_DELAY,
    multiplier = AI_ANALYSIS.OKX_RATE_LIMIT.RETRY_MULTIPLIER,
    errorHandler = (error) => console.error('Retry error:', error.message)
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error.message && error.message.includes('Too Many Requests')) {
        const delay = initialDelay * Math.pow(multiplier, attempt - 1);
        console.log(`   ⚠️  频率限制，${attempt}/${maxAttempts}次重试，等待${delay}ms...`);
        if (attempt < maxAttempts) {
          await sleep(delay);
        }
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * POST /api/ai/analyze-with-tools
 * AI分析（使用完整MCP功能，让AI自主决定调用哪些工具）
 * 优化版：添加超时控制和性能优化
 */
router.post('/analyze-with-tools', validateBody(schemas.ai.analyzeWithTools), async (req, res) => {
  const startTime = Date.now();
  const performanceMetrics = {
    dataCollection: 0,
    aiAnalysis: 0,
    toolExecution: 0,
    dbSave: 0,
    total: 0
  };

  try {
    const { symbol, useFullMCP = true, forceRefresh = false, mode, contextK, minWeight, contextId } = req.body;

    // 🧠 若未提供 contextId，自动选择/创建默认记忆面板
    let effectiveContextId = null;
    try {
      if (contextId !== undefined && contextId !== null) {
        effectiveContextId = Number(contextId);
      } else {
        const db = getDatabase();
        const active = getConfig && getConfig('active_memory_context_id');
        if (active) {
          effectiveContextId = Number(active);
        } else {
          let row = db.prepare(`SELECT id FROM ai_memory_contexts WHERE is_default = 1 ORDER BY id DESC LIMIT 1`).get();
          if (!row) {
            // 没有默认面板，尝试使用任意一个已有面板
            row = db.prepare(`SELECT id FROM ai_memory_contexts ORDER BY updated_at DESC, created_at DESC LIMIT 1`).get();
            if (!row) {
              // 完全没有面板，自动创建一个默认面板
              const info = db.prepare(`
                INSERT INTO ai_memory_contexts (name, description, is_default, created_at, updated_at)
                VALUES ('默认记忆面板', '自动创建', 1, datetime('now'), datetime('now'))
              `).run();
              row = { id: info.lastInsertRowid };
            } else {
              // 将该面板设为默认
              db.prepare(`UPDATE ai_memory_contexts SET is_default = 0 WHERE id != ?`).run(row.id);
              db.prepare(`UPDATE ai_memory_contexts SET is_default = 1 WHERE id = ?`).run(row.id);
            }
          }
          effectiveContextId = row.id;
          if (setConfig) setConfig('active_memory_context_id', effectiveContextId);
        }
      }
    } catch (e) {
      // 忽略记忆面板自动处理错误，不影响分析
      effectiveContextId = null;
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🤖 AI全面分析: ${symbol}`);
    console.log(`📊 模式: 完整模式（6个时间框架）`);
    if (forceRefresh) {
      console.log(`🔄 强制刷新: 忽略缓存`);
    }
    console.log(`${'═'.repeat(60)}\n`);

    mcpLogger.info('ai-enhanced', `开始分析: ${symbol} (完整模式${forceRefresh ? ', 强制刷新' : ''})`);

    // ⚡ 步骤1: 收集完整数据（包含6个时间框架）
    const dataCollectionStart = Date.now();
    const mcpData = await gatherAllMCPData(symbol);
    performanceMetrics.dataCollection = Date.now() - dataCollectionStart;
    console.log(`⏱️  数据收集耗时: ${performanceMetrics.dataCollection}ms`);

    // 🆕 验证数据新鲜度
    const freshnessReport = dataFreshnessValidator.generateFreshnessReport(mcpData);
    console.log(`🔍 数据新鲜度: ${freshnessReport.overall}`);

    if (freshnessReport.overall === 'STALE') {
      console.warn('⚠️ 警告：部分数据可能过期');
      mcpData.freshnessWarning = true;
      mcpData.freshnessReport = freshnessReport;
    }

    // 🆕 验证数据质量（降级方案检查）
    if (mcpData.dataQuality === 'CRITICAL') {
      console.error('🚨 数据质量严重不足，无法进行安全分析');
      return res.status(503).json({
        success: false,
        error: '数据源不可用',
        message: mcpData.dataQualityWarning || '数据质量严重不足，请稍后重试',
        recommendation: '建议等待数据源恢复后再进行交易'
      });
    }

    if (mcpData.dataQuality === 'POOR') {
      console.warn('⚠️ 数据质量较差，分析结果可能不可靠');
      mcpData.dataQualityWarning = mcpData.dataQualityWarning || '⚠️ 数据质量较差，建议谨慎交易';
    }

    // 🆕 验证多时间框架数据质量
    if (mcpData.multiTimeframe?.dataQuality === 'INSUFFICIENT') {
      console.error('🚨 多时间框架数据严重不足，无法进行可靠分析');

      // 使用DeepSeek服务返回安全HOLD信号
      const safeAnalysis = deepseekService.getSafeHoldAnalysis(
        { price: mcpData.ticker?.last || 0, symbol },
        mcpData.indicators,
        'MULTI_TIMEFRAME_FAILED'
      );

      return res.json({
        success: true,
        data: {
          ...safeAnalysis,
          multiTimeframeWarning: mcpData.multiTimeframe.warning,
          failedTimeframes: mcpData.multiTimeframe.resonance.details.failed,
          recommendation: '⚠️ 多时间框架数据不足，建议等待数据恢复后再交易'
        }
      });
    }

    // ⚡ 步骤2: AI分析（带超时控制）
    const aiAnalysisStart = Date.now();
    const aiTimeout = AI_ANALYSIS.AI_ANALYSIS_TIMEOUT;

    console.log(`⏱️  开始AI分析，超时设置: ${aiTimeout/1000}秒`);

    // 将前端的强制刷新意图下传，允许后端绕过缓存
    if (forceRefresh) {
      mcpData.realtime = true;
    }
    mcpData.contextId = effectiveContextId || null;
    if (mode || contextK || minWeight || effectiveContextId !== null) {
      mcpData.contextOptions = { mode, contextK, minWeight, contextId: effectiveContextId };
    }

    const analysis = await Promise.race([
      analyzeWithMCPData(symbol, mcpData),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`AI分析超时（超过${aiTimeout/1000}秒）`)), aiTimeout)
      )
    ]);
    performanceMetrics.aiAnalysis = Date.now() - aiAnalysisStart;
    console.log(`⏱️  AI分析耗时: ${performanceMetrics.aiAnalysis}ms`);

    // ⚡ 步骤3: AI自动执行工具
    const toolExecutionStart = Date.now();
    const aiActions = await executeAITools(symbol, analysis, mcpData);
    performanceMetrics.toolExecution = Date.now() - toolExecutionStart;

    performanceMetrics.total = Date.now() - startTime;
    console.log(`⏱️  总耗时: ${performanceMetrics.total}ms\n`);

    // 🔍 调试：检查analysis.chainOfThought的类型和内容
    console.log('🔍 返回前检查 analysis.chainOfThought:');
    console.log('   - 类型:', typeof analysis.chainOfThought);
    console.log('   - 是数组:', Array.isArray(analysis.chainOfThought));
    console.log('   - 长度:', analysis.chainOfThought?.length || 0);
    console.log('   - 前100字符:', typeof analysis.chainOfThought === 'string'
      ? analysis.chainOfThought.substring(0, 100)
      : JSON.stringify(analysis.chainOfThought).substring(0, 100));

    // Build data coverage report (ensuring all available data sources are counted)
    const expectedSources = [
      'ticker','indicators','ohlcv','priceAction','orderBook','trades',
      'sentiment','coinDetail','gainersLosers','advancedIndicators',
      'fundingRate','openInterest','liquidations','freeAPIs',
      'multiTimeframe','aktools',
      // 5 CRITICAL DATA SOURCES (Phase 1)
      'fundingRateHistory','openInterestHistory','longShortRatio','longShortRatioHistory','markPrice',
      // 10 HIGH-PRIORITY DATA SOURCES (Phase 2)
      'takerVolume','markOHLCV','indexOHLCV','l2OrderBook','borrowRateHistory',
      'leverageTiers','fundingInterval','optionGreeks','optionChain','systemStatus',
      // 6 MEDIUM-PRIORITY DATA SOURCES (Phase 3)
      'currentOpenInterest','openInterestVolume','longShortPositionRatio',
      'optionOpenInterestVolume','insuranceFund','indexTickers',
      // 5 HIGH-VALUE DATA SOURCES (Phase 4)
      'tradingFee','premiumIndex','liquidationOrdersData','priceLimit','marketCapRanking',
      // 7 COMPLETION DATA SOURCES (Phase 4 Final)
      'convertCurrencies','maxOrderSize','estimatedPrice','vipLevels','interestRate','assetValuation','riskReserve'
    ];
    const presentMap = {
      ticker: !!mcpData.ticker,
      indicators: !!mcpData.indicators,
      ohlcv: Array.isArray(mcpData.ohlcv) ? mcpData.ohlcv.length > 0 : !!mcpData.ohlcv,
      priceAction: !!mcpData.priceAction,
      orderBook: !!mcpData.orderBook,
      trades: Array.isArray(mcpData.trades) ? mcpData.trades.length > 0 : !!mcpData.trades,
      sentiment: !!mcpData.sentiment,
      coinDetail: !!mcpData.coinDetail,
      gainersLosers: !!mcpData.gainersLosers,
      advancedIndicators: !!mcpData.advancedIndicators,
      fundingRate: mcpData.fundingRate !== undefined && mcpData.fundingRate !== null,
      openInterest: mcpData.openInterest !== undefined && mcpData.openInterest !== null,
      liquidations: !!mcpData.liquidations,
      freeAPIs: !!mcpData.freeAPIs,
      multiTimeframe: !!mcpData.multiTimeframe,
      aktools: !!mcpData.aktools,
      // 5 CRITICAL DATA SOURCES (Phase 1)
      fundingRateHistory: !!mcpData.fundingRateHistory,
      openInterestHistory: !!mcpData.openInterestHistory,
      longShortRatio: !!mcpData.longShortRatio,
      longShortRatioHistory: !!mcpData.longShortRatioHistory,
      markPrice: !!mcpData.markPrice,
      // 10 HIGH-PRIORITY DATA SOURCES (Phase 2)
      takerVolume: !!mcpData.takerVolume,
      markOHLCV: !!mcpData.markOHLCV,
      indexOHLCV: !!mcpData.indexOHLCV,
      l2OrderBook: !!mcpData.l2OrderBook,
      borrowRateHistory: !!mcpData.borrowRateHistory,
      leverageTiers: !!mcpData.leverageTiers,
      fundingInterval: !!mcpData.fundingInterval,
      // Optional features that may return null gracefully (count as success)
      optionGreeks: mcpData.optionGreeks !== undefined,
      optionChain: !!mcpData.optionChain,
      systemStatus: !!mcpData.systemStatus,
      // 6 MEDIUM-PRIORITY DATA SOURCES (Phase 3)
      currentOpenInterest: !!mcpData.currentOpenInterest,
      openInterestVolume: !!mcpData.openInterestVolume,
      longShortPositionRatio: !!mcpData.longShortPositionRatio,
      optionOpenInterestVolume: !!mcpData.optionOpenInterestVolume,
      insuranceFund: !!mcpData.insuranceFund,
      indexTickers: !!mcpData.indexTickers,
      // 5 HIGH-VALUE DATA SOURCES (Phase 4)
      tradingFee: !!mcpData.tradingFee,
      // Optional feature that may return null for unsupported instruments (count as success)
      premiumIndex: mcpData.premiumIndex !== undefined,
      liquidationOrdersData: !!mcpData.liquidationOrdersData,
      priceLimit: !!mcpData.priceLimit,
      marketCapRanking: !!mcpData.marketCapRanking,
      // 7 COMPLETION DATA SOURCES (Phase 4 Final)
      convertCurrencies: !!mcpData.convertCurrencies,
      maxOrderSize: !!mcpData.maxOrderSize,
      estimatedPrice: !!mcpData.estimatedPrice,
      vipLevels: !!mcpData.vipLevels,
      interestRate: !!mcpData.interestRate,
      assetValuation: !!mcpData.assetValuation,
      riskReserve: !!mcpData.riskReserve
    };
    const presentCount = expectedSources.reduce((n, k) => n + (presentMap[k] ? 1 : 0), 0);
    const coverage = presentCount / expectedSources.length;
    const missing = expectedSources.filter(k => !presentMap[k]);
    const timeframeStats = (() => {
      const tf = mcpData.multiTimeframe?.timeframes;
      if (!tf) return { available: false };
      const keys = Object.keys(tf);
      const success = keys.filter(k => tf[k]?.status === 'success').length;
      return { available: true, total: keys.length, success, successRate: keys.length ? success/keys.length : 0 };
    })();

    // Build lightweight price sparkline (last 30 closes)
    const sparkline = Array.isArray(mcpData.ohlcv)
      ? mcpData.ohlcv.slice(-30).map(c => Array.isArray(c) ? Number(c[4]) : null).filter(v => Number.isFinite(v))
      : null;

    // Build the complete response data object
    const responseData = {
      ...analysis,
      aiActions,
      symbol,
      analysisMode: mode || 'complete',
      priceAction: mcpData.priceAction || null,
      dataCoverage: {
        coverage,
        presentCount,
        total: expectedSources.length,
        missing
      },
      timeframeStats,
      sparkline,
      mcpDataUsed: {
        price: !!mcpData.ticker,
        indicators: !!mcpData.indicators,
        sentiment: !!mcpData.sentiment,
        coinDetail: !!mcpData.coinDetail,
        gainersLosers: !!mcpData.gainersLosers,
        aktools: !!mcpData.aktools,
        ohlcv: !!mcpData.ohlcv,
        priceAction: !!mcpData.priceAction,
        orderBook: !!mcpData.orderBook,
        trades: Array.isArray(mcpData.trades) ? mcpData.trades.length > 0 : !!mcpData.trades,
        fundingRate: mcpData.fundingRate !== undefined && mcpData.fundingRate !== null,
        openInterest: mcpData.openInterest !== undefined && mcpData.openInterest !== null,
        liquidations: !!mcpData.liquidations,
        freeAPIs: !!mcpData.freeAPIs,
        multiTimeframe: !!mcpData.multiTimeframe,
        // 5 CRITICAL DATA SOURCES (Phase 1)
        fundingRateHistory: !!mcpData.fundingRateHistory,
        openInterestHistory: !!mcpData.openInterestHistory,
        longShortRatio: !!mcpData.longShortRatio,
        longShortRatioHistory: !!mcpData.longShortRatioHistory,
        markPrice: !!mcpData.markPrice,
        // 10 HIGH-PRIORITY DATA SOURCES (Phase 2)
        takerVolume: !!mcpData.takerVolume,
        markOHLCV: !!mcpData.markOHLCV,
        indexOHLCV: !!mcpData.indexOHLCV,
        l2OrderBook: !!mcpData.l2OrderBook,
        borrowRateHistory: !!mcpData.borrowRateHistory,
        leverageTiers: !!mcpData.leverageTiers,
        fundingInterval: !!mcpData.fundingInterval,
        // Optional features that may return null gracefully (count as success)
        optionGreeks: mcpData.optionGreeks !== undefined,
        optionChain: !!mcpData.optionChain,
        systemStatus: !!mcpData.systemStatus,
        // 6 MEDIUM-PRIORITY DATA SOURCES (Phase 3)
        currentOpenInterest: !!mcpData.currentOpenInterest,
        openInterestVolume: !!mcpData.openInterestVolume,
        longShortPositionRatio: !!mcpData.longShortPositionRatio,
        optionOpenInterestVolume: !!mcpData.optionOpenInterestVolume,
        insuranceFund: !!mcpData.insuranceFund,
        indexTickers: !!mcpData.indexTickers,
        // 5 HIGH-VALUE DATA SOURCES (Phase 4)
        tradingFee: !!mcpData.tradingFee,
        // Optional feature that may return null for unsupported instruments (count as success)
        premiumIndex: mcpData.premiumIndex !== undefined,
        liquidationOrdersData: !!mcpData.liquidationOrdersData,
        priceLimit: !!mcpData.priceLimit,
        marketCapRanking: !!mcpData.marketCapRanking,
        // 7 COMPLETION DATA SOURCES (Phase 4 Final)
        convertCurrencies: !!mcpData.convertCurrencies,
        maxOrderSize: !!mcpData.maxOrderSize,
        estimatedPrice: !!mcpData.estimatedPrice,
        vipLevels: !!mcpData.vipLevels,
        interestRate: !!mcpData.interestRate,
        assetValuation: !!mcpData.assetValuation,
        riskReserve: !!mcpData.riskReserve
        },
      // Data freshness info
        dataFreshness: {
          overall: freshnessReport.overall,
          hasWarning: mcpData.freshnessWarning || false,
          details: freshnessReport.details,
          recommendation: freshnessReport.overall === 'STALE'
            ? '⚠️ 部分数据可能过期，建议刷新后再交易'
            : '✅ 数据新鲜，可以正常交易'
        },
        performanceMetrics: {
          dataCollectionMs: performanceMetrics.dataCollection,
          aiAnalysisMs: performanceMetrics.aiAnalysis,
          toolExecutionMs: performanceMetrics.toolExecution,
          dbSaveMs: performanceMetrics.dbSave,
          totalMs: performanceMetrics.total
        }
    };

    try {
      if (mode === 'narrative' || responseData.behaviorNarrative || responseData.timeline) {
        monitoringService.ingestNarrativeFromAnalysis(responseData, { symbol });
      }
    } catch (narrativeError) {
      console.warn('⚠️ 模型自述更新失败:', narrativeError.message);
    }

    // Save analysis result to database (with complete response data including dataCoverage)
    const dbSaveStart = Date.now();
    try {
      // Build complete market data snapshot for database
      const completeMarketData = {
        symbol,
        price: mcpData.ticker?.last || mcpData.ticker?.price || 0,
        exchange: 'okx',
        ticker: mcpData.ticker,
        sentiment: mcpData.sentiment,
        coinDetail: mcpData.coinDetail,
        gainersLosers: mcpData.gainersLosers,
        aktools: mcpData.aktools,
        freeAPIs: mcpData.freeAPIs,
        fundingRate: mcpData.fundingRate,
        openInterest: mcpData.openInterest,
        liquidations: mcpData.liquidations,
        multiTimeframe: mcpData.multiTimeframe,
        priceAction: mcpData.priceAction,
        divergence: mcpData.divergence,
        timestamp: Date.now()
      };

      await aiMemoryService.saveAnalysis(
        symbol,
        'okx',
        analysis,
        completeMarketData,
        mcpData.indicators,
        Object.keys(mcpData).filter(k => !k.startsWith('_')),
        mcpData.contextId || mcpData.contextOptions?.contextId || null,
        responseData  // Pass the complete response including dataCoverage
      );
      performanceMetrics.dbSave = Date.now() - dbSaveStart;
      console.log(`✅ 分析结果已保存到数据库（${performanceMetrics.dbSave}ms）`);
    } catch (dbError) {
      performanceMetrics.dbSave = Date.now() - dbSaveStart;
      console.error('⚠️ 保存分析失败:', dbError.message);
      // Don't block user response
    }

    res.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('\n❌ AI分析失败:');
    console.error('   错误信息:', error.message);
    console.error('   错误堆栈:', error.stack);
    console.error('   错误详情:', JSON.stringify({
      name: error.name,
      message: error.message,
      code: error.code,
      response: error.response?.data
    }, null, 2));
    console.error('');

    try {
      // 尝试返回安全的 HOLD 结果，避免前端 500 抛错
      const symbol = req.body?.symbol || '';
      const safeAnalysis = deepseekService.getSafeHoldAnalysis(
        { price: 0, symbol },
        null,
        'ROUTE_ERROR'
      );

      res.json({
        success: true,
        data: {
          ...safeAnalysis,
          analysisMode: req.body?.mode || 'complete',
          aiActions: { backtests: [] },
          errorInfo: {
            degraded: true,
            reason: error.message
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (fallbackError) {
      // 如果兜底也失败，再返回 500
      res.status(500).json({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          name: error.name
        } : undefined
      });
    }
  }
});

/**
 * GET /api/ai/available-tools
 * 返回AI可用工具列表（供前端展示）
 */
router.get('/available-tools', (req, res) => {
  try {
    const toolsList = mcpToolsManager.getToolsList();
    const tools = toolsList.map(t => ({
      id: t.id,
      name: t.name,
      description: mcpToolsManager.getTool(t.id)?.description || t.description || '',
    }));
    res.json({ success: true, data: { tools } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ai/analysis-history (别名路由，兼容性)
 * 获取AI分析历史记录
 */
router.get('/analysis-history', async (req, res) => {
  try {
    const { symbol, limit = 20, contextId } = req.query;

    console.log(`📊 获取AI历史记录: symbol=${symbol}, limit=${limit}`);

    const ctxIdNum = contextId ? Number(contextId) : null;
    const history = await aiMemoryService.getRecentAnalyses(symbol, Number(limit), ctxIdNum);
    const stats = await aiMemoryService.getTradingStats(symbol, ctxIdNum);

    console.log(`✅ 成功获取 ${history.length} 条历史记录`);

    res.json({
      success: true,
      data: {
        history,
        stats
      }
    });
  } catch (error) {
    console.error('❌ 获取AI历史失败:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai/history
 * 获取AI分析历史记录
 */
router.get('/history', async (req, res) => {
  try {
    const { symbol, limit = 20, contextId } = req.query;

    // ✅ 添加更详细的错误日志
    console.log(`📊 获取AI历史记录: symbol=${symbol}, limit=${limit}`);

    const ctxIdNum = contextId ? Number(contextId) : null;
    const history = await aiMemoryService.getRecentAnalyses(symbol, Number(limit), ctxIdNum);
    const stats = await aiMemoryService.getTradingStats(symbol, ctxIdNum);

    console.log(`✅ 成功获取 ${history.length} 条历史记录`);

    res.json({
      success: true,
      data: {
        history,
        stats
      }
    });
  } catch (error) {
    console.error('❌ 获取AI历史失败:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || '获取历史记录失败'
    });
  }
});

/**
 * DELETE /api/ai/history
 * 清空AI分析历史（按symbol/contextId或全部）
 */
router.delete('/history', async (req, res) => {
  try {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const symbol = payload.symbol || null;
    const contextId = payload.contextId ? Number(payload.contextId) : null;
    const allowAll = payload.all === '1' || payload.all === 'true' || payload.all === true;

    const result = await aiMemoryService.clearAnalyses({ symbol, contextId, allowAll });
    res.json({ success: true, deleted: result.deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ai/history/favorite
 * 收藏分析结果
 */
router.post('/history/favorite', async (req, res) => {
  try {
    const { id, favorite } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: '缺少记录ID' });
    }
    await aiMemoryService.toggleFavorite(id, favorite);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ 更新收藏失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== 辅助函数（放在文件末尾） =====

/**
 * 收集MCP数据（完整模式，包含6个时间框架）
 * @param {string} symbol - 交易对
 */
async function gatherAllMCPData(symbol) {
  const exchange = process.env.EXCHANGE_NAME || 'okx';

  try {
    console.log(`📊 开始收集${symbol}完整数据（6个时间框架）`);
    console.log(`   数据源: ${dataSourceManager.getCurrentSource()}`);

    // 🕐 完整模式：获取多时间框架数据 + 所有市场数据
    console.log('🕐 获取多时间框架数据（1m, 15m, 30m, 1h, 4h, 1d）...');

    // 并行获取：基础数据 + 多时间框架数据
    const [baseDataResult, multiTimeframeResult] = await Promise.allSettled([
      // 基础市场数据（使用1小时作为主时间框架）
      Promise.race([
        dataSourceManager.getCompleteMarketData(exchange, symbol, '1h'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('基础数据获取超时')), AI_ANALYSIS.DATA_COLLECTION_TIMEOUT))
      ]),
      // 多时间框架技术指标（6个时间框架）
      Promise.race([
        getMultiTimeframeData(exchange, symbol),
        new Promise((_, reject) => setTimeout(() => reject(new Error('多时间框架数据超时')), AI_ANALYSIS.MULTI_TIMEFRAME_TIMEOUT))
      ])
    ]);

    if (baseDataResult.status === 'rejected') {
      const reason = baseDataResult.reason?.message || baseDataResult.reason;
      console.error(`❌ 基础数据获取失败: ${reason}`);
    }
    if (multiTimeframeResult.status === 'rejected') {
      const reason = multiTimeframeResult.reason?.message || multiTimeframeResult.reason;
      console.error(`❌ 多时间框架数据获取失败: ${reason}`);
    }

    let baseData = baseDataResult.status === 'fulfilled' ? baseDataResult.value : {};
    const multiTimeframe = multiTimeframeResult.status === 'fulfilled' ? multiTimeframeResult.value : null;

    if (!baseData || typeof baseData !== 'object') {
      baseData = {};
    }

    const missingFields = [];
    if (!baseData.ticker) missingFields.push('ticker');
    if (!baseData.indicators) missingFields.push('indicators');
    if (!Array.isArray(baseData.ohlcv) || baseData.ohlcv.length === 0) missingFields.push('ohlcv');

    if (missingFields.length > 0) {
      console.warn(`⚠️ 基础数据缺失字段(${missingFields.join(', ')}), 启动补救获取...`);
      const [tickerFix, indicatorsFix, ohlcvFix] = await Promise.allSettled([
        missingFields.includes('ticker')
          ? Promise.race([
              dataSourceManager.getTicker(exchange, symbol),
              new Promise((_, reject) => setTimeout(() => reject(new Error('ticker补救超时')), AI_ANALYSIS.TICKER_TIMEOUT))
            ])
          : Promise.resolve(null),
        missingFields.includes('indicators')
          ? Promise.race([
              dataSourceManager.getAllIndicators(exchange, symbol, '1h'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('indicators补救超时')), AI_ANALYSIS.INDICATORS_TIMEOUT))
            ])
          : Promise.resolve(null),
        missingFields.includes('ohlcv')
          ? Promise.race([
              dataSourceManager.getOHLCV(exchange, symbol, '1h', AI_ANALYSIS.DEFAULT_KLINE_LIMIT),
              new Promise((_, reject) => setTimeout(() => reject(new Error('ohlcv补救超时')), AI_ANALYSIS.DATA_COLLECTION_TIMEOUT))
            ])
          : Promise.resolve(null)
      ]);

      if (tickerFix.status === 'fulfilled' && tickerFix.value) {
        baseData.ticker = tickerFix.value;
      }
      if (indicatorsFix.status === 'fulfilled' && indicatorsFix.value) {
        baseData.indicators = indicatorsFix.value;
      }
      if (ohlcvFix.status === 'fulfilled' && Array.isArray(ohlcvFix.value)) {
        baseData.ohlcv = ohlcvFix.value;
      }
    }

    console.log(`✅ 完整数据收集成功: ticker=${!!baseData.ticker}, indicators=${!!baseData.indicators}, multiTimeframe=${!!multiTimeframe}`);

    // 🆕 检测背离信号
    let divergenceAnalysis = null;
    if (baseData.ohlcv && baseData.ohlcv.length > 0 && baseData.indicators) {
      console.log('🔄 检测背离信号...');
      divergenceAnalysis = divergenceDetector.detectAll(baseData.ohlcv, baseData.indicators);
      console.log(`   背离检测结果: ${divergenceAnalysis.hasDivergence ? divergenceAnalysis.summary : '未检测到背离'}`);
    }

    // 🆕 裸K价格行为分析
    let priceAction = null;
    try {
      if (Array.isArray(baseData.ohlcv) && baseData.ohlcv.length > 0) {
        priceAction = priceActionService.analyze({
          symbol,
          baseTimeframe: '1h',
          baseOhlcv: baseData.ohlcv,
          multiTimeframe: multiTimeframe?.timeframes ? Object.fromEntries(
            Object.entries(multiTimeframe.timeframes)
              .filter(([_, value]) => value?.ohlcv)
              .map(([tf, value]) => [tf, { ohlcv: value.ohlcv }])
          ) : multiTimeframe
        });
      }
    } catch (paError) {
      console.error('⚠️ 价格行为分析失败:', paError.message);
    }

    return {
      ...baseData,
      multiTimeframe, // 添加多时间框架数据（6个时间框架）
      divergence: divergenceAnalysis, // 🆕 添加背离分析
      priceAction, // 🆕 裸K价格行为分析
      fastMode: false
    };
    
  } catch (error) {
    console.error('❌ 收集数据失败:', error.message);

    // 降级方案：最小化数据获取
    try {
      console.log('🔄 降级方案：仅获取价格和基础指标...');
      const [ticker, indicators] = await Promise.allSettled([
        Promise.race([
          dataSourceManager.getTicker(exchange, symbol),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ticker超时')), AI_ANALYSIS.TICKER_TIMEOUT))
        ]),
        Promise.race([
          dataSourceManager.getAllIndicators(exchange, symbol, '1h'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('indicators超时')), AI_ANALYSIS.INDICATORS_TIMEOUT))
        ])
      ]);

      const fallbackData = {
        symbol,
        ticker: ticker.status === 'fulfilled' ? ticker.value : null,
        indicators: indicators.status === 'fulfilled' ? indicators.value : null,
        ohlcv: [],
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        fallback: true,
        error: error.message,
        priceAction: null
      };

      // 🆕 强制验证降级数据的有效性
      console.log('🔍 验证降级方案数据有效性...');

      // 验证1：价格数据必须存在
      if (!fallbackData.ticker || !fallbackData.ticker.last) {
        console.error('🚨 降级方案失败：无法获取有效的价格数据');
        console.error('   Ticker状态:', ticker.status);
        console.error('   Ticker数据:', fallbackData.ticker);
        throw new Error('数据源完全不可用：无法获取价格数据，无法进行安全分析');
      }

      // 验证2：价格必须为正数
      const price = fallbackData.ticker.last;
      if (price <= 0 || isNaN(price)) {
        console.error('🚨 降级方案失败：价格数据无效');
        console.error('   价格值:', price);
        throw new Error(`价格数据无效（${price}），无法进行安全分析`);
      }

      // 验证3：技术指标缺失时标记数据质量
      if (!fallbackData.indicators) {
        console.warn('⚠️ 降级方案：技术指标数据缺失，分析质量严重降低');
        fallbackData.dataQuality = 'CRITICAL';
        fallbackData.dataQualityWarning = '⚠️ 技术指标缺失，强烈建议等待数据恢复后再交易';
      } else {
        fallbackData.dataQuality = 'POOR';
        fallbackData.dataQualityWarning = '⚠️ 仅有基础数据，建议谨慎交易';
      }

      console.log(`✅ 降级方案数据验证通过（数据质量: ${fallbackData.dataQuality}）`);
      console.log(`   价格: $${price}`);
      console.log(`   技术指标: ${fallbackData.indicators ? '✅ 有' : '❌ 无'}`);

      return fallbackData;

    } catch (fallbackError) {
      console.error('❌ 降级方案失败:', fallbackError.message);
      throw new Error(`数据获取完全失败: ${fallbackError.message}`);
    }
  }
}

/**
 * 获取多时间框架数据（1m, 15m, 30m, 1h, 4h, 1d）
 * 优化版：使用批次串行请求避免OKX API频率限制
 * @param {string} exchange - 交易所
 * @param {string} symbol - 交易对
 */
async function getMultiTimeframeData(exchange, symbol) {
  try {
    console.log(`   📈 批次串行获取 1m, 15m, 30m, 1h, 4h, 1d 六个时间框架的K线和指标...`);

    // 定义时间框架列表
    const timeframesList = ['1m', '15m', '30m', '1h', '4h', '1d'];
    const batchSize = AI_ANALYSIS.OKX_RATE_LIMIT.BATCH_SIZE;
    const requestDelay = AI_ANALYSIS.OKX_RATE_LIMIT.REQUEST_DELAY;
    const batchDelay = AI_ANALYSIS.OKX_RATE_LIMIT.BATCH_DELAY;

    // 分批处理
    const results = {};
    for (let i = 0; i < timeframesList.length; i += batchSize) {
      const batch = timeframesList.slice(i, i + batchSize);
      console.log(`   📦 处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(timeframesList.length/batchSize)}: ${batch.join(', ')}`);

      // 批次内并行请求
      const batchResults = await Promise.allSettled(
        batch.map(async (tf) => {
          // 添加请求延迟避免频率限制
          await sleep(requestDelay * (i % batchSize));

          // 使用智能重试
          return retryWithBackoff(async () => {
            const [ohlcv, indicators] = await Promise.all([
              dataSourceManager.getOHLCV(exchange, symbol, tf, AI_ANALYSIS.DEFAULT_KLINE_LIMIT),
              dataSourceManager.getAllIndicators(exchange, symbol, tf)
    ]);
            return { tf, ohlcv, indicators };
          });
        })
      );

      // 收集批次结果
      batch.forEach((tf, idx) => {
        const result = batchResults[idx];
        if (result.status === 'fulfilled') {
          results[tf] = result.value;
        } else {
          results[tf] = { error: result.reason?.message || 'Unknown error' };
        }
      });

      // 批次之间延迟
      if (i + batchSize < timeframesList.length) {
        await sleep(batchDelay);
      }
    }

    // 构建时间框架数据对象
    const timeframesData = {};
    ['1m', '15m', '30m', '1h', '4h', '1d'].forEach(tf => {
      const data = results[tf];
      if (data && !data.error) {
        timeframesData[tf] = {
          ohlcv: data.ohlcv || [],
          indicators: data.indicators || null,
          trend: analyzeTrendDirection(data.indicators),
        status: 'success'
        };
      } else {
        timeframesData[tf] = {
          status: 'failed',
          error: data?.error || 'Unknown error'
        };
      }
    });

    // 验证多时间框架数据质量
    const timeframeKeys = Object.keys(timeframesData);
    const failedTimeframes = timeframeKeys.filter(tf => timeframesData[tf].status === 'failed');
    const successTimeframes = timeframeKeys.filter(tf => timeframesData[tf].status === 'success');
    const failureRate = failedTimeframes.length / timeframeKeys.length;

    console.log(`   📊 多时间框架数据统计:`);
    console.log(`      成功: ${successTimeframes.length}/${timeframeKeys.length}`);
    console.log(`      失败: ${failedTimeframes.length}/${timeframeKeys.length}`);
    console.log(`      失败率: ${(failureRate * 100).toFixed(1)}%`);

    // 如果超过阈值失败，标记为数据不足
    if (failureRate > AI_ANALYSIS.TIMEFRAME_FAILURE_THRESHOLD) {
      console.error(`   🚨 多时间框架数据严重不足（失败率${(failureRate * 100).toFixed(1)}%）`);
      return {
        timeframes: timeframesData,
        resonance: {
          level: 'insufficient_data',
          summary: `数据不足：${failedTimeframes.length}/${timeframeKeys.length}个时间框架失败`,
          consistency: 0,
          details: {
            failed: failedTimeframes,
            success: successTimeframes
          }
        },
        dataQuality: 'INSUFFICIENT',
        warning: '⚠️ 多时间框架数据严重不足，无法进行可靠的共振分析',
        timestamp: Date.now(),
        datetime: new Date().toISOString()
      };
    }

    // 计算共振分析
    const resonance = analyzeTimeframeResonance(timeframesData);

    console.log(`   ✅ 多时间框架数据获取完成:`);
    console.log(`      1m:  ${timeframesData['1m'].status} (趋势: ${timeframesData['1m'].trend || 'N/A'})`);
    console.log(`      15m: ${timeframesData['15m'].status} (趋势: ${timeframesData['15m'].trend || 'N/A'})`);
    console.log(`      30m: ${timeframesData['30m'].status} (趋势: ${timeframesData['30m'].trend || 'N/A'})`);
    console.log(`      1h:  ${timeframesData['1h'].status} (趋势: ${timeframesData['1h'].trend || 'N/A'})`);
    console.log(`      4h:  ${timeframesData['4h'].status} (趋势: ${timeframesData['4h'].trend || 'N/A'})`);
    console.log(`      1d:  ${timeframesData['1d'].status} (趋势: ${timeframesData['1d'].trend || 'N/A'})`);
    console.log(`      共振分析: ${resonance.summary}`);

    // 如果有失败的时间框架，添加警告
    if (failedTimeframes.length > 0) {
      console.warn(`   ⚠️ 部分时间框架失败: ${failedTimeframes.join(', ')}`);
    }

    return {
      timeframes: timeframesData,
      resonance,
      dataQuality: failedTimeframes.length > 0 ? 'PARTIAL' : 'GOOD',
      failedTimeframes: failedTimeframes.length > 0 ? failedTimeframes : undefined,
      timestamp: Date.now(),
      datetime: new Date().toISOString()
    };
  } catch (error) {
    console.error(`   ❌ 多时间框架数据获取失败: ${error.message}`);
    return null;
  }
}

/**
 * 分析趋势方向（基于EMA排列）
 */
function analyzeTrendDirection(indicators) {
  if (!indicators || !indicators.trend) return 'UNKNOWN';

  const { ema9, ema21, ema50, currentPrice } = indicators.trend;

  if (!ema9 || !ema21 || !ema50) return 'UNKNOWN';

  // 计算趋势强度
  const bullishGap = ema9 - ema50; // 多头排列时的价格差
  const bearishGap = ema50 - ema9; // 空头排列时的价格差
  const avgPrice = (ema9 + ema21 + ema50) / 3;
  const gapPercent = Math.abs((ema9 - ema50) / avgPrice) * 100;

  // 从配置读取强趋势阈值
  const strongThreshold = AI_ANALYSIS.STRONG_TREND_THRESHOLD;

  // 多头排列：EMA9 > EMA21 > EMA50
  if (ema9 > ema21 && ema21 > ema50) {
    return gapPercent > strongThreshold ? 'STRONG_BULLISH' : 'BULLISH';
  }

  // 空头排列：EMA9 < EMA21 < EMA50
  if (ema9 < ema21 && ema21 < ema50) {
    return gapPercent > strongThreshold ? 'STRONG_BEARISH' : 'BEARISH';
  }

  // 其他情况为震荡
  return 'SIDEWAYS';
}

/**
 * 🆕 加权多时间框架共振分析（长期趋势权重更高）
 * 从配置文件读取权重和阈值
 */
function analyzeTimeframeResonance(timeframes) {
  // 从配置读取时间框架权重
  const weights = AI_ANALYSIS.TIMEFRAME_WEIGHTS;

  // 提取趋势数据
  const timeframeData = {
    '1m': timeframes['1m'],
    '15m': timeframes['15m'],
    '30m': timeframes['30m'],
    '1h': timeframes['1h'],
    '4h': timeframes['4h'],
    '1d': timeframes['1d']
  };

  // 过滤有效数据（支持大小写不敏感）
  const validTimeframes = Object.entries(timeframeData).filter(
    ([tf, data]) => data && data.trend && data.trend.toUpperCase() !== 'UNKNOWN' && data.status === 'success'
  );

  if (validTimeframes.length === 0) {
    return {
      level: 'unknown',
      summary: '多时间框架数据不完整',
      confidenceAdjustment: 0,
      recommendation: '基于单一时间框架分析',
      weightedScore: 0
    };
  }

  // 🆕 计算加权得分（支持强趋势和弱趋势）
  let bullishScore = 0;
  let bearishScore = 0;
  let sidewaysScore = 0;
  let totalWeight = 0;

  validTimeframes.forEach(([tf, data]) => {
    const weight = weights[tf];
    totalWeight += weight;

    const trendUpper = data.trend.toUpperCase();
    
    if (trendUpper === 'BULLISH') {
      bullishScore += weight;
    } else if (trendUpper === 'STRONG_BULLISH') {
      bullishScore += weight * 1.5; // 强趋势权重加倍
    } else if (trendUpper === 'BEARISH') {
      bearishScore += weight;
    } else if (trendUpper === 'STRONG_BEARISH') {
      bearishScore += weight * 1.5; // 强趋势权重加倍
    } else if (trendUpper === 'SIDEWAYS') {
      sidewaysScore += weight;
    }
  });

  // 归一化得分（转换为百分比）
  bullishScore = (bullishScore / totalWeight) * 100;
  bearishScore = (bearishScore / totalWeight) * 100;
  sidewaysScore = (sidewaysScore / totalWeight) * 100;

  // 判断主导趋势
  const maxScore = Math.max(bullishScore, bearishScore, sidewaysScore);
  let dominantTrend = 'sideways';
  let dominantScore = sidewaysScore;

  if (bullishScore === maxScore) {
    dominantTrend = 'bullish';
    dominantScore = bullishScore;
  } else if (bearishScore === maxScore) {
    dominantTrend = 'bearish';
    dominantScore = bearishScore;
  }

  // 从配置读取共振阈值
  const thresholds = AI_ANALYSIS.RESONANCE_THRESHOLDS;
  const adjustments = AI_ANALYSIS.RESONANCE_CONFIDENCE_ADJUSTMENT;

  // 基于加权得分判断共振级别
  // 超强共振：主导趋势得分≥阈值
  if (dominantScore >= thresholds.VERY_STRONG) {
    return {
      level: 'very_strong',
      summary: `超强共振：${dominantTrend === 'bullish' ? '看涨' : dominantTrend === 'bearish' ? '看跌' : '震荡'}趋势占${dominantScore.toFixed(1)}%权重`,
      confidenceAdjustment: adjustments.VERY_STRONG,
      recommendation: '极高置信度信号，长期趋势强力支持',
      weightedScore: dominantScore,
      details: {
        bullishScore: bullishScore.toFixed(1),
        bearishScore: bearishScore.toFixed(1),
        sidewaysScore: sidewaysScore.toFixed(1),
        validTimeframes: validTimeframes.length,
        totalTimeframes: 6
      }
    };
  }

  // 强共振：主导趋势得分≥阈值
  if (dominantScore >= thresholds.STRONG) {
    return {
      level: 'strong',
      summary: `强共振：${dominantTrend === 'bullish' ? '看涨' : dominantTrend === 'bearish' ? '看跌' : '震荡'}趋势占${dominantScore.toFixed(1)}%权重`,
      confidenceAdjustment: adjustments.STRONG,
      recommendation: '高置信度信号，多周期确认',
      weightedScore: dominantScore,
      details: {
        bullishScore: bullishScore.toFixed(1),
        bearishScore: bearishScore.toFixed(1),
        sidewaysScore: sidewaysScore.toFixed(1),
        validTimeframes: validTimeframes.length,
        totalTimeframes: 6
      }
    };
  }

  // 中等共振：主导趋势得分≥阈值
  if (dominantScore >= thresholds.MEDIUM) {
    return {
      level: 'medium',
      summary: `中等共振：${dominantTrend === 'bullish' ? '看涨' : dominantTrend === 'bearish' ? '看跌' : '震荡'}趋势占${dominantScore.toFixed(1)}%权重`,
      confidenceAdjustment: adjustments.MEDIUM,
      recommendation: '中等置信度，建议结合其他指标',
      weightedScore: dominantScore,
      details: {
        bullishScore: bullishScore.toFixed(1),
        bearishScore: bearishScore.toFixed(1),
        sidewaysScore: sidewaysScore.toFixed(1),
        validTimeframes: validTimeframes.length,
        totalTimeframes: 6
      }
    };
  }

  // 弱共振或矛盾：主导趋势得分<阈值
  return {
    level: 'weak',
    summary: `周期矛盾：看涨${bullishScore.toFixed(1)}%，看跌${bearishScore.toFixed(1)}%，震荡${sidewaysScore.toFixed(1)}%`,
    confidenceAdjustment: adjustments.WEAK,
    recommendation: '建议观望，等待趋势明确',
    weightedScore: dominantScore,
    details: {
      bullishScore: bullishScore.toFixed(1),
      bearishScore: bearishScore.toFixed(1),
      sidewaysScore: sidewaysScore.toFixed(1),
      validTimeframes: validTimeframes.length,
      totalTimeframes: 6
    }
  };
}

/**
 * AI基于MCP数据分析
 */
async function analyzeWithMCPData(symbol, mcpData) {
  try {
    console.log(`🤖 开始AI分析: ${symbol}`);
    console.log(`📦 MCP数据结构:`, {
      hasTicker: !!mcpData.ticker,
      hasIndicators: !!mcpData.indicators,
      hasMultiTimeframe: !!mcpData.multiTimeframe,
      hasSummary: !!mcpData.summary,
      tickerKeys: mcpData.ticker ? Object.keys(mcpData.ticker) : []
    });

    // 提取价格数据 - 增强fallback逻辑
    let price = 0;

    console.log('🔍 开始提取价格数据...');
    console.log('   ticker存在:', !!mcpData.ticker);
    console.log('   summary存在:', !!mcpData.summary);
    console.log('   ohlcv存在:', !!mcpData.ohlcv);
    console.log('   indicators存在:', !!mcpData.indicators);

    // 尝试多个来源获取价格
    if (mcpData.ticker) {
      console.log('   尝试从ticker提取价格...');
      console.log('   ticker.last:', mcpData.ticker.last);
      console.log('   ticker.price:', mcpData.ticker.price);
      console.log('   ticker.close:', mcpData.ticker.close);
      console.log('   ticker.lastPrice:', mcpData.ticker.lastPrice);
      
      price = mcpData.ticker.last ||
              mcpData.ticker.price ||
              mcpData.ticker.close ||
              mcpData.ticker.lastPrice ||
              0;
      
      if (price) {
        console.log(`   ✅ 从ticker获取价格: $${price}`);
      }
    }

    // 如果ticker中没有，尝试summary
    if (!price && mcpData.summary) {
      console.log('   尝试从summary提取价格...');
      price = mcpData.summary.price ||
              mcpData.summary.last ||
              mcpData.summary.close ||
              0;
      
      if (price) {
        console.log(`   ✅ 从summary获取价格: $${price}`);
      }
    }

    // 如果还是没有，尝试从indicators获取当前价格
    if (!price && mcpData.indicators && mcpData.indicators.trend) {
      console.log('   尝试从indicators.trend提取价格...');
      price = mcpData.indicators.trend.currentPrice || 0;
      
      if (price) {
        console.log(`   ✅ 从indicators.trend获取价格: $${price}`);
      }
    }

    // 如果还是没有，尝试从ohlcv获取最新收盘价
    if (!price && mcpData.ohlcv && mcpData.ohlcv.length > 0) {
      console.log('   尝试从ohlcv提取价格...');
      const latestCandle = mcpData.ohlcv[mcpData.ohlcv.length - 1];
      price = latestCandle[4]; // close price
      console.log(`   ✅ 从OHLCV获取价格: $${price}`);
    }

    const change24h = mcpData.ticker?.percentage || mcpData.summary?.change24h || 0;
    const volume24h = mcpData.ticker?.baseVolume || mcpData.ticker?.quoteVolume || mcpData.summary?.volume24h || 0;
    const high24h = mcpData.ticker?.high || mcpData.summary?.high24h || 0;
    const low24h = mcpData.ticker?.low || mcpData.summary?.low24h || 0;

    console.log(`📊 最终市场数据: 价格=$${price}, 24h涨跌=${change24h}%, 成交量=${volume24h}`);

    // 验证数据有效性
    if (!price || price <= 0 || isNaN(price)) {
      console.error('❌ 价格数据无效，详细诊断:');
      console.error('   最终price值:', price);
      console.error('   ticker完整内容:', mcpData.ticker);
      console.error('   summary完整内容:', mcpData.summary);
      console.error('   indicators.trend:', mcpData.indicators?.trend);
      console.error('   ohlcv长度:', mcpData.ohlcv?.length);
      
      // 额外尝试：从订单簿推导中间价
      if ((!price || price <= 0 || isNaN(price)) && mcpData.orderBook && Array.isArray(mcpData.orderBook.bids) && Array.isArray(mcpData.orderBook.asks)) {
        const bestBid = mcpData.orderBook.bids[0]?.price || mcpData.orderBook.bids[0]?.[0];
        const bestAsk = mcpData.orderBook.asks[0]?.price || mcpData.orderBook.asks[0]?.[0];
        if (isFinite(bestBid) && isFinite(bestAsk)) {
          price = (Number(bestBid) + Number(bestAsk)) / 2;
          console.warn(`   ⚠️ 从订单簿中间价推导价格: $${price}`);
        }
      }

      // 尝试最后的救援：从multiTimeframe中提取
      if (mcpData.multiTimeframe && mcpData.multiTimeframe.timeframes) {
        console.warn('   ⚠️ 尝试从multiTimeframe提取价格...');
        const tfs = mcpData.multiTimeframe.timeframes;
        // 先尝试从指标中的 currentPrice 取值
        for (const [tf, data] of Object.entries(tfs)) {
          if (data && data.indicators && data.indicators.trend && data.indicators.trend.currentPrice) {
            price = data.indicators.trend.currentPrice;
            console.warn(`   ⚠️ 从multiTimeframe[${tf}].indicators.trend.currentPrice 获取价格: $${price}`);
            break;
          }
        }
        // 若仍无效，则尝试从各时间框架的OHLCV最新K线收盘价
        if (!price || price <= 0 || isNaN(price)) {
          const order = ['1h', '15m', '1m', '30m', '4h', '1d'];
          for (const tf of order) {
            const data = tfs[tf];
            if (data && Array.isArray(data.ohlcv) && data.ohlcv.length > 0) {
              const last = data.ohlcv[data.ohlcv.length - 1];
              const close = Array.isArray(last) ? last[4] : null;
              if (close && isFinite(close) && close > 0) {
                price = close;
                console.warn(`   ⚠️ 从multiTimeframe[${tf}].ohlcv 收盘价获取价格: $${price}`);
                break;
              }
            }
          }
        }
      }
      
      // 如果还是失败，尝试直连公开API（OKX/Binance/Coingecko）
      if (!price || price <= 0 || isNaN(price)) {
        try {
          const axios = require('axios');
          const [base, quote] = symbol.split('/');
          // OKX public
          try {
            const instId = `${base}-${quote}`;
            const resp = await axios.get('https://www.okx.com/api/v5/market/ticker', { params: { instId }, timeout: 5000 });
            const d = resp.data?.data?.[0];
            if (d?.last) {
              price = Number(d.last);
              console.warn(`   ⚠️ 通过OKX公开API获取价格: $${price}`);
            }
          } catch {}

          // Binance public
          if (!price || price <= 0 || isNaN(price)) {
            try {
              const resp2 = await axios.get('https://api.binance.com/api/v3/ticker/price', { params: { symbol: `${base}${quote}` }, timeout: 5000 });
              if (resp2.data?.price) {
                price = Number(resp2.data.price);
                console.warn(`   ⚠️ 通过Binance公开API获取价格: $${price}`);
              }
            } catch {}
          }

          // CoinGecko简易价格（仅当仍失败时）
          if (!price || price <= 0 || isNaN(price)) {
            try {
              const idMap = { BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', MATIC: 'matic-network', DOT: 'polkadot', AVAX: 'avalanche-2', LINK: 'chainlink', UNI: 'uniswap' };
              const coinId = idMap[base] || base.toLowerCase();
              const resp3 = await axios.get('https://api.coingecko.com/api/v3/simple/price', { params: { ids: coinId, vs_currencies: quote.toLowerCase() }, timeout: 6000 });
              const v = resp3.data?.[coinId]?.[quote.toLowerCase()];
              if (v) {
                price = Number(v);
                console.warn(`   ⚠️ 通过CoinGecko获取价格: $${price}`);
              }
            } catch {}
          }
        } catch {}

        // 仍失败则报错
        if (!price || price <= 0 || isNaN(price)) {
          throw new Error(`价格数据完全无法获取: 所有数据源(ticker/summary/indicators/orderBook/ohlcv/multiTimeframe/OKX/Binance/Coingecko)均无有效价格`);
        }
      }
    }

    if (!mcpData.indicators) {
      console.warn('⚠️  技术指标数据缺失');
    }
    
    // 构建覆盖率（用于一起落库）
    const expectedSourcesForCoverage = [
      'ticker','indicators','ohlcv','orderBook','trades',
      'sentiment','coinDetail','gainersLosers','advancedIndicators',
      'fundingRate','openInterest','liquidations','freeAPIs',
      'multiTimeframe','aktools'
    ];
    const coveragePresentMap = {
      ticker: !!mcpData.ticker,
      indicators: !!mcpData.indicators,
      ohlcv: Array.isArray(mcpData.ohlcv) ? mcpData.ohlcv.length > 0 : !!mcpData.ohlcv,
      orderBook: !!mcpData.orderBook,
      trades: Array.isArray(mcpData.trades) ? mcpData.trades.length > 0 : !!mcpData.trades,
      sentiment: !!mcpData.sentiment,
      coinDetail: !!mcpData.coinDetail,
      gainersLosers: !!mcpData.gainersLosers,
      advancedIndicators: !!mcpData.advancedIndicators,
      fundingRate: mcpData.fundingRate !== undefined && mcpData.fundingRate !== null,
      openInterest: mcpData.openInterest !== undefined && mcpData.openInterest !== null,
      liquidations: !!mcpData.liquidations,
      freeAPIs: !!mcpData.freeAPIs,
      multiTimeframe: !!mcpData.multiTimeframe,
      aktools: !!mcpData.aktools
    };
    const presentCountForCoverage = expectedSourcesForCoverage.reduce((n, k) => n + (coveragePresentMap[k] ? 1 : 0), 0);
    const coveragePctForStorage = presentCountForCoverage / expectedSourcesForCoverage.length;

    // 构建完整的市场数据，包含所有可用信息
    const marketData = {
      symbol,
      price,
      change24h,
      volume24h,
      high24h,
      low24h,
      exchange: 'okx',
      // 允许上层通过 mcpData.realtime 控制缓存绕过
      realtime: !!mcpData.realtime,
      contextOptions: mcpData.contextOptions || {},
      contextId: mcpData.contextId || null,

      // 添加完整的ticker数据
      ticker: mcpData.ticker,

      // 添加衍生品数据
      fundingRate: mcpData.fundingRate,
      openInterest: mcpData.openInterest,
      liquidations: mcpData.liquidations,

      // 添加市场情绪和基本面
      sentiment: mcpData.sentiment,
      coinDetail: mcpData.coinDetail,
      gainersLosers: mcpData.gainersLosers,

      // 添加AkTools链上数据
      aktools: mcpData.aktools,

      // 添加高级指标
      advancedIndicators: mcpData.advancedIndicators,

      // 添加免费API数据
      freeAPIs: mcpData.freeAPIs,

      // 添加K线和订单簿数据
      ohlcv: mcpData.ohlcv,
      orderBook: mcpData.orderBook,
      trades: mcpData.trades,

      // 🕐 添加多时间框架数据（完整模式专属）
      multiTimeframe: mcpData.multiTimeframe,
      coverageReport: {
        coverage: Number((coveragePctForStorage * 100).toFixed(0)),
        present: coveragePresentMap,
        timestamp: Date.now()
      }
    };
    
    const analysis = await deepseekService.analyzeMarket(
      marketData,
      mcpData.indicators || {},
      mcpData.aktools?.news || null  // 传入新闻数据
    );
    
    console.log(`✅ AI分析完成: 信号=${analysis.decision?.signal}, 置信度=${analysis.decision?.confidence}%`);
    
    return analysis;
  } catch (error) {
    console.error('❌ AI分析失败:', error.message);
    console.error('错误堆栈:', error.stack);
    
    // 返回默认分析结果而不是抛出错误
    return {
      summary: `分析失败: ${error.message}`,
      chainOfThought: `由于 ${error.message}，无法完成完整分析`,
      decision: {
        signal: 'HOLD',
        confidence: 0,
        entryPrice: null,
        stopLoss: null,
        takeProfit: null,
        reasoning: `分析过程出错: ${error.message}`,
        riskLevel: 'HIGH'
      },
      error: error.message
    };
  }
}

/**
 * AI自动执行工具
 * 注意：预警创建已移至 deepseek.js 的 alertCreatorService.manageAlerts()
 * 这里只返回已创建的预警信息，避免重复创建
 */
async function executeAITools(symbol, analysis, mcpData) {
  const actions = {
    priceAlerts: [],
    backtests: [],
    reasoning: []
  };

  try {
    // ✅ 从 analysis.alertManagement 获取已创建的预警信息
    if (analysis.alertManagement && analysis.alertManagement.created) {
      actions.priceAlerts = analysis.alertManagement.created.map(alert => ({
        type: alert.type,
        price: alert.target_price ?? alert.price,
        id: alert.id,
        reason: alert.message
      }));

      console.log(`📋 AI工具执行: 已创建 ${actions.priceAlerts.length} 个智能预警`);

      // 添加推理说明
      if (actions.priceAlerts.length > 0) {
        actions.reasoning.push(`✅ 智能预警系统已创建 ${actions.priceAlerts.length} 个预警`);
        actions.priceAlerts.forEach(alert => {
          const typeLabel = {
            'stop_loss': '止损',
            'take_profit': '止盈',
            'breakout': '突破',
            'volatility': '波动'
          }[alert.type] || alert.type;
          actions.reasoning.push(`  - ${typeLabel}预警 @ $${alert.price}`);
        });
      }
    } else {
      console.log('ℹ️  无预警信息（可能是HOLD信号或预警创建失败）');
    }

    // 🆕 将深度分析阶段生成的回测结果透传给前端
    if (analysis.aiActions && Array.isArray(analysis.aiActions.backtests) && analysis.aiActions.backtests.length > 0) {
      actions.backtests = analysis.aiActions.backtests.map(bt => ({
        strategy: bt.strategy || bt.strategyName || 'Unknown',
        result: bt.result || bt.performance
      }));
    }

    // 🔮 未来可以在这里添加其他AI工具执行逻辑
    // 例如：自动回测、自动下单（需要用户授权）等

  } catch (error) {
    console.error('❌ 执行AI工具失败:', error.message);
    actions.reasoning.push(`⚠️ AI工具执行出错: ${error.message}`);
  }

  return actions;
}

module.exports = router;
