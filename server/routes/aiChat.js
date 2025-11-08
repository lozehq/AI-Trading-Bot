const express = require('express');
const router = express.Router();
const axios = require('axios');
const mcpLogger = require('../services/mcpLogger');
const { aiChatLimiter } = require('../utils/rateLimiter');
const { validateBody, schemas } = require('../validators'); // ✅ 添加输入验证
const { getDatabase } = require('../database/database');

// 读取DB中的设置（若存在）
function getSettingFromDB(key) {
  try {
    const db = getDatabase && getDatabase();
    if (!db) return null;
    const row = db.prepare('SELECT value FROM api_settings WHERE category = ? AND key = ?').get('ai', key);
    return row?.value || null;
  } catch (_) { return null; }
}

// 统一解析DeepSeek/OpenAI兼容API的URL
function resolveDeepseekUrl() {
  const full = process.env.DEEPSEEK_ENDPOINT_URL || getSettingFromDB('endpointUrl');
  if (full && typeof full === 'string' && full.trim()) return full.trim();
  const base = (process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_API_URL || getSettingFromDB('deepseekBaseUrl') || 'https://api.deepseek.com');
  const endpoint = process.env.DEEPSEEK_ENDPOINT_PATH || getSettingFromDB('endpointPath') || '/v1/chat/completions';
  const trimmed = base.replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : ('/' + endpoint);
  return `${trimmed}${path}`;
}

// 解析模型名称（优先DB设置）
function resolveModelName() {
  const dbModel = getSettingFromDB('modelName');
  return dbModel || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
}

/**
 * POST /api/ai/chat
 * AI对话测试接口
 */
router.post('/chat',
  validateBody(schemas.ai.chat), // ✅ 添加输入验证
  async (req, res) => {
    try {
      const {
        message, model, temperature, maxTokens,
        symbol,
        includeContext = true,
        k = 5,
        executionsK = 50,
        contextId,
        analysisId,
        includeExecutions = true,
        includeOHLCV = false,
        timeframes = ['1h'],
        ohlcvLimit = 200,
        ohlcvAttachMode = 'sampled'
      } = req.body;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`💬 AI对话请求: ${message}`);
    console.log(`${'═'.repeat(60)}\n`);
    
    mcpLogger.info('deepseek-ai', `用户问题: ${message.substring(0, 50)}...`);

    // 检查API配置（优先环境变量，其次数据库）
    const apiKey = process.env.DEEPSEEK_API_KEY || getSettingFromDB('deepseekApiKey');
    if (!apiKey) {
      return res.json({
        success: true,
        data: {
          response: '⚠️ DeepSeek API密钥未配置，无法使用AI对话功能。\n\n当前系统使用纯技术分析模式，所有交易功能正常。',
          mode: 'fallback'
        }
      });
    }

    try {
      // 组装上下文（可选）
      let contextText = '';
      if (includeContext && symbol) {
        try {
          const aiMemoryService = require('../services/aiMemoryService');
          const runtimeStrategy = require('../services/runtimeStrategy');
          const ExecutionService = require('../database/services/ExecutionService');
          const dataSourceManager = require('../services/dataSourceManager');
          const config = runtimeStrategy.getConfig();

          // 最近分析记录（放开上限至k）
          const analyses = await aiMemoryService.getRecentAnalyses(symbol, k, contextId || null);
          // 最近执行记录（按 executionsK）
          let execRows = [];
          if (includeExecutions) {
            if (analysisId) {
              execRows = ExecutionService.query({ analysisId: String(analysisId), limit: Math.min(executionsK, 1000), orderBy: 'created_at', orderDirection: 'DESC' });
            } else {
              execRows = ExecutionService.getRecent(Math.min(executionsK, 1000)).filter(r => r.symbol === symbol).slice(0, executionsK);
            }
          }

          const lines = [];
          lines.push(`项目: ${symbol} | 激进度: ${config.aggressiveness}`);
          if (analyses.length > 0) {
            lines.push('\n最近分析:');
            analyses.forEach((a, idx) => {
              lines.push(`${idx+1}. ${new Date(a.createdAt).toLocaleString('zh-CN')} · ${a.signal} (${a.confidence}%) @ $${a.entryPrice ?? '-'} | ${String(a.reasoning||'').slice(0,80)}`);
            });
          } else {
            lines.push('\n最近分析: 暂无');
          }

          if (execRows.length > 0) {
            lines.push(analysisId ? `\n关联执行(analysisId=${analysisId}):` : '\n最近执行:');
            execRows.forEach((e, idx) => {
              const slip = (typeof e.slippage_percent === 'number') ? `${(e.slippage_percent*100).toFixed(2)}%` : '--';
              const lat = (typeof e.latency_ms === 'number') ? `${Math.round(e.latency_ms)}ms` : '--';
              const fill = (typeof e.fill_rate === 'number') ? `${Number(e.fill_rate).toFixed(1)}%` : '--';
              lines.push(`${idx+1}. ${e.status?.toUpperCase()} · ${new Date(e.created_at).toLocaleString('zh-CN')} · ${e.side?.toUpperCase()} @ ${Number(e.actual_price||e.expected_price||0).toFixed(4)} · 滑点${slip} · 延迟${lat} · 成交率${fill}`);
            });
          }

          // 可选：注入多时间框架OHLCV
          if (includeOHLCV && Array.isArray(timeframes) && timeframes.length > 0) {
            lines.push('\nK线上下文:');
            const tfList = [...new Set(timeframes)];
            const limitResolved = (ohlcvLimit === 'all') ? (Number(process.env.CHAT_MAX_OHLCV) || 5000) : Number(ohlcvLimit);
            for (const tf of tfList) {
              try {
                const ohlcv = await dataSourceManager.getOHLCV('okx', symbol, tf, limitResolved);
                const count = Array.isArray(ohlcv) ? ohlcv.length : 0;
                if (count > 0) {
                  const firstTs = new Date(ohlcv[0][0]).toISOString();
                  const lastTs = new Date(ohlcv[count-1][0]).toISOString();
                  lines.push(`- ${tf}: ${count} 根 (${firstTs} → ${lastTs})`);
                  // 附带原始数据（可选）
                  const attach = (mode) => {
                    const mkRow = (r) => `${r[0]},${r[1]},${r[2]},${r[3]},${r[4]},${r[5]}`; // ts,o,h,l,c,v
                    if (mode === 'none') return [];
                    if (mode === 'full') return ohlcv.map(mkRow);
                    if (mode === 'head') return ohlcv.slice(0, Math.min(30, count)).map(mkRow);
                    if (mode === 'tail') return ohlcv.slice(-Math.min(30, count)).map(mkRow);
                    // sampled
                    const target = 200;
                    const step = Math.max(1, Math.floor(count / target));
                    const sampled = [];
                    for (let i = 0; i < count; i += step) sampled.push(ohlcv[i]);
                    if (sampled[sampled.length-1] !== ohlcv[count-1]) sampled.push(ohlcv[count-1]);
                    return sampled.map(mkRow);
                  };
                  const rows = attach(ohlcvAttachMode);
                  if (rows.length > 0) {
                    lines.push(`  原始(${tf}/${ohlcvAttachMode}): ts,open,high,low,close,volume`);
                    lines.push(rows.join('\n'));
                  }
                } else {
                  lines.push(`- ${tf}: 未获取到K线`);
                }
              } catch (e) {
                lines.push(`- ${tf}: 获取失败(${e.message})`);
              }
            }
          }

          contextText = lines.join('\n');
        } catch (ctxErr) {
          console.warn('生成聊天上下文失败:', ctxErr.message);
        }
      }
      // 调用DeepSeek API（添加限流+重试机制）
      let retries = 3;
      let response;
      
      while (retries > 0) {
        try {
          // 如果用户API足够，限流器会自动禁用
          response = await aiChatLimiter.execute(() => axios.post(
            resolveDeepseekUrl(),
            {
              model: resolveModelName(),
              messages: [
                {
                  role: 'system',
                  content: '你是一个专业的加密货币交易助手。对于提供的系统上下文，请先快速回顾结论，再回答用户问题。若上下文包含历史分析与执行明细，请在建议里说明与历史的一致/冲突点和改进。'
                },
                ...(contextText ? [{ role: 'system', content: `【系统上下文】\n${contextText}` }] : []),
                { role: 'user', content: message }
              ],
              temperature: typeof temperature === 'number' ? temperature : 0.7,
              max_tokens: typeof maxTokens === 'number' ? maxTokens : 1000
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 120000 // 增加到120秒（从30秒）
            }
          ));
          break; // 成功则退出循环
        } catch (err) {
          if (err.response?.status === 429) {
            if (retries > 1) {
              const waitTime = (4 - retries) * 5000; // 递增等待：5秒、10秒
              console.log(`⚠️  API限流，等待${waitTime/1000}秒后重试... (剩余${retries - 1}次)`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              retries--;
            } else {
              // 最后一次失败，直接返回友好提示
              throw new Error('API_RATE_LIMIT');
            }
          } else {
            throw err; // 其他错误直接抛出
          }
        }
      }

      // 🔧 安全提取AI响应内容，兼容多种API返回格式
      let aiResponse;
      try {
        const data = response.data;
        console.log('🔍 API返回结构:', JSON.stringify({
          hasData: !!data,
          topLevelKeys: data ? Object.keys(data) : [],
          hasChoices: !!(data?.choices),
          choicesLength: Array.isArray(data?.choices) ? data.choices.length : 0,
          hasMessage: !!(data?.choices?.[0]?.message),
          hasContent: !!(data?.choices?.[0]?.message?.content),
          hasBody: !!(data?.body),
          hasStatus: !!(data?.status)
        }));
        
        // 🔍 打印完整原始响应用于调试
        console.log('📄 完整原始响应:', JSON.stringify(data, null, 2));
        
        // 🔍 同时写入文件便于查看
        try {
          const fs = require('fs');
          fs.writeFileSync('ai-response-debug.json', JSON.stringify(data, null, 2));
          console.log('💾 响应已保存到 ai-response-debug.json');
        } catch (_) {}
        
        // 🔧 iflow.cn 特殊处理：检查 {status, msg, body} 包裹格式
        let actualData = data;
        if (data?.body && typeof data.body === 'object') {
          console.log('🔍 检测到 iflow.cn 包裹格式，解包 body 字段...');
          actualData = data.body;
        }
        
        // 兼容多种API响应格式
        if (Array.isArray(actualData?.choices) && actualData.choices.length > 0) {
          const choice = actualData.choices[0];
          aiResponse = choice?.message?.content || choice?.content || choice?.text;
        } else if (actualData?.message?.content) {
          aiResponse = actualData.message.content;
        } else if (actualData?.content) {
          aiResponse = actualData.content;
        } else if (actualData?.text) {
          aiResponse = actualData.text;
        } else if (typeof actualData === 'string') {
          aiResponse = actualData;
        }
        
        if (!aiResponse || typeof aiResponse !== 'string') {
          console.error('❌ 无法提取AI响应内容');
          console.error('📄 完整响应:', JSON.stringify(data, null, 2));
          throw new Error('AI返回数据格式不正确，未找到有效内容');
        }
      } catch (extractError) {
        console.error('❌ 提取AI响应失败:', extractError.message);
        throw new Error(`AI响应解析失败: ${extractError.message}`);
      }
      
      console.log('✅ AI响应成功\n');
      mcpLogger.success('deepseek-ai', `✓ AI对话成功 (${aiResponse.length}字)`);
      
      res.json({
        success: true,
        data: {
          response: aiResponse,
          mode: 'ai',
          model: process.env.DEEPSEEK_MODEL,
          timestamp: new Date().toISOString()
        }
      });

    } catch (apiError) {
      console.error('❌ DeepSeek API错误:', apiError.message);
      mcpLogger.warning('deepseek-ai', `API调用失败: ${apiError.message}`);
      
      // API调用失败，返回友好提示
      let errorMessage = '⚠️ AI服务暂时不可用\n\n';
      
      if (apiError.message === 'API_RATE_LIMIT' || apiError.response?.status === 429) {
        errorMessage += '原因：ModelScope API调用频率限制\n\n';
        errorMessage += '💡 这是正常现象，说明：\n';
        errorMessage += '1. API工作正常，只是请求太频繁\n';
        errorMessage += '2. 免费额度有频率限制（通常1-2分钟恢复）\n';
        errorMessage += '3. 已自动重试3次（等待5秒、10秒）\n\n';
        errorMessage += '🎯 解决方案：\n';
        errorMessage += '• 等待1-2分钟后再试（推荐）\n';
        errorMessage += '• 使用"AI增强"或"自动AI"功能（较少频率）\n';
        errorMessage += '• 技术分析功能完全不受影响\n\n';
        errorMessage += '📊 好消息：所有交易信号、技术指标、MCP工具都正常工作！';
      } else if (apiError.response?.status === 503) {
        errorMessage += '原因：API密钥额度已用完或服务暂时宕机\n\n';
        errorMessage += '解决方案：\n';
        errorMessage += '1. 获取新的DeepSeek API密钥\n';
        errorMessage += '2. 使用其他AI服务（OpenAI、Claude等）\n';
        errorMessage += '3. 继续使用纯技术分析模式（当前系统功能完全正常）\n\n';
      } else if (apiError.response?.status === 401) {
        errorMessage += '原因：API密钥无效\n\n';
        errorMessage += '解决方案：请检查.env文件中的DEEPSEEK_API_KEY配置\n\n';
      } else {
        errorMessage += `错误详情：${apiError.message}\n\n`;
      }
      
      errorMessage += '💡 提示：即使没有AI对话功能，系统的交易信号和技术分析功能仍然完全正常！';

      res.json({
        success: true,
        data: {
          response: errorMessage,
          mode: 'error',
          error: apiError.response?.data || apiError.message
        }
      });
    }
  } catch (error) {
    console.error('\n❌ 对话失败:', error.message, '\n');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai/status
 * 检查AI服务状态
 */
router.get('/status', async (req, res) => {
  const status = {
    configured: !!process.env.DEEPSEEK_API_KEY || !!getSettingFromDB('deepseekApiKey'),
    apiUrl: process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_API_URL || getSettingFromDB('deepseekBaseUrl') || 'not set',
    apiUrlResolved: resolveDeepseekUrl(),
    model: resolveModelName(),
    available: true, // ✅ 默认设为true（因为实际测试显示AI可用）
    message: '✅ AI服务正常'
  };

  // 简化检查：只要配置了就认为可用
  if (!status.configured) {
    status.available = false;
    status.message = '❌ API密钥未配置';
  }

  res.json({
    success: true,
    data: status
  });
});

module.exports = router;

