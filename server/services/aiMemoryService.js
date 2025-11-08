/**
 * AI记忆服务 - 让AI拥有历史记忆和连贯性思维
 * 
 * 功能：
 * 1. 保存每次AI分析结果
 * 2. 查询历史分析记录
 * 3. 分析历史决策的准确性
 * 4. 提供连贯性上下文给AI
 */

const { getDatabase } = require('../database/database');
const mcpLogger = require('./mcpLogger');

/**
 * 安全的JSON序列化函数，防止循环引用和无效值
 */
function safeStringify(obj, fallback = '{}') {
  try {
    return JSON.stringify(obj, (key, value) => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'number' && !isFinite(value)) return null;
      if (typeof value === 'function') return undefined;
      if (value instanceof Error) return value.message;
      return value;
    });
  } catch (err) {
    console.warn(`⚠️ JSON序列化失败: ${err.message}, 使用fallback`);
    return fallback;
  }
}

class AIMemoryService {
  constructor() {
    this.maxHistoryCount = 50; // 最多保留50条历史记录
    this.ensureSchema();
  }

  /**
   * 获取数据库实例
   */
  getDB() {
    return getDatabase();
  }

  ensureSchema() {
    try {
      const db = this.getDB();
      const columns = db.prepare("PRAGMA table_info(ai_analyses)").all();
      const columnNames = columns.map(col => col.name);

      if (!columnNames.includes('tools_used')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN tools_used TEXT").run();
      }
      if (!columnNames.includes('indicators_summary')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN indicators_summary TEXT").run();
      }
      if (!columnNames.includes('is_favorite')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN is_favorite INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('prompt_system')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN prompt_system TEXT").run();
      }
      if (!columnNames.includes('prompt_user')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN prompt_user TEXT").run();
      }
      if (!columnNames.includes('analysis_result')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN analysis_result TEXT").run();
        mcpLogger.info('ai-memory', 'Added analysis_result column to ai_analyses table');
      }
      // 🆕 状态与时效字段
      if (!columnNames.includes('status')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN status TEXT DEFAULT 'active'").run();
      }
      if (!columnNames.includes('status_reason')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN status_reason TEXT").run();
      }
      if (!columnNames.includes('valid_until')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN valid_until TEXT").run();
      }
      if (!columnNames.includes('ttl_sec')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN ttl_sec INTEGER").run();
      }
      if (!columnNames.includes('outcome')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN outcome TEXT").run();
      }
      if (!columnNames.includes('outcome_price')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN outcome_price REAL").run();
      }
      if (!columnNames.includes('outcome_at')) {
        db.prepare("ALTER TABLE ai_analyses ADD COLUMN outcome_at TEXT").run();
      }
    } catch (error) {
      mcpLogger.error('ai-memory', `更新ai_analyses表结构失败: ${error.message}`);
    }
  }

  /**
   * 保存AI分析结果到数据库
   */
  async saveAnalysis(symbol, exchange, analysis, marketData, indicators, toolsUsed = [], contextId = null, completeResult = null) {
    try {
      const db = this.getDB();

      // 兼容新旧格式
      const decision = analysis.decision || analysis;

      const query = `
        INSERT INTO ai_analyses (
          symbol, exchange, signal, confidence, entry_price,
          stop_loss, take_profit, reasoning, risk_level,
          market_data, indicators, tools_used, indicators_summary,
          prompt_system, prompt_user, ai_actions, chain_of_thought, context_id,
          analysis_result, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `;

      // 处理chainOfThought - 支持字符串和数组格式
      let chainOfThoughtValue = null;
      if (analysis.chainOfThought) {
        if (typeof analysis.chainOfThought === 'string') {
          chainOfThoughtValue = analysis.chainOfThought;
        } else if (Array.isArray(analysis.chainOfThought)) {
          // 将思考步骤数组序列化为JSON字符串
          chainOfThoughtValue = safeStringify(analysis.chainOfThought, null);
        }
      }

      const params = [
        symbol,
        exchange,
        decision.signal,
        decision.confidence,
        decision.entryPrice || marketData.price,
        decision.stopLoss,
        decision.takeProfit,
        decision.reasoning || analysis.chainOfThought || analysis.summary,
        decision.riskLevel,
        safeStringify(marketData, '{}'),
        safeStringify(indicators, '{}'),
        safeStringify(toolsUsed || analysis.toolsUsed || [], '[]'),
        analysis.indicatorsSummary || null,
        (analysis.promptSnapshots && analysis.promptSnapshots.system) || null,
        (analysis.promptSnapshots && analysis.promptSnapshots.user) || null,
        safeStringify({
          alertManagement: analysis.alertManagement || null,
          positionManagement: analysis.positionManagement || null,
          validationReport: analysis.validationReport || null
        }, 'null'),
        chainOfThoughtValue,
        contextId || null,
        completeResult ? safeStringify(completeResult, 'null') : null
      ];

      const info = db.prepare(query).run(...params);
      mcpLogger.success('ai-memory', `✓ 保存分析记录: ${symbol} ${decision.signal}`);

      // 计算时效TTL
      const inferTtlSec = () => {
        // 默认 60 分钟
        const defaultTtl = 60 * 60;
        const tfMap = { '1m': 10*60, '3m': 15*60, '5m': 30*60, '15m': 60*60, '30m': 2*60*60, '1h': 6*60*60, '4h': 24*60*60, '1d': 3*24*60*60 };
        try {
          const tfObj = completeResult?.mcpData?.multiTimeframe?.timeframes || completeResult?.multiTimeframe?.timeframes;
          if (!tfObj) return defaultTtl;
          const keys = Object.keys(tfObj).filter(k => tfObj[k] && tfObj[k].status !== 'failed');
          if (keys.length === 0) return defaultTtl;
          const order = ['1m','3m','5m','15m','30m','1h','4h','1d'];
          const smallest = order.find(k => keys.includes(k));
          return tfMap[smallest] || defaultTtl;
        } catch (_) {
          return defaultTtl;
        }
      };

      const ttlSec = inferTtlSec();
      const validUntilISO = new Date(Date.now() + ttlSec * 1000).toISOString();

      // 写入 TTL 与状态
      db.prepare(`UPDATE ai_analyses SET ttl_sec = ?, valid_until = ?, status = 'active' WHERE id = ?`).run(ttlSec, validUntilISO, info.lastInsertRowid);

      // 将该 symbol 的其他 active 记录标记为 superseded
      try {
        db.prepare(`UPDATE ai_analyses SET status = 'superseded', status_reason = 'newer_analysis' WHERE symbol = ? AND id <> ? AND status = 'active'`).run(symbol, info.lastInsertRowid);
      } catch (e) { /* ignore */ }

      // 刷新过期记录
      try {
        db.prepare(`UPDATE ai_analyses SET status = 'expired', status_reason = 'ttl_expired' WHERE status = 'active' AND valid_until IS NOT NULL AND datetime(valid_until) <= datetime('now')`).run();
      } catch (e) { /* ignore */ }

      // 尝试为新记录生成向量嵌入（轻量）
      try {
        const row = {
          id: info.lastInsertRowid,
          symbol,
          reasoning: decision.reasoning || analysis.chainOfThought || analysis.summary,
          marketData,
          indicators
        };
        const vectorService = require('./vectorMemoryService');
        vectorService.upsertEmbedding(row);
      } catch (e) {
        // 忽略向量生成错误，不影响主流程
      }
    } catch (error) {
      mcpLogger.error('ai-memory', `保存分析失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取最近的历史分析记录
   */
  async getRecentAnalyses(symbol, limit = 10, contextId = null) {
    try {
      const db = this.getDB();

      const clauses = ['SELECT * FROM ai_analyses'];
      const params = [];

      const where = [];
      if (symbol) { where.push('symbol = ?'); params.push(symbol); }
      if (contextId) { where.push('context_id = ?'); params.push(contextId); }
      if (where.length > 0) {
        clauses.push('WHERE ' + where.join(' AND '));
      }

      clauses.push('ORDER BY created_at DESC');
      clauses.push('LIMIT ?');
      params.push(limit);

      const query = clauses.join(' ');
      const rows = db.prepare(query).all(...params);
      
      return rows.map(row => {
        // 解析chainOfThought - 可能是字符串或JSON数组
        let parsedChainOfThought = row.chain_of_thought;
        if (row.chain_of_thought) {
          try {
            // 尝试解析为JSON（如果是数组格式）
            const parsed = JSON.parse(row.chain_of_thought);
            if (Array.isArray(parsed)) {
              parsedChainOfThought = parsed;
            }
          } catch (e) {
            // 不是JSON，保持为字符串
            parsedChainOfThought = row.chain_of_thought;
          }
        }

        return {
          id: row.id,
          symbol: row.symbol,
          exchange: row.exchange,
          signal: row.signal,
          confidence: row.confidence,
          entryPrice: row.entry_price,
          stopLoss: row.stop_loss,
          takeProfit: row.take_profit,
          reasoning: row.reasoning,
          riskLevel: row.risk_level,
          marketData: JSON.parse(row.market_data || '{}'),
          indicators: JSON.parse(row.indicators || '{}'),
          toolsUsed: JSON.parse(row.tools_used || '[]'),
          indicatorsSummary: row.indicators_summary,
          aiActions: (()=>{ try { return JSON.parse(row.ai_actions || 'null'); } catch(e){ return null; } })(),
          chainOfThought: parsedChainOfThought,
          isFavorite: row.is_favorite === 1,
          createdAt: row.created_at,
          status: row.status || null,
          statusReason: row.status_reason || null,
          validUntil: row.valid_until || null,
          ttlSec: typeof row.ttl_sec === 'number' ? row.ttl_sec : (row.ttl_sec ? Number(row.ttl_sec) : null),
          outcome: row.outcome || null,
          outcomePrice: typeof row.outcome_price === 'number' ? row.outcome_price : (row.outcome_price ? Number(row.outcome_price) : null),
          outcomeAt: row.outcome_at || null
        };
      });
    } catch (error) {
      mcpLogger.error('ai-memory', `获取历史记录失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取单条分析详情
   */
  async getAnalysisById(id) {
    try {
      const db = this.getDB();
      const row = db.prepare(`
        SELECT * FROM ai_analyses WHERE id = ?
      `).get(id);
      if (!row) return null;

      // 解析chainOfThought - 可能是字符串或JSON数组
      let parsedChainOfThought = row.chain_of_thought;
      if (row.chain_of_thought) {
        try {
          const parsed = JSON.parse(row.chain_of_thought);
          if (Array.isArray(parsed)) {
            parsedChainOfThought = parsed;
          }
        } catch (e) {
          parsedChainOfThought = row.chain_of_thought;
        }
      }

      const detail = {
        id: row.id,
        symbol: row.symbol,
        exchange: row.exchange,
        signal: row.signal,
        confidence: row.confidence,
        entryPrice: row.entry_price,
        stopLoss: row.stop_loss,
        takeProfit: row.take_profit,
        reasoning: row.reasoning,
        riskLevel: row.risk_level,
        marketData: JSON.parse(row.market_data || '{}'),
        indicators: JSON.parse(row.indicators || '{}'),
        toolsUsed: JSON.parse(row.tools_used || '[]'),
        indicatorsSummary: row.indicators_summary,
        chainOfThought: parsedChainOfThought,
        createdAt: row.created_at,
        status: row.status || null,
        statusReason: row.status_reason || null,
        validUntil: row.valid_until || null,
        ttlSec: typeof row.ttl_sec === 'number' ? row.ttl_sec : (row.ttl_sec ? Number(row.ttl_sec) : null),
        outcome: row.outcome || null,
        outcomePrice: typeof row.outcome_price === 'number' ? row.outcome_price : (row.outcome_price ? Number(row.outcome_price) : null),
        outcomeAt: row.outcome_at || null
      };

      // ===== 衍生：基于当前记录重建上下文引用与指标（轻量版） =====
      try {
        const vectorService = require('./vectorMemoryService');
        const ctxWeights = require('./contextWeightService');
        const conflictAgg = require('./conflictAggregator');

        // 确保近期嵌入并检索
        const useHQ = process.env.AI_EMBED_HIGH_QUALITY === '1';
        const queryText = safeStringify({ marketData: detail.marketData, indicators: detail.indicators }, '{}');
        let similar = [];
        if (detail.symbol && useHQ && typeof vectorService.ensureRecentEmbeddingsAsync === 'function') {
          await vectorService.ensureRecentEmbeddingsAsync(detail.symbol, 50);
          if (typeof vectorService.searchSimilarAsync === 'function') {
            similar = await vectorService.searchSimilarAsync(detail.symbol, queryText, 8);
          }
        }
        if ((!similar || similar.length === 0) && detail.symbol) {
          vectorService.ensureRecentEmbeddings(detail.symbol, 50);
          similar = vectorService.searchSimilar(detail.symbol, queryText, 8);
        }
        const { evidence, background, metrics } = ctxWeights.rankAndSplit(similar, { contextK: 5, minWeight: 0.5 });
        const conflict = conflictAgg.aggregate(evidence);

        const evidenceText = evidence.length > 0
          ? evidence.map((r, i) => `[#${r.id}] ${i + 1}. ${r.signal}(${r.confidence}%) $${r.entryPrice} @ ${r.timestamp}`).join('\n')
          : '无高权重引用';
        const backgroundText = background.length > 0
          ? background.map((r, i) => `[#${r.id}] ${i + 1}. ${r.signal}(${r.confidence}%)`).join('\n')
          : '';

        detail.contextDerived = {
          evidence,
          background,
          metrics,
          conflict,
          snippet: {
            evidence: evidenceText,
            background: backgroundText,
            metrics: `覆盖率 ${(metrics.coverage * 100).toFixed(0)}% · 问题率 ${(metrics.issueRate * 100).toFixed(0)}% · 冲突 ${conflict.summary}`
          }
        };
      } catch (e) {
        // 忽略，不影响详情
      }

      // ===== 关联：该次分析后短时间内由AI创建的预警（近5分钟） =====
      try {
        if (detail.symbol && detail.createdAt) {
          const start = new Date(detail.createdAt);
          const end = new Date(new Date(detail.createdAt).getTime() + 5 * 60 * 1000);
          const alerts = db.prepare(`
            SELECT id, type, target_price, message, created_at
            FROM price_alerts
            WHERE symbol = @symbol AND deleted_at IS NULL
              AND created_at >= @start AND created_at <= @end
            ORDER BY created_at ASC
            LIMIT 20
          `).all({ symbol: detail.symbol, start: start.toISOString(), end: end.toISOString() });
          detail.alerts = alerts.map(a => ({ id: a.id, type: a.type, target_price: a.target_price, message: a.message, created_at: a.created_at }));
        }
      } catch (e) {
        // 忽略
      }

      return detail;
    } catch (error) {
      mcpLogger.error('ai-memory', `获取分析详情失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 分析历史决策的准确性
   */
  async analyzeHistoricalAccuracy(symbol, limit = 20, contextId = null) {
    try {
      const analyses = await this.getRecentAnalyses(symbol, limit, contextId);
      
      if (analyses.length < 2) {
        return {
          totalAnalyses: analyses.length,
          accuracy: 0,
          message: '历史数据不足，需要至少2条记录'
        };
      }

      let correctPredictions = 0;
      let totalPredictions = 0;

      // 使用时间正序进行相邻比较，避免方向反转导致的误判
      const ordered = analyses.slice().reverse(); // 最旧 → 最新

      for (let i = 0; i < ordered.length - 1; i++) {
        const current = ordered[i];       // 较早的预测
        const next = ordered[i + 1];      // 后续时刻的价格

        const currentPrice = Number(current.entryPrice);
        const nextPrice = Number(next.entryPrice);
        if (!isFinite(currentPrice) || !isFinite(nextPrice) || currentPrice === 0) continue;

        const priceChange = ((nextPrice - currentPrice) / currentPrice) * 100; // 早 -> 晚 的变化

        totalPredictions++;

        // 判断预测是否正确
        if (current.signal === 'BUY' && priceChange > 0) {
          correctPredictions++;
        } else if (current.signal === 'SELL' && priceChange < 0) {
          correctPredictions++;
        } else if (current.signal === 'HOLD' && Math.abs(priceChange) < 1) {
          correctPredictions++;
        }
      }

      const accuracyRate = totalPredictions > 0
        ? (correctPredictions / totalPredictions) * 100
        : 0;

      return {
        totalAnalyses: analyses.length,
        verifiableCount: totalPredictions,
        correctCount: correctPredictions,
        accuracyRate: accuracyRate,
        message: `准确率: ${accuracyRate.toFixed(2)}% (${correctPredictions}/${totalPredictions})`
      };
    } catch (error) {
      mcpLogger.error('ai-memory', `分析准确性失败: ${error.message}`);
      return {
        totalAnalyses: 0,
        accuracy: 0,
        message: '分析失败'
      };
    }
  }

  /**
   * 生成AI上下文 - 包含历史记忆
   */
  async generateContextForAI(symbol, currentMarketData, currentIndicators, contextId = null) {
    try {
      // 获取最近5条历史记录
      const recentAnalyses = await this.getRecentAnalyses(symbol, 5, contextId);
      
      // 获取历史准确性
      const accuracy = await this.analyzeHistoricalAccuracy(symbol, 20, contextId);

      // 构建上下文
      let context = `\n## 📊 历史分析记录（连贯性思维）\n\n`;
      
      if (recentAnalyses.length === 0) {
        context += `这是对 ${symbol} 的**第一次分析**，没有历史记录。\n`;
      } else {
        context += `你之前对 ${symbol} 进行过 ${recentAnalyses.length} 次分析：\n\n`;
        
        recentAnalyses.forEach((analysis, index) => {
          const timeAgo = this.getTimeAgo(analysis.createdAt);
          context += `### ${index + 1}. ${timeAgo}\n`;
          context += `- **信号**: ${analysis.signal}\n`;
          context += `- **置信度**: ${analysis.confidence}%\n`;
          context += `- **入场价**: $${analysis.entryPrice}\n`;
          context += `- **当时理由**: ${analysis.reasoning}\n`;
          
          // 计算价格变化
          if (index === 0) {
            const priceChange = ((currentMarketData.price - analysis.entryPrice) / analysis.entryPrice) * 100;
            const isCorrect = this.isPredictionCorrect(analysis.signal, priceChange);
            context += `- **结果**: 价格${priceChange > 0 ? '上涨' : '下跌'} ${Math.abs(priceChange).toFixed(2)}% `;
            context += isCorrect ? '✅ **预测正确**\n' : '❌ **预测错误**\n';
          }
          context += `\n`;
        });

        context += `\n## 🎯 历史准确率\n\n`;
        context += `- 总分析次数: ${accuracy.totalAnalyses}\n`;
        context += `- 可验证预测: ${accuracy.verifiableCount}\n`;
        context += `- 正确预测: ${accuracy.correctCount}\n`;
        context += `- **准确率**: ${accuracy.accuracyRate.toFixed(2)}%\n\n`;

        if (accuracy.accuracyRate < 50) {
          context += `⚠️ **警告**: 历史准确率较低，需要重新审视分析方法！\n\n`;
        } else if (accuracy.accuracyRate > 70) {
          context += `✅ **表现良好**: 历史准确率较高，继续保持！\n\n`;
        }
      }

      context += `## 💡 连贯性思维要求\n\n`;
      context += `1. **回顾历史**: 分析你之前的判断是否正确，为什么？\n`;
      context += `2. **因果逻辑**: 市场变化是否符合你之前的预期？\n`;
      context += `3. **学习改进**: 如果之前判断错误，这次如何避免？\n`;
      context += `4. **趋势延续**: 当前趋势是否与历史分析一致？\n`;
      context += `5. **风险管理**: 基于历史表现调整置信度和风险等级\n\n`;

      return context;
    } catch (error) {
      mcpLogger.error('ai-memory', `生成上下文失败: ${error.message}`);
      return '';
    }
  }

  /**
   * 生成AI上下文（带引用追踪）
   * 返回 { context, used }，used 为被引用的历史列表（含潜在问题标记）
   */
  async generateContextForAIWithRefs(symbol, currentMarketData, currentIndicators, limit = 5, contextId = null) {
    try {
      const recentAnalyses = await this.getRecentAnalyses(symbol, limit, contextId);
      const accuracy = await this.analyzeHistoricalAccuracy(symbol, 20, contextId);

      const nowTs = Date.now();
      const used = [];
      let context = `\n## 📊 历史分析记录（连贯性思维 - 带引用ID）\n\n`;

      if (recentAnalyses.length === 0) {
        context += `这是对 ${symbol} 的**第一次分析**，没有历史记录。\n`;
      } else {
        context += `你之前对 ${symbol} 进行过 ${recentAnalyses.length} 次分析。请在本次结论中引用相关记录（用 [#id] 标注）。\n\n`;
        recentAnalyses.forEach((a, idx) => {
          const issues = [];
          const createdTs = new Date(a.createdAt).getTime();
          const ageMin = Math.floor((nowTs - createdTs) / 60000);
          if (!Number.isFinite(a.entryPrice) || a.entryPrice <= 0) issues.push('invalid_entry_price');
          if (ageMin > 180) issues.push('stale'); // 超过3小时标记为过期
          const reasonText = (a.reasoning || '').toLowerCase();
          if (reasonText.includes('失败') || reasonText.includes('错误') || reasonText.includes('无效')) issues.push('error');

          used.push({
            id: a.id,
            timestamp: a.createdAt,
            signal: a.signal,
            confidence: a.confidence,
            entryPrice: a.entryPrice,
            summary: a.reasoning,
            issues
          });

          context += `### [#${a.id}] ${idx + 1}\n`;
          context += `- 信号: ${a.signal} (置信度 ${a.confidence}%)\n`;
          context += `- 入场价: $${a.entryPrice}\n`;
          context += `- 概要: ${a.reasoning}\n`;
          if (issues.length > 0) {
            context += `- 引用注意: ${issues.join(', ')}\n`;
          }
          context += `\n`;
        });

        context += `\n## 🎯 历史准确率\n\n`;
        context += `- 总分析次数: ${accuracy.totalAnalyses}\n`;
        context += `- 可验证预测: ${accuracy.verifiableCount}\n`;
        context += `- 正确预测: ${accuracy.correctCount}\n`;
        context += `- **准确率**: ${accuracy.accuracyRate.toFixed(2)}%\n\n`;
      }

      context += `## 💡 引用规范\n\n`;
      context += `- 在结论中使用 [#id] 标注关键引用来源；对于存在 invalid_entry_price/stale/error 的历史，请谨慎引用并说明差异。\n`;

      return { context, used };
    } catch (error) {
      mcpLogger.error('ai-memory', `生成引用上下文失败: ${error.message}`);
      return { context: '', used: [] };
    }
  }

  /**
   * 判断预测是否正确
   */
  isPredictionCorrect(signal, priceChange) {
    if (signal === 'BUY' && priceChange > 0) return true;
    if (signal === 'SELL' && priceChange < 0) return true;
    if (signal === 'HOLD' && Math.abs(priceChange) < 1) return true;
    return false;
  }

  /**
   * 计算时间差
   */
  getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    return `${diffDays}天前`;
  }

  /**
   * 清理旧记录（保留最近N条）
   */
  async cleanOldRecords(symbol, keepCount = 50) {
    try {
      const db = this.getDB();
      const query = `
        DELETE FROM ai_analyses
        WHERE symbol = ?
        AND id NOT IN (
          SELECT id FROM ai_analyses
          WHERE symbol = ?
          ORDER BY created_at DESC
          LIMIT ?
        )
      `;

      db.prepare(query).run(symbol, symbol, keepCount);
      mcpLogger.info('ai-memory', `清理旧记录: ${symbol}`);
    } catch (error) {
      mcpLogger.error('ai-memory', `清理记录失败: ${error.message}`);
    }
  }

  /**
   * 获取交易统计
   */
  async getTradingStats(symbol, contextId = null) {
    try {
      const db = this.getDB();
      let query = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN signal = 'BUY' THEN 1 ELSE 0 END) as buy_count,
          SUM(CASE WHEN signal = 'SELL' THEN 1 ELSE 0 END) as sell_count,
          SUM(CASE WHEN signal = 'HOLD' THEN 1 ELSE 0 END) as hold_count,
          AVG(confidence) as avg_confidence,
          AVG(CASE WHEN risk_level = 'HIGH' THEN 3 WHEN risk_level = 'MEDIUM' THEN 2 ELSE 1 END) as avg_risk,
          SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END) as favorite_count
        FROM ai_analyses
        WHERE 1=1
      `;

      const params = [];

      if (symbol) { query += ' AND symbol = ?'; params.push(symbol); }
      if (contextId) { query += ' AND context_id = ?'; params.push(contextId); }

      const row = db.prepare(query).get(...params);
      
      return {
        total: row.total || 0,
        buyCount: row.buy_count || 0,
        sellCount: row.sell_count || 0,
        holdCount: row.hold_count || 0,
        avgConfidence: row.avg_confidence || 0,
        avgRisk: row.avg_risk || 0,
        favoriteCount: row.favorite_count || 0
      };
    } catch (error) {
      mcpLogger.error('ai-memory', `获取统计失败: ${error.message}`);
      return null;
    }
  }

  async toggleFavorite(id, favorite) {
    try {
      const db = this.getDB();
      db.prepare('UPDATE ai_analyses SET is_favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
      return true;
    } catch (error) {
      mcpLogger.error('ai-memory', `更新收藏失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 清空分析记录
   * - 若提供 symbol，仅清理该交易对
   * - 若提供 contextId，仅清理该上下文
   * - 同时提供则两者共同限制
   * - 若都不提供且 allowAll=true，则清空全部（危险操作）
   */
  async clearAnalyses({ symbol = null, contextId = null, allowAll = false } = {}) {
    try {
      const db = this.getDB();
      const where = [];
      const params = [];
      if (symbol) { where.push('symbol = ?'); params.push(symbol); }
      if (contextId) { where.push('context_id = ?'); params.push(contextId); }

      let sql = 'DELETE FROM ai_analyses';
      if (where.length > 0) {
        sql += ' WHERE ' + where.join(' AND ');
      } else if (!allowAll) {
        // 默认不允许无条件清空，除非显式 allowAll
        return { deleted: 0 };
      }

      const result = db.prepare(sql).run(...params);
      return { deleted: result.changes };
    } catch (error) {
      mcpLogger.error('ai-memory', `清空分析记录失败: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new AIMemoryService();

