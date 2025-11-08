import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Brain,
  Zap,
  Play,
  Pause,
  Activity,
  Loader,
  Bot,
  Radar,
  Sparkles,
  AlertTriangle,
  Info,
  Award,
  Bell,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Trash2
} from 'lucide-react';
import AIAnalysisCard from './AIAnalysisCard';
import { useUI } from '../hooks/useReduxStore';


// ✅ 常量定义：消除魔法数字
const MAX_THOUGHT_HISTORY = 20; // 最多保留的思考步骤数
const HISTORY_LIMIT = 20; // 历史记录查询限制

// 常用交易对备选
const COMMON_SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT','DOGE/USDT','ADA/USDT','DOT/USDT'];

function AutoAIPanel({
  selectedSymbol,
  setSelectedSymbol: setGlobalSelectedSymbol,
  isRunning,
  setIsRunning,
  interval,
  setInterval: setIntervalTime,
  analysis,
  setAnalysis,
  chainOfThought,
  setChainOfThought,
  addAutoAIThought, // ✅ 新增：Redux追加动作，避免传入函数到store
  modelChatHistory,
  setModelChatHistory,
  showTitle = true // 新增：控制是否显示标题卡片
}) {
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(interval);

  // 历史记录加载状态
  //
  const [symbolInput, setSymbolInput] = useState(selectedSymbol || 'ETH/USDT');
  useEffect(() => { setSymbolInput(selectedSymbol || 'ETH/USDT'); }, [selectedSymbol]);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [progress, setProgress] = useState({ step: 0, total: 0, label: '' });
  const [usedTools, setUsedTools] = useState([]);
  const [errorHint, setErrorHint] = useState(null);
  // 提示词配置
  const { setActiveTab } = useUI();
  const [promptProfiles, setPromptProfiles] = useState([]);
  const [activePromptId, setActivePromptId] = useState('default');
  const loadPromptProfiles = useCallback(async () => {
    try {
      const res = await axios.get('/api/prompts');
      if (res.data?.success) {
        setPromptProfiles(res.data.data.profiles || []);
        setActivePromptId(res.data.data.activeId || 'default');
      }
    } catch (_) {}
  }, []);
  useEffect(() => { loadPromptProfiles(); }, [loadPromptProfiles]);

  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [historyStats, setHistoryStats] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [filterExecutedOnly, setFilterExecutedOnly] = useState(false);
  const [recentExecutions, setRecentExecutions] = useState([]);

  // AI工具状态（只读展示）
  const [alerts, setAlerts] = useState([]);
  const [backtestResult, setBacktestResult] = useState(null);
  const [forceRefresh, setForceRefresh] = useState(false);

  // 持久化“实时模式”设置
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai_force_refresh');
      if (saved === 'true') setForceRefresh(true);
    } catch (e) {
      // 忽略
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('ai_force_refresh', forceRefresh ? 'true' : 'false');
    } catch (e) {
      // 忽略
    }
  }, [forceRefresh]);

  // 防御：确保渲染期使用的历史一定是数组，避免因异常state导致UI崩溃
  const safeHistory = Array.isArray(modelChatHistory) ? modelChatHistory : [];
  const analysisSource = analysis && typeof analysis === 'object' ? analysis._source : null;
  const currentAnalysisId = analysis && typeof analysis === 'object' ? analysis._analysisId : null;
  const displayHistory = safeHistory.filter(entry => {
    if (!currentAnalysisId) return true;
    if (analysisSource !== 'live') return true;
    return entry?._analysisId !== currentAnalysisId;
  });

  // 按“仅显示已执行”进行二次过滤
  const executedAidSet = (() => {
    const set = new Set();
    (recentExecutions || []).forEach((e) => {
      const aid = String(e.analysis_id || e.analysisId || '').trim();
      if (aid) set.add(aid);
    });
    return set;
  })();

  const displayHistoryFiltered = (filterExecutedOnly ? displayHistory.filter((entry) => {
    const aid = entry?.aiActions?.autoTrade?.analysisId || entry?.analysisId || '';
    if (!aid) return false;
    for (const full of executedAidSet) {
      if (full.startsWith(String(aid))) return true;
    }
    return false;
  }) : displayHistory);
  const shouldShowHighlight = analysis && analysisSource !== 'history';

  useEffect(() => {
    if (pendingQuestion) {
      window.dispatchEvent(new CustomEvent('ai-follow-up', {
        detail: {
          question: pendingQuestion,
          timestamp: Date.now(),
          symbol: selectedSymbol
        }
      }));
      setPendingQuestion(null);
    }
  }, [pendingQuestion, selectedSymbol]);

  // 拉取最近执行明细（用于筛选）
  useEffect(() => {
    const fetchExecutions = async () => {
      if (!selectedSymbol) return;
      try {
        const res = await axios.get('/api/monitoring/executions', { params: { symbol: selectedSymbol, limit: 200 } });
        setRecentExecutions(Array.isArray(res.data?.data) ? res.data.data : []);
      } catch (e) {
        setRecentExecutions([]);
      }
    };
    fetchExecutions();
  }, [selectedSymbol]);

  // 🆕 刷新后恢复最近一次 live 结果（避免视觉“回退”）
  useEffect(() => {
    if (!selectedSymbol) return;
    try {
      const key = `last_live_analysis_${selectedSymbol}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj._source === 'live') {
          setAnalysis(obj);
          lastAnalysisAtRef.current = Date.now();
        }
      }
    } catch (e) {
      // 忽略
    }
  }, [selectedSymbol]);

  useEffect(() => {
    if (typeof analysis === 'function') {
      console.warn('检测到无效的 analysis 函数值，已重置为空');
      setAnalysis(null);
    }
  }, [analysis, setAnalysis]);

  // 添加思考步骤
  const addThought = (step, status = 'info') => {
    const thought = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      step,
      status // info, success, error
    };

    // 优先使用Redux的追加动作，避免将函数作为payload
    if (typeof addAutoAIThought === 'function') {
      addAutoAIThought(thought);
      return;
    }

    // 退化为本地/父级状态：基于当前数组拼接，传入新数组
    if (typeof setChainOfThought === 'function') {
      const base = Array.isArray(chainOfThought) ? chainOfThought : [];
      setChainOfThought([...base, thought].slice(-MAX_THOUGHT_HISTORY));
    }
  };

  const updateProgress = (step, total, label) => {
    setProgress({ step, total, label });
  };

  // 加载历史记录
  useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedSymbol) return;
      try {
        setHistoryLoading(true);
        const { data } = await axios.get('/api/ai/history', {
          params: {
            symbol: selectedSymbol,
            limit: HISTORY_LIMIT,
            contextId: (()=>{ try { return Number(localStorage.getItem('active_memory_context_id')) || null; } catch(e){ return null; } })()
          }
        });

        if (data?.success) {
          const history = data.data?.history || [];
          const stats = data.data?.stats;

          // 🔍 调试：检查历史记录的chainOfThought
          console.log('📚 加载历史记录:', history.length, '条');
          if (history.length > 0) {
            console.log('📚 第一条记录的chainOfThought:', {
              exists: !!history[0].chainOfThought,
              type: typeof history[0].chainOfThought,
              length: history[0].chainOfThought?.length || 0,
              preview: typeof history[0].chainOfThought === 'string'
                ? history[0].chainOfThought.substring(0, 100)
                : history[0].chainOfThought
            });
          }

          const normalized = history.map(item => {
            // 🔧 归一化 chainOfThought：强制转为字符串
            let normalizedChain = '';
            if (typeof item.chainOfThought === 'string') {
              normalizedChain = item.chainOfThought;
            } else if (Array.isArray(item.chainOfThought)) {
              normalizedChain = item.chainOfThought.join('\n');
            } else if (item.chainOfThought && typeof item.chainOfThought === 'object') {
              normalizedChain = JSON.stringify(item.chainOfThought, null, 2);
            } else {
              normalizedChain = item.reasoning || '无思维链记录';
            }

            const historyAnalysisId = item.analysisId || `history-${item.id}`;

            return {
              id: `history-${item.id}`,
              rawId: item.id,
              timestamp: item.createdAt,
              symbol: item.symbol,
              signal: item.signal || 'HOLD',
              confidence: item.confidence ?? 50,
              reasoning: item.reasoning || '无详细说明',
              entryPrice: item.entryPrice ?? item.marketData?.price ?? 0,
              stopLoss: item.stopLoss ?? 0,
              takeProfit: item.takeProfit ?? 0,
              riskLevel: item.riskLevel || 'MEDIUM',
              summary: item.reasoning,
              chainOfThought: normalizedChain,
              aiActions: item.aiActions || null,
              isFavorite: item.isFavorite === 1,
              // 🆕 状态/时效（沿用服务端字段，避免前端误判）
              status: item.status || null,
              statusReason: item.statusReason || item.status_reason || null,
              validUntil: item.validUntil || item.valid_until || null,
              ttlSec: (typeof item.ttlSec === 'number' ? item.ttlSec : (item.ttlSec ? Number(item.ttlSec) : (typeof item.ttl_sec === 'number' ? item.ttl_sec : (item.ttl_sec ? Number(item.ttl_sec) : null)))),
              outcome: item.outcome || null,
              outcomePrice: item.outcomePrice ?? item.outcome_price ?? null,
              outcomeAt: item.outcomeAt || item.outcome_at || null,
              decision: {
                signal: item.signal,
                confidence: item.confidence,
                entryPrice: item.entryPrice,
                stopLoss: item.stopLoss,
                takeProfit: item.takeProfit,
                reasoning: item.reasoning,
                riskLevel: item.riskLevel || 'MEDIUM'
              },
              _analysisId: historyAnalysisId,
              _source: 'history'
            };
          });

          // ✅ 安全检查：确保setModelChatHistory是函数
          if (typeof setModelChatHistory === 'function') {
            setModelChatHistory(normalized);
          }
          setHistoryStats(stats || null);
          setFavoriteIds(new Set(normalized.filter(item => item.isFavorite).map(item => item.id)));

          // 🔧 修复：初次加载历史时不自动设置为当前分析（避免覆盖新分析结果）
          // 移除自动设置分析，避免重复渲染
          // if (normalized.length > 0 && typeof setAnalysis === 'function' && !analysis) {
          //   const first = normalized[0];
          //   setAnalysis({ ...first, _source: 'history' });
          // }
        }
      } catch (error) {
        console.error('加载AI历史记录失败:', error);
        // 不显示错误提示，静默失败
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [selectedSymbol]); // 只依赖selectedSymbol，避免无限循环

  // 清空历史（当前symbol + 当前记忆面板）
  const handleClearHistory = async () => {
    if (!selectedSymbol) return;
    if (!confirm('确定要清空当前交易对的分析历史吗？该操作不可恢复。')) return;
    try {
      setClearing(true);
      const contextId = (()=>{ try { return Number(localStorage.getItem('active_memory_context_id')) || null; } catch(e){ return null; } })();
      await axios.delete('/api/ai/history', { data: { symbol: selectedSymbol, contextId } });
      if (typeof setModelChatHistory === 'function') setModelChatHistory([]);
      setHistoryStats(null);
      setFavoriteIds(new Set());
      addThought('✅ 已清空历史记录', 'success');
    } catch (e) {
      addThought(`清空失败: ${e.message}`, 'error');
    } finally {
      setClearing(false);
    }
  };

  // 加载价格预警（V2接口）
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await axios.get('/api/price-alert-v2/list', {
          params: { symbol: selectedSymbol, enabled: true, limit: 50, contextId: (()=>{ try { return Number(localStorage.getItem('active_memory_context_id')) || null; } catch(e){ return null; } })() }
        });
        if (response.data.success) {
          const rows = response.data.data.alerts || [];
          // 适配V2字段 -> UI所需字段
          const mapped = rows
            .filter(a => a.symbol === selectedSymbol)
            .map(a => ({
              id: a.id,
              type: a.type,
              price: Number(a.target_price),
              message: a.message,
              enabled: a.enabled === 1,
            }));
          setAlerts(mapped);
        }
      } catch (error) {
        console.error('加载预警失败:', error);
      }
    };
    if (selectedSymbol) {
      fetchAlerts();
    }
  }, [selectedSymbol]);

  const handleRefreshAlerts = async () => {
    try {
      const response = await axios.get('/api/price-alert-v2/list', {
        params: { symbol: selectedSymbol, enabled: true, limit: 50, contextId: (()=>{ try { return Number(localStorage.getItem('active_memory_context_id')) || null; } catch(e){ return null; } })() }
      });
      if (response.data.success) {
        const rows = response.data.data.alerts || [];
        const mapped = rows
          .filter(a => a.symbol === selectedSymbol)
          .map(a => ({ id: a.id, type: a.type, price: Number(a.target_price), message: a.message, enabled: a.enabled === 1 }));
        setAlerts(mapped);
      }
    } catch (err) {
      console.error('刷新预警失败:', err);
      addThought('⚠️ 刷新预警失败', 'error');
    }
  };

  // 删除价格预警（保留删除功能，用户可以删除AI设置的预警）
  const handleDeleteAlert = async (id) => {
    try {
      const response = await axios.delete(`/api/price-alert-v2/${id}`);
      if (response.data.success) {
        setAlerts(prev => prev.filter(a => a.id !== id));
        addThought('✅ 删除价格预警', 'success');
      } else {
        throw new Error(response.data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除预警失败:', error);
      addThought(`❌ 删除预警失败: ${error.message}`, 'error');
    }
  };

  // 执行AI分析
  const analysisInFlightRef = useRef(false); // 防止并发分析
  const activeRequestIdRef = useRef(null);   // 防止乱序覆盖
  const lastAnalysisAtRef = useRef(0);       // 上次live结果时间
  const runAnalysis = async () => {
    if (analysisInFlightRef.current) {
      // 避免并发触发造成重复日志与资源占用
      addThought('⏳ 上一次分析尚未完成，已跳过本次触发', 'info');
      return;
    }
    analysisInFlightRef.current = true;
    const thisRequestId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    activeRequestIdRef.current = thisRequestId;
    if (!selectedSymbol) {
      addThought('❌ 请先选择交易对', 'error');
      analysisInFlightRef.current = false;
      return;
    }

    setLoading(true);
    addThought('开始AI全面分析...', 'info');
    updateProgress(0, 9, '准备启动');
    setErrorHint(null);

    // ✅ 改进1: 记录开始时间（用于性能监控）
    const startTime = Date.now();

    try {
      addThought(`分析交易对: ${selectedSymbol}`, 'info');
      updateProgress(0, 9, '解析交易对');

      // 步骤1: 获取数据（展示所有实际调用的MCP工具）
      addThought('步骤1/3: 根据MCP工具启动状态调用数据源', 'info');
      addThought('  基础数据（必调）:', 'info');
      addThought('  1. CCXT - fetchTicker (实时价格)', 'info');
      addThought('  2. 基础指标 - RSI, MACD, 布林带, EMA (4个)', 'info');
      addThought('  3. 高级指标 (11个并行): KDJ, Williams R, SAR, Ichimoku, Aroon, Stochastic, ATR, CCI, ADX, OBV, MFI', 'info');
      addThought('  4. CCXT - fetchOHLCV (100根K线)', 'info');
      addThought('  5. CCXT - fetchOrderBook (订单簿深度)', 'info');
      addThought('  6. CCXT - fetchTrades (最近50笔交易)', 'info');
      addThought('  MCP工具（按启动状态）:', 'info');
      addThought('  7-10. CoinGecko（若已启动）- 市场情绪/币种详情/涨跌榜/市场列表', 'info');
      addThought('  11-15. AkTools（若已启动）- OKX K线/多空比/主动交易量/币安AI/资讯', 'info');

      updateProgress(1, 9, '获取实时价格');

      // 🔬 深度分析模式: 包含市场情绪、链上数据、基本面
      const AI_ANALYSIS_TIMEOUT = 300000; // 与后端一致：5分钟完整模式
      const storedContextId = (() => {
        try {
          return localStorage.getItem('active_memory_context_id');
        } catch (e) {
          return null;
        }
      })();
      const parsedContextId = storedContextId ? Number(storedContextId) : undefined;
      const effectiveContextId = Number.isInteger(parsedContextId) && parsedContextId > 0
        ? parsedContextId
        : undefined;

      const requestPayload = {
        symbol: selectedSymbol,
        useFullMCP: true,
        mode: 'complete', // 完整模式：获取所有数据（市场情绪+基本面+链上数据）
        forceRefresh
      };
      if (effectiveContextId !== undefined) {
        requestPayload.contextId = effectiveContextId;
      }

      // 主请求（complete）+ 超时降级（fast）
      let finished = false;
      let fallbackTimer;
      const COMPLETE_TIMEOUT = AI_ANALYSIS_TIMEOUT; // 120s
      const FALLBACK_START_MS = 45000; // 45s 后触发快速降级
      const fastFallbackDisabled = (() => {
        try { return localStorage.getItem('disable_fast_fallback') === '1'; } catch (_) { return false; }
      })();

      const completePromise = axios.post('/api/ai/analyze-with-tools', requestPayload);

      const fallbackPromise = fastFallbackDisabled
        ? new Promise(() => {})
        : new Promise((resolve) => {
            fallbackTimer = setTimeout(async () => {
              try {
                if (activeRequestIdRef.current !== thisRequestId || finished) return;
                addThought('⏳ 完整分析较慢，启动快速降级(Fast)…', 'info');
                const fastPayload = { ...requestPayload, mode: 'fast' };
                const fastRes = await axios.post('/api/ai/analyze-with-tools', fastPayload);
                if (fastRes?.data?.data) fastRes.data.data._fallback = true;
                resolve({ __fromFallback: true, res: fastRes });
              } catch (e) {
                resolve({ __fromFallback: true, res: null });
              }
            }, FALLBACK_START_MS);
          });

      const response = await Promise.race([
        (async () => {
          const r = await Promise.race([
            completePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI深度分析超时（120秒），请稍后重试')), COMPLETE_TIMEOUT))
          ]);
          return { __fromFallback: false, res: r };
        })(),
        fallbackPromise
      ]);
      finished = true;
      clearTimeout(fallbackTimer);

      addThought('步骤2/3: MCP数据收集完成', 'success');
      const finalRes = response?.res;
      const finalData = finalRes?.data?.data || {};
      const used = finalData.mcpDataUsed || {};
      setUsedTools(Object.entries(used).filter(([, v]) => v).map(([key]) => key));
      updateProgress(6, 9, '数据收集完成');

      // 步骤2: AI分析
      addThought('步骤3/3: AI深度分析中 (综合已启动MCP工具数据)', 'info');
      addThought('  → 解读15+个技术指标 (RSI/MACD/布林/EMA/KDJ/威廉/SAR/一目均衡/Aroon/随机/ATR/CCI/ADX/OBV/MFI)', 'info');
      addThought('  → 分析市场深度 (订单簿/最近交易)', 'info');
      addThought('  → 研判市场情绪 (若CoinGecko已启动：涨跌榜/市值/排名)', 'info');
      addThought('  → 分析AkTools高级数据 (若已启动：OKX多空比/主动交易量/币安AI解读/最新资讯)', 'info');
      addThought('  → 评估风险收益比 & 生成交易决策', 'info');
      updateProgress(8, 9, 'AI深度分析');

      const result = finalData;

      // ✅ 修复：防御性初始化所有数组字段，避免 undefined.length 错误
      if (!result) {
        throw new Error('AI返回的数据为空');
      }
      if (!Array.isArray(result.chainOfThought)) {
        if (typeof result.chainOfThought === 'string' && result.chainOfThought.trim().length > 0) {
          result.chainOfThought = result.chainOfThought
            .split(/\n+/)
            .map(line => line.trim())
            .filter(Boolean);
        } else if (result.chainOfThought && typeof result.chainOfThought === 'object') {
          const values = Object.values(result.chainOfThought).map(v => (typeof v === 'string' ? v : JSON.stringify(v))).filter(Boolean);
          result.chainOfThought = values.length > 0 ? values : [];
        } else {
          result.chainOfThought = [];
        }
      }
      if (!result.decision) result.decision = {};
      if (!result.aiActions) result.aiActions = {};
      if (result.aiActions) {
        if (!Array.isArray(result.aiActions.priceAlerts)) result.aiActions.priceAlerts = [];
        if (!Array.isArray(result.aiActions.backtests)) result.aiActions.backtests = [];
        if (!Array.isArray(result.aiActions.reasoning)) result.aiActions.reasoning = [];
      }
      if (!result.validationReport) result.validationReport = {};
      if (result.validationReport && !Array.isArray(result.validationReport.corrections)) {
        result.validationReport.corrections = [];
      }

      // ✅ 改进2: 验证AI返回结果
      const dec = result.decision || result || {};

      // 验证置信度
      if (dec.confidence !== undefined && (dec.confidence < 0 || dec.confidence > 100)) {
        throw new Error(`AI返回了无效的置信度: ${dec.confidence}，应在0-100之间`);
      }

      // 验证信号和价格
      if (dec.signal && dec.signal !== 'HOLD') {
        if (!dec.entryPrice || dec.entryPrice <= 0) {
          addThought(`⚠️ 警告: ${dec.signal}信号但缺少有效入场价`, 'error');
        }
      }

      // ✅ 修复：确保数据完整性并强制更新
      console.log('📊 AI分析结果:', {
        hasSummary: !!result.summary,
        hasChainOfThought: !!result.chainOfThought,
        chainLength: Array.isArray(result.chainOfThought)
          ? result.chainOfThought.length
          : (typeof result.chainOfThought === 'string'
              ? (result.chainOfThought || '').length
              : 0),
        hasDecision: !!result.decision
      });

      const analysisId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const liveAnalysis = {
        ...result,
        _analysisId: analysisId,
        _source: 'live'
      };
      // 乱序/回滚保护：仅当前请求ID可更新；且短时间内HOLD不覆盖强信号
      if (activeRequestIdRef.current !== thisRequestId) {
        addThought('⚠️ 检测到过期结果，已忽略（可能由更晚的请求覆盖）', 'info');
      } else {
        const prev = analysis && analysis._source === 'live' ? analysis : null;
        const now = Date.now();
        const isFallbackLike = (
          (liveAnalysis?.decision?.signal === 'HOLD') && (
            typeof liveAnalysis?.summary === 'string' && /代理服务返回错误|safe\s*HOLD|数据不足|超时/.test(liveAnalysis.summary)
          )
        );
        const shouldBlockHoldOverride = prev && (prev.decision?.signal === 'BUY' || prev.decision?.signal === 'SELL')
          && liveAnalysis?.decision?.signal === 'HOLD'
          && (now - lastAnalysisAtRef.current) < 30000; // 30秒内不允许HOLD覆盖强信号

        if (shouldBlockHoldOverride || isFallbackLike) {
          addThought('⏳ 已忽略可能的回退/安全HOLD覆盖，短期内保留上次信号', 'info');
        } else {
          setAnalysis(liveAnalysis);
          lastAnalysisAtRef.current = now;
        // 持久化最近一次 live 结果（跨刷新保留）
        try {
          localStorage.setItem(`last_live_analysis_${selectedSymbol}`, JSON.stringify(liveAnalysis));
          if (dec.signal && dec.signal !== 'HOLD' && typeof dec.confidence === 'number' && dec.confidence >= 60) {
            localStorage.setItem('last_strong_signal_time', String(now));
          }
        } catch (e) { /* 忽略 */ }
        }
      }

      // 变更解释：若与上次信号不同，给出可读原因
      try {
        const prevEntry = Array.isArray(modelChatHistory) && modelChatHistory.length > 0
          ? modelChatHistory[0]
          : null;
        const prevSignal = prevEntry?.signal;
        const currSignal = (result?.decision?.signal) || result?.signal;

        if (prevSignal && currSignal && prevSignal !== currSignal) {
          addThought(`🔄 信号变化: ${prevSignal} → ${currSignal}`, 'info');
          const reasons = [];
          if (result?.validationReport?.corrections?.length) {
            const corrTexts = result.validationReport.corrections.map(c => `${c.field}: ${c.from}→${c.to}（${c.reason}）`);
            reasons.push(`验证修正: ${corrTexts.join('; ')}`);
          }
          if (typeof prevEntry?.confidence === 'number' && typeof dec.confidence === 'number') {
            const diff = Number(dec.confidence) - Number(prevEntry.confidence);
            if (Math.abs(diff) >= 5) {
              reasons.push(`置信度变化: ${prevEntry.confidence}% → ${dec.confidence}%`);
            }
          }
          if (result?.dataFreshness?.overall === 'STALE') {
            reasons.push('数据新鲜度: 部分数据过期，谨慎处理');
          }
          if (reasons.length > 0) {
            addThought(`原因: ${reasons.join(' | ')}`, 'info');
          }
        }
      } catch (e) {
        // 静默
      }

      // ✅ 改进3: 性能监控
      const totalTime = Date.now() - startTime;
      const performanceStatus = totalTime < 10000 ? '⚡ 快速' :
                               totalTime < 20000 ? '✅ 正常' :
                               '⚠️ 较慢';

      addThought(`分析完成: ${dec.signal || 'HOLD'} (置信度 ${dec.confidence ?? 0}%)`, 'success');
      addThought(`建议: ${dec.signal === 'BUY' ? '做多' : dec.signal === 'SELL' ? '做空' : '观望'}`, 'success');
      addThought(`⏱️ 耗时: ${(totalTime / 1000).toFixed(1)}秒 ${performanceStatus}`, totalTime > 20000 ? 'error' : 'info');

      // 性能告警
      if (totalTime > 20000) {
        console.warn('⚠️ AI分析耗时过长:', {
          symbol: selectedSymbol,
          totalTime: `${(totalTime / 1000).toFixed(1)}秒`,
          timestamp: new Date().toISOString()
        });
      }

      // 显示AI自动执行的操作
      if (result.aiActions) {
        const actions = result.aiActions;

        if (actions.priceAlerts && actions.priceAlerts.length > 0) {
          addThought(`🔔 AI自动设置了 ${actions.priceAlerts.length} 个价格预警`, 'success');
          actions.priceAlerts.forEach(alert => {
            if (alert.type === 'stop_loss') {
              addThought(`  ├─ 止损预警: $${alert.price}`, 'info');
            } else if (alert.type === 'take_profit') {
              addThought(`  ├─ 止盈预警: $${alert.price}`, 'info');
            } else if (alert.type === 'technical_breakout') {
              addThought(`  ├─ 技术预警: ${alert.indicator} $${alert.price}`, 'info');
            }
          });
        }

        if (actions.backtests && actions.backtests.length > 0) {
          addThought(`📊 AI运行了策略回测验证`, 'success');
          actions.backtests.forEach(bt => {
            addThought(`  ├─ 策略: ${bt.strategy}`, 'info');
            addThought(`  ├─ 收益率: ${bt.result.totalReturn.toFixed(2)}%`, bt.result.totalReturn > 0 ? 'success' : 'error');
            addThought(`  ├─ 胜率: ${bt.result.winRate.toFixed(1)}%`, 'info');
            addThought(`  └─ 最大回撤: ${bt.result.maxDrawdown.toFixed(2)}%`, 'info');
          });
        }

        if (actions.reasoning && actions.reasoning.length > 0) {
          addThought('🤖 AI工具执行总结:', 'info');
          actions.reasoning.forEach(r => addThought(`  ${r}`, 'info'));
        }

        // 更新预警列表
        if (actions.priceAlerts && actions.priceAlerts.length > 0) {
          try {
            const response = await axios.get('/api/price-alert-v2/list', {
              params: { symbol: selectedSymbol, enabled: true, limit: 50 }
            });
            if (response.data.success) {
              const rows = response.data.data.alerts || [];
              const mapped = rows
                .filter(a => a.symbol === selectedSymbol)
                .map(a => ({ id: a.id, type: a.type, price: Number(a.target_price), message: a.message, enabled: a.enabled === 1 }));
              setAlerts(mapped);
              addThought(`✅ 已加载 ${mapped.length} 个预警`, 'success');
            }
          } catch (err) {
            console.error('加载预警失败:', err);
            addThought('⚠️ 加载预警失败', 'error');
          }
        }

        // 更新回测结果
        if (actions.backtests && actions.backtests.length > 0) {
          setBacktestResult({
            strategyName: actions.backtests[0].strategy,
            performance: actions.backtests[0].result
          });
          addThought(`✅ 回测结果已更新`, 'success');
        }
      }

      // 🎯 关键：将分析结果同步到模型聊天记录
      const modelChatEntry = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        symbol: selectedSymbol,
        signal: dec.signal || 'HOLD',
        confidence: dec.confidence ?? 50,
        reasoning: dec.reasoning || result.summary || '分析结果不完整',
        entryPrice: dec.entryPrice ?? 0,
        stopLoss: dec.stopLoss ?? 0,
        takeProfit: dec.takeProfit ?? 0,
        riskLevel: dec.riskLevel || 'MEDIUM',
        summary: result.summary,
        chainOfThought: Array.isArray(result.chainOfThought)
          ? result.chainOfThought.join('\n')
          : result.chainOfThought,
        decision: result.decision,
        validationReport: result.validationReport,
        historyReferences: result.historyReferences,
        favorite: false,
        _analysisId: analysisId,
        _source: 'live'
      };

      // ✅ 安全更新：避免把函数塞进Redux，直接基于当前历史构造新数组
      if (typeof setModelChatHistory === 'function') {
        const prev = Array.isArray(modelChatHistory) ? modelChatHistory : [];
        const next = [modelChatEntry, ...prev].slice(0, 50);
        setModelChatHistory(next);
        addThought('已更新模型聊天记录', 'success');
      } else {
        console.warn('setModelChatHistory不是函数，跳过更新聊天记录');
      }
      updateProgress(9, 9, '完成');

    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message;
      addThought(`分析失败: ${errorMessage}`, 'error');
      console.error('AI分析失败:', error);
      setErrorHint({
        message: errorMessage,
        time: new Date().toISOString()
      });
    } finally {
      setLoading(false);
      analysisInFlightRef.current = false;
    }
  };

  // 自动运行循环
  useEffect(() => {
    let timer;
    let countdownTimer;

    if (isRunning) {
      // 立即执行一次
      runAnalysis();
      setCountdown(interval);
      updateProgress(0, 9, '等待下一轮');

      // 倒计时
      countdownTimer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            return interval;
          }
          return prev - 1;
        });
      }, 1000);

      // 定时执行（若上一次分析仍在进行，则跳过本轮）
      timer = setInterval(() => {
        updateProgress(0, 9, '准备下一轮');
        if (!analysisInFlightRef.current) {
          runAnalysis();
        } else {
          addThought('⏳ 跳过：上一次分析仍在进行', 'info');
        }
      }, interval * 1000);
    }

    return () => {
      clearInterval(timer);
      clearInterval(countdownTimer);
    };
  }, [isRunning, interval, selectedSymbol]);

  // 启动/停止自动AI
  const toggleAutoAI = () => {
    if (isRunning) {
      addThought('⏸️ 自动AI已停止', 'info');
      setIsRunning(false);
      updateProgress(0, 0, '已暂停');
    } else {
      addThought('▶️ 自动AI已启动', 'success');
      setIsRunning(true);
    }
  };

  const handleToggleFavorite = useCallback(async (entry) => {
    try {
      const nextState = !favoriteIds.has(entry.id);
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (nextState) {
          next.add(entry.id);
        } else {
          next.delete(entry.id);
        }
        return next;
      });

      await axios.post('/api/ai/history/favorite', {
        id: entry.id.replace('history-', ''),
        favorite: nextState
      });
    } catch (error) {
      console.error('更新收藏状态失败:', error);
    }
  }, [favoriteIds]);

  const triggerFollowUp = (entry) => {
    const question = `基于${entry.symbol}最新分析 (${entry.signal}，置信度 ${entry.confidence}%)，下一步策略建议是什么？`;
    setPendingQuestion(question);
  };

  return (
    <div className="space-y-4">
      {/* 整合页面标题 - 仅在独立页面显示 */}
      {showTitle && (
        <div className="card bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
          <h1 className="text-2xl font-bold mb-2">AI自动分析 & 模型聊天</h1>
          <p className="text-sm text-dark-muted">受nof1.ai启发 - 自动AI运行并记录所有分析到模型聊天</p>
        </div>
      )}

      {/* 控制面板 - 紧凑横向布局 */}
      <div className="card bg-gradient-to-r from-blue-900/20 to-green-900/20 border-blue-500/30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* 左侧：状态 */}
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 bg-gradient-to-br rounded-lg flex items-center justify-center ${
              isRunning ? 'from-green-600 to-blue-600 animate-pulse' : 'from-purple-600 to-blue-600'
            }`}>
              {isRunning ? <Zap className="w-4 h-4 text-white" /> : <Brain className="w-4 h-4 text-white" />}
            </div>
            <div>
              <h2 className="text-base font-bold">AI自动分析</h2>
            <div className="bg-dark-bg px-2 py-1.5 rounded-lg">
              <div className="text-[10px] text-dark-muted mb-0.5">交易对</div>
              <div className="flex items-center gap-1">
                <select
                  value={selectedSymbol}
                  onChange={(e) => {
                    const sym = e.target.value;
                    setSymbolInput(sym);
                    if (typeof setGlobalSelectedSymbol === 'function') setGlobalSelectedSymbol(sym);
                  }}
                  disabled={isRunning}
                  className="bg-dark-card text-dark-text border-0 text-xs font-semibold pr-4 cursor-pointer rounded"
                  style={{ backgroundColor: 'rgb(30, 33, 43)', color: 'rgb(229, 231, 235)' }}
                >
                  {COMMON_SYMBOLS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value)}
                  onBlur={() => {
                    const sym = (symbolInput || '').trim().toUpperCase();
                    if (sym && typeof setGlobalSelectedSymbol === 'function') setGlobalSelectedSymbol(sym);
                  }}
                  placeholder="自定义 如: BTC/USDT"
                  className="bg-dark-card text-dark-text border-0 text-xs font-semibold px-2 py-1 rounded w-36"
                />
              </div>
            </div>

              <p className="text-xs text-dark-muted">
                {isRunning ? '运行中' : '已停止'} • {selectedSymbol}
              </p>
            </div>
          </div>

          {/* 中间：设置 */}
          <div className="flex items-center space-x-2">
            <div className="bg-dark-bg px-2 py-1.5 rounded-lg">
              <div className="text-[10px] text-dark-muted mb-0.5">间隔</div>
              <select
                value={interval}
                onChange={(e) => setIntervalTime(parseInt(e.target.value))}
                disabled={isRunning}
                className="bg-dark-card text-dark-text border-0 text-xs font-semibold pr-4 cursor-pointer rounded"
                style={{
                  backgroundColor: 'rgb(30, 33, 43)',
                  color: 'rgb(229, 231, 235)'
                }}
              >
                <option value="60" style={{backgroundColor: 'rgb(30, 33, 43)', color: 'rgb(229, 231, 235)'}}>1分钟</option>
                <option value="120" style={{backgroundColor: 'rgb(30, 33, 43)', color: 'rgb(229, 231, 235)'}}>2分钟</option>
                <option value="180" style={{backgroundColor: 'rgb(30, 33, 43)', color: 'rgb(229, 231, 235)'}}>3分钟</option>
                <option value="300" style={{backgroundColor: 'rgb(30, 33, 43)', color: 'rgb(229, 231, 235)'}}>5分钟</option>
              </select>
            </div>

            <div className="bg-dark-bg px-2 py-1.5 rounded-lg">
              <div className="text-[10px] text-dark-muted mb-0.5">实时模式</div>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={forceRefresh}
                  onChange={(e) => setForceRefresh(e.target.checked)}
                  disabled={loading}
                />
                <span className={forceRefresh ? 'text-accent-primary' : 'text-dark-muted'}>
                  {forceRefresh ? '开启' : '关闭'}
                </span>
              </label>
            </div>

            {isRunning && (
              <div className="bg-dark-bg px-2 py-1.5 rounded-lg min-w-[60px]">
                <div className="text-[10px] text-dark-muted mb-0.5">倒计时</div>
                <div className="text-base font-bold font-mono text-accent-warning">{countdown}s</div>
              </div>
            )}
          </div>

          {/* 右侧：按钮 */}
          <button
            onClick={toggleAutoAI}
            disabled={loading}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg font-semibold transition-all text-sm ${
              isRunning
                ? 'bg-accent-danger text-white hover:bg-red-600'
                : 'bg-accent-success text-white hover:bg-green-600'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : isRunning ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>{loading ? '处理中' : isRunning ? '停止' : '启动'}</span>
          </button>
            <div className="bg-dark-bg px-2 py-1.5 rounded-lg">
              <div className="text-[10px] text-dark-muted mb-0.5">提示词</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('prompts')}
                  className="text-xs px-2 py-1 rounded bg-dark-card border border-dark-border hover:border-accent-primary"
                >自定义/导入</button>
              </div>
            </div>

            {/* 备用：提示词选择（临时隐藏）*/}
            {false && (

            <div className="bg-dark-bg px-2 py-1.5 rounded-lg">
              <div className="text-[10px] text-dark-muted mb-0.5">9929</div>
              <div className="flex items-center gap-1">
                <select
                  value={activePromptId}
                  onChange={async (e) => {
                    const id = e.target.value;
                    setActivePromptId(id);
                    try {
                      await axios.post('/api/prompts/activate', { id });
                    } catch (err) {
                      console.error('切换提示词失败', err);
                    }
                  }}
                  className="bg-dark-card text-dark-text border-0 text-xs font-semibold pr-4 cursor-pointer rounded"
                  style={{ backgroundColor: 'rgb(30, 33, 43)', color: 'rgb(229, 231, 235)' }}
                >
                  {promptProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setActiveTab('prompts')}
                  className="text-xs px-2 py-1 rounded bg-dark-card border border-dark-border hover:border-accent-primary"


                >管理</button>
              </div>
            </div>

            )}

        </div>

        {/* 进度指示器 */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-dark-bg/80 p-3 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Radar className="w-4 h-4 text-accent-primary" />
                <span className="text-xs font-semibold text-dark-muted">分析进度</span>
              </div>
              <span className="text-xs text-dark-muted">
                {progress.total > 0 ? `${progress.step}/${progress.total}` : '待启动'}
              </span>
            </div>
            <div className="w-full h-2 bg-dark-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 transition-all duration-300"
                style={{ width: progress.total > 0 ? `${(progress.step / progress.total) * 100}%` : '0%' }}
              />
            </div>
            <div className="text-xs text-dark-muted mt-2">
              {progress.label || '准备就绪'}
            </div>
          </div>

          <div className="bg-dark-bg/80 p-3 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-accent-success" />
                <span className="text-xs font-semibold text-dark-muted">已调用工具</span>
              </div>
              <span className="text-xs text-accent-success font-mono">{usedTools.length}</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap text-[11px] text-dark-muted">
              {usedTools.length > 0 ? (
                usedTools.map(tool => (
                  <span key={tool} className="px-2 py-0.5 bg-accent-success/10 text-accent-success rounded-full">
                    {tool}
                  </span>
                ))
              ) : (
                <span className="text-dark-muted/70">等待本轮分析完成…</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI工具执行结果展示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AI设置的价格预警 */}
        <div className="card bg-gradient-to-br from-yellow-900/10 to-orange-900/10 border-yellow-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5 text-yellow-400" />
              <h3 className="text-sm font-bold">AI智能预警</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">AI自动设置</div>
              <button onClick={handleRefreshAlerts} className="text-xs px-2 py-1 rounded border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10">刷新</button>
            </div>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto">
              {alerts.length === 0 ? (
              <div className="text-xs text-dark-muted text-center py-4">
                <div>AI分析后会自动设置预警</div>
                {analysis?.alertManagement && (
                  <div className="mt-2 text-[11px] text-dark-muted/80">
                    来源: {analysis.alertManagement.source || '—'} · 新建 {analysis.alertManagement.created?.length || 0}
                    {typeof analysis.alertManagement.skipped === 'number' && (
                      <> · 跳过重复 {analysis.alertManagement.skipped}</>
                    )}
                    {Array.isArray(analysis.alertManagement.rejected) && analysis.alertManagement.rejected.length > 0 && (
                      <>
                        {' '}· 拒绝 {analysis.alertManagement.rejected.length}
                        <div className="mt-1 opacity-80">示例原因：{Array.from(new Set(analysis.alertManagement.rejected.map(r=>r.reason))).slice(0,2).join('；')}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              alerts.map(alert => {
                const typeLabel = {
                  above: '突破上方',
                  below: '跌破下方',
                  cross_above: '上穿',
                  cross_below: '下穿',
                  both: '接近区间'
                }[alert.type] || alert.type;
                const UpIcon = <TrendingUp className="w-4 h-4 text-green-400" />;
                const DownIcon = <TrendingDown className="w-4 h-4 text-red-400" />;
                const icon = (alert.type === 'below' || alert.type === 'cross_below') ? DownIcon : UpIcon;
                return (
                  <div key={alert.id} className="flex items-center justify-between p-2 bg-dark-bg/30 rounded">
                    <div className="flex items-center space-x-2">
                      {icon}
                      <div>
                        <div className="text-sm font-semibold">
                          {typeLabel} ${alert.price}
                        </div>
                        {alert.message && (
                          <div className="text-xs text-dark-muted">{alert.message}</div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteAlert(alert.id)}
                      className="p-1 hover:bg-red-500/20 rounded transition-colors"
                      title="删除预警"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* AI运行的策略回测 */}
        <div className="card bg-gradient-to-br from-blue-900/10 to-purple-900/10 border-blue-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-bold">AI策略验证</h3>
            </div>
            <div className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
              AI自动回测
            </div>
          </div>

          {!backtestResult ? (
            <div className="text-xs text-dark-muted text-center py-4">
              AI分析后会自动运行回测验证
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-dark-muted mb-2">
                策略: {backtestResult.strategyName || 'SimpleMA'}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-dark-bg/30 p-2 rounded">
                  <div className="text-dark-muted">收益率</div>
                  <div className={`text-sm font-bold ${backtestResult.performance.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {backtestResult.performance.totalReturn.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-dark-bg/30 p-2 rounded">
                  <div className="text-dark-muted">最大回撤</div>
                  <div className="text-sm font-bold text-red-400">
                    {backtestResult.performance.maxDrawdown.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-dark-bg/30 p-2 rounded">
                  <div className="text-dark-muted">胜率</div>
                  <div className="text-sm font-bold text-blue-400">
                    {backtestResult.performance.winRate.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-dark-bg/30 p-2 rounded">
                  <div className="text-dark-muted">交易次数</div>
                  <div className="text-sm font-bold">
                    {backtestResult.performance.totalTrades}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {errorHint && (
        <div className="card border border-accent-danger/40 bg-accent-danger/10">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-accent-danger" />
            <div>
              <div className="text-sm font-semibold text-accent-danger">分析出现问题</div>
              <div className="text-xs text-dark-muted mt-1">{errorHint.message}</div>
              <div className="text-xs text-dark-muted/70 mt-2">建议：检查MCP工具状态或稍后重试（{new Date(errorHint.time).toLocaleTimeString('zh-CN')}）</div>
            </div>
          </div>
        </div>
      )}

      {shouldShowHighlight && (
        <AIAnalysisCard
          analysis={analysis}
          timestamp={new Date().toISOString()}
          modelName="DEEPSEEK CHAT V3.2"
          highlight
        />
      )}

      {/* 模型聊天历史记录 - 主要内容区 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-accent-success" />
            <h3 className="text-lg font-bold">分析历史</h3>
            <span className="text-xs text-dark-muted">共 {safeHistory.length} 条</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              className={`text-xs px-2 py-1 rounded ${compareMode ? 'bg-accent-primary/20 text-accent-primary' : 'bg-dark-bg text-dark-muted hover:text-dark-text'}`}
              onClick={() => setCompareMode(!compareMode)}
            >
              对比最近两次
            </button>
          <label className="flex items-center gap-1 text-xs bg-dark-bg px-2 py-1 rounded cursor-pointer">
            <input
              type="checkbox"
              checked={filterExecutedOnly}
              onChange={(e) => setFilterExecutedOnly(e.target.checked)}
            />
            <span className={filterExecutedOnly ? 'text-accent-primary' : 'text-dark-muted'}>仅显示已执行</span>
          </label>
          <button
            className={`text-xs px-2 py-1 rounded ${clearing ? 'opacity-60 cursor-not-allowed' : 'bg-dark-bg text-red-400 hover:text-red-300'}`}
            onClick={handleClearHistory}
            disabled={clearing}
            title="清空当前交易对的历史（按当前记忆面板过滤）"
          >
            清空历史
          </button>
          </div>
        </div>

        {compareMode && displayHistoryFiltered.length >= 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {[0, 1].map(idx => (
                <div key={idx} className="p-3 bg-dark-bg rounded-lg border border-dark-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 text-sm">
                    <Info className="w-3.5 h-3.5 text-accent-primary" />
                    <span>第 {idx + 1} 次分析</span>
                  </div>
                  <span className="text-xs text-dark-muted">
                    {new Date(displayHistoryFiltered[idx].timestamp).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-dark-card rounded">
                    <div className="text-dark-muted">信号</div>
                    <div className="font-semibold">{displayHistoryFiltered[idx].signal}</div>
                  </div>
                  <div className="p-2 bg-dark-card rounded">
                    <div className="text-dark-muted">置信度</div>
                    <div className="font-semibold">{displayHistoryFiltered[idx].confidence}%</div>
                  </div>
                  <div className="p-2 bg-dark-card rounded">
                    <div className="text-dark-muted">风险</div>
                    <div className="font-semibold">{displayHistoryFiltered[idx].riskLevel}</div>
                  </div>
                  <div className="p-2 bg-dark-card rounded">
                    <div className="text-dark-muted">入场价</div>
                    <div className="font-semibold">${displayHistoryFiltered[idx].entryPrice?.toFixed?.(2) || '--'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {historyLoading ? (
            <div className="text-center py-6 text-dark-muted flex flex-col items-center">
              <Loader className="w-6 h-6 animate-spin mb-2" />
              <span className="text-sm">正在加载历史记录...</span>
            </div>
          ) : displayHistoryFiltered.length > 0 ? (
            <>
              {historyStats && (
                <div className="sticky top-0 z-10 bg-dark-bg/90 backdrop-blur border border-dark-border rounded-lg p-3 mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-dark-muted">
                    <Award className="w-3.5 h-3.5 text-accent-primary" />
                    <span>总数 {historyStats.total}</span>
                    <span>收藏 {historyStats.favoriteCount}</span>
                    <span>平均置信度 {Number(historyStats.avgConfidence || 0).toFixed(1)}%</span>
                  </div>
                  <div className="text-xs text-dark-muted">
                    BUY {historyStats.buyCount} / SELL {historyStats.sellCount} / HOLD {historyStats.holdCount}
                  </div>
                </div>
              )}
              {displayHistoryFiltered.map((historyEntry, index) => (
              <AIAnalysisCard
                  key={`${historyEntry.id}-${historyEntry.timestamp}-${index}`}
                  analysis={historyEntry}
                  timestamp={historyEntry.timestamp}
                  modelName="DEEPSEEK CHAT V3.2"
                  favorite={favoriteIds.has(historyEntry.id)}
                  onToggleFavorite={() => handleToggleFavorite(historyEntry)}
                  onAskFollowUp={() => triggerFollowUp(historyEntry)}
                />
              ))}
            </>
          ) : (
            <div className="text-center py-8 text-dark-muted">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">启动自动AI后，每次分析都会自动记录在这里</p>
              <p className="text-xs mt-1 text-accent-success">像nof1.ai的MODELCHAT一样</p>
            </div>
          )}
        </div>
      </div>

      {/* AI思考过程 - 折叠式，次要信息 */}
      {(() => {
        const fromSteps = Array.isArray(chainOfThought) ? chainOfThought : [];
        const fromAnalysis = (() => {
          if (!analysis) return [];
          const source =
            (typeof analysis.chainOfThought === 'string' && analysis.chainOfThought.trim()) ? analysis.chainOfThought :
            (Array.isArray(analysis.chainOfThought) ? analysis.chainOfThought.join('\n') :
              (typeof analysis.reasoning === 'string' && analysis.reasoning.trim()) ? analysis.reasoning :
              (Array.isArray(analysis.reasoning) ? analysis.reasoning.join('\n') : ''));
          if (!source) return [];
          return String(source).split('\n').map((line, idx) => ({ id: `ai-${idx}`, timestamp: '', step: line, status: 'info' }));
        })();
        const displayThoughts = fromSteps.length > 0 ? fromSteps : fromAnalysis;
        return displayThoughts.length > 0;
      })() && (
        <details className="card bg-dark-bg/30">
          <summary className="cursor-pointer text-sm font-semibold flex items-center space-x-2 py-2">
            <Activity className="w-4 h-4 text-accent-primary" />
            <span>{(() => {
              const fromSteps = Array.isArray(chainOfThought) ? chainOfThought : [];
              const fromAnalysis = (() => {
                if (!analysis) return [];
                const source =
                  (typeof analysis.chainOfThought === 'string' && analysis.chainOfThought.trim()) ? analysis.chainOfThought :
                  (Array.isArray(analysis.chainOfThought) ? analysis.chainOfThought.join('\n') :
                    (typeof analysis.reasoning === 'string' && analysis.reasoning.trim()) ? analysis.reasoning :
                    (Array.isArray(analysis.reasoning) ? analysis.reasoning.join('\n') : ''));
                if (!source) return [];
                return String(source).split('\n');
              })();
              const count = fromSteps.length > 0 ? fromSteps.length : fromAnalysis.length;
              return `AI思考过程详情 ${count}条`;
            })()}</span>
            <span className="text-xs text-dark-muted ml-auto">点击展开/折叠</span>
          </summary>

          <div className="mt-4 bg-dark-bg rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs">
            <div className="space-y-1">
              {(() => {
                const fromSteps = Array.isArray(chainOfThought) ? chainOfThought : [];
                const fromAnalysis = (() => {
                  if (!analysis) return [];
                  const source =
                    (typeof analysis.chainOfThought === 'string' && analysis.chainOfThought.trim()) ? analysis.chainOfThought :
                    (Array.isArray(analysis.chainOfThought) ? analysis.chainOfThought.join('\n') :
                      (typeof analysis.reasoning === 'string' && analysis.reasoning.trim()) ? analysis.reasoning :
                      (Array.isArray(analysis.reasoning) ? analysis.reasoning.join('\n') : ''));
                  if (!source) return [];
                  return String(source).split('\n').map((line, idx) => ({ id: `ai-${idx}`, timestamp: '', step: line, status: 'info' }));
                })();
                const displayThoughts = fromSteps.length > 0 ? fromSteps : fromAnalysis;
                return displayThoughts.map((thought) => (
                  <div key={thought.id || Math.random()} className="flex items-start space-x-2">
                    <span className="text-dark-muted text-[10px]">{thought.timestamp ? `[${thought.timestamp}]` : ''}</span>
                    {' '}
                    <span className={
                      thought.status === 'success' ? 'text-accent-success' :
                      thought.status === 'error' ? 'text-accent-danger' :
                      'text-dark-text'
                    }>
                      {thought.step}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </details>
      )}

      {/* 提示信息 - 仅在完全空白时显示 */}
      {!isRunning && ((chainOfThought || []).length === 0) && !analysis && safeHistory.length === 0 && (
        <div className="card text-center py-12 bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
          <Zap className="w-16 h-16 mx-auto mb-4 text-purple-500 opacity-50" />
          <h3 className="text-xl font-bold mb-3">整合式AI分析系统</h3>
          <p className="text-sm text-dark-muted mb-2">
            点击"启动"按钮开始自动分析
          </p>
          <p className="text-xs text-accent-success">
            最新分析 + 历史记录 + 思考过程 = 完整追踪
          </p>
        </div>
      )}
    </div>
  );
}

export default AutoAIPanel;

