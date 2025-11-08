import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  ChevronDown,
  ChevronUp,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  StarOff,
  MessageCircle,
  BarChart3
} from 'lucide-react';

const AIAnalysisCard = ({
  analysis,
  timestamp,
  modelName = 'DEEPSEEK CHAT V3.1',
  highlight = false,
  favorite = false,
  onToggleFavorite,
  onAskFollowUp
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [refFilter, setRefFilter] = useState('ALL'); // BUY/SELL/HOLD/ALL
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [linkedExecs, setLinkedExecs] = useState([]);
  const [execLoading, setExecLoading] = useState(false);
  const [missingExpanded, setMissingExpanded] = useState(false);

  const openDetail = async (id) => {
    try {
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailError(null);
      const res = await axios.get(`/api/memory/analysis/${id}`);
      if (res.data?.success) {
        setDetailData(res.data.data);
      } else {
        setDetailError(res.data?.error || '加载失败');
      }
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  if (!analysis) return null;

  // 兼容新旧格式
  const summary = analysis.summary || `${analysis.signal} 信号，置信度 ${analysis.confidence}%`;
  // 兼容数组/字符串/对象形式的思维链
  const rawChain =
    analysis.chainOfThought ??
    analysis.reasoning ??
    analysis.rawContent?.chainOfThought ??
    analysis.rawContent?.analysis ??
    analysis.rawContent?.thoughts ??
    analysis.rawContent?.fullText ??
    '';

  // 转换chainOfThought为字符串
  const chainOfThought = Array.isArray(rawChain)
    ? rawChain.map((item) =>
        typeof item === 'string'
          ? item
          : (item?.step || item?.text || JSON.stringify(item))
      ).join('\n')
    : String(rawChain || '');
  const hasThought = chainOfThought.trim().length > 0;

  // 🔍 调试日志 - 简化版，避免修改冻结对象
  useEffect(() => {
    // 使用WeakSet来跟踪已调试的组件
    if (!window.debuggedAnalyses) {
      window.debuggedAnalyses = new WeakSet();
    }

    if (process.env.NODE_ENV === 'development' && analysis && !window.debuggedAnalyses.has(analysis)) {
      console.log('🔍 AIAnalysisCard 接收到数据:');
      console.log('  - hasAnalysis:', !!analysis);
      console.log('  - hasSummary:', !!analysis?.summary);
      console.log('  - hasChainOfThought:', !!analysis?.chainOfThought);
      console.log('  - chainOfThought类型:', typeof analysis?.chainOfThought);
      console.log('  - chainOfThought原始长度:', analysis?.chainOfThought?.length || 0);
      console.log('  - rawChain类型:', typeof rawChain);
      console.log('  - rawChain长度:', rawChain?.length || 0);
      console.log('  - 转换后chainOfThought长度:', chainOfThought.length);
      console.log('  - hasThought:', hasThought);
      console.log('  - chainOfThought前100字符:', chainOfThought.substring(0, 100));

      // 标记为已调试
      window.debuggedAnalyses.add(analysis);
    }
  }, [analysis?.id, rawChain, chainOfThought, hasThought]); // 使用analysis.id而不是整个对象

  useEffect(() => {
    setMissingExpanded(false);
  }, [analysis?.dataCoverage?.missing?.length || 0, analysis?.id]);
  const decision = analysis.decision || analysis;

  // 获取信号图标和颜色
  const getSignalConfig = (signal) => {
    switch (signal) {
      case 'BUY':
        return {
          icon: TrendingUp,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          label: '做多'
        };
      case 'SELL':
        return {
          icon: TrendingDown,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          label: '做空'
        };
      default:
        return {
          icon: Minus,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          label: '观望'
        };
    }
  };

  const signalConfig = getSignalConfig(decision?.signal);
  const SignalIcon = signalConfig.icon;

  // 信号翻译映射
  const translateSignal = (signal) => {
    const translations = {
      'BUY': '买入',
      'SELL': '卖出',
      'HOLD': '持有',
      'ALL': '全部'
    };
    return translations[signal] || signal;
  };

  // 格式化时间
  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // 🆕 分析有效性与状态
  const inferTtlSecFromTimeframes = () => {
    const tfMap = { '1m': 600, '3m': 900, '5m': 1800, '15m': 3600, '30m': 7200, '1h': 21600, '4h': 86400, '1d': 259200 };
    try {
      const tfs = analysis?.marketData?.multiTimeframe?.timeframes || analysis?.multiTimeframe?.timeframes;
      if (!tfs) return 3600; // 默认1h
      const keys = Object.keys(tfs).filter(k => tfs[k] && tfs[k].status !== 'failed');
      const order = ['1m','3m','5m','15m','30m','1h','4h','1d'];
      const smallest = order.find(k => keys.includes(k));
      return tfMap[smallest] || 3600;
    } catch (_) {
      return 3600;
    }
  };
  const ttlSec = Number(analysis?.ttlSec) > 0 ? Number(analysis.ttlSec) : inferTtlSecFromTimeframes();
  const validUntil = analysis?.validUntil || (timestamp ? new Date(new Date(timestamp).getTime() + ttlSec * 1000).toISOString() : null);
  const now = Date.now();
  const isExpired = validUntil ? (new Date(validUntil).getTime() <= now) : false;

  const hasFilledExec = Array.isArray(linkedExecs) && linkedExecs.some(e => String(e.status || '').toUpperCase().includes('FILLED') || (Number(e.fill_rate ?? e.fillRate) || 0) > 0);
  const status = hasFilledExec ? 'executed' : (analysis?.status || (isExpired ? 'expired' : 'active'));
  const statusMeta = (() => {
    switch (status) {
      case 'executed':
        return { label: '已执行', cls: 'border-blue-500/60 text-blue-400' };
      case 'expired':
        return { label: '已过期', cls: 'border-yellow-500/60 text-yellow-400' };
      case 'superseded':
        return { label: '已被替代', cls: 'border-dark-border text-dark-muted' };
      case 'active':
      default:
        return { label: '有效', cls: 'border-green-500/60 text-green-400' };
    }
  })();

  // 格式化思维链：移除Markdown标题符号(##等)、多余空行
  const formatChainOfThought = (text) => {
    if (!text) return null;
    const lines = String(text)
      .split('\n')
      .map(l => l.replace(/^\s{0,3}#{1,6}\s*/, '').trim()) // 去除 #/##/### 标题前缀
      .map(l => l.replace(/^[-*+]\s+/, ''))               // 去除无序列表前缀
      .map(l => l.replace(/^\d+\.\s+/, ''))             // 去除有序列表前缀
      .map(l => l.replace(/\*\*\*([^*]+)\*\*\*/g, '$1')) // 去掉***加粗斜体
      .map(l => l.replace(/\*\*([^*]+)\*\*/g, '$1'))     // 去掉**加粗
      .map(l => l.replace(/__([^_]+)__/g, '$1'))             // 去掉__加粗
      .filter((l, idx, arr) => !(l === '' && (idx === 0 || arr[idx-1] === ''))); // 折叠空行
    return lines.map((line, i) => (
      <p key={i} className="mb-2">{line}</p>
    ));
  };

  // 🆕 来源与模式徽章（用于判断是否为降级/快速/安全HOLD）
  const sourceTag = analysis?._source === 'live' ? '实时' : analysis?._source === 'history' ? '历史' : '未知';
  const isSafeHold = /安全HOLD|安全模式|代理服务返回错误|数据不足|超时/.test(String(summary || '')) || analysis?.errorInfo?.degraded;
  const isFast = !!analysis?._fallback || analysis?.analysisMode === 'fast';
  const modeTag = isSafeHold ? '安全' : (isFast ? '快速' : '完整');

  // 关联执行查询（基于 autoTrade.analysisId）
  useEffect(() => {
    (async () => {
      try {
        setExecLoading(true);
        setLinkedExecs([]);
        const aid = analysis?.aiActions?.autoTrade?.analysisId || analysis?.analysisId;
        const symbol = analysis?.symbol || analysis?.marketData?.symbol;
        if (!aid) { setExecLoading(false); return; }
        const res = await axios.get('/api/monitoring/executions', { params: { limit: 100, symbol } });
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        const matched = rows.filter(r => String(r.analysis_id || r.analysisId || '').startsWith(String(aid))); // 前缀兼容
        setLinkedExecs(matched);
      } catch (_) {
        setLinkedExecs([]);
      } finally {
        setExecLoading(false);
      }
    })();
  }, [analysis?.aiActions?.autoTrade?.analysisId, analysis?.analysisId, analysis?.symbol]);

  return (
    <div className={`card mb-4 border-l-4 ${highlight ? 'border-l-purple-500 shadow-lg shadow-purple-500/20' : 'border-l-blue-500'}`}>
      {/* Header */}
      <div className="pb-3 border-b border-dark-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-500" />
            <h3 className="text-sm font-medium text-dark-muted">
              {modelName}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-dark-border text-dark-muted" title="来源">
              {sourceTag}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isSafeHold ? 'border-yellow-500/60 text-yellow-400' : isFast ? 'border-blue-500/60 text-blue-400' : 'border-green-500/60 text-green-400'}`} title="分析模式">
              {modeTag}
            </span>
            {/* 🆕 有效性标签 */}
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusMeta.cls}`} title={validUntil ? `有效期至 ${new Date(validUntil).toLocaleTimeString('zh-CN')}` : ''}>
              {statusMeta.label}
            </span>
            {/* 🆕 结果标签 */}
            {analysis?.outcome && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  analysis.outcome === 'correct' ? 'border-accent-success text-accent-success' :
                  analysis.outcome === 'wrong' ? 'border-accent-danger text-accent-danger' : 'border-dark-border text-dark-muted'
                }`}
                title={`结果评估于 ${analysis.outcomeAt ? new Date(analysis.outcomeAt).toLocaleTimeString('zh-CN') : ''}`}
              >
                {analysis.outcome === 'correct' ? '✓ 正确' : analysis.outcome === 'wrong' ? '✕ 错误' : '— 中性'}
              </span>
            )}
            <span className="text-xs text-dark-muted">
              {formatTime(timestamp)}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 pt-4">
        {/* 简短总结 */}
        <div className={`p-3 rounded-lg ${highlight ? 'bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/40' : 'bg-dark-bg'}`}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-relaxed flex-1">{summary}</p>
            <div className="flex items-center space-x-2">
              {onToggleFavorite && (
                <button
                  onClick={onToggleFavorite}
                  className={`p-2 rounded-full transition-colors ${favorite ? 'bg-yellow-500/20 text-yellow-400' : 'bg-dark-border text-dark-muted hover:text-white'}`}
                  title={favorite ? '取消收藏' : '收藏此分析'}
                >
                  {favorite ? <Star className="w-4 h-4" /> : <StarOff className="w-4 h-4" />}
                </button>
              )}
              {onAskFollowUp && (
                <button
                  onClick={onAskFollowUp}
                  className="p-2 rounded-full bg-dark-border text-dark-muted hover:text-accent-primary transition-colors"
                  title="追问AI"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {analysis.dataFreshness && (
            <div className="mt-2 flex items-center gap-2 text-[10px]">
              <span className="px-2 py-0.5 border border-dark-border rounded text-dark-muted">
                数据新鲜度: {analysis.dataFreshness.overall}
              </span>
              {analysis.performanceMetrics && (
                <span className="px-2 py-0.5 border border-dark-border rounded text-dark-muted">
                  耗时: {Math.round((analysis.performanceMetrics.totalMs || 0)/100)/10}s
                </span>
              )}
              {analysis.contextMetrics && (
                <>
                  <span className="px-2 py-0.5 border border-dark-border rounded text-dark-muted">
                    引用覆盖: {Math.round((analysis.contextMetrics.coverage || 0)*100)}%
                  </span>
                  <span className="px-2 py-0.5 border border-dark-border rounded text-dark-muted">
                    引用问题: {Math.round((analysis.contextMetrics.issueRate || 0)*100)}%
                  </span>
                </>
              )}
              {analysis?.dataCoverage && (
                <>
                  <span className="px-2 py-0.5 border border-dark-border rounded text-dark-muted">
                    数据覆盖: {analysis.dataCoverage.coverage}%
                  </span>
                  {Array.isArray(analysis.dataCoverage?.missing) && analysis.dataCoverage.missing.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMissingExpanded(prev => !prev)}
                      className={`flex items-center gap-1 px-2 py-0.5 border border-dark-border rounded text-accent-warning transition-colors ${missingExpanded ? 'bg-yellow-500/10' : 'bg-transparent'}`}
                      title={missingExpanded ? '收起缺失数据' : '查看缺失数据列表'}
                    >
                      <span>缺失: {analysis.dataCoverage.missing.length}</span>
                      {missingExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {missingExpanded && Array.isArray(analysis?.dataCoverage?.missing) && analysis.dataCoverage.missing.length > 0 && (
            <div className="mt-3 bg-dark-bg/80 border border-yellow-500/30 rounded-lg p-3 text-[12px] text-yellow-100 space-y-1">
              <div className="flex items-center gap-2 text-[11px] text-yellow-200">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>以下数据在本次分析中缺失，建议手动核对：</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-3 list-disc">
                {analysis.dataCoverage.missing.map((item, idx) => (
                  <li key={idx} className="leading-relaxed break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 展开/折叠按钮 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-xs text-dark-muted hover:text-white flex items-center justify-center gap-1 py-2 rounded hover:bg-dark-bg transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              收起详情
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              展开详情
            </>
          )}
        </button>

        {/* 展开的详细内容 */}
        {isExpanded && (
          <div className="space-y-4 pt-2 border-t">
            {/* 关联执行 */}
            {execLoading ? (
              <div className="text-xs text-dark-muted">关联执行加载中…</div>
            ) : (linkedExecs && linkedExecs.length > 0) ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-green-500 rounded" />
                  <h4 className="text-sm font-semibold">关联执行</h4>
                </div>
                <div className="pl-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
                  {linkedExecs.map((e, idx) => (
                    <div key={idx} className="p-2 bg-dark-bg rounded border border-dark-border">
                      <div className="flex items-center justify-between">
                        <div className="font-mono">{e.symbol}</div>
                        <div className={`text-[10px] px-1.5 py-0.5 rounded border ${String(e.side).toUpperCase()==='BUY'?'border-green-500/60 text-green-400':'border-red-500/60 text-red-400'}`}>{String(e.side).toUpperCase()}</div>
                      </div>
                      <div className="mt-1 text-[11px] text-dark-muted">
                        {new Date(e.created_at || e.time || Date.now()).toLocaleString('zh-CN')} · 状态 {String(e.status||'').toUpperCase()}
                      </div>
                      <div className="mt-1 grid grid-cols-3 gap-2">
                        <div className="bg-dark-card rounded p-1.5">
                          <div className="text-[10px] text-dark-muted">价格</div>
                          <div className="font-mono">{Number(e.expected_price ?? e.expectedPrice)?.toFixed?.(4)}→{Number(e.actual_price ?? e.actualPrice)?.toFixed?.(4)}</div>
                        </div>
                        <div className="bg-dark-card rounded p-1.5">
                          <div className="text-[10px] text-dark-muted">滑点%</div>
                          <div className="font-mono">{Number(e.slippage_percent ?? e.slippagePercent)?.toFixed?.(2)}%</div>
                        </div>
                        <div className="bg-dark-card rounded p-1.5">
                          <div className="text-[10px] text-dark-muted">延迟/成交率</div>
                          <div className="font-mono">{Math.round(Number(e.latency_ms ?? e.latencyMs)||0)}ms · {Number(e.fill_rate ?? e.fillRate)?.toFixed?.(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {/* 历史引用卡片 */}
            {Array.isArray(analysis.historyReferences) && analysis.historyReferences.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-teal-500 rounded" />
                  <h4 className="text-sm font-semibold">历史引用</h4>
                </div>
                {/* 过滤器 */}
                <div className="pl-1 mb-2 text-[10px] flex items-center gap-2">
                  {['ALL','BUY','SELL','HOLD'].map(key => (
                    <button
                      key={key}
                      onClick={() => setRefFilter(key)}
                      className={`px-2 py-0.5 rounded border ${refFilter === key ? 'border-accent-primary text-accent-primary' : 'border-dark-border text-dark-muted'}`}
                    >
                      {translateSignal(key)}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-1">
                  {(analysis.historyReferences.filter(r => refFilter === 'ALL' ? true : (String(r.signal || '').toUpperCase() === refFilter))).map((ref) => (
                    <button key={ref.id} onClick={() => openDetail(ref.id)} className="text-left p-2 bg-dark-bg rounded border border-dark-border hover:bg-dark-border/40 transition">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-dark-muted">
                          {new Date(ref.timestamp).toLocaleString('zh-CN')}
                        </span>
                        <div className="flex items-center gap-2">
                          {typeof ref.deltaPct === 'number' && (
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${ref.outcome === 'correct' ? 'border-accent-success text-accent-success' : ref.outcome === 'wrong' ? 'border-accent-danger text-accent-danger' : 'border-dark-border text-dark-muted'}`} title="相对当前价格的结果">
                              {ref.outcome === 'correct' ? '✓ 正确' : ref.outcome === 'wrong' ? '✕ 错误' : '— 中性'}
                              {` ${ref.deltaPct >= 0 ? '+' : ''}${(ref.deltaPct || 0).toFixed(2)}%`}
                            </span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 border border-dark-border rounded">
                            {ref.signal} · {ref.confidence}%
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-dark-muted line-clamp-2">
                        {ref.summary || '无摘要'}
                      </div>
                      {Array.isArray(ref.issues) && ref.issues.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {ref.issues.map((iss, i) => (
                            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${
                              iss === 'error' ? 'border-accent-danger text-accent-danger' :
                              iss === 'stale' ? 'border-yellow-500/40 text-yellow-400' :
                              'border-accent-warning/40 text-accent-warning'
                            }`}>
                              {iss}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* 引用冲突摘要与矩阵 */}
          {analysis.contextMetrics?.conflict && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-orange-500 rounded" />
                <h4 className="text-sm font-semibold">引用冲突</h4>
              </div>
              <div className="pl-3 text-xs text-dark-muted">
                {analysis.contextMetrics.conflict.summary} · 主导 {translateSignal(analysis.contextMetrics.conflict.dominant)} · 一致性 {Math.round(analysis.contextMetrics.conflict.consistency*100)}%
              </div>
              {analysis.contextMetrics.conflict.counts && (
                <div className="pl-3 mt-2 grid grid-cols-3 gap-2 text-center">
                  {['BUY','SELL','HOLD'].map((k) => {
                    const val = analysis.contextMetrics.conflict.counts[k] || 0;
                    const isDom = analysis.contextMetrics.conflict.dominant === k;
                    const color = k === 'BUY' ? 'text-accent-success' : k === 'SELL' ? 'text-accent-danger' : 'text-yellow-400';
                    const active = refFilter !== 'ALL' && refFilter === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setRefFilter(k)}
                        className={`p-2 rounded border ${isDom ? 'border-accent-primary' : 'border-dark-border'} ${active ? 'bg-dark-border/40' : ''}`}
                        title={`筛选 ${translateSignal(k)} 引用`}
                      >
                        <div className={`text-[10px] ${color}`}>{translateSignal(k)}</div>
                        <div className="text-sm font-semibold">{val}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

            {/* 思维链 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-purple-500 rounded" />
                <h4 className="text-sm font-semibold">思维过程</h4>
              </div>
              <div className="pl-3 text-sm text-dark-muted space-y-1">
                {hasThought ? (
                  formatChainOfThought(chainOfThought)
                ) : (
                  <p className="text-xs text-dark-muted/80">暂无思维链记录。</p>
                )}
              </div>
            </div>

            {/* 决策验证与修正信息 */}
            {analysis?.validationReport && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-yellow-500 rounded" />
                  <h4 className="text-sm font-semibold">决策验证</h4>
                </div>
                <div className="pl-3 space-y-2">
                  {Array.isArray(analysis.validationReport?.warnings) && analysis.validationReport.warnings.length > 0 && (
                    <div className="text-xs text-accent-warning">
                      <div className="mb-1">警告:</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {analysis.validationReport.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(analysis.validationReport?.corrections) && analysis.validationReport.corrections.length > 0 && (
                    <div className="text-xs text-dark-muted">
                      <div className="mb-1">已应用修正:</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {analysis.validationReport.corrections.map((c, i) => (
                          <li key={i}>{c.field}: {c.from} → {c.to}（{c.reason}）</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 最终决策 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-blue-500 rounded" />
                <h4 className="text-sm font-semibold">交易决策</h4>
              </div>
              
              <div className="space-y-3 pl-3">
                {/* 信号和置信度 */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${signalConfig.bgColor}`}>
                    <SignalIcon className={`w-4 h-4 ${signalConfig.color}`} />
                    <span className={`font-semibold ${signalConfig.color}`}>
                      {signalConfig.label}
                    </span>
                  </div>
                  <span className="px-2 py-1 text-xs border border-dark-border rounded">
                    置信度: {decision?.confidence}%
                  </span>
                  {analysis?.indicatorsSummary && (
                    <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" />{analysis.indicatorsSummary}
                    </span>
                  )}
                  <span className={`px-2 py-1 text-xs rounded ${
                    decision?.riskLevel === 'LOW' ? 'bg-green-500/20 text-green-500' :
                    decision?.riskLevel === 'HIGH' ? 'bg-red-500/20 text-red-500' :
                    'bg-yellow-500/20 text-yellow-500'
                  }`}>
                    风险: {decision?.riskLevel}
                  </span>
                </div>

                {analysis?.toolsUsed?.length > 0 && (
                  <div className="flex flex-wrap gap-1 text-[10px] text-dark-muted">
                    {analysis.toolsUsed.map(tool => (
                      <span key={tool} className="px-2 py-0.5 bg-dark-border rounded-full">{tool}</span>
                    ))}
                  </div>
                )}

                {/* 价格信息 - 仅在BUY/SELL时显示 */}
                {decision?.entryPrice && decision?.signal !== 'HOLD' && (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 bg-dark-bg rounded">
                      <div className="text-dark-muted mb-1">入场价</div>
                      <div className="font-mono font-semibold">
                        {isNaN(Number(decision.entryPrice)) ? decision.entryPrice : `$${Number(decision.entryPrice).toFixed(2)}`}
                      </div>
                    </div>
                    {decision?.stopLoss && (
                      <div className="p-2 bg-red-500/10 rounded">
                        <div className="text-dark-muted mb-1">止损价</div>
                        <div className="font-mono font-semibold text-red-500">
                          {isNaN(Number(decision.stopLoss)) ? decision.stopLoss : `$${Number(decision.stopLoss).toFixed(2)}`}
                        </div>
                      </div>
                    )}
                    {decision?.takeProfit && (
                      <div className="p-2 bg-green-500/10 rounded">
                        <div className="text-dark-muted mb-1">止盈价</div>
                        <div className="font-mono font-semibold text-green-500">
                          {isNaN(Number(decision.takeProfit)) ? decision.takeProfit : `$${Number(decision.takeProfit).toFixed(2)}`}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {decision?.signal === 'HOLD' && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm">
                    <div className="flex items-center gap-2 text-yellow-500">
                      <Minus className="w-4 h-4" />
                      <span className="font-medium">观望策略：暂不建议入场交易</span>
                    </div>
                    <div className="text-dark-muted text-xs mt-2">
                      当前市场状态不明朗或风险较高，建议等待更清晰的趋势信号后再操作。
                    </div>
                  </div>
                )}

                {/* 决策理由 */}
                {decision?.reasoning && decision.reasoning !== chainOfThought && (
                  <div className="p-3 bg-dark-bg rounded-lg text-sm">
                    <div className="font-medium mb-1">核心理由：</div>
                    <div className="text-dark-muted">
                      {decision.reasoning}
                    </div>
                  </div>
                )}
              </div>
            </div>
          {/* 紧凑引用条：在未展开时也能看到引用来源 */}
          {Array.isArray(analysis.historyReferences) && analysis.historyReferences.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
              <span className="px-2 py-0.5 border border-dark-border rounded text-dark-muted">引用 {analysis.historyReferences.length}</span>
              {analysis.historyReferences.slice(0, 4).map(ref => (
                <button
                  key={ref.id}
                  onClick={() => openDetail(ref.id)}
                  className={`px-2 py-0.5 rounded border ${ref.source === 'current' ? 'border-accent-primary text-accent-primary' : 'border-dark-border text-dark-muted'} hover:bg-dark-border/40`}
                  title={`${new Date(ref.timestamp).toLocaleString('zh-CN')} · ${ref.signal} · ${ref.confidence || 0}% · ${ref.source === 'current' ? '本面板' : ref.source === 'global' ? '全局' : '未知'}`}
                >
                  #{ref.id} {ref.source === 'current' ? '面板' : '全局'}
                </button>
              ))}
              {analysis.historyReferences.length > 4 && (
                <span className="px-2 py-0.5 border border-dark-border rounded text-dark-muted">…</span>
              )}
            </div>
          )}
          </div>
        )}
      </div>
      {/* 详情弹窗 */}
      {detailOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-dark-muted">历史详情</div>
              <button className="text-dark-muted hover:text-white" onClick={() => setDetailOpen(false)}>关闭</button>
            </div>
            {detailLoading ? (
              <div className="text-sm text-dark-muted">加载中...</div>
            ) : detailError ? (
              <div className="text-sm text-accent-danger">{detailError}</div>
            ) : detailData ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-dark-bg rounded">
                    <div className="text-dark-muted">时间</div>
                    <div>{new Date(detailData.createdAt).toLocaleString('zh-CN')}</div>
                  </div>
                  <div className="p-2 bg-dark-bg rounded">
                    <div className="text-dark-muted">信号/置信度</div>
                    <div>{detailData.signal} / {detailData.confidence}%</div>
                  </div>
                  <div className="p-2 bg-dark-bg rounded">
                    <div className="text-dark-muted">价格</div>
                    <div>入场 {detailData.entryPrice} · 止损 {detailData.stopLoss || '--'} · 止盈 {detailData.takeProfit || '--'}</div>
                  </div>
                  <div className="p-2 bg-dark-bg rounded">
                    <div className="text-dark-muted">风险</div>
                    <div>{detailData.riskLevel || 'MEDIUM'}</div>
                  </div>
                </div>
                {detailData.reasoning && (
                  <div className="p-2 bg-dark-bg rounded">
                    <div className="text-dark-muted mb-1">当时理由</div>
                    <div className="whitespace-pre-wrap">{detailData.reasoning}</div>
                  </div>
                )}
                {detailData.contextDerived && (
                  <div className="p-2 bg-dark-bg rounded space-y-2">
                    <div className="text-dark-muted mb-1">上下文指标</div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="space-y-1">
                        <div>覆盖率</div>
                        <div className="w-full h-2 bg-dark-border rounded">
                          <div className="h-full bg-accent-primary rounded" style={{ width: `${Math.round((detailData.contextDerived.metrics.coverage||0)*100)}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div>问题率</div>
                        <div className="w-full h-2 bg-dark-border rounded">
                          <div className="h-full bg-accent-danger rounded" style={{ width: `${Math.round((detailData.contextDerived.metrics.issueRate||0)*100)}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div>一致性</div>
                        <div className="w-full h-2 bg-dark-border rounded">
                          <div className="h-full bg-green-500 rounded" style={{ width: `${Math.round((detailData.contextDerived.conflict?.consistency||0)*100)}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-dark-muted mb-1">证据引用</div>
                        <pre className="text-xs whitespace-pre-wrap">{detailData.contextDerived.snippet.evidence}</pre>
                      </div>
                      <div>
                        <div className="text-dark-muted mb-1">背景引用</div>
                        <pre className="text-xs whitespace-pre-wrap">{detailData.contextDerived.snippet.background || '—'}</pre>
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-2 bg-dark-bg rounded">
                  <div className="text-dark-muted mb-1">MarketData</div>
                  <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(detailData.marketData, null, 2)}</pre>
                </div>
                <div className="p-2 bg-dark-bg rounded">
                  <div className="text-dark-muted mb-1">Indicators</div>
                  <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(detailData.indicators, null, 2)}</pre>
                </div>
                {(detailData.promptSystem || detailData.promptUser) && (
                  <div className="p-2 bg-dark-bg rounded space-y-2">
                    <div className="text-dark-muted">提示词快照</div>
                    {detailData.promptSystem && (
                      <div>
                        <div className="text-[10px] text-dark-muted mb-1">System Prompt</div>
                        <pre className="text-[10px] whitespace-pre-wrap max-h-40 overflow-y-auto">{detailData.promptSystem}</pre>
                      </div>
                    )}
                    {detailData.promptUser && (
                      <div>
                        <div className="text-[10px] text-dark-muted mb-1">User Prompt</div>
                        <pre className="text-[10px] whitespace-pre-wrap max-h-60 overflow-y-auto">{detailData.promptUser}</pre>
                      </div>
                    )}
                  </div>
                )}
                {Array.isArray(detailData.alerts) && detailData.alerts.length > 0 && (
                  <div className="p-2 bg-dark-bg rounded">
                    <div className="text-dark-muted mb-1">关联预警</div>
                    <div className="space-y-1 text-xs">
                      {detailData.alerts.map(a => (
                        <div key={a.id} className="flex items-center justify-between">
                          <span className="text-dark-muted">{a.type}</span>
                          <span>${a.target_price}</span>
                          <span className="truncate flex-1 ml-2">{a.message || ''}</span>
                          <span className="text-dark-muted ml-2">{new Date(a.created_at).toLocaleTimeString('zh-CN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAnalysisCard;

