import React, { useState, useEffect, useRef } from 'react';
import { Settings, Key, Shield, Save, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import axios from 'axios';

function SettingsPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('ai');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showKeys, setShowKeys] = useState({
    deepseek: false,
    okxApi: false,
    okxSecret: false,
    okxPassphrase: false
  });

  // 已保存标记（用以占位提示且避免覆盖）
  const [savedFlags, setSavedFlags] = useState({
    deepseekApiKeySaved: false,
    okxApiKeySaved: false,
    okxSecretSaved: false,
    okxPassSaved: false
  });

  const [showAiPanel, setShowAiPanel] = useState(true);
  const [showOkxQuick, setShowOkxQuick] = useState(false);
  const [searchText, setSearchText] = useState('');
  const aiSectionRef = useRef(null);
  const okxQuickRef = useRef(null);
  const aiKeyRef = useRef(null);
  const aiUrlRef = useRef(null);
  const endpointUrlRef = useRef(null);
  const aiModelRef = useRef(null);
  const okxApiRef = useRef(null);
  const okxSecretRef = useRef(null);
  const okxPassRef = useRef(null);

  // AI密钥配置
  const [aiConfig, setAiConfig] = useState({
    deepseekApiKey: '',
    deepseekBaseUrl: 'https://apis.iflow.cn/v1',
    endpointUrl: '',
    endpointPath: '/v1/chat/completions',
    modelName: 'deepseek-v3.2',
    customModel: '',  // 自定义模型名称
    availableModels: [] // 可用模型列表
  });

  // OKX密钥配置
  const [okxConfig, setOkxConfig] = useState({
    apiKey: '',
    secretKey: '',
    passphrase: '',
    testnet: false,
    enableRealTrading: false
  });

  // 校准与风险参数
  const [targetWinRate, setTargetWinRate] = useState(0.55);
  const [riskParams, setRiskParams] = useState({ drawdownL2: -1.5, drawdownL3: -3, consecutiveLossBase: 0.8 });

  const [antiTrendParams, setAntiTrendParams] = useState({ hardGatePct: 85, softPenaltyPct: 70, softPenaltyAdd: 10 });

  // 加载现有配置
  useEffect(() => {
    loadSettings();
  }, []);

  // 键盘 ESC 关闭弹窗
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/settings/keys');
      if (response.data.success) {
        const { ai, okx } = response.data.data;
        if (ai) {
          setAiConfig({
            deepseekApiKey: '', // 永远不回填密钥，避免覆盖
            deepseekBaseUrl: ai.deepseekBaseUrl || 'https://api.deepseek.com',
            endpointUrl: ai.endpointUrl || '',
            endpointPath: ai.endpointPath || '/v1/chat/completions',
            modelName: ai.modelName || 'deepseek-chat',
            customModel: ai.customModel || '',
            availableModels: ai.availableModels || []
          });
          setSavedFlags(prev => ({
            ...prev,
            deepseekApiKeySaved: !!ai.deepseekApiKeySaved
          }));
        }
        if (okx) {
          setOkxConfig({
            apiKey: '', // 不回填
            secretKey: '', // 不回填
            passphrase: '', // 不回填
            testnet: !!(okx.testnet === '1' || okx.testnet === 1 || okx.testnet === true),
            enableRealTrading: !!(okx.enableRealTrading === '1' || okx.enableRealTrading === 1 || okx.enableRealTrading === true)
          });
          setSavedFlags(prev => ({
            ...prev,
            okxApiKeySaved: !!okx.apiKeySaved,
            okxSecretSaved: !!okx.secretKeySaved,
            okxPassSaved: !!okx.passphraseSaved
          }));
        }
      }
    } catch (error) {
      showMessage('加载配置失败: ' + error.message, 'error');

    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const toggleKeyVisibility = (key) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const scrollToRef = (ref) => {
    try { ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
  };

  const handleSearch = () => {
    const q = (searchText || '').toLowerCase();
    const go = (ref, openAi = false, openOkx = false) => {
      if (openAi) setShowAiPanel(true);
      if (openOkx) setShowOkxQuick(true);
      setTimeout(() => {
        scrollToRef(ref);
        try { ref?.current?.focus?.(); } catch (_) {}
      }, 0);
    };
    if (!q) return go(aiSectionRef, true, false);
    if (q.includes('okx')) {
      if (q.includes('secret') || q.includes('秘') || q.includes('密钥2')) return go(okxSecretRef, false, true);
      if (q.includes('pass') || q.includes('phrase') || q.includes('密码')) return go(okxPassRef, false, true);
      return go(okxApiRef, false, true);
    }
    if (q.includes('端点') || q.includes('endpoint')) return go(endpointUrlRef, true, false);
    if (q.includes('url') || q.includes('api基础') || q.includes('基础url')) return go(aiUrlRef, true, false);
    if (q.includes('模型') || q.includes('model')) return go(aiModelRef, true, false);
    if (q.includes('key') || q.includes('密钥') || q.includes('sk')) return go(aiKeyRef, true, false);
    return go(aiSectionRef, true, false);
  };

  const saveAiConfig = async () => {
    try {
      setLoading(true);
      const payload = {
        deepseekBaseUrl: aiConfig.deepseekBaseUrl,
        endpointUrl: aiConfig.endpointUrl,
        endpointPath: aiConfig.endpointPath,
        modelName: aiConfig.customModel || aiConfig.modelName,
      };
      if (aiConfig.deepseekApiKey && aiConfig.deepseekApiKey.trim()) {
        payload.deepseekApiKey = aiConfig.deepseekApiKey.trim();
      }
      const response = await axios.post('/api/settings/ai-keys', payload);
      if (response.data.success) {

        showMessage('AI配置保存成功', 'success');
        setAiConfig(prev => ({ ...prev, deepseekApiKey: '' }));
        setSavedFlags(prev => ({ ...prev, deepseekApiKeySaved: true }));
      }
    } catch (error) {
      showMessage('保存失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 获取可用模型列表
  const fetchAvailableModels = async () => {
    try {
      setLoading(true);
      const response = await axios.post('/api/settings/fetch-models', {
        apiKey: aiConfig.deepseekApiKey,
        baseUrl: aiConfig.deepseekBaseUrl
      });
      if (response.data.success) {
        setAiConfig(prev => ({
          ...prev,
          availableModels: response.data.models || [],
          modelName: response.data.models?.[0]?.id || prev.modelName
        }));
        showMessage(`获取到 ${response.data.models?.length || 0} 个可用模型`, 'success');
      } else {
        showMessage('获取模型列表失败: ' + response.data.message, 'error');
      }
    } catch (error) {
      showMessage('获取模型失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveOkxConfig = async () => {
    try {
      setLoading(true);
      const payload = {
        testnet: !!okxConfig.testnet,
        enableRealTrading: !!okxConfig.enableRealTrading,
      };
      if (okxConfig.apiKey && okxConfig.apiKey.trim()) payload.apiKey = okxConfig.apiKey.trim();
      if (okxConfig.secretKey && okxConfig.secretKey.trim()) payload.secretKey = okxConfig.secretKey.trim();
      if (okxConfig.passphrase && okxConfig.passphrase.trim()) payload.passphrase = okxConfig.passphrase.trim();
      const response = await axios.post('/api/settings/okx-keys', payload);
      if (response.data.success) {
        showMessage('OKX配置保存成功', 'success');
        setOkxConfig(prev => ({ ...prev, apiKey: '', secretKey: '', passphrase: '' }));
        setSavedFlags(prev => ({ ...prev, okxApiKeySaved: payload.apiKey ? true : prev.okxApiKeySaved, okxSecretSaved: payload.secretKey ? true : prev.okxSecretSaved, okxPassSaved: payload.passphrase ? true : prev.okxPassSaved }));
      }
    } catch (error) {
      showMessage('保存失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testAiConnection = async () => {
    try {
      setLoading(true);
      const response = await axios.post('/api/settings/test-ai', aiConfig);
      if (response.data.success) {
        showMessage('AI连接测试成功', 'success');
      } else {
        showMessage('AI连接测试失败: ' + response.data.message, 'error');
      }
    } catch (error) {
      showMessage('测试失败: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testOkxConnection = async () => {
    try {
      setLoading(true);
      const response = await axios.post('/api/settings/test-okx', okxConfig);
      if (response.data.success) {
        showMessage('OKX连接测试成功', 'success');
      } else {
        showMessage('OKX连接测试失败: ' + response.data.message, 'error');
      }
    } catch (error) {
      showMessage('测试失败: ' + error.message, 'error');

    } finally {
      setLoading(false);
    }
  };

  // ---- AI校准&风险参数：加载/保存 ----
  const fetchValidationTarget = async () => {
    try {
      const r = await axios.get('/api/settings/ai/validation-target');
      const v = Number(r.data?.data?.targetWinRate);
      if (Number.isFinite(v)) setTargetWinRate(v);
    } catch (_) {}
  };

  const saveValidationTarget = async () => {
    try {
      setLoading(true);
      const v = Number(targetWinRate);
      const resp = await axios.post('/api/settings/ai/validation-target', { targetWinRate: v });
      if (resp.data?.success) showMessage('目标胜率已更新', 'success');
    } catch (e) {
      showMessage('保存失败: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRiskParams = async () => {
    try {
      const r = await axios.get('/api/settings/risk/params');
      const d = r.data?.data || {};
      setRiskParams({
        drawdownL2: Number(d.drawdownL2 ?? -1.5),
        drawdownL3: Number(d.drawdownL3 ?? -3),
        consecutiveLossBase: Number(d.consecutiveLossBase ?? 0.8),
      });
    } catch (_) {}
  };

  const saveRiskParams = async () => {
    try {
      setLoading(true);
      const payload = { ...riskParams };
      const resp = await axios.post('/api/settings/risk/params', payload);
      if (resp.data?.success) showMessage('风险参数已更新', 'success');
    } catch (e) {
      showMessage('保存失败: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAntiTrendParams = async () => {
    try {
      const r = await axios.get('/api/settings/ai/anti-trend');
      const d = r.data?.data || {};
      setAntiTrendParams({
        hardGatePct: Number(d.hardGatePct ?? 85),
        softPenaltyPct: Number(d.softPenaltyPct ?? 70),
        softPenaltyAdd: Number(d.softPenaltyAdd ?? 10),
      });
    } catch (_) {}
  };

  const saveAntiTrendParams = async () => {
    try {
      setLoading(true);
      const payload = { ...antiTrendParams };
      const resp = await axios.post('/api/settings/ai/anti-trend', payload);
      if (resp.data?.success) showMessage('反趋势参数已更新', 'success');
    } catch (e) {
      showMessage('保存失败: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValidationTarget();
    fetchRiskParams();
    fetchAntiTrendParams();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="系统设置" data-testid="settings-modal">
      <div className="bg-dark-card border border-dark-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden relative shadow-2xl m-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-border">
          <div className="flex items-center space-x-3">
            <Settings className="w-6 h-6 text-accent-primary" />
            <h2 className="text-xl font-bold">系统设置</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-500 transition-all"
            title="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-6 mt-4 p-3 rounded-lg flex items-center space-x-2 ${
            message.type === 'error' ? 'bg-red-500/20 border border-red-500' : 'bg-green-500/20 border border-green-500'
          }`}>
            {message.type === 'error' ?
              <AlertCircle className="w-5 h-5 text-red-500" /> :
              <CheckCircle className="w-5 h-5 text-green-500" />
            }
            <span className="text-sm">{message.text}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-dark-border">
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'ai'
                ? 'text-accent-primary border-b-2 border-accent-primary'
                : 'text-dark-muted hover:text-white'
            }`}
          >
            AI配置
          </button>
          <button
            onClick={() => setActiveTab('okx')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'okx'
                ? 'text-accent-primary border-b-2 border-accent-primary'

                : 'text-dark-muted hover:text-white'
            }`}
          >
            OKX配置
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {activeTab === 'ai' && (
            <div className="space-y-6">
              <div className="-mx-6 px-6 bg-dark-card/50 border-b border-dark-border py-2 flex items-center gap-2">
                <button
                  onClick={() => { setShowAiPanel(true); scrollToRef(aiSectionRef); }}
                  className="px-3 py-1 text-sm rounded-lg bg-dark-bg border border-dark-border hover:border-accent-primary transition-colors"
                >
                  AI API
                </button>
                <button
                  onClick={() => { setShowOkxQuick(true); setTimeout(() => scrollToRef(okxQuickRef), 0); }}
                  className="px-3 py-1 text-sm rounded-lg bg-dark-bg border border-dark-border hover:border-accent-primary transition-colors"
                >
                  OKX 快捷
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                    placeholder="搜索: API密钥/URL/模型/OKX..."
                    className="px-3 py-1 text-sm bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none w-56"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-3 py-1 text-sm rounded-lg bg-accent-primary hover:bg-accent-secondary transition-colors"
                  >定位</button>
                </div>
              </div>

              <div ref={aiSectionRef} className="scroll-mt-4 pt-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">AI API 配置</h3>
                  <button
                    onClick={() => setShowAiPanel(v => !v)}
                    className="text-sm text-accent-primary hover:text-accent-secondary"
                  >{showAiPanel ? '收起' : '展开'}</button>
                </div>
                {showAiPanel && (

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">自定义端点URL</label>
                    <input
                      type="text"
                      value={aiConfig.endpointUrl}
                      onChange={(e)=>setAiConfig({...aiConfig, endpointUrl: e.target.value})}
                      placeholder="https://your.domain.com/v1/chat/completions"
                      className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none"
                      ref={endpointUrlRef}
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-dark-muted">填写完整端点则优先使用该URL，忽略基础URL与路径。</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">API密钥</label>
                    <div className="relative">
                      <input
                        type={showKeys.deepseek ? "text" : "password"}
                        value={aiConfig.deepseekApiKey}
                        onChange={(e) => setAiConfig({...aiConfig, deepseekApiKey: e.target.value})}
                        placeholder={savedFlags.deepseekApiKeySaved ? "已保存，留空不修改" : "sk-..."}
                        className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none pr-12"
                        ref={aiKeyRef}
                      />
                      <button
                        onClick={() => toggleKeyVisibility('deepseek')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-white"
                      >
                        {showKeys.deepseek ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">模型选择</label>
                    <div className="flex space-x-2">
                      <select
                        value={aiConfig.modelName}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'custom') {
                            setAiConfig({...aiConfig, modelName: value, customModel: ''});
                          } else {
                            setAiConfig({...aiConfig, modelName: value, customModel: ''});
                          }
                        }}
                        className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none"
                        ref={aiModelRef}
                      >
                        <option value="deepseek-chat">DeepSeek Chat</option>
                        <option value="deepseek-v3">DeepSeek V3</option>
                        <option value="deepseek-v3.2">DeepSeek V3.2</option>
                        <option value="deepseek-coder">DeepSeek Coder</option>
                        <option value="gpt-4">GPT-4</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        <option value="claude-3-opus">Claude 3 Opus</option>
                        <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                        {aiConfig.availableModels?.map(model => (
                          <option key={model.id} value={model.id}>{model.id}</option>
                        ))}
                        <option value="custom">自定义模型...</option>
                      </select>
                      {aiConfig.modelName === 'custom' && (
                        <input
                          type="text"
                          value={aiConfig.customModel}
                          onChange={(e) => setAiConfig({...aiConfig, customModel: e.target.value})}
                          placeholder="输入模型名称"
                          className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none"
                        />
                      )}
                    </div>
                    <div className="mt-2">
                      <button
                        onClick={fetchAvailableModels}
                        disabled={loading || !aiConfig.deepseekApiKey || !aiConfig.deepseekBaseUrl}
                        className="text-sm text-accent-primary hover:text-accent-secondary transition-colors disabled:opacity-50"
                      >
                        获取可用模型列表
                      </button>
                    </div>
                  </div>

                  <div className="flex space-x-4">
                    <button
                      onClick={saveAiConfig}
                      disabled={loading}
                      className="flex items-center space-x-2 px-6 py-2 bg-accent-primary rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>保存配置</span>
                    </button>
                    <button
                      onClick={testAiConnection}
                      disabled={loading || !aiConfig.deepseekApiKey}
                      className="flex items-center space-x-2 px-6 py-2 bg-dark-bg border border-dark-border rounded-lg hover:bg-dark-border transition-colors disabled:opacity-50"
                    >
                      <Shield className="w-4 h-4" />
                      <span>测试连接</span>
                    </button>
                  </div>
                </div>
                )}
              </div>


	              {/* AI校准 & 风险参数 */}
	              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
	                <div className="p-4 rounded-lg border border-dark-border bg-dark-card/50">
	                  <h4 className="text-sm font-semibold mb-2">AI 校准目标胜率</h4>
	                  <div className="flex items-center gap-2">
	                    <input
	                      type="number"
	                      step="0.01"
	                      min="0.01"
	                      max="0.99"
	                      value={targetWinRate}
	                      onChange={(e)=>setTargetWinRate(Number(e.target.value))}
	                      className="px-3 py-2 w-28 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none"
	                    />
	                    <span className="text-xs text-dark-muted">0-1 小数，例如 0.60 表示 60%</span>
	                  </div>
	                  <div className="mt-3">
	                    <button onClick={saveValidationTarget} disabled={loading} className="text-xs px-3 py-1 rounded bg-accent-primary hover:bg-accent-secondary disabled:opacity-50">保存</button>
	                  </div>


	                </div>
	                <div className="p-4 rounded-lg border border-dark-border bg-dark-card/50">
	                  <h4 className="text-sm font-semibold mb-2">风险参数</h4>
	                  <div className="grid grid-cols-3 gap-2">
	                    <div>
	                      <label className="block text-[11px] text-dark-muted mb-1">L2 回撤阈值(%)</label>
	                      <input type="number" step="0.1" value={riskParams.drawdownL2}
	                        onChange={(e)=>setRiskParams({...riskParams, drawdownL2: Number(e.target.value)})}
	                        className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded" />
	                    </div>
	                    <div>
	                      <label className="block text-[11px] text-dark-muted mb-1">L3 回撤阈值(%)</label>
	                      <input type="number" step="0.1" value={riskParams.drawdownL3}
	                        onChange={(e)=>setRiskParams({...riskParams, drawdownL3: Number(e.target.value)})}
	                        className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded" />
	                    </div>
	                    <div>
	                      <label className="block text-[11px] text-dark-muted mb-1">连亏缩放基数</label>
	                      <input type="number" step="0.01" min="0.1" max="0.99" value={riskParams.consecutiveLossBase}
	                        onChange={(e)=>setRiskParams({...riskParams, consecutiveLossBase: Number(e.target.value)})}
	                        className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded" />
	                    </div>
	                  </div>
	                  <div className="mt-3">
	                    <button onClick={saveRiskParams} disabled={loading} className="text-xs px-3 py-1 rounded bg-accent-primary hover:bg-accent-secondary disabled:opacity-50">保存</button>
	                  </div>
	                </div>
	              </div>

			      {/* 反趋势保护参数 */}
			      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
			        <div className="p-4 rounded-lg border border-dark-border bg-dark-card/50">
			          <h4 className="text-sm font-semibold mb-2">反趋势保护</h4>
			          <div className="grid grid-cols-3 gap-2">
			            <div>
			              <label className="block text-[11px] text-dark-muted mb-1">硬门槛阈值(%)</label>
			              <input type="number" min="0" max="100" step="1" value={antiTrendParams.hardGatePct}
			                onChange={(e)=>setAntiTrendParams({...antiTrendParams, hardGatePct: Number(e.target.value)})}
			                className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded" />
			            </div>
			            <div>
			              <label className="block text-[11px] text-dark-muted mb-1">软惩罚阈值(%)</label>
			              <input type="number" min="0" max="100" step="1" value={antiTrendParams.softPenaltyPct}
			                onChange={(e)=>setAntiTrendParams({...antiTrendParams, softPenaltyPct: Number(e.target.value)})}
			                className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded" />
			            </div>
			            <div>
			              <label className="block text-[11px] text-dark-muted mb-1">上调幅度(pp)</label>
			              <input type="number" min="0" max="50" step="1" value={antiTrendParams.softPenaltyAdd}
			                onChange={(e)=>setAntiTrendParams({...antiTrendParams, softPenaltyAdd: Number(e.target.value)})}
			                className="w-full px-2 py-1 bg-dark-bg border border-dark-border rounded" />
			            </div>
			          </div>
			          <div className="mt-3 flex items-center gap-2">
			            <button onClick={saveAntiTrendParams} disabled={loading} className="text-xs px-3 py-1 rounded bg-accent-primary hover:bg-accent-secondary disabled:opacity-50">保存</button>
			            <span className="text-[11px] text-dark-muted">说明：达到“硬门槛”时直接 HOLD；达到“软惩罚阈值”时提升最低置信阈值 +pp</span>
			          </div>
			        </div>
			      </div>


              <div ref={okxQuickRef} className="mt-8 border-t border-dark-border pt-6 scroll-mt-20">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">OKX 实盘API 快捷设置</h3>
                  <button
                    onClick={() => setShowOkxQuick(v => !v)}
                    className="text-sm text-accent-primary hover:text-accent-secondary"
                  >
                    {showOkxQuick ? '收起' : '展开'}
                  </button>
                </div>
                {showOkxQuick && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">API Key</label>
                    <div className="relative">
                      <input
                        type={showKeys.okxApi ? "text" : "password"}
                        value={okxConfig.apiKey}
                        onChange={(e) => setOkxConfig({ ...okxConfig, apiKey: e.target.value })}
                        placeholder={savedFlags.okxApiKeySaved ? "已保存，留空不修改" : "输入OKX API Key"}
                        className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none pr-12"
                        ref={okxApiRef}
                      />
                      <button
                        onClick={() => toggleKeyVisibility('okxApi')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-white"
                      >
                        {showKeys.okxApi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>

                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Secret Key</label>
                    <div className="relative">
                      <input
                        type={showKeys.okxSecret ? "text" : "password"}
                        value={okxConfig.secretKey}
                        onChange={(e) => setOkxConfig({ ...okxConfig, secretKey: e.target.value })}
                        placeholder={savedFlags.okxSecretSaved ? "已保存，留空不修改" : "输入OKX Secret Key"}
                        className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none pr-12"
                        ref={okxSecretRef}
                      />
                      <button
                        onClick={() => toggleKeyVisibility('okxSecret')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-white"
                      >
                        {showKeys.okxSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Passphrase</label>
                    <div className="relative">
                      <input
                        type={showKeys.okxPassphrase ? "text" : "password"}
                        value={okxConfig.passphrase}
                        onChange={(e) => setOkxConfig({ ...okxConfig, passphrase: e.target.value })}
                        placeholder={savedFlags.okxPassSaved ? "已保存，留空不修改" : "输入OKX Passphrase"}
                        className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none pr-12"
                        ref={okxPassRef}
                      />
                      <button
                        onClick={() => toggleKeyVisibility('okxPassphrase')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-white"
                      >
                        {showKeys.okxPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={okxConfig.enableRealTrading}
                        onChange={(e) => setOkxConfig({ ...okxConfig, enableRealTrading: e.target.checked, testnet: e.target.checked ? false : okxConfig.testnet })}
                        className="w-4 h-4 text-red-500 bg-dark-bg border-dark-border rounded focus:ring-red-500"
                      />
                      <span className={`text-sm ${okxConfig.enableRealTrading && !okxConfig.testnet ? 'text-red-500' : ''}`}>启用真实交易（危险）</span>
                    </label>

                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={okxConfig.testnet}
                        onChange={(e) => setOkxConfig({ ...okxConfig, testnet: e.target.checked, enableRealTrading: e.target.checked ? false : okxConfig.enableRealTrading })}
                        className="w-4 h-4 text-accent-primary bg-dark-bg border-dark-border rounded focus:ring-accent-primary"
                      />
                      <span className="text-sm">使用模拟盘（Testnet）</span>
                    </label>
                  </div>

                  <div className="flex space-x-4">
                    <button
                      onClick={saveOkxConfig}
                      disabled={loading}
                      className="flex items-center space-x-2 px-6 py-2 bg-accent-primary rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>保存OKX配置</span>
                    </button>
                    <button
                      onClick={testOkxConnection}
                      disabled={loading || !okxConfig.apiKey}
                      className="flex items-center space-x-2 px-6 py-2 bg-dark-bg border border-dark-border rounded-lg hover:bg-dark-border transition-colors disabled:opacity-50"
                    >
                      <Shield className="w-4 h-4" />
                      <span>测试OKX连接</span>
                    </button>
                  </div>
                </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'okx' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">OKX交易所配置</h3>

                {/* 警告提示 */}
                <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold mb-1">安全提示</p>
                      <ul className="list-disc list-inside space-y-1 text-dark-muted">
                        <li>请使用只读或受限权限的API密钥</li>
                        <li>不要授予API"提现"权限</li>
                        <li>建议先在模拟盘测试</li>
                        <li>启用IP白名单限制</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">API Key</label>
                    <div className="relative">
                      <input
                        type={showKeys.okxApi ? "text" : "password"}
                        value={okxConfig.apiKey}
                        onChange={(e) => setOkxConfig({...okxConfig, apiKey: e.target.value})}
                        placeholder={savedFlags.okxApiKeySaved ? "已保存，留空不修改" : "输入OKX API Key"}
                        className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none pr-12"
                      />
                      <button
                        onClick={() => toggleKeyVisibility('okxApi')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-white"
                      >
                        {showKeys.okxApi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Secret Key</label>
                    <div className="relative">
                      <input
                        type={showKeys.okxSecret ? "text" : "password"}
                        value={okxConfig.secretKey}
                        onChange={(e) => setOkxConfig({...okxConfig, secretKey: e.target.value})}
                        placeholder={savedFlags.okxSecretSaved ? "已保存，留空不修改" : "输入OKX Secret Key"}
                        className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none pr-12"
                      />
                      <button
                        onClick={() => toggleKeyVisibility('okxSecret')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-white"
                      >
                        {showKeys.okxSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Passphrase</label>
                    <div className="relative">
                      <input
                        type={showKeys.okxPassphrase ? "text" : "password"}
                        value={okxConfig.passphrase}
                        onChange={(e) => setOkxConfig({...okxConfig, passphrase: e.target.value})}
                        placeholder={savedFlags.okxPassSaved ? "已保存，留空不修改" : "输入OKX Passphrase"}
                        className="w-full px-4 py-2 bg-dark-bg border border-dark-border rounded-lg focus:border-accent-primary focus:outline-none pr-12"
                      />
                      <button
                        onClick={() => toggleKeyVisibility('okxPassphrase')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-muted hover:text-white"
                      >
                        {showKeys.okxPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={okxConfig.testnet}
                        onChange={(e) => setOkxConfig({...okxConfig, testnet: e.target.checked})}
                        className="w-4 h-4 text-accent-primary bg-dark-bg border-dark-border rounded focus:ring-accent-primary"
                      />
                      <span className="text-sm">使用模拟盘（Testnet）</span>
                    </label>

                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={okxConfig.enableRealTrading}
                        onChange={(e) => setOkxConfig({...okxConfig, enableRealTrading: e.target.checked})}
                        disabled={okxConfig.testnet}
                        className="w-4 h-4 text-red-500 bg-dark-bg border-dark-border rounded focus:ring-red-500 disabled:opacity-50"
                      />
                      <span className={`text-sm ${okxConfig.enableRealTrading && !okxConfig.testnet ? 'text-red-500' : ''}`}>
                        启用真实交易（危险）
                      </span>
                    </label>
                  </div>

                  <div className="flex space-x-4">
                    <button
                      onClick={saveOkxConfig}
                      disabled={loading}
                      className="flex items-center space-x-2 px-6 py-2 bg-accent-primary rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>保存配置</span>
                    </button>
                    <button
                      onClick={testOkxConnection}
                      disabled={loading || !okxConfig.apiKey}
                      className="flex items-center space-x-2 px-6 py-2 bg-dark-bg border border-dark-border rounded-lg hover:bg-dark-border transition-colors disabled:opacity-50"
                    >
                      <Shield className="w-4 h-4" />
                      <span>测试连接</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-dark-card/90 backdrop-blur border-t border-dark-border p-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg hover:bg-dark-border transition-colors">关闭</button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
