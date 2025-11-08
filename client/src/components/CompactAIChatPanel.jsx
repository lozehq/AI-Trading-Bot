import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MessageCircle, Send, Bot, User, ChevronDown, ChevronUp, Settings, Plus, Trash2, Eraser } from 'lucide-react';

/**
 * 紧凑型AI对话面板 - 右侧栏组件
 * 适合在整合式布局中使用
 */
function CompactAIChatPanel({ selectedSymbol }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [includeContext, setIncludeContext] = useState(true);
  const [kCount, setKCount] = useState(5);
  const [executionsK, setExecutionsK] = useState(50);
  const [includeOHLCV, setIncludeOHLCV] = useState(false);
  const [ohlcvLimit, setOhlcvLimit] = useState(200);
  const [ohlcvAll, setOhlcvAll] = useState(false);
  const [timeframes, setTimeframes] = useState(['1h']);
  const [ohlcvAttachMode, setOhlcvAttachMode] = useState('sampled');
  const [showPreview, setShowPreview] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cleanOutput, setCleanOutput] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagMsg, setDiagMsg] = useState(null);
  const [expandedErr, setExpandedErr] = useState({});
  const analysisIdRef = useRef(null);
  const overrideSymbolRef = useRef(null);
  const messagesContainerRef = useRef(null);
  // 轻量净化AI文本：去掉标题符号、粗体星号、常见emoji、压缩空行与项目符号
  const sanitizeAIText = (text) => {
    try {
      let t = String(text || '');
      // 去掉 markdown 标题符号
      t = t.replace(/^#{1,6}\s*/gm, '');
      // 去粗体/斜体星号/下划线
      t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/_([^_]+)_/g, '$1');
      // 去常见emoji/大图标
      t = t.replace(/[⚠✅📊📈📉🔍🔴🟢⭐✨🔥🚀💥📌💡🎯❌✅]/g, '');
      // 项目符号统一
      t = t.replace(/^\s*[-•·]\s+/gm, '· ');
      // 压缩多余空行
      t = t.replace(/\n{3,}/g, '\n\n');
      // 去掉行首多余空白
      t = t.replace(/^\s+/gm, '');
      return t.trim();
    } catch (_) {
      return text;
    }
  };

  // 检查AI服务状态
  useEffect(() => {
    checkAIStatus();
    // 初始化会话列表
    (async () => {
      try {
        const res = await axios.get('/api/chat/conversations');
        const list = res.data?.data || [];
        setConversations(list);
        if (list.length === 0) {
          const created = await axios.post('/api/chat/conversations', { name: '默认会话' });
          const id = created.data?.data?.id;
          setActiveConvId(id);
        } else {
          setActiveConvId(list[0].id);
          // 加载首个会话消息
          const msgs = await axios.get('/api/chat/messages', { params: { conversationId: list[0].id, limit: 200 } });
          const mapped = (msgs.data?.data || []).map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
          if (mapped.length > 0) setMessages(mapped);
        }
      } catch (_) {}
    })();
  }, []);

  const checkAIStatus = async () => {
    try {
      const response = await axios.get('/api/ai/status');
      setAiStatus(response.data.data);
      
      // 添加欢迎消息
      if (response.data.data.available) {
        setMessages([{
          role: 'assistant',
          content: '你好！我是AI交易助手。\n\n我可以帮你：\n• 分析市场趋势\n• 解读技术指标\n• 提供交易建议',
          timestamp: new Date().toISOString()
        }]);
      } else {
        setMessages([{
          role: 'assistant',
          content: 'AI对话功能暂时不可用\n\n' + response.data.data.message,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('检查AI状态失败:', error);
    }
  };

  const scrollToBottom = (smooth = true) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (!autoScroll) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = (el.scrollHeight - el.clientHeight - el.scrollTop) < 80;
    if (nearBottom) scrollToBottom();
  }, [messages, autoScroll]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const contextId = (()=>{ try { return Number(localStorage.getItem('active_memory_context_id')) || null; } catch(e){ return null; } })();
      const rawSymbol = (overrideSymbolRef.current || selectedSymbol) || undefined;
      const safeSymbol = rawSymbol ? String(rawSymbol).toUpperCase().replace('-', '/') : undefined;
      const symbolValid = !safeSymbol || /^[A-Z0-9]+\/[A-Z]+$/.test(safeSymbol);
      const payload = {
        message: input,
        symbol: symbolValid ? safeSymbol : undefined,
        includeContext,
        k: kCount,
        executionsK,
        contextId,
        includeOHLCV,
        timeframes,
        ohlcvLimit: ohlcvAll ? 'all' : Math.max(1, parseInt(ohlcvLimit)||200),
        ohlcvAttachMode,
        analysisId: analysisIdRef.current || undefined
      };
      const response = await axios.post('/api/ai/chat', payload);

      const assistantMessage = {
        role: 'assistant',
        content: cleanOutput ? sanitizeAIText(response.data.data.response) : response.data.data.response,
        mode: response.data.data.mode,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // 追加到历史
      try {
        if (activeConvId) {
          await axios.post('/api/chat/messages', { conversationId: activeConvId, role: 'user', content: userMessage.content });
          await axios.post('/api/chat/messages', { conversationId: activeConvId, role: 'assistant', content: assistantMessage.content });
        }
      } catch (_) {}
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: '抱歉，发生了错误：' + error.message,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      analysisIdRef.current = null;
      overrideSymbolRef.current = null;
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const openSettings = () => {
    try { window.dispatchEvent(new CustomEvent('open-settings')); } catch (_) {}
  };
  const runDiagnostics = async () => {
    try {
      setDiagRunning(true);
      setDiagMsg(null);
      const res = await axios.post('/api/settings/test-ai', {});
      if (res.data?.success) setDiagMsg({ type: 'ok', text: res.data?.message || 'AI连接测试成功' });
      else setDiagMsg({ type: 'err', text: res.data?.message || 'AI连接测试失败' });
    } catch (e) {
      setDiagMsg({ type: 'err', text: e.message });
    } finally {
      setDiagRunning(false);
    }
  };

  // 监听分析卡片“追问”事件，自动携带 analysisId 和 symbol
  useEffect(() => {
    const handler = (e) => {
      try {
        const { question, symbol, analysisId } = e.detail || {};
        if (symbol) overrideSymbolRef.current = symbol;
        if (analysisId) analysisIdRef.current = analysisId;
        setIncludeContext(true);
        if (question) {
          setInput(question);
          setTimeout(() => sendMessage(), 0);
        }
      } catch (_) {}
    };
    window.addEventListener('ai-follow-up', handler);
    return () => window.removeEventListener('ai-follow-up', handler);
  }, []);

  const applyResearchPreset = (on) => {
    setResearchMode(on);
    if (on) {
      setIncludeContext(true);
      setIncludeOHLCV(true);
      setTimeframes(['1m','5m','15m','1h','4h','1d']);
      setKCount(50);
      setExecutionsK(200);
      setOhlcvAll(false);
      setOhlcvLimit(2000);
      setOhlcvAttachMode('sampled');
    } else {
      setIncludeOHLCV(false);
      setTimeframes(['1h']);
      setKCount(5);
      setExecutionsK(50);
      setOhlcvAll(false);
      setOhlcvLimit(200);
      setOhlcvAttachMode('sampled');
    }
  };

  // 快捷问题
  const quickQuestions = [
    'BTC现在适合买入吗？',
    'RSI指标是什么意思？',
    'MACD金叉是什么信号？'
  ];

  return (
    <div className="space-y-3">
      {/* 标题栏 */}
      <div className="flex items-center justify-between min-w-0 gap-2">
        <h2 className="text-lg font-bold flex items-center space-x-2">
          <MessageCircle className="w-5 h-5 text-accent-primary" />
          <span className="whitespace-nowrap">AI对话</span>
        </h2>
        <div className="flex items-center gap-1 md:gap-2 justify-end max-w-full overflow-x-auto whitespace-nowrap">
          <button
            onClick={runDiagnostics}
            className="text-[11px] px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border/40"
            disabled={diagRunning}
            title="测试AI连接"
          >
            {diagRunning ? '诊断中…' : '测试连接'}
          </button>
          {/* 会话下拉与操作 */}
          <div className="hidden md:flex items-center gap-1 text-[11px]">
            <select
              value={activeConvId || ''}
              onChange={async (e) => {
                const id = Number(e.target.value) || null;
                setActiveConvId(id);
                if (id) {
                  try {
                    const msgs = await axios.get('/api/chat/messages', { params: { conversationId: id, limit: 200 } });
                    const mapped = (msgs.data?.data || []).map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
                    setMessages(mapped);
                    // 滚到底
                    setTimeout(() => scrollToBottom(false), 0);
                  } catch (_) {}
                }
              }}
              className="bg-dark-bg border border-dark-border rounded px-2 py-1 w-28"
              title="选择会话"
            >
              {conversations.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                try {
                  const created = await axios.post('/api/chat/conversations', { name: '新建会话' });
                  const id = created.data?.data?.id;
                  const res = await axios.get('/api/chat/conversations');
                  setConversations(res.data?.data || []);
                  setActiveConvId(id);
                  setMessages([]);
                } catch (_) {}
              }}
              className="px-2 py-1 border border-dark-border rounded hover:bg-dark-border inline-flex items-center whitespace-nowrap"
              title="新建会话"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden lg:inline ml-1">新建</span>
            </button>
            <button
              onClick={async () => {
                if (!activeConvId) return;
                try {
                  await axios.delete(`/api/chat/messages`, { params: { conversationId: activeConvId } });
                  setMessages([]);
                } catch (_) {}
              }}
              className="px-2 py-1 border border-dark-border rounded hover:bg-dark-border inline-flex items-center whitespace-nowrap"
              title="清空当前会话消息"
            >
              <Eraser className="w-3 h-3" />
              <span className="hidden lg:inline ml-1">清空</span>
            </button>
            <button
              onClick={async () => {
                if (!activeConvId) return;
                try {
                  await axios.delete(`/api/chat/conversations/${activeConvId}`);
                  const res = await axios.get('/api/chat/conversations');
                  const list = res.data?.data || [];
                  setConversations(list);
                  setActiveConvId(list[0]?.id || null);
                  if (list[0]?.id) {
                    const msgs = await axios.get('/api/chat/messages', { params: { conversationId: list[0].id, limit: 200 } });
                    const mapped = (msgs.data?.data || []).map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
                    setMessages(mapped);
                  } else {
                    setMessages([]);
                  }
                } catch (_) {}
              }}
              className="px-2 py-1 border border-red-900 text-red-400 rounded hover:bg-red-900/20 inline-flex items-center whitespace-nowrap"
              title="删除当前会话"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden lg:inline ml-1">删除</span>
            </button>
          </div>
          <button
            onClick={() => setShowSettings(v => !v)}
            className="p-1 hover:bg-dark-border rounded transition-colors shrink-0"
            title="聊天设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-dark-border rounded transition-colors shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* AI状态指示器 */}
          {aiStatus && aiStatus.available && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400">DeepSeek V3.2 在线</span>
              </div>
            </div>
          )}

          {/* 消息列表 */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-3">
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2" ref={messagesContainerRef}>
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start space-x-2 max-w-[85%] ${
                    msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}>
                    {/* 头像 */}
                    {msg.role === 'user' ? (
                      <div className="w-6 h-6 rounded-full bg-accent-primary flex items-center justify-center flex-shrink-0">
                        <User className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <img 
                        src="/ai-avatar.png" 
                        alt="AI" 
                        className="w-6 h-6 rounded-full flex-shrink-0 object-cover"
                      />
                    )}

                    {/* 消息内容 */}
                    <div className={`p-2 rounded-lg text-xs ${
                      msg.role === 'user'
                        ? 'bg-accent-primary text-white'
                        : msg.mode === 'error' || msg.mode === 'fallback'
                        ? 'bg-yellow-900/20 border border-yellow-500/30'
                        : 'bg-dark-bg'
                    }`}>
                      {(() => {
                        const isError = msg.mode === 'error';
                        if (!isError) {
                          return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
                        }
                        const summary = (() => {
                          try {
                            const firstLine = String(msg.content || '').split('\n')[0] || 'AI服务暂时不可用';
                            return firstLine.replace(/^⚠️\s*/,'');
                          } catch (_) {
                            return 'AI服务暂时不可用';
                          }
                        })();
                        const expanded = !!expandedErr[index];
                        return (
                          <div>
                            <div className="whitespace-pre-wrap break-words">
                              {expanded ? msg.content : `${summary}\n\n点击查看详情…`}
                            </div>
                            <button
                              onClick={() => setExpandedErr(prev => ({ ...prev, [index]: !prev[index] }))}
                              className="mt-1 text-[10px] text-yellow-400 hover:underline"
                            >
                              {expanded ? '收起详情' : '查看详情'}
                            </button>
                          </div>
                        );
                      })()}
                      <div className={`text-[10px] mt-1 ${
                        msg.role === 'user' ? 'text-white/60' : 'text-dark-muted'
                      }`}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-start space-x-2">
                    <img 
                      src="/ai-avatar.png" 
                      alt="AI" 
                      className="w-6 h-6 rounded-full object-cover animate-pulse"
                    />
                    <div className="bg-dark-bg p-2 rounded-lg">
                      <div className="flex space-x-1">
                        <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 底部占位用于保持内边距 */}
              <div style={{ height: 2 }} />
            </div>
          </div>
      {diagMsg && (
        <div className={`mt-2 p-2 rounded text-xs ${diagMsg.type==='ok'?'bg-green-500/10 text-green-400 border border-green-500/30':'bg-red-500/10 text-red-400 border border-red-500/30'}`}>{diagMsg.text}</div>
      )}

      {/* 输入区与设置 */}
          <div className="bg-dark-card border border-dark-border rounded-lg p-2">
            <div className="flex items-center gap-2 mb-2 text-[11px] text-dark-muted flex-wrap">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={includeContext} onChange={(e)=>setIncludeContext(e.target.checked)} />
                <span>携带上下文</span>
              </label>
              <span className="px-1.5 py-0.5 bg-dark-bg rounded">{(overrideSymbolRef.current || selectedSymbol) || '未选交易对'}</span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={cleanOutput} onChange={(e)=>setCleanOutput(e.target.checked)} />
                <span>净化显示</span>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={autoScroll} onChange={(e)=>setAutoScroll(e.target.checked)} />
                <span>自动滚动</span>
              </label>
              <label className="hidden md:flex items-center gap-1">
                <span>分析K</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={kCount}
                  onChange={(e)=>setKCount(Math.max(1, Math.min(1000, parseInt(e.target.value)||5)))}
                  className="w-14 bg-dark-bg border border-dark-border rounded px-1 py-0.5"
                />
              </label>
              <label className="hidden md:flex items-center gap-1">
                <span>执行K</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={executionsK}
                  onChange={(e)=>setExecutionsK(Math.max(1, Math.min(1000, parseInt(e.target.value)||50)))}
                  className="w-16 bg-dark-bg border border-dark-border rounded px-1 py-0.5"
                />
              </label>
            </div>
            {/* K线设置（折叠） */}
            {showSettings && (
            <div className="flex items-center gap-2 mb-2 text-[11px] text-dark-muted flex-wrap">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={includeOHLCV} onChange={(e)=>setIncludeOHLCV(e.target.checked)} />
                <span>包含OHLCV</span>
              </label>
              <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
                <span>timeframes</span>
                {['1m','5m','15m','30m','1h','4h','1d'].map(tf => (
                  <button
                    key={tf}
                    onClick={()=> setTimeframes(prev => prev.includes(tf) ? prev.filter(x=>x!==tf) : [...prev, tf])}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded border ${timeframes.includes(tf) ? 'border-accent-primary text-accent-primary' : 'border-dark-border text-dark-muted'} bg-dark-bg`}
                  >{tf}</button>
                ))}
              </div>
              <label className="flex items-center gap-1">
                <span>根数</span>
                <input
                  type="number"
                  min="1"
                  max="5000"
                  value={ohlcvLimit}
                  onChange={(e)=>setOhlcvLimit(Math.max(1, Math.min(5000, parseInt(e.target.value)||200)))}
                  className="w-20 bg-dark-bg border border-dark-border rounded px-1 py-0.5"
                  disabled={ohlcvAll}
                />
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={ohlcvAll} onChange={(e)=>setOhlcvAll(e.target.checked)} /> 全量
                </label>
              </label>
              <label className="flex items-center gap-1">
                <span>附带</span>
                <select
                  value={ohlcvAttachMode}
                  onChange={(e)=>setOhlcvAttachMode(e.target.value)}
                  className="bg-dark-bg border border-dark-border rounded px-1 py-0.5"
                >
                  <option value="none">不附带</option>
                  <option value="head">前30</option>
                  <option value="tail">后30</option>
                  <option value="sampled">采样200</option>
                  <option value="full">全部</option>
                </select>
              </label>
              <button onClick={()=>applyResearchPreset(!researchMode)} className={`px-2 py-1 rounded border ${researchMode ? 'border-accent-primary text-accent-primary' : 'border-dark-border text-dark-muted'} bg-dark-bg`}>{researchMode ? '关闭研究模式' : '开启研究模式'}</button>
              <button onClick={()=>setShowPreview(v=>!v)} className="px-2 py-1 rounded border border-dark-border bg-dark-bg">{showPreview ? '隐藏预览' : '预览上下文'}</button>
            </div>
            )}
            {showPreview && (
              <div className="mb-2 bg-dark-bg p-2 rounded border border-dark-border text-[10px] whitespace-pre-wrap">
                {`上下文配置:\n- symbol: ${(overrideSymbolRef.current || selectedSymbol) || '-'}\n- 分析K: ${kCount} 条\n- 执行K: ${executionsK} 条\n- 包含OHLCV: ${includeOHLCV}\n- TF: ${timeframes.join(', ')}\n- 根数: ${ohlcvAll ? 'all' : ohlcvLimit}\n- 附带: ${ohlcvAttachMode}\n- analysisId: ${analysisIdRef.current || '-'}\n`}
              </div>
            )}
            <div className="flex space-x-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={aiStatus?.available ? "输入你的问题..." : "AI暂不可用"}
                className="input flex-1 resize-none text-sm"
                rows="2"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="btn-primary px-3 flex items-center justify-center"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
            <div className="mt-1 text-[10px] text-dark-muted">
              Enter发送 • Shift+Enter换行
            </div>
          </div>

          {/* 快捷问题 */}
          {messages.length <= 2 && (
            <div className="space-y-1">
              <div className="text-xs text-dark-muted">快捷问题：</div>
              <div className="flex flex-col gap-1">
                {quickQuestions.map((question, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(question)}
                    className="text-xs px-2 py-1 bg-dark-bg hover:bg-dark-border rounded text-left transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CompactAIChatPanel;

