import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MessageCircle, Send, Bot, User, AlertCircle, CheckCircle, MessageSquare, X, Loader2, ChevronRight, ChevronDown, Copy } from 'lucide-react';
import ModelNarrativeCard from './ModelNarrativeCard';
import CompactAIChatPanel from './CompactAIChatPanel';

function AIChatPanel({ selectedSymbol }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const messagesEndRef = useRef(null);
  const [showEdgeChat, setShowEdgeChat] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagMsg, setDiagMsg] = useState(null);
  const [showErrDetail, setShowErrDetail] = useState(false);
  const [expandedErr, setExpandedErr] = useState({});

  // 检查AI服务状态
  useEffect(() => {
    checkAIStatus();
  }, []);

  const checkAIStatus = async () => {
    try {
      const response = await axios.get('/api/ai/status');
      setAiStatus(response.data.data);
      
      // 添加欢迎消息
      if (response.data.data.available) {
        setMessages([{
          role: 'assistant',
          content: '你好！我是AI交易助手，有什么可以帮你的吗？\n\n我可以帮你：\n• 分析市场趋势\n• 解读技术指标\n• 提供交易建议\n• 回答加密货币相关问题',
          timestamp: new Date().toISOString()
        }]);
      } else {
        // 不把冗长错误直接塞进消息流，避免刷屏；给一条温和提示即可
        setMessages([{
          role: 'assistant',
          content: 'AI服务暂不可用，但系统交易与技术分析功能一切正常。',
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('检查AI状态失败:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const openSettings = () => {
    try { window.dispatchEvent(new CustomEvent('open-settings')); } catch (_) {}
  };

  const runDiagnostics = async () => {
    try {
      setDiagRunning(true);
      setDiagMsg(null);
      const res = await axios.post('/api/settings/test-ai', {});
      if (res.data?.success) {
        setDiagMsg({ type: 'ok', text: res.data?.message || 'AI连接测试成功' });
      } else {
        setDiagMsg({ type: 'err', text: res.data?.message || 'AI连接测试失败' });
      }
    } catch (e) {
      setDiagMsg({ type: 'err', text: e.message });
    } finally {
      setDiagRunning(false);
    }
  };

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
      const response = await axios.post('/api/ai/chat', {
        message: input,
        symbol: selectedSymbol || undefined
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.data.data.response,
        mode: response.data.data.mode,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: '抱歉，发生了错误：' + error.message,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 右侧浮动：模型自述卡片 */}
      <ModelNarrativeCard selectedSymbol={selectedSymbol} />

      {/* 右下角浮动：AI对话卡片开关 */}
      <button
        onClick={() => setShowEdgeChat(true)}
        className={`fixed right-2 bottom-24 z-40 bg-accent-primary text-white px-3 py-2 rounded-l ${showEdgeChat ? 'hidden' : ''}`}
        title="AI对话"
      >
        <MessageSquare className="w-4 h-4" />
      </button>
      {showEdgeChat && (
        <div className="fixed right-2 bottom-4 z-50 w-96 max-w-[90vw] bg-dark-card border border-dark-border rounded-lg shadow-xl">
          <div className="flex items-center justify-between p-2 border-b border-dark-border">
            <div className="text-sm font-semibold">AI对话</div>
            <button onClick={() => setShowEdgeChat(false)} className="p-1 hover:bg-dark-border rounded" title="关闭">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-2">
            <CompactAIChatPanel />
          </div>
        </div>
      )}
      {/* 状态与诊断 */}
      <div className="mb-4 space-y-2">
        {aiStatus && aiStatus.available && (
          <div className="card border-green-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <img 
                  src="/ai-avatar.png" 
                  alt="AI" 
                  className="w-10 h-10 rounded-lg object-cover"
                />
                <div>
                  <div className="font-semibold">AI对话助手</div>
                  <div className="text-sm text-dark-muted">DeepSeek V3.2 运行中</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={runDiagnostics} className="text-xs px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border/40" disabled={diagRunning}>
                  {diagRunning ? '诊断中…' : '测试连接'}
                </button>
                <button onClick={openSettings} className="text-xs px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border/40">
                  打开设置
                </button>
              </div>
            </div>
          </div>
        )}
        {/* 错误提示条 */}
        {(!aiStatus || !aiStatus.available) && (
          <div className="p-3 rounded-lg bg-yellow-900/15 border border-yellow-500/30">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm leading-relaxed">
                <div className="font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                  AI服务暂不可用
                </div>
                <div className="text-dark-muted mt-1">
                  你仍可使用行情、指标与交易功能；建议先“测试连接”，或稍后重试。
                </div>
                {aiStatus?.message && (
                  <div className="mt-2">
                    <button
                      className="text-xs text-yellow-400 hover:underline inline-flex items-center gap-1"
                      onClick={() => setShowErrDetail(v => !v)}
                    >
                      {showErrDetail ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      查看错误详情
                    </button>
                    {showErrDetail && (
                      <div className="mt-2 bg-dark-bg border border-dark-border rounded p-2 text-xs relative max-h-60 overflow-auto">
                        <pre className="whitespace-pre-wrap break-words leading-5 text-yellow-200/80">{aiStatus.message}</pre>
                        <button
                          onClick={() => { try { navigator.clipboard.writeText(aiStatus.message || ''); } catch (_) {} }}
                          className="absolute right-2 top-2 text-dark-muted hover:text-white"
                          title="复制错误"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={checkAIStatus} className="text-xs px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border/40">
                  重试
                </button>
                <button onClick={runDiagnostics} className="text-xs px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border/40" disabled={diagRunning}>
                  {diagRunning ? '诊断中…' : '测试连接'}
                </button>
                <button onClick={openSettings} className="text-xs px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border/40">
                  打开设置
                </button>
              </div>
            </div>
          </div>
        )}
        {diagMsg && (
          <div className={`p-2 rounded text-xs ${diagMsg.type==='ok'?'bg-green-500/10 text-green-400 border border-green-500/30':'bg-red-500/10 text-red-400 border border-red-500/30'}`}>{diagMsg.text}</div>
        )}
      </div>

      {/* 聊天区域 */}
      <div className="card flex-1 flex flex-col" style={{ minHeight: '500px' }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center space-x-2">
            <MessageCircle className="w-5 h-5 text-accent-primary" />
            <span>AI对话测试</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border/40"
              onClick={() => setMessages([])}
              title="清空会话"
            >
              清空
            </button>
            <button
              className="text-xs px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border/40"
              onClick={() => { try { navigator.clipboard.writeText(messages.map(m => `[${m.role}] ${m.content}`).join('\n\n')); } catch (_) {} }}
              title="复制会话"
            >
              复制
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-start space-x-2 max-w-[80%] ${
                msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}>
                {/* 头像 */}
                {msg.role === 'user' ? (
                  <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <img 
                    src="/ai-avatar.png" 
                    alt="AI" 
                    className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                  />
                )}

                {/* 消息内容 */}
                <div className={`p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-accent-primary text-white'
                    : msg.mode === 'error' || msg.mode === 'fallback'
                    ? 'bg-yellow-900/20 border border-yellow-500/30'
                    : 'bg-dark-bg'
                }`}>
                  {(() => {
                    const isError = msg.mode === 'error';
                    if (!isError) {
                      return <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>;
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
                        <div className="text-sm whitespace-pre-wrap break-words">
                          {expanded ? msg.content : `${summary}\n\n点击查看详情…`}
                        </div>
                        <button
                          onClick={() => setExpandedErr(prev => ({ ...prev, [index]: !prev[index] }))}
                          className="mt-1 text-xs text-yellow-400 hover:underline"
                        >
                          {expanded ? '收起详情' : '查看详情'}
                        </button>
                      </div>
                    );
                  })()}
                  <div className={`text-xs mt-1 ${
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
                  className="w-8 h-8 rounded-full object-cover animate-pulse"
                />
                <div className="bg-dark-bg p-3 rounded-lg">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-accent-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div className="border-t border-dark-border pt-4 sticky bottom-0 bg-dark-card">
          <div className="flex space-x-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={aiStatus?.available ? "输入你的问题..." : "AI暂不可用，但你可以使用Trading面板获取交易信号"}
              className="input flex-1 resize-none"
              rows="2"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="btn-primary px-4 flex items-center justify-center"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="mt-2 text-xs text-dark-muted">
            Enter 发送，Shift + Enter 换行
          </div>
        </div>

        {/* 快捷问题 */}
        {messages.length <= 2 && (
          <div className="mt-4 border-t border-dark-border pt-4">
            <div className="text-sm text-dark-muted mb-2">试试这些问题：</div>
            <div className="flex flex-wrap gap-2">
              {[
                'BTC现在适合买入吗？',
                'RSI指标是什么意思？',
                'MACD金叉是什么信号？',
                '如何设置止损止盈？'
              ].map((question, i) => (
                <button
                  key={i}
                  onClick={() => setInput(question)}
                  className="text-xs px-3 py-1 bg-dark-bg hover:bg-dark-border rounded-full transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AIChatPanel;

