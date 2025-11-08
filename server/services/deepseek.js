const axios = require('axios');
const aiMemoryService = require('./aiMemoryService');
const { caches } = require('../utils/cache'); // ✅ 引入缓存系统
const aiDecisionValidator = require('./aiDecisionValidator'); // 🆕 引入AI决策验证层
const positionManager = require('./positionManager'); // 🆕 引入仓位管理系统
const alertCreatorService = require('./alertCreatorService'); // 🆕 引入预警创建服务
const { jsonrepair } = require('jsonrepair'); // ✅ 自动修复畸形 JSON
const { getBacktestEngine } = require('./backtestEngine'); // 🆕 策略回测引擎
const autoTradeService = require('./autoTradeService'); // 🆕 自动下单服务
const backtestMemoryService = require('./backtestMemoryService'); // 🆕 回测结果存储
const alertingService = require('./alertingService');
const { getDatabase } = require('../database/database');

// ✅ 常量定义：消除魔法数字
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存
const CACHE_TIME_WINDOW_MS = 30 * 1000; // 30秒时间窗口
const MAX_RETRIES = 2; // 最大重试次数
const RETRY_DELAY_MS = 2000; // 重试延迟（毫秒）
const API_TIMEOUT_MS = 120000; // API超时时间（120秒，增加到2分钟）

class DeepSeekService {
  constructor() {
    // 读取DB中的设置（若存在）
    const getSettingFromDB = (key) => {
      try {
        const db = getDatabase && getDatabase();
        if (!db) return null;
        const row = db.prepare('SELECT value FROM api_settings WHERE category = ? AND key = ?').get('ai', key);
        return row?.value || null;
      } catch (_) {
        return null;
      }
    };

    // 优先使用环境变量，其次使用数据库中保存的配置
    const dbApiKey = getSettingFromDB('deepseekApiKey');
    this.apiKey = process.env.DEEPSEEK_API_KEY || dbApiKey;

    // 🔧 更健壮的 API 基址拼接，支持自定义端点
    const full = process.env.DEEPSEEK_ENDPOINT_URL || getSettingFromDB('endpointUrl');
    if (full && typeof full === 'string' && full.trim()) {
      this.apiUrl = full.trim();
    } else {
      const rawBase = process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_API_URL || getSettingFromDB('deepseekBaseUrl') || 'https://api.deepseek.com';
      const endpoint = process.env.DEEPSEEK_ENDPOINT_PATH || getSettingFromDB('endpointPath') || '/v1/chat/completions';
      const base = (rawBase || '').replace(/\/+$/, '');
      let path = endpoint.startsWith('/') ? endpoint : ('/' + endpoint);
      // 🛠️ 防止 /v1 重复：如果 base 已以 /v1 结尾且 path 也以 /v1 开头，则去重一个 /v1
      const baseEndsWithV1 = /\/v1$/i.test(base);
      const pathStartsWithV1 = /^\/v1(\/|$)/i.test(path);
      if (baseEndsWithV1 && pathStartsWithV1) {
        path = path.replace(/^\/v1/i, '');
        if (!path.startsWith('/')) path = '/' + path;
      }
      this.apiUrl = base + path;
    }
    this.useLocalFallback = process.env.USE_LOCAL_FALLBACK === 'true';
    this.fallbackOnly = process.env.FALLBACK_ONLY === 'true';
    this.maxRetries = MAX_RETRIES;
    this.retryDelay = RETRY_DELAY_MS;
    this.timeout = API_TIMEOUT_MS;
  }

  // generateCacheKey 已由 CacheManagerService 接管

  /**
   * 主分析函数 - 重构为多个职责单一的小函数
   */
  async analyzeMarket(marketData, indicators, newsData) {
    // 1. 数据新鲜度验证
    const freshnessReport = this.validateDataFreshness(marketData);
    
    // 2. 缓存检查与处理
    const cacheResult = await this.handleCache(marketData, indicators, freshnessReport);
    if (cacheResult.cached) return cacheResult.analysis;

    // 3. 如果配置为仅使用fallback，返回安全HOLD
    if (this.fallbackOnly) {
      return await this.handleFallbackOnly(marketData, indicators);
    }

    // 4. 调用AI分析
    const aiAnalysis = await this.callAIAnalysis(marketData, indicators, newsData);
    
    // 5. 决策验证与仓位管理
    return await this.processAnalysisResult(aiAnalysis, marketData, indicators);
  }

  /**
   * 1. 数据新鲜度验证
   */
  validateDataFreshness(marketData) {
    const dataFreshnessValidator = require('./dataFreshnessValidator');
    const freshnessReport = dataFreshnessValidator.generateFreshnessReport(marketData);
    console.log(`🔍 数据新鲜度: ${freshnessReport.overall}`);

    if (freshnessReport.overall === 'STALE') {
      console.warn('⚠️ 数据过期，建议刷新:', freshnessReport.details);
    }

    return freshnessReport;
  }

  /**
   * 2. 缓存检查与处理
   */
  async handleCache(marketData, indicators, freshnessReport) {
    const runtimeStrategy = require('./runtimeStrategy');
    if (marketData?.realtime || runtimeStrategy.isGlobalRealtime()) {
      return { cached: false };
    }
    const cacheManager = require('./cacheManagerService');
    const dataFreshnessValidator = require('./dataFreshnessValidator');
    
    const cacheKey = cacheManager.generateAnalysisKey(marketData, indicators);
    const cached = cacheManager.get(cacheKey);

    if (cached) {
      const invalidationCheck = dataFreshnessValidator.shouldInvalidateCache(cached, marketData);

      if (invalidationCheck.shouldInvalidate) {
        console.log(`💥 缓存失效: ${invalidationCheck.message}`);
        cacheManager.del(cacheKey);
        return { cached: false };
      } else {
        console.log(`📦 使用AI分析缓存: ${invalidationCheck.message}`);
        return { cached: true, analysis: cached };
      }
    }

    return { cached: false };
  }

  /**
   * 3. 处理仅使用fallback的情况
   */
  async handleFallbackOnly(marketData, indicators) {
    console.warn('⚠️ 配置为仅使用本地技术分析，为安全起见返回HOLD信号');
    const safeAnalysis = this.getSafeHoldAnalysis(marketData, indicators, 'FALLBACK_ONLY_MODE');

    await aiMemoryService.saveAnalysis(
      marketData.symbol,
      marketData.exchange || 'unknown',
      safeAnalysis,
      marketData,
      indicators,
      [],
      marketData.contextId || marketData.contextOptions?.contextId || null
    );

    const dataFreshnessValidator = require('./dataFreshnessValidator');
    const cacheManager = require('./cacheManagerService');
    const cacheKey = cacheManager.generateAnalysisKey(marketData, indicators);
    const dynamicTTL = dataFreshnessValidator.getDynamicCacheTTL(marketData, indicators);

    if (dynamicTTL > 0) {
      cacheManager.set(cacheKey, safeAnalysis, dynamicTTL);
      console.log(`✅ 安全HOLD信号已缓存 ${dynamicTTL / 1000}秒`);
    } else {
      console.log('⚡ 高波动市场，不缓存分析结果');
    }

    return safeAnalysis;
  }

  /**
   * 4. 调用AI分析
   */
  async callAIAnalysis(marketData, indicators, newsData) {
    // 根据上下文切换模式（默认complete；支持narrative）
    const requestedMode = marketData?.contextOptions?.mode;
    const baseMode = requestedMode === 'narrative' ? 'narrative' : 'complete';
    
    const { buildSmartPrompt } = require('../prompts/tradingSystemPrompt');

    const envFallbackRaw = process.env.DEEPSEEK_FALLBACK_MODES || '';
    const envFallbackModes = envFallbackRaw
      .split(',')
      .map(mode => mode.trim().toLowerCase())
      .filter(Boolean);

    const defaultFallbackModes = baseMode === 'narrative'
      ? ['complete', 'fast', 'minimal']
      : ['fast', 'minimal'];

    const modeQueue = [];
    const pushMode = (mode) => {
      if (!mode) return;
      const normalized = String(mode).trim().toLowerCase();
      if (!normalized) return;
      if (!modeQueue.includes(normalized)) {
        modeQueue.push(normalized);
      }
    };

    pushMode(baseMode);

    // 🆕 尊重运行时策略：可全局关闭降级
    let fallbackCandidates = envFallbackModes.length > 0 ? envFallbackModes : defaultFallbackModes;
    try {
      const runtimeStrategy = require('./runtimeStrategy');
      if (!runtimeStrategy.isAnalysisFallbackEnabled()) {
        fallbackCandidates = [];
      }
    } catch (_) {}
    fallbackCandidates.forEach(pushMode);

    console.log(`🤖 AI分析模式队列: ${modeQueue.join(' -> ')}`);

    let lastError = null;
    for (const modeAttempt of modeQueue) {
      const isFallbackMode = modeAttempt !== baseMode;

      if (!marketData.contextOptions) {
        marketData.contextOptions = {};
      }
      marketData.contextOptions.mode = modeAttempt;

    const dataAvailability = {
      hasMultiTimeframe: !!marketData.multiTimeframe,
      hasDerivatives: !!(marketData.fundingRate || marketData.openInterest),
      hasSentiment: !!(marketData.sentiment || marketData.freeAPIs),
        mode: modeAttempt
    };

    const systemPrompt = buildSmartPrompt(dataAvailability);
      console.log(`📝 使用${dataAvailability.mode}提示词 (多时间框架: ${dataAvailability.hasMultiTimeframe ? '✅' : '❌'})`);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
          if (attempt > 1) {
            console.warn(`⚠️ 模式 ${modeAttempt} 第${attempt}次重试`);
          }

          const prompt = await this.buildAnalysisPrompt(marketData, indicators, newsData, modeAttempt);
          console.log(`🤖 调用AI API (模式=${modeAttempt}, 第${attempt}次)...`);

        const response = await this.callAIAPI(systemPrompt, prompt);
        // 兼容不同返回结构，安全获取content
        const extractContent = (resp) => {
          try {
            const data = resp?.data || resp;
            if (typeof data === 'string') return data; // 直接字符串
            const ch = Array.isArray(data?.choices) ? data.choices[0] : null;
            // 常见与兼容结构
            let c = ch?.message?.content
                 || ch?.content
                 || ch?.delta?.content
                 || ch?.text
                 || data?.message?.content
                 || data?.output_text
                 || data?.output?.text
                 || data?.result?.content
                 || data?.data?.output_text
                 || data?.data?.message?.content
                 || (Array.isArray(data?.data?.choices) ? data.data.choices[0]?.message?.content || data.data.choices[0]?.content : '')
                 || data?.content
                 || '';
            // 段落数组情况（部分SDK返回segments）
            if (Array.isArray(c)) {
              c = c.map(seg => (typeof seg === 'string' ? seg : (seg?.text || ''))).join('\n');
            }
            if (typeof c !== 'string') return '';
            return c;
          } catch (_) {
            return '';
          }
        };
        let content = extractContent(response);
          if (!content || typeof content !== 'string' || content.trim() === '') {
            if (attempt < this.maxRetries) {
              await new Promise(r => setTimeout(r, this.retryDelay));
              continue;
            }
            const emptyErr = new Error('EMPTY_CONTENT');
            emptyErr.code = 'NO_CONTENT';
            emptyErr.retryable = false;
            throw emptyErr;
          }
        const analysis = this.parseAIResponse(content);
        // 附加Prompt快照（用于详情展示）
        analysis.promptSnapshots = {
          system: systemPrompt,
          user: prompt
        };
        if (this._lastContextMetrics) {
          analysis.contextMetrics = this._lastContextMetrics;
        }

        // 附加：严格引用（取自buildAnalysisPrompt阶段收集的used refs）
        try {
          const refs = Array.isArray(this._lastUsedHistoryRefs) ? this._lastUsedHistoryRefs : [];
          if (refs.length > 0) {
            const currentPrice = Number(marketData?.price || marketData?.ticker?.last || marketData?.ticker?.price || 0);
            const threshold = 0.2; // 0.2% 容忍区间
            analysis.historyReferences = refs.map(r => {
              const entry = Number(r.entryPrice || 0);
              let deltaPct = null;
              let outcome = 'neutral';
              const fromContextId = typeof r.contextId === 'number' ? r.contextId : null;
              const source = fromContextId && (marketData.contextId || marketData.contextOptions?.contextId)
                ? (Number(fromContextId) === Number(marketData.contextId || marketData.contextOptions?.contextId) ? 'current' : 'global')
                : 'unknown';
              if (entry > 0 && currentPrice > 0) {
                deltaPct = ((currentPrice - entry) / entry) * 100;
                const up = deltaPct;
                if (String(r.signal).toUpperCase() === 'BUY') {
                  if (up > threshold) outcome = 'correct';
                  else if (up < -threshold) outcome = 'wrong';
                  else outcome = 'neutral';
                } else if (String(r.signal).toUpperCase() === 'SELL') {
                  if (up < -threshold) outcome = 'correct';
                  else if (up > threshold) outcome = 'wrong';
                  else outcome = 'neutral';
                }
              }
              return {
                id: r.id,
                timestamp: r.timestamp,
                signal: r.signal,
                confidence: r.confidence,
                entryPrice: r.entryPrice,
                summary: r.summary,
                issues: r.issues || [],
                outcome,
                deltaPct,
                contextId: fromContextId,
                source
              };
            });
          }
        } catch (e) {
          // 忽略
        }

        // 保存到历史记忆（带上上下文ID）
        await aiMemoryService.saveAnalysis(
          marketData.symbol,
          marketData.exchange || 'unknown',
          analysis,
          marketData,
          indicators,
          analysis.toolsUsed,
          marketData.contextId || marketData.contextOptions?.contextId || null
        );

        analysis.analysisMode = modeAttempt;
        if (isFallbackMode) {
          analysis.fallbackFromMode = baseMode;
          analysis.summary = `${analysis.summary || ''}\n\n⚠️ 已自动降级为 ${modeAttempt} 模式（原模式 ${baseMode} 多次失败）`.trim();
        }

        // 缓存结果
        await this.cacheAnalysisResult(analysis, marketData, indicators);

        return analysis;

      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === this.maxRetries;
        const errorHandler = require('./errorHandlerService');
        errorHandler.logAttemptFailure(error, attempt);

        const shouldRetry = errorHandler.shouldRetry(error, attempt, this.maxRetries);
        if (!isLastAttempt && shouldRetry) {
          console.log(`⏳ ${this.retryDelay/1000}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          continue;
        }

        console.warn(`⚠️ 模式 ${modeAttempt} 分析失败: ${error.message || error}`);
        break; // 跳转到下一个模式
      }
    }
    }

    // 所有模式均失败
    const failureReason = lastError?.code || (lastError?.message === 'EMPTY_CONTENT' ? 'NO_CONTENT' : null) || 'AI_API_ALL_RETRIES_FAILED';
    return await this.handleAPIFailure(marketData, indicators, failureReason);
  }

  /**
   * 调用AI API
   */
  async callAIAPI(systemPrompt, prompt) {
    console.log(`🔍 [DeepSeek] API URL: ${this.apiUrl}`);
    console.log(`🔍 [DeepSeek] Model: ${process.env.DEEPSEEK_MODEL || 'deepseek-v3.1:671b'}`);
    console.log(`🔍 [DeepSeek] Prompt length: ${prompt.length} chars`);
    
    const response = await axios.post(
        this.apiUrl,
        {
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          messages: [
            {
              role: 'system',
            content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 3000,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout: this.timeout
      }
    );

    console.log(`✅ [DeepSeek] API响应状态: ${response.status}`);
    const preview = (() => { try { return JSON.stringify(response.data).slice(0, 400); } catch { return String(response.data).slice(0, 400); } })();
    console.log(`🔍 [DeepSeek] 响应结构:`, JSON.stringify({
      hasData: !!response.data,
      hasChoices: !!(response.data?.choices),
      choicesLength: Array.isArray(response.data?.choices) ? response.data.choices.length : 0,
      firstChoice: response.data?.choices?.[0] ? Object.keys(response.data.choices[0]) : null
    }));
    console.log(`[DeepSeek] Response preview: ${preview}`);

    // 兼容 iflow.cn 等代理返回的包裹格式（HTTP 200 但业务状态失败）
    try {
      const data = response.data;
      const hasWrappedStatus = data && typeof data === 'object' && !Array.isArray(data)
        && (Object.prototype.hasOwnProperty.call(data, 'status') || Object.prototype.hasOwnProperty.call(data, 'msg'))
        && !Object.prototype.hasOwnProperty.call(data, 'choices');
      if (hasWrappedStatus) {
        const statusRaw = data.status !== undefined ? String(data.status) : '';
        const msg = data.msg || data.message || '';
        const statusNum = parseInt(statusRaw, 10);
        const isExpired = /expired/i.test(msg) || statusNum === 439;
        if (!Number.isNaN(statusNum) && statusNum !== 200 && statusNum !== 0) {
          const err = new Error(msg || `Provider error (status=${statusRaw})`);
          err.code = isExpired ? 'TOKEN_EXPIRED' : 'IFLOW_ERROR';
          err.retryable = !isExpired; // 令牌过期不可重试，其它交由上层判断
          err.provider = 'iflow';
          err.status = statusNum;
          err.raw = data;
          throw err;
        }
        // 某些代理成功时将有效负载放在 body 字段
        if (data.body && typeof data.body === 'object') {
          response.data = data.body;
        }
      }
      // OpenAI 风格错误对象
      if (data && typeof data === 'object' && data.error && !data.choices) {
        const e = new Error(data.error.message || 'LLM provider returned error');
        e.code = data.error.type || 'PROVIDER_ERROR';
        e.retryable = false;
        e.raw = data;
        throw e;
      }
    } catch (proxyCheckErr) {
      // 将代理层错误抛出到上层以便统一处理/降级
      throw proxyCheckErr;
    }

    return response;
  }

  /**
   * 缓存分析结果
   */
  async cacheAnalysisResult(analysis, marketData, indicators) {
    if (marketData?.realtime) {
      return;
    }
    if (analysis?.safeMode) {
      console.log('⏭️ 安全模式结果不缓存');
      return;
    }
    const dataFreshnessValidator = require('./dataFreshnessValidator');
    const cacheManager = require('./cacheManagerService');
    const cacheKey = cacheManager.generateAnalysisKey(marketData, indicators);
    const dynamicTTL = dataFreshnessValidator.getDynamicCacheTTL(marketData, indicators);

    if (dynamicTTL > 0) {
      analysis.timestamp = Date.now();
      analysis.marketData = marketData;
      cacheManager.set(cacheKey, analysis, dynamicTTL);
      console.log(`📦 AI分析结果已缓存 ${dynamicTTL / 1000}秒`);
    } else {
      console.log('⚡ 高波动市场，不缓存分析结果');
    }
  }

  /**
   * 处理API调用失败
   */
  async handleAPIFailure(marketData, indicators, reason) {
    console.warn(`⚠️ ${reason}，为安全起见返回HOLD信号`);
    const safeAnalysis = this.getSafeHoldAnalysis(marketData, indicators, reason);

    await aiMemoryService.saveAnalysis(
      marketData.symbol,
      marketData.exchange || 'unknown',
      safeAnalysis,
      marketData,
      indicators,
      safeAnalysis.toolsUsed,
      marketData.contextId || marketData.contextOptions?.contextId || null
    );

    const shouldAlert = process.env.ALERT_ON_AI_FAILURE !== 'false';
    if (shouldAlert) {
      const symbol = marketData.symbol || 'UNKNOWN';
      const severityMap = {
        TOKEN_EXPIRED: 'error',
        AI_API_ALL_RETRIES_FAILED: 'error',
        AI_API_ERROR: 'warning',
        NO_CONTENT: 'warning',
        '429': 'warning',
        IFLOW_ERROR: 'warning'
      };
      const level = severityMap[String(reason)] || 'warning';
      alertingService.notify({
        level,
        title: 'AI分析失败',
        message: `${symbol} → ${reason}`,
        dedupeKey: `ai-failure:${symbol}:${reason}`,
        cooldownMs: Number(process.env.ALERT_AI_FAILURE_COOLDOWN_MS) || 300000,
        context: {
          symbol,
          reason,
          mode: marketData?.contextOptions?.mode || 'complete'
        }
      }).catch(err => {
        console.error('[Alerting] AI failure notify failed:', err.message);
        // 记录错误但不中断主流程
        // 可以考虑降级到邮件通知或数据库记录
      });
    }

    return safeAnalysis;
  }

  /**
   * 5. 处理分析结果（决策验证、仓位管理与预警管理）
   */
  async processAnalysisResult(analysis, marketData, indicators) {
    // AI决策验证
    console.log('🔍 开始AI决策验证...');
    const validationResult = aiDecisionValidator.validate(analysis, marketData, indicators);

    // 应用验证后的决策
    if (validationResult.validatedDecision) {
      analysis.decision = validationResult.validatedDecision;
      analysis.validationReport = {
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        corrections: validationResult.corrections
      };

      if (validationResult.corrections.length > 0) {
        analysis.summary = `${analysis.summary}\n\n⚠️ 验证修正: ${validationResult.corrections.length}处修正已应用`;
      }
    }

    // 智能仓位管理
    console.log('💰 计算智能仓位...');
    const positionResult = positionManager.calculatePosition(
      analysis.decision,
      marketData,
      { indicators }
    );

    analysis.positionManagement = positionResult;

    if (positionResult.recommendedSize > 0) {
      analysis.summary = `${analysis.summary}\n\n💰 建议仓位: ${positionResult.recommendedSize}% (最大${positionResult.maxSize}%)`;
    }

    // 🆕 智能预警管理
    try {
      console.log('🔔 开始智能预警管理流程...');
      console.log('🔍 分析结果结构检查:', {
        hasAlertSuggestions: !!analysis.alertSuggestions,
        alertSuggestionsCount: analysis.alertSuggestions?.length || 0,
        alertSuggestionsType: typeof analysis.alertSuggestions,
        decisionSignal: analysis.decision?.signal,
        marketDataSymbol: marketData.symbol
      });

      const alertResult = await alertCreatorService.manageAlerts(analysis, marketData);
      analysis.alertManagement = alertResult;

      console.log('🔔 预警管理结果:', {
        source: alertResult.source,
        createdCount: alertResult.created.length,
        skippedCount: alertResult.skipped,
        activeCount: alertResult.active.length,
        error: alertResult.error
      });

      // 更新摘要信息
      if (alertResult.created.length > 0) {
        const sourceLabel = alertResult.source === 'ai' ? 'AI建议' : alertResult.source === 'auto' ? '自动生成' : '未知';
        analysis.summary = `${analysis.summary}\n\n🔔 智能预警: 已创建 ${alertResult.created.length} 个预警 (${sourceLabel})`;

        // 添加到关键要点
        if (analysis.decision && analysis.decision.keyPoints) {
          analysis.decision.keyPoints.push(`已设置 ${alertResult.created.length} 个智能预警`);
        }
      } else if (alertResult.source === 'none') {
        console.log('ℹ️  未创建预警（HOLD信号或数据不足）');
      }

      // 将被拒绝的不合理预警写入警告与摘要
      if (alertResult.rejected && alertResult.rejected.length > 0) {
        const reasonsTop = Array.from(new Set(alertResult.rejected.map(r => r.reason))).slice(0, 3).join('；');
        analysis.summary = `${analysis.summary}\n\n⚠️  已拒绝 ${alertResult.rejected.length} 个不合理预警（例如：${reasonsTop}）`;
        analysis.validationReport = analysis.validationReport || { isValid: true, errors: [], warnings: [], corrections: [] };
        analysis.validationReport.warnings = Array.isArray(analysis.validationReport.warnings) ? analysis.validationReport.warnings : [];
        analysis.validationReport.warnings.push(`已拒绝 ${alertResult.rejected.length} 个不合理预警：${reasonsTop}`);
      }

    } catch (error) {
      console.error('❌ 预警管理失败:', error);
      console.error('   错误堆栈:', error.stack);
      analysis.alertManagement = {
        created: [],
        deleted: [],
        active: [],
        skipped: 0,
        source: 'error',
        error: error.message
      };
    }

    // 🧪 策略回测验证（仅在AI给出实际交易信号时运行）
    analysis.aiActions = analysis.aiActions || {};

    if (!analysis.safeMode) {
      analysis.aiActions.backtests = [];
      const decisionSignal = analysis?.decision?.signal || analysis?.signal;
      const normalizedSignal = typeof decisionSignal === 'string' ? decisionSignal.toUpperCase() : null;

      const engine = getBacktestEngine();
      const lookbackDays = Number(process.env.AI_BACKTEST_LOOKBACK_DAYS) || 30;
      const backtestInterval = process.env.AI_BACKTEST_INTERVAL || '1h';
      const initialCapital = Number(process.env.AI_BACKTEST_CAPITAL) || 10000;
      const fee = Number(process.env.AI_BACKTEST_FEE) || 0.001;
      const slippage = Number(process.env.AI_BACKTEST_SLIPPAGE) || 0.0005;
      const cacheTTL = Number(process.env.AI_BACKTEST_CACHE_TTL_MS) || (2 * 60 * 60 * 1000);

      const strategySpecs = (process.env.AI_BACKTEST_STRATEGIES || 'SimpleMA,Momentum,RSIReversion')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const parseStrategySpec = (spec) => {
        const [namePart, paramsPart] = spec.split(':');
        const name = namePart.trim();
        if (!paramsPart) return { name, params: {} };
        const params = {};
        paramsPart.split(';').forEach(pair => {
          const [k, v] = pair.split('=').map(x => x && x.trim()).filter(Boolean);
          if (k && v !== undefined) {
            const num = Number(v);
            params[k] = Number.isFinite(num) ? num : v;
          }
        });
        return { name, params };
      };

      const strategiesToRun = strategySpecs.map(parseStrategySpec);
      const now = new Date();
      const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
      const backtestSummaryLines = [];

      for (const spec of strategiesToRun) {
        try {
          const backtestConfig = {
            strategyName: spec.name,
            symbol: marketData.symbol,
            interval: backtestInterval,
            startDate: start.toISOString(),
            endDate: now.toISOString(),
            initialCapital,
            fee,
            slippage,
            params: spec.params
          };

          console.log('📊 策略回测验证启动:', backtestConfig);
          const backtestResult = await engine.runBacktestWithCache(backtestConfig, { ttlMs: cacheTTL });
          const performance = backtestResult.performance || {};
          const cacheInfo = backtestResult.fromCache
            ? (() => {
                const remainingMs = Math.max(0, (backtestResult.cacheExpiresAt || 0) - Date.now());
                const remainingMinutes = Math.ceil(remainingMs / 60000);
                return `缓存，剩余约${remainingMinutes}分钟`;
              })()
            : '新计算';

          analysis.aiActions.backtests.push({
            strategy: backtestResult.strategyName,
            interval: backtestResult.interval,
            period: backtestResult.period,
            runAt: now.toISOString(),
            fromCache: !!backtestResult.fromCache,
            cacheExpiresAt: backtestResult.cacheExpiresAt || null,
            cacheTTL: backtestResult.cacheTTL || cacheTTL,
            params: spec.params,
            result: {
              totalReturn: performance.totalReturn,
              winRate: performance.winRate,
              maxDrawdown: performance.maxDrawdown,
              totalTrades: performance.totalTrades,
              sharpeRatio: performance.sharpeRatio,
              executionTime: backtestResult.executionTime
            }
          });

          backtestMemoryService.saveResult(
            marketData.contextId || marketData.contextOptions?.contextId || null,
            marketData.symbol,
            backtestResult.strategyName,
            backtestConfig,
            {
              performance,
              period: backtestResult.period,
              fromCache: backtestResult.fromCache,
              runAt: now.toISOString()
            }
          );

          const cacheLabel = backtestResult.fromCache ? ` (${cacheInfo})` : '';
          const summaryLine = `📊 ${backtestResult.strategyName}: 收益 ${Number(performance.totalReturn || 0).toFixed(2)}%，胜率 ${Number(performance.winRate || 0).toFixed(1)}%，最大回撤 ${Number(performance.maxDrawdown || 0).toFixed(2)}%${cacheLabel}`;
          backtestSummaryLines.push(summaryLine);
        } catch (strategyError) {
          console.error(`❌ 策略回测失败 (${spec.name}):`, strategyError);

          const message = (strategyError && strategyError.message) || '';
          const isRegionalBlock = /451/.test(message) || /unavailable.+region/i.test(message);

          const status = isRegionalBlock ? 'skipped' : 'error';
          const reason = isRegionalBlock ? '数据源受地区限制，已跳过' : message;

          analysis.aiActions.backtests.push({
            strategy: spec.name,
            interval: backtestInterval,
            params: spec.params,
            status,
            error: reason
          });

          const line = isRegionalBlock
            ? `⚠️ ${spec.name} 回测跳过：数据源受地区限制`
            : `⚠️ ${spec.name} 回测失败: ${message}`;
          backtestSummaryLines.push(line);
        }
      }

      if (backtestSummaryLines.length > 0) {
        analysis.summary = `${analysis.summary || ''}\n\n${backtestSummaryLines.join('\n')}`.trim();
        analysis.aiActions.reasoning = Array.isArray(analysis.aiActions.reasoning)
          ? analysis.aiActions.reasoning
          : [];
        analysis.aiActions.reasoning.push(...backtestSummaryLines);
      }
    } else {
      analysis.aiActions.backtests = [];
    }

    try {
      const autoTradeOutcome = await autoTradeService.handleAnalysis(analysis, marketData);
      if (autoTradeOutcome) {
        analysis.aiActions.autoTrade = autoTradeOutcome;

        if (autoTradeOutcome.status === 'executed') {
          const autoTradeNote = `✅ 已自动执行 ${autoTradeOutcome.signal} 交易 (${autoTradeOutcome.mode || 'paper'} 模式，数量 ${autoTradeOutcome.amount})`;
          analysis.summary = `${analysis.summary || ''}\n\n${autoTradeNote}`.trim();

          analysis.aiActions.reasoning = Array.isArray(analysis.aiActions.reasoning)
            ? analysis.aiActions.reasoning
            : [];
          analysis.aiActions.reasoning.push(autoTradeNote);
        }
      }
    } catch (autoTradeError) {
      console.error('⚠️ 自动交易执行失败:', autoTradeError);
      analysis.aiActions.autoTrade = {
        status: 'error',
        reason: autoTradeError.message
      };
    }

    return analysis;
  }

  async buildAnalysisPrompt(marketData, indicators, newsData, mode = 'complete') {
    const promptBuilder = require('./promptBuilderService');
    const dataFormatter = require('./dataFormatterService');
    const contextWeighter = require('./contextWeightService');
    const conflictAggregator = require('./conflictAggregator');
    const accountStateService = require('./accountStateService');

    // 获取账户状态（余额、持仓、交易绩效）
    let accountState = null;
    try {
      const exchange = marketData.exchange || 'okx';
      const symbol = marketData.symbol;
      accountState = await accountStateService.getAccountState(exchange, symbol);
      console.log('✅ 已获取账户状态:', {
        hasBalance: !!accountState?.balance,
        positionsCount: accountState?.positions?.length || 0,
        recentTradesCount: accountState?.recentTrades?.length || 0
      });
    } catch (error) {
      console.warn('⚠️ 获取账户状态失败，继续使用无账户信息模式:', error.message);
    }

    let historyContext = '';
    let usedHistoryRefs = [];
    try {
      if (typeof aiMemoryService.generateContextForAIWithRefs === 'function') {
        const contextId = marketData.contextId || marketData.contextOptions?.contextId || null;
        const { context, used } = await aiMemoryService.generateContextForAIWithRefs(
          marketData.symbol,
          marketData,
          indicators,
          5,
          contextId
        );
        historyContext = context;
        usedHistoryRefs = used || [];
      } else {
        const contextId = marketData.contextId || marketData.contextOptions?.contextId || null;
        historyContext = await aiMemoryService.generateContextForAI(
          marketData.symbol,
          marketData,
          indicators,
          contextId
        );
      }
      // 语义检索补充（向量Top-K）
      try {
        const vectorService = require('./vectorMemoryService');
        const useHQ = process.env.AI_EMBED_HIGH_QUALITY === '1';
        
        // 安全的JSON序列化，避免循环引用和无效值
        let queryText;
        try {
          queryText = JSON.stringify({ marketData, indicators }, (key, value) => {
            // 过滤掉循环引用和无效值
            if (value === undefined || value === null) return null;
            if (typeof value === 'number' && !isFinite(value)) return null;
            if (typeof value === 'function') return undefined;
            return value;
          });
        } catch (jsonErr) {
          console.warn('⚠️ JSON序列化失败，使用简化查询:', jsonErr.message);
          queryText = JSON.stringify({ 
            symbol: marketData.symbol, 
            price: marketData.price,
            signal: indicators?.trend || 'unknown'
          });
        }
        
        let similar = [];
        const ctxId = marketData.contextId || marketData.contextOptions?.contextId || null;
        if (useHQ && typeof vectorService.ensureRecentEmbeddingsAsync === 'function') {
          await vectorService.ensureRecentEmbeddingsAsync(marketData.symbol, 50, ctxId);
          if (typeof vectorService.searchSimilarAsync === 'function') {
            similar = await vectorService.searchSimilarAsync(marketData.symbol, queryText, 8, ctxId);
          }
        }
        if (!similar || similar.length === 0) {
          vectorService.ensureRecentEmbeddings(marketData.symbol, 50, ctxId);
          similar = vectorService.searchSimilar(marketData.symbol, queryText, 8, ctxId);
        }
        // 兜底：若按面板过滤后的引用不足，跨面板补充相同币种的相似历史
        try {
          const minRefs = 3;
          const currentCount = (usedHistoryRefs?.length || 0) + (similar?.length || 0);
          if (currentCount < minRefs) {
            const extraSimilar = Array.isArray(similar) && similar.length > 0
              ? similar
              : [];
            // 合并按面板检索出的相似项
            const ids0 = new Set(usedHistoryRefs.map(r => r.id));
            extraSimilar.forEach(s => { if (!ids0.has(s.id)) usedHistoryRefs.push(s); });

            if (usedHistoryRefs.length < minRefs) {
              // 跨上下文补足
              try {
                vectorService.ensureRecentEmbeddings(marketData.symbol, 50, null);
                const globalSimilar = typeof vectorService.searchSimilarAsync === 'function'
                  ? await vectorService.searchSimilarAsync(marketData.symbol, queryText, 8, null)
                  : vectorService.searchSimilar(marketData.symbol, queryText, 8, null);
                const ids = new Set(usedHistoryRefs.map(r => r.id));
                for (const g of (globalSimilar || [])) {
                  if (!ids.has(g.id)) {
                    usedHistoryRefs.push(g);
                    ids.add(g.id);
                    if (usedHistoryRefs.length >= minRefs) break;
                  }
                }
              } catch (e) {
                console.warn('⚠️ 跨面板补足引用失败:', e.message);
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ 历史引用兜底逻辑异常:', e.message);
        }
        // 合并去重
        const ids = new Set(usedHistoryRefs.map(r => r.id));
        similar.forEach(s => { if (!ids.has(s.id)) usedHistoryRefs.push(s); });
      } catch (e) {
        console.warn('⚠️ 语义检索失败:', e.message);
        // 忽略检索失败
      }
    } catch (e) {
      console.warn('生成历史上下文失败:', e.message);
    }

    try {
      // 权重筛选与冲突聚合
      const options = marketData.contextOptions || {};
      const contextK = Number(options.contextK) || 5;
      const minWeight = options.minWeight !== undefined ? Number(options.minWeight) : 0.5;
      const { evidence, background, metrics } = contextWeighter.rankAndSplit(usedHistoryRefs, { contextK, minWeight });
      const conflict = conflictAggregator.aggregate(evidence);

      const evidenceText = evidence.length > 0
        ? evidence.map((r, i) => `[#${r.id}] ${i + 1}. ${r.signal}(${r.confidence}%) $${r.entryPrice} @ ${r.timestamp}${Array.isArray(r.issues) && r.issues.length ? ` [${r.issues.join(',')}]` : ''}`).join('\n')
        : '无高权重引用';
      const backgroundText = background.length > 0
        ? background.map((r, i) => `[#${r.id}] ${i + 1}. ${r.signal}(${r.confidence}%)`).join('\n')
        : '';

      const evidenceSection = `## 证据引用(高权重)\n${evidenceText}`;
      const backgroundSection = backgroundText ? `\n\n## 背景引用(低权重)\n${backgroundText}` : '';
      const metricsSection = `\n\n## 引用指标\n- 覆盖率: ${(metrics.coverage * 100).toFixed(0)}%\n- 问题率: ${(metrics.issueRate * 100).toFixed(0)}%\n- 冲突: 支持BUY:${conflict.counts.BUY} / 支持SELL:${conflict.counts.SELL} / 中性:${conflict.counts.HOLD} (主导 ${conflict.dominant}, 一致性 ${(conflict.consistency * 100).toFixed(0)}%)`;

      // 保存引用与指标供返回
      this._lastUsedHistoryRefs = evidence.concat(background);
      this._lastContextMetrics = { coverage: metrics.coverage, issueRate: metrics.issueRate, conflict };

      // 记录检查点（节流+阈值控制，失败不影响主流程）
      try {
        const checkpointService = require('./checkpointService');
        checkpointService.maybeCreateCheckpoint(
          marketData.symbol,
          marketData,
          indicators,
          { contextMetrics: this._lastContextMetrics, usedRefs: this._lastUsedHistoryRefs }
        );
      } catch (e) {
        // 忽略错误
      }

      const dataQuality = this.calculateDataQuality(marketData, indicators);
      const anomalies = this.detectAnomalies(marketData, indicators);
      const promptStr = promptBuilder.buildAnalysisPrompt({
        marketData,
        indicators,
        newsData,
        historyContext: `${historyContext}\n\n${evidenceSection}${backgroundSection}${metricsSection}`,
        dataQuality,
        anomalies,
        accountState, // 添加账户状态信息
        mode,
        formatters: {
          formatMultiTimeframe: this.formatMultiTimeframe.bind(this),
          formatIndicators: dataFormatter.formatIndicators.bind(dataFormatter),
          formatPriceAction: dataFormatter.formatPriceAction.bind(dataFormatter),
          formatDivergence: dataFormatter.formatDivergence.bind(dataFormatter),
          formatNews: this.formatNews.bind(this),
          formatDerivativesData: dataFormatter.formatDerivativesData.bind(dataFormatter),
          formatOnChainData: dataFormatter.formatOnChainData.bind(dataFormatter),
          formatAdvancedIndicators: dataFormatter.formatAdvancedIndicators.bind(dataFormatter),
          formatFreeAPIsData: dataFormatter.formatFreeAPIsData.bind(dataFormatter),
          formatOrderBookData: dataFormatter.formatOrderBookData.bind(dataFormatter),
          formatTradesData: dataFormatter.formatTradesData.bind(dataFormatter),
          formatOHLCVData: dataFormatter.formatOHLCVData.bind(dataFormatter)
        }
      });
      // 已在上方设置 _lastUsedHistoryRefs/_lastContextMetrics
      return promptStr;
    } catch (e) {
      console.error('构建提示词失败，使用简化fallback:', e.message);
      const F = require('./promptFragments/coreSections');
      const sections = [
        F.buildHeader(),
        '',
        F.buildCurrentPriceSection(marketData),
        '',
        '## 价格行为（裸K）分析',
        dataFormatter.formatPriceAction(marketData.priceAction),
        '',
        '## 技术指标',
        dataFormatter.formatIndicators(indicators),
        '',
        '## K线形态（最近10根）',
        dataFormatter.formatOHLCVData(marketData.ohlcv),
        '',
        historyContext
      ];
      return sections.filter(Boolean).join('\n');
    }
  }


  

  formatNews(newsData) {
    if (!newsData || newsData.length === 0) return '暂无最新新闻';
    
    return newsData.slice(0, 5).map((news, i) => 
      `${i + 1}. ${news.title} (${news.source})`
    ).join('\n');
  }

  

  

  

  /**
   * 🆕 格式化背离分析
   */
  

  

  

  

  

  parseAIResponse(content) {
    try {
      console.log('🔍 开始解析AI响应，内容长度:', content.length);
      console.log('📄 原始内容前200字符:', content.substring(0, 200));
      console.log('📄 原始内容最后100字符:', content.substring(content.length - 100));

      // 预处理：移除可能的说明文字（如 "这是分析结果："、"Here is the json:" 等）
      let preprocessed = content;

      // 如果内容以说明文字开头，尝试找到第一个 { 或 ``` 并从那里开始
      const firstBrace = content.indexOf('{');
      const firstCodeBlock = content.indexOf('```');

      if (firstBrace > 50 || firstCodeBlock > 50) {
        // 如果第一个 { 或 ``` 出现在50字符之后，说明前面可能有说明文字
        console.log('⚠️ 检测到可能的前导说明文字，尝试移除...');
        if (firstCodeBlock !== -1 && (firstCodeBlock < firstBrace || firstBrace === -1)) {
          preprocessed = content.substring(firstCodeBlock);
          console.log('✂️ 从第一个代码块标记开始截取');
        } else if (firstBrace !== -1) {
          preprocessed = content.substring(firstBrace);
          console.log('✂️ 从第一个 { 开始截取');
        }
      }

      // 尝试从markdown代码块中提取JSON
      let jsonStr = null;

      // 方法1: 匹配 ```json ... ``` (支持多行)
      const jsonMatch1 = preprocessed.match(/```json\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch1) {
        jsonStr = jsonMatch1[1];
        console.log('✅ 方法1匹配成功: ```json ... ```');
        console.log('📝 提取的JSON前100字符:', jsonStr.substring(0, 100));
      }

      // 方法2: 匹配 ``` ... ``` (支持多行)
      if (!jsonStr) {
        const jsonMatch2 = preprocessed.match(/```\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch2) {
          jsonStr = jsonMatch2[1];
          console.log('✅ 方法2匹配成功: ``` ... ```');
          console.log('📝 提取的JSON前100字符:', jsonStr.substring(0, 100));
        }
      }

      // 方法3: 直接匹配 { ... } (贪婪匹配，获取最外层的完整JSON)
      if (!jsonStr) {
        const jsonMatch3 = preprocessed.match(/\{[\s\S]*\}/);
        if (jsonMatch3) {
          jsonStr = jsonMatch3[0];
          console.log('✅ 方法3匹配成功: { ... }');
          console.log('📝 提取的JSON前100字符:', jsonStr.substring(0, 100));
        }
      }

      // 调试：检查是否找到JSON
      if (!jsonStr) {
        console.error('❌ 未找到JSON结构，尝试所有方法都失败');
        console.error('📄 完整内容:', content);
        throw new Error('无法从AI响应中提取JSON');
      }

      if (jsonStr) {
        // 清理可能的格式问题
        jsonStr = jsonStr.trim();

        // 移除可能的BOM标记
        jsonStr = jsonStr.replace(/^\uFEFF/, '');

        // 统一奇异引号
        jsonStr = jsonStr.replace(/[""]/g, '"').replace(/['']/g, "'");

        // 移除注释（// 与 /* */）
        try {
          jsonStr = jsonStr
            .replace(/(^|\s)\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        } catch (_) { /* ignore */ }

        // 修复常见的JSON格式错误
        jsonStr = jsonStr.replace(/,\s*"keyPoints\[/g, ',\n  "keyPoints": [');
        jsonStr = jsonStr.replace(/,\s*"alertSuggestions\[/g, ',\n  "alertSuggestions": [');

        // 修复控制字符错误：使用更简单的方法转义字符串中的控制字符
        // 这个方法会找到所有 "..." 格式的字符串并转义其中的控制字符
        try {
          let inString = false;
          let escaped = false;
          let result = '';

          for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];
            const code = char.charCodeAt(0);

            // 检查是否在字符串内部
            if (char === '"' && !escaped) {
              inString = !inString;
              result += char;
            }
            // 检查是否是转义字符
            else if (char === '\\' && !escaped && inString) {
              escaped = true;
              result += char;
            }
            // 如果在字符串内且遇到控制字符，转义它
            else if (inString && !escaped && code >= 0x00 && code <= 0x1F) {
              if (code === 0x09) result += '\\t';      // tab
              else if (code === 0x0A) result += '\\n'; // newline
              else if (code === 0x0D) result += '\\r'; // carriage return
              else result += '\\u' + ('0000' + code.toString(16)).slice(-4);
            }
            // 正常字符
            else {
              result += char;
              escaped = false;
            }
          }

          jsonStr = result;
          console.log('✅ 控制字符转义完成');
        } catch (escapeError) {
          console.warn('⚠️ 控制字符转义失败，尝试继续:', escapeError.message);
        }

        console.log('📝 准备解析JSON，长度:', jsonStr.length);
        console.log('📝 JSON前100字符:', jsonStr.substring(0, 100));

        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        console.log('✅ JSON解析成功');
        } catch (parseError) {
          console.error('❌ JSON解析失败:', parseError.message);

          // 提取错误位置信息
          const positionMatch = parseError.message.match(/position (\d+)/);
          const position = positionMatch ? parseInt(positionMatch[1]) : -1;

          console.error('   错误位置:', position !== -1 ? position : '未知');
          console.error('   错误行:', parseError.message.match(/line (\d+)/)?.[1] || '未知');

          // 显示错误位置附近的字符（前后各50个字符）
          if (position !== -1 && jsonStr.length > 0) {
            const start = Math.max(0, position - 50);
            const end = Math.min(jsonStr.length, position + 50);
            const snippet = jsonStr.substring(start, end);
            const errorChar = jsonStr[position] || '';

            console.error('\n📍 错误位置附近的内容:');
            console.error('   [开始位置:', start, ']');
            console.error('   内容:', JSON.stringify(snippet));
            console.error('   错误字符:', JSON.stringify(errorChar), '(char code:', errorChar.charCodeAt(0) || 'N/A', ')');
            console.error('   [结束位置:', end, ']\n');
          }

          // ✅ 先尝试使用 jsonrepair 进行自动修复
          try {
            const repaired = jsonrepair(jsonStr);
            console.log('🔧 jsonrepair 修复成功，重新解析');
            parsed = JSON.parse(repaired);
            console.log('✅ JSON通过 jsonrepair 解析成功');
          } catch (repairError) {
            console.warn('⚠️ jsonrepair 修复失败:', repairError.message);
          
          // ✅ 修复：尝试修复常见的 JSON 格式错误
          try {
            // 修复1: 移除尾随逗号（对象和数组）
            jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
            
            // 修复2: 修复单引号（某些AI可能使用单引号）
            jsonStr = jsonStr.replace(/'/g, '"');
            
            // 修复3: 修复对象之间的缺失逗号
            jsonStr = jsonStr.replace(/}\s*{/g, '},{');
            
            // 修复4: 修复属性值后的缺失逗号（在两个字符串属性之间）
            jsonStr = jsonStr.replace(/(":\s*"[^"]*")\s*\n\s*(")/g, '$1,\n    $2');
            
            console.log('🔧 尝试修复后的 JSON 前200字符:', jsonStr.substring(0, 200));
            parsed = JSON.parse(jsonStr);
            console.log('✅ JSON修复并解析成功');
          } catch (fixError) {
            console.error('❌ JSON修复失败:', fixError.message);
            // 尝试提取错误位置附近的代码
            const errorPos = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0');
            if (errorPos > 0 && errorPos < jsonStr.length) {
              const start = Math.max(0, errorPos - 50);
              const end = Math.min(jsonStr.length, errorPos + 50);
              console.error('   错误位置附近的代码:', jsonStr.substring(start, end));
            }
            // 返回错误但提供部分可用的数据
            throw new Error(`JSON解析失败: ${parseError.message}。AI返回的JSON格式不正确，请检查AI响应。`);
          }
          }
        }

        // 叙述模式：behaviorNarrative/timeline + decision
        if (parsed.behaviorNarrative && parsed.decision) {
          // 兼容：确保数组结构
          const narrative = Array.isArray(parsed.behaviorNarrative)
            ? parsed.behaviorNarrative
            : (typeof parsed.behaviorNarrative === 'string'
                ? parsed.behaviorNarrative.split(/\n+/).map(s => s.trim()).filter(Boolean)
                : []);
          const timeline = Array.isArray(parsed.timeline) ? parsed.timeline : [];

          // 归一化多时间框架
          if (!parsed.decision.multiTimeframeAnalysis) {
            parsed.decision.multiTimeframeAnalysis = {
              "1m_trend": "unknown",
              "15m_trend": "unknown",
              "30m_trend": "unknown",
              "1h_trend": "unknown",
              "4h_trend": "unknown",
              "1d_trend": "unknown",
              "resonance_level": "unknown",
              "confidence_adjustment": "0%",
              "summary": "AI未提供多时间框架分析"
            };
          }

          const mtfN = parsed.decision.multiTimeframeAnalysis;
          const normalizedMTF_N = {
            timeframes: {
              '1m': { trend: mtfN['1m_trend'] || 'unknown', status: mtfN['1m_trend'] ? 'success' : 'failed' },
              '15m': { trend: mtfN['15m_trend'] || 'unknown', status: mtfN['15m_trend'] ? 'success' : 'failed' },
              '30m': { trend: mtfN['30m_trend'] || 'unknown', status: mtfN['30m_trend'] ? 'success' : 'failed' },
              '1h': { trend: mtfN['1h_trend'] || 'unknown', status: mtfN['1h_trend'] ? 'success' : 'failed' },
              '4h': { trend: mtfN['4h_trend'] || 'unknown', status: mtfN['4h_trend'] ? 'success' : 'failed' },
              '1d': { trend: mtfN['1d_trend'] || 'unknown', status: mtfN['1d_trend'] ? 'success' : 'failed' }
            },
            resonance: {
              level: mtfN.resonance_level || 'unknown',
              confidenceAdjustment: mtfN.confidence_adjustment || '0%',
              summary: mtfN.summary || '多时间框架分析'
            },
            raw: mtfN
          };

          return {
            summary: parsed.summary || '模型自述',
            chainOfThought: narrative.join('\n'),
            decision: {
              signal: parsed.decision.signal || 'HOLD',
              confidence: parsed.decision.confidence || 0,
              entryPrice: parsed.decision.entryPrice ?? null,
              stopLoss: parsed.decision.stopLoss ?? null,
              takeProfit: parsed.decision.takeProfit ?? null,
              reasoning: parsed.decision.reasoning || narrative.join('\n'),
              riskLevel: parsed.decision.riskLevel || 'MEDIUM'
            },
            multiTimeframeAnalysis: normalizedMTF_N,
            behaviorNarrative: narrative,
            timeline,
            currentIntent: parsed.currentIntent || null,
            nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions : [],
            usedIndicators: Array.isArray(parsed.usedIndicators) ? parsed.usedIndicators : undefined,
            alertSuggestions: Array.isArray(parsed.alertSuggestions) ? parsed.alertSuggestions : [],
            rawContent: content
          };
        }

        // 新格式：包含 summary, reasoning/chainOfThought, decision（可选 usedIndicators）
        if (parsed.summary && (parsed.chainOfThought || parsed.reasoning) && parsed.decision) {
          // 🕐 验证和转换多时间框架分析字段
          if (!parsed.decision.multiTimeframeAnalysis) {
            console.warn('⚠️ AI未返回多时间框架分析，添加默认值');
            parsed.decision.multiTimeframeAnalysis = {
              "1m_trend": "unknown",
              "15m_trend": "unknown",
              "30m_trend": "unknown",
              "1h_trend": "unknown",
              "4h_trend": "unknown",
              "1d_trend": "unknown",
              "resonance_level": "unknown",
              "confidence_adjustment": "0%",
              "summary": "AI未提供多时间框架分析"
            };
          }
          
          // 转换为验证器期望的格式：将 1m_trend 等字段转换为 timeframes['1m'].trend
          const mtf = parsed.decision.multiTimeframeAnalysis;
          const normalizedMTF = {
            timeframes: {
              '1m': { trend: mtf['1m_trend'] || 'unknown', status: mtf['1m_trend'] ? 'success' : 'failed' },
              '15m': { trend: mtf['15m_trend'] || 'unknown', status: mtf['15m_trend'] ? 'success' : 'failed' },
              '30m': { trend: mtf['30m_trend'] || 'unknown', status: mtf['30m_trend'] ? 'success' : 'failed' },
              '1h': { trend: mtf['1h_trend'] || 'unknown', status: mtf['1h_trend'] ? 'success' : 'failed' },
              '4h': { trend: mtf['4h_trend'] || 'unknown', status: mtf['4h_trend'] ? 'success' : 'failed' },
              '1d': { trend: mtf['1d_trend'] || 'unknown', status: mtf['1d_trend'] ? 'success' : 'failed' }
            },
            resonance: {
              level: mtf.resonance_level || 'unknown',
              confidenceAdjustment: mtf.confidence_adjustment || '0%',
              summary: mtf.summary || '多时间框架分析'
            },
            // 保留原始AI返回的字段，供其他地方使用
            raw: mtf
          };

          return {
            summary: parsed.summary,
            chainOfThought: parsed.chainOfThought || parsed.reasoning || '', // 兼容reasoning字段
            decision: {
              signal: parsed.decision.signal || 'HOLD',
              confidence: parsed.decision.confidence || 0,
              entryPrice: parsed.decision.entryPrice,
              stopLoss: parsed.decision.stopLoss,
              takeProfit: parsed.decision.takeProfit,
              reasoning: parsed.decision.reasoning || parsed.chainOfThought || '', // 兼容两个字段
              riskLevel: parsed.decision.riskLevel || 'MEDIUM'
            },
            // 🕐 多时间框架分析需要在顶层，供验证器使用（已标准化格式）
            multiTimeframeAnalysis: normalizedMTF,
            coreIndicatorsAlignment: parsed.decision?.coreIndicatorsAlignment || parsed.coreIndicatorsAlignment,
            signalChangeReason: parsed.decision?.signalChangeReason || parsed.signalChangeReason,
            usedIndicators: Array.isArray(parsed.usedIndicators) ? parsed.usedIndicators : undefined,
            alertSuggestions: Array.isArray(parsed.alertSuggestions) ? parsed.alertSuggestions : [],
            // 保留原始内容用于调试
            rawContent: content
          };
        }

        // 旧格式兼容：直接返回决策
        // 🕐 验证和转换多时间框架分析字段
        if (!parsed.multiTimeframeAnalysis) {
          console.warn('⚠️ AI未返回多时间框架分析（旧格式），添加默认值');
          parsed.multiTimeframeAnalysis = {
            "1m_trend": "unknown",
            "15m_trend": "unknown",
            "30m_trend": "unknown",
            "1h_trend": "unknown",
            "4h_trend": "unknown",
            "1d_trend": "unknown",
            "resonance_level": "unknown",
            "confidence_adjustment": "0%",
            "summary": "AI未提供多时间框架分析"
          };
        }
        
        // 转换为验证器期望的格式
        const mtfOld = parsed.multiTimeframeAnalysis;
        const normalizedMTFOld = {
          timeframes: {
            '1m': { trend: mtfOld['1m_trend'] || 'unknown', status: mtfOld['1m_trend'] ? 'success' : 'failed' },
            '15m': { trend: mtfOld['15m_trend'] || 'unknown', status: mtfOld['15m_trend'] ? 'success' : 'failed' },
            '30m': { trend: mtfOld['30m_trend'] || 'unknown', status: mtfOld['30m_trend'] ? 'success' : 'failed' },
            '1h': { trend: mtfOld['1h_trend'] || 'unknown', status: mtfOld['1h_trend'] ? 'success' : 'failed' },
            '4h': { trend: mtfOld['4h_trend'] || 'unknown', status: mtfOld['4h_trend'] ? 'success' : 'failed' },
            '1d': { trend: mtfOld['1d_trend'] || 'unknown', status: mtfOld['1d_trend'] ? 'success' : 'failed' }
          },
          resonance: {
            level: mtfOld.resonance_level || 'unknown',
            confidenceAdjustment: mtfOld.confidence_adjustment || '0%',
            summary: mtfOld.summary || '多时间框架分析'
          },
          raw: mtfOld
        };

        return {
          summary: parsed.reasoning || '市场分析',
          chainOfThought: parsed.chainOfThought || parsed.reasoning || content,
          decision: {
            signal: parsed.signal || 'HOLD',
            confidence: parsed.confidence || 0,
            entryPrice: parsed.entryPrice,
            stopLoss: parsed.stopLoss,
            takeProfit: parsed.takeProfit,
            reasoning: parsed.reasoning || parsed.chainOfThought || content,
            riskLevel: parsed.riskLevel || 'MEDIUM'
          },
          // 🕐 多时间框架分析需要在顶层，供验证器使用（已标准化格式）
          multiTimeframeAnalysis: normalizedMTFOld,
          coreIndicatorsAlignment: parsed.coreIndicatorsAlignment,
          signalChangeReason: parsed.signalChangeReason,
          alertSuggestions: Array.isArray(parsed.alertSuggestions) ? parsed.alertSuggestions : [],
          rawContent: content
        };
      }
      
      // 如果没有找到JSON，返回默认结构
      console.error('❌ 未找到有效的JSON结构');
      console.error('📄 原始内容前500字符:', content.substring(0, 500));

      return {
        summary: '无法解析AI响应',
        chainOfThought: '未找到有效的JSON结构，请检查AI返回格式',
        decision: {
        signal: 'HOLD',
        confidence: 0,
        reasoning: '解析失败：未找到有效的JSON结构',
        riskLevel: 'HIGH'
        },
        alertSuggestions: [],
        rawContent: content
      };
    } catch (error) {
      console.error('❌ 解析AI响应失败:', error.message);
      console.error('📄 错误位置:', error.stack);
      console.error('📄 原始内容前500字符:', content.substring(0, 500));

      // 尝试从原始文本中"挽救"关键字段，避免全流程中断
      const safeExtract = (regex, mapFn = (v) => v) => {
        const m = content.match(regex);
        if (!m) return null;
        try { return mapFn(m[1]); } catch { return null; }
      };

      const toNumber = (v) => {
        const n = parseFloat(String(v).replace(/[,\s]/g, ''));
        return isFinite(n) ? n : null;
      };

      // 基础字段兜底提取
      const fallbackSignal = (safeExtract(/signal\s*[:=]\s*"?(BUY|SELL|HOLD)"?/i) || 'HOLD').toUpperCase();
      const fallbackConfidence = toNumber(safeExtract(/confidence\s*[:=]\s*([0-9]{1,3}(?:\.[0-9]+)?)/i)) ?? 0;
      const fallbackEntry = toNumber(safeExtract(/entryPrice\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i));
      const fallbackSL = toNumber(safeExtract(/stopLoss\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i));
      const fallbackTP = toNumber(safeExtract(/takeProfit\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i));

      // 摘要/理由
      let summary = '解析失败';
      const summaryMatch = content.match(/"summary"\s*:\s*"([^"]+)"/);
      if (summaryMatch) summary = summaryMatch[1];
      const reasoning = `JSON解析失败: ${error.message}`;

      // 兜底返回结构（尽可能携带解析到的关键信息，供验证与预警使用）
      return {
        summary,
        chainOfThought: reasoning,
        decision: {
          signal: fallbackSignal,
          confidence: fallbackConfidence,
          entryPrice: fallbackEntry,
          stopLoss: fallbackSL,
          takeProfit: fallbackTP,
          reasoning,
        riskLevel: 'HIGH'
        },
        alertSuggestions: [],
        rawContent: content
      };
    }
  }

  /**
   * 🆕 安全的HOLD分析（AI不可用时的安全策略）
   * @param {Object} marketData - 市场数据
   * @param {Object} indicators - 技术指标
   * @param {string} reason - 返回HOLD的原因
   */
  getSafeHoldAnalysis(marketData, indicators, reason = 'UNKNOWN') {
    console.log(`🛡️ 返回安全HOLD信号，原因: ${reason}`);

    const price = marketData.price || marketData.ticker?.last || 0;

    // 生成详细的原因说明
    const reasonMessages = {
      'AI_API_UNAVAILABLE': 'AI分析服务暂时不可用',
      'AI_API_ALL_RETRIES_FAILED': 'AI分析服务多次重试失败',
      'FALLBACK_ONLY_MODE': '系统配置为仅使用本地分析',
      'DATA_QUALITY_POOR': '数据质量不足',
      'MULTI_TIMEFRAME_FAILED': '多时间框架数据不足',
      'NO_CONTENT': 'AI返回缺少内容',
      'TOKEN_EXPIRED': 'API令牌已过期',
      'IFLOW_ERROR': '代理服务返回错误',
      // 🆕 通用/网络错误映射
      'AI_API_ERROR': 'AI服务调用失败',
      'PROVIDER_ERROR': 'AI提供方返回错误',
      'API_RATE_LIMIT': 'API调用频率受限',
      '429': 'API调用频率受限',
      'ECONNABORTED': 'AI服务超时',
      'ETIMEDOUT': 'AI服务超时',
      'ECONNRESET': '网络连接被重置',
      'ENOTFOUND': 'DNS解析失败',
      'ECONNREFUSED': '连接被拒绝'
    };

    const reasonMessage = reasonMessages[String(reason)] || '未知原因';

    return {
      summary: `⚠️ 安全模式：${reasonMessage}`,
      chainOfThought: `由于${reasonMessage}，系统无法进行可靠的市场分析。为保护资金安全，建议观望等待。\n\n` +
                      `当前价格: $${price}\n` +
                      `技术指标: ${indicators ? '部分可用' : '不可用'}\n\n` +
                      `⚠️ 重要提示：在AI分析服务恢复前，请勿进行交易。`,
      decision: {
        signal: 'HOLD',
        confidence: 0,
        entryPrice: price,
        stopLoss: null,
        takeProfit: null,
        reasoning: `🛡️ 安全策略：${reasonMessage}，无法进行可靠分析，强制观望以保护资金安全`,
        riskLevel: 'HIGH'
      },
      // 🕐 添加安全模式下的多时间框架分析（标记为不可用）
      multiTimeframeAnalysis: {
        timeframes: {
          '1m': { trend: 'unknown', status: 'failed' },
          '15m': { trend: 'unknown', status: 'failed' },
          '30m': { trend: 'unknown', status: 'failed' },
          '1h': { trend: 'unknown', status: 'failed' },
          '4h': { trend: 'unknown', status: 'failed' },
          '1d': { trend: 'unknown', status: 'failed' }
        },
        resonance: {
          level: 'unknown',
          confidenceAdjustment: '0%',
          summary: '安全模式：多时间框架分析不可用'
        }
      },
      indicatorsSummary: indicators ? '技术指标部分可用，但不足以支持交易决策' : '技术指标不可用',
      toolsUsed: ['safe_hold_fallback'],
      safeMode: true,
      safeReason: reason,
      warning: '⚠️ AI分析服务不可用，请等待服务恢复后再进行交易',
      recommendation: '建议：\n1. 等待AI分析服务恢复\n2. 检查数据源连接状态\n3. 不要基于不完整数据进行交易'
    };
  }

  

  async streamAnalysis(marketData, indicators, newsData, onChunk) {
    const prompt = await this.buildAnalysisPrompt(marketData, indicators, newsData);
    
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: process.env.DEEPSEEK_MODEL || 'deepseek-v3.1:671b',
          messages: [
            {
              role: 'system',
              content: '你是一个专业的加密货币交易分析师。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: true,
          temperature: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );

      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content;
                if (content) {
                  onChunk(content);
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('流式分析错误:', error.message);
      throw error;
    }
  }

  /**
   * 🆕 格式化多时间框架数据（支持6个时间框架）
   */
  formatMultiTimeframe(multiTimeframe) {
    if (!multiTimeframe || !multiTimeframe.timeframes) {
      return `## 🕐 多时间框架趋势验证

⚠️ 多周期数据获取失败，使用单周期分析
`;
    }

    const { timeframes, resonance } = multiTimeframe;
    const tf1m = timeframes['1m'];
    const tf15m = timeframes['15m'];
    const tf30m = timeframes['30m'];
    const tf1h = timeframes['1h'];
    const tf4h = timeframes['4h'];
    const tf1d = timeframes['1d'];

    // 趋势符号
    const getTrendEmoji = (trend) => {
      if (trend === 'bullish') return '📈 看涨';
      if (trend === 'bearish') return '📉 看跌';
      if (trend === 'sideways') return '↔️ 震荡';
      return '❓ 未知';
    };

    // 共振级别符号
    const getResonanceEmoji = (level) => {
      if (level === 'very_strong') return '🟢🟢';
      if (level === 'strong') return '🟢';
      if (level === 'medium') return '🟡';
      if (level === 'weak') return '🔴';
      return '⚪';
    };

    // 格式化指标数据
    const formatIndicators = (tf) => {
      if (!tf || tf.status !== 'success' || !tf.indicators) {
        return 'N/A';
      }
      const ind = tf.indicators;
      const ema9 = ind.trend?.ema9?.toFixed(2) || 'N/A';
      const ema21 = ind.trend?.ema21?.toFixed(2) || 'N/A';
      const ema50 = ind.trend?.ema50?.toFixed(2) || 'N/A';
      const rsi = ind.momentum?.rsi14?.toFixed(2) || 'N/A';
      return `EMA9=${ema9}, EMA21=${ema21}, EMA50=${ema50}, RSI=${rsi}`;
    };

    return `## 🕐 多时间框架趋势验证（6个时间框架）

**💡 重要**: 这是提高分析准确性的关键数据，建议充分利用所有6个时间框架的信息

### 📊 六个时间框架的趋势分析

**1分钟周期（超短期）**: ${getTrendEmoji(tf1m?.trend)} | ${formatIndicators(tf1m)}
- 状态: ${tf1m?.status || 'unknown'}
- 用途: 精确入场时机

**15分钟周期（短期）**: ${getTrendEmoji(tf15m?.trend)} | ${formatIndicators(tf15m)}
- 状态: ${tf15m?.status || 'unknown'}
- 用途: 日内趋势判断

**30分钟周期（短期）**: ${getTrendEmoji(tf30m?.trend)} | ${formatIndicators(tf30m)}
- 状态: ${tf30m?.status || 'unknown'}
- 用途: 日内趋势确认

**1小时周期（中短期）**: ${getTrendEmoji(tf1h?.trend)} | ${formatIndicators(tf1h)}
- 状态: ${tf1h?.status || 'unknown'}
- 用途: 波段入场判断

**4小时周期（中期）**: ${getTrendEmoji(tf4h?.trend)} | ${formatIndicators(tf4h)}
- 状态: ${tf4h?.status || 'unknown'}
- 用途: 趋势确认

**日线周期（长期）**: ${getTrendEmoji(tf1d?.trend)} | ${formatIndicators(tf1d)}
- 状态: ${tf1d?.status || 'unknown'}
- 用途: 大方向判断

---

### ${getResonanceEmoji(resonance.level)} 多周期共振分析结果

**共振级别**: ${resonance.level} (${
  resonance.level === 'very_strong' ? '超强共振' :
  resonance.level === 'strong' ? '强共振' :
  resonance.level === 'medium' ? '中等共振' :
  resonance.level === 'weak' ? '弱共振' : '未知'
})
**置信度调整**: ${resonance.confidenceAdjustment > 0 ? '+' : ''}${resonance.confidenceAdjustment}%
**一致性**: ${resonance.details?.consistency || 'N/A'}%
**分析总结**: ${resonance.summary}
**操作建议**: ${resonance.recommendation}
**详细统计**: 看涨${resonance.details?.bullishCount || 0}个, 看跌${resonance.details?.bearishCount || 0}个, 震荡${resonance.details?.sidewaysCount || 0}个

---

### 🎯 重要操作指导

1. **检查所有6个时间框架的趋势一致性**:
   - 1m趋势: ${tf1m?.trend || 'unknown'} (超短期，精确入场)
   - 15m趋势: ${tf15m?.trend || 'unknown'} (短期，日内趋势)
   - 30m趋势: ${tf30m?.trend || 'unknown'} (短期，趋势确认)
   - 1h趋势: ${tf1h?.trend || 'unknown'} (中短期，波段判断)
   - 4h趋势: ${tf4h?.trend || 'unknown'} (中期，趋势确认)
   - 1d趋势: ${tf1d?.trend || 'unknown'} (长期，大方向)

2. **应用置信度调整规则**:
   - 共振级别: ${resonance.level}
   - 置信度调整: ${resonance.confidenceAdjustment > 0 ? '+' : ''}${resonance.confidenceAdjustment}%
   - ${resonance.level === 'very_strong' ? '✅ 5-6个周期完全一致，极高质量信号，置信度+30%' : ''}
   - ${resonance.level === 'strong' ? '✅ 4个周期一致，高质量信号，置信度+20%' : ''}
   - ${resonance.level === 'medium' ? '⚠️ 3个周期一致，中等质量信号，置信度+10%' : ''}
   - ${resonance.level === 'weak' ? '❌ 周期矛盾，低质量信号，置信度-15%，建议HOLD' : ''}

3. **在返回的JSON中包含完整的 multiTimeframeAnalysis 字段**:
   \`\`\`json
   {
     "multiTimeframeAnalysis": {
       "1m_trend": "${tf1m?.trend || 'unknown'}",
       "15m_trend": "${tf15m?.trend || 'unknown'}",
       "30m_trend": "${tf30m?.trend || 'unknown'}",
       "1h_trend": "${tf1h?.trend || 'unknown'}",
       "4h_trend": "${tf4h?.trend || 'unknown'}",
       "1d_trend": "${tf1d?.trend || 'unknown'}",
       "resonance_level": "${resonance.level}",
       "confidence_adjustment": "${resonance.confidenceAdjustment > 0 ? '+' : ''}${resonance.confidenceAdjustment}%",
       "summary": "${resonance.summary}"
     }
   }
   \`\`\`

**💡 提示**: 多时间框架数据能显著提高分析准确性，建议充分利用所有6个时间框架的信息
`;
  }

  /**
   * 🆕 计算数据质量评分
   */
  calculateDataQuality(marketData, indicators) {
    let score = 100;
    const issues = [];
    const warnings = [];
    const availableData = [];
    const missingData = [];

    // 核心价格数据
    if (!marketData.price || marketData.price <= 0) {
      score -= 30;
      issues.push('❌ 价格数据缺失');
      missingData.push('实时价格');
    } else {
      availableData.push('实时价格');
    }

    // 技术指标完整性
    if (!indicators || Object.keys(indicators).length === 0) {
      score -= 25;
      issues.push('❌ 技术指标数据缺失');
      missingData.push('技术指标（76项）');
    } else {
      availableData.push(`技术指标（${Object.keys(indicators || {}).length}项）`);
      if (!indicators.trend?.ema9) { score -= 5; warnings.push('⚠️ EMA指标缺失'); }
      if (!indicators.momentum?.rsi14) { score -= 5; warnings.push('⚠️ RSI指标缺失'); }
      if (!indicators.momentum?.macd) { score -= 5; warnings.push('⚠️ MACD指标缺失'); }
    }

    // 多时间框架数据
    const multiTimeframe = marketData.multiTimeframe;
    if (multiTimeframe && multiTimeframe.timeframes) {
      const tfEntries = Object.entries(multiTimeframe.timeframes);
      const totalTf = tfEntries.length || 0;
      const successTf = tfEntries.filter(([, tf]) => tf && tf.status !== 'failed' && ((Array.isArray(tf.ohlcv) && tf.ohlcv.length > 0) || tf.indicators)).length;
      if (successTf > 0) {
        availableData.push(`多时间框架数据（成功 ${successTf}/${totalTf}）`);
        if (successTf < totalTf) {
          warnings.push(`⚠️ 多时间框架数据部分缺失：${totalTf - successTf} 个时间框架获取失败`);
          score -= 5;
        }
      } else {
        score -= 12;
        warnings.push('⚠️ 多时间框架数据获取失败');
        missingData.push('多时间框架数据（1m-1d）');
      }
    } else {
      score -= 12;
      warnings.push('⚠️ 多时间框架数据缺失');
      missingData.push('多时间框架数据（1m-1d）');
    }

    // 衍生品数据
    const hasDerivatives = !!(marketData.fundingRate || marketData.openInterest || (Array.isArray(marketData.liquidations) && marketData.liquidations.length > 0));
    if (!hasDerivatives) {
      score -= 10;
      warnings.push('⚠️ 衍生品数据缺失，降低分析可靠性');
      missingData.push('衍生品数据（资金费率/持仓量/清算）');
    } else {
      availableData.push('衍生品数据');
    }

    // 链上与情绪数据
    const hasSentiment = !!(marketData.sentiment || marketData.aktools || marketData.freeAPIs);
    if (!hasSentiment) {
      score -= 8;
      warnings.push('⚠️ 市场情绪/链上数据缺失');
      missingData.push('市场情绪与链上数据');
    } else {
      availableData.push('市场情绪与链上数据');
    }

    // 订单簿数据
    const hasOrderBook = !!(marketData.orderBook && Array.isArray(marketData.orderBook.bids) && marketData.orderBook.bids.length > 0 && Array.isArray(marketData.orderBook.asks) && marketData.orderBook.asks.length > 0);
    if (!hasOrderBook) {
      score -= 10;
      warnings.push('⚠️ 订单簿数据缺失');
      missingData.push('订单簿深度');
    } else {
      availableData.push('订单簿深度');
    }

    // 成交量数据
    if (!marketData.volume24h || marketData.volume24h <= 0) {
      score -= 8;
      warnings.push('⚠️ 成交量数据异常');
      missingData.push('24h成交量');
    } else {
      availableData.push('24h成交量');
    }

    // 生成报告
    let report = `**数据质量评分: ${score}/100**\n\n`;
    
    if (score >= 90) {
      report += `✅ 数据完整度优秀，可进行高可信度分析\n`;
    } else if (score >= 75) {
      report += `✅ 数据完整度良好，分析结果可靠\n`;
    } else if (score >= 60) {
      report += `⚠️ 数据完整度一般，部分指标可能不准确\n`;
    } else {
      report += `❌ 数据质量较差，建议谨慎参考分析结果\n`;
    }

    if (availableData.length > 0) {
      report += `\n**已成功获取的数据覆盖**:\n${availableData.map(item => `  ✅ ${item}`).join('\n')}\n`;
    }

    if (missingData.length > 0) {
      report += `\n**缺失或部分缺失的数据**:\n${missingData.map(item => `  ⚠️ ${item}`).join('\n')}\n`;
    }

    if (issues.length > 0) {
      report += `\n**严重问题**:\n${issues.map(i => `  ${i}`).join('\n')}\n`;
    }

    if (warnings.length > 0) {
      report += `\n**提醒**:\n${warnings.map(w => `  ${w}`).join('\n')}\n`;
    }

    return { score, issues, warnings, availableData, missingData, report };
  }

  /**
   * 🆕 检测异常波动
   */
  detectAnomalies(marketData, indicators) {
    const anomalies = [];
    const price = marketData.price || 0;
    const change24h = Math.abs(marketData.change24h || 0);
    const volume24h = marketData.volume24h || 0;
    const rsi = indicators?.momentum?.rsi14;
    const fundingRate = marketData.fundingRate?.rate;

    // 1. 极端价格波动检测
    if (change24h > 10) {
      anomalies.push(`🔴 **极端波动**: 24h价格变化${marketData.change24h}%，远超正常范围`);
      if (volume24h < 1000000) {
        anomalies.push(`⚠️ **低流动性**: 成交量偏低但波动剧烈，可能有操纵风险`);
      }
    } else if (change24h > 5) {
      anomalies.push(`🟡 **大幅波动**: 24h价格变化${marketData.change24h}%，需密切关注`);
    }

    // 2. 量价背离检测
    if (change24h > 3 && volume24h < 500000) {
      anomalies.push(`🚨 **量价背离**: 价格大幅波动${change24h}%但成交量不足，警惕诱多/诱空`);
    }

    // 3. RSI极端值检测
    if (rsi) {
      if (rsi > 85) {
        anomalies.push(`🔴 **RSI极度超买**: RSI=${rsi.toFixed(2)}，历史极值区域，随时可能暴跌`);
      } else if (rsi < 15) {
        anomalies.push(`🔴 **RSI极度超卖**: RSI=${rsi.toFixed(2)}，历史极值区域，可能触底反弹`);
      }
    }

    // 4. 资金费率异常检测
    if (fundingRate) {
      const rate = typeof fundingRate === 'number' ? fundingRate : parseFloat(fundingRate);
      if (!isNaN(rate)) {
        if (rate > 0.15) {
          anomalies.push(`🔴 **资金费率极高**: ${(rate * 100).toFixed(3)}%，多头严重拥挤，警惕暴跌`);
        } else if (rate < -0.1) {
          anomalies.push(`🔴 **资金费率极低**: ${(rate * 100).toFixed(3)}%，空头严重拥挤，警惕暴涨`);
        }
      }
    }

    // 5. 链上数据异常检测
    const longShortRatio = marketData.aktools?.okxLongShortRatio;
    if (longShortRatio) {
      if (longShortRatio > 2.0) {
        anomalies.push(`⚠️ **多头拥挤**: OKX多空比=${longShortRatio.toFixed(2)}，多单过多易遭砸盘`);
      } else if (longShortRatio < 0.5) {
        anomalies.push(`⚠️ **空头拥挤**: OKX多空比=${longShortRatio.toFixed(2)}，空单过多易遭逼空`);
      }
    }

    // 6. 恐惧贪婪指数极端值
    const fearGreed = marketData.sentiment?.fearGreedIndex;
    if (fearGreed) {
      const fgi = typeof fearGreed === 'number' ? fearGreed : parseFloat(fearGreed);
      if (!isNaN(fgi)) {
        if (fgi > 85) {
          anomalies.push(`🔴 **极度贪婪**: 恐惧贪婪指数=${fgi}，历史顶部信号，警惕回调`);
        } else if (fgi < 15) {
          anomalies.push(`🔴 **极度恐慌**: 恐惧贪婪指数=${fgi}，历史底部信号，可能反转`);
        }
      }
    }

    // 生成报告
    let report = '';
    if (anomalies.length === 0) {
      report = `✅ **未检测到异常**：市场处于正常波动范围\n`;
    } else {
      report = `**检测到 ${anomalies.length} 个异常信号**:\n\n`;
      report += anomalies.map((a, i) => `${i + 1}. ${a}`).join('\n') + '\n';
      report += `\n⚠️ **风险提示**: 存在异常波动时应格外谨慎，降低仓位或观望\n`;
    }

    return { anomalies, count: anomalies.length, report };
  }
}

module.exports = new DeepSeekService();

