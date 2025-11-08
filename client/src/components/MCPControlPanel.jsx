import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Power, RefreshCw, Play, Square, AlertCircle, CheckCircle, Loader, Terminal, Trash2, ToggleLeft, ToggleRight, Database, Zap, Activity, TrendingUp, Settings, Save, Download, Upload, Filter, Clock as ClockIcon } from 'lucide-react';

function MCPControlPanel() {
  const [mcpStatus, setMcpStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [showLogs, setShowLogs] = useState(true);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const [selectedToolFilter, setSelectedToolFilter] = useState('all');
  const [mcpMasterSwitch, setMcpMasterSwitch] = useState(true); // MCP总开关

  // 数据源管理状态
  const [dataSourceStatus, setDataSourceStatus] = useState(null);
  const [dataSourceLoading, setDataSourceLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [activeTab, setActiveTab] = useState('mcp'); // 'mcp' | 'datasource' | 'config'
  const [notification, setNotification] = useState(null); // 通知消息
  // 策略配置
  const [strategy, setStrategy] = useState({ aggressiveness: 'balanced', globalRealtime: true, tickerTTL: 1000, indicatorsTTL: 10000 });
  const [configs, setConfigs] = useState([]);
  const [configForm, setConfigForm] = useState({
    id: null,
    toolId: '',
    command: '',
    argsText: '',
    envText: '',
    description: '',
    workingDirectory: ''
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsLevelFilter, setLogsLevelFilter] = useState('all');
  const filteredLogs = logs.filter(log => {
    const matchText = logsSearch ? (log.message?.toLowerCase().includes(logsSearch.toLowerCase()) || log.toolId?.toLowerCase().includes(logsSearch.toLowerCase())) : true;
    const matchLevel = logsLevelFilter === 'all' ? true : log.level === logsLevelFilter;
    return matchText && matchLevel;
  });

  const exportLogs = () => {
    try {
      const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mcp-logs-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出日志失败:', error);
    }
  };

  // 获取MCP工具状态
  const fetchMCPStatus = async () => {
    try {
      const response = await axios.get('/api/mcp-control/status');
      setMcpStatus(response.data.data);
      setLoading(false);
    } catch (error) {
      console.error('获取MCP状态失败:', error);
      setLoading(false);
    }
  };

  // 获取策略配置
  const fetchStrategy = async () => {
    try {
      const res = await axios.get('/api/strategy');
      if (res.data?.success) {
        setStrategy(res.data.data || {});
        try { localStorage.setItem('aggr_level', (res.data.data?.aggressiveness || 'balanced')); } catch(_) {}
      }
    } catch (e) {
      console.error('获取策略配置失败:', e);
      // 本地回退
      try {
        const cached = localStorage.getItem('aggr_level');
        if (cached) setStrategy((s) => ({ ...s, aggressiveness: cached }));
      } catch(_) {}
    }
  };

  // 更新激进度
  const updateAggressiveness = async (level) => {
    try {
      const res = await axios.post('/api/strategy', { aggressiveness: level });
      if (res.data?.success) {
        setStrategy(res.data.data || {});
        setNotification({ type: 'success', message: `已切换激进度为 ${level}` });
        setTimeout(() => setNotification(null), 2000);
        try { localStorage.setItem('aggr_level', level); } catch(_) {}
      }
    } catch (e) {
      setNotification({ type: 'error', message: e.response?.data?.error || e.message });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // 获取MCP日志
  const fetchLogs = async () => {
    try {
      const response = await axios.get('/api/mcp-control/logs', {
        params: {
          toolId: selectedToolFilter === 'all' ? null : selectedToolFilter,
          limit: 200
        }
      });
      setLogs(response.data.data.logs);
    } catch (error) {
      console.error('获取日志失败:', error);
    }
  };

  // 获取数据源状态
  const fetchDataSourceStatus = async () => {
    try {
      const response = await axios.get('/api/data-source/status');
      setDataSourceStatus(response.data.data);
    } catch (error) {
      console.error('获取数据源状态失败:', error);
    }
  };

  // 切换数据源
  const switchDataSource = async (source) => {
    setDataSourceLoading(true);
    try {
      const response = await axios.post('/api/data-source/switch', { source });
      setDataSourceStatus(response.data.data);
      setNotification({
        type: 'success',
        message: `已切换到 ${source.toUpperCase()} 数据源`
      });
      // 3秒后自动清除通知
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('切换数据源失败:', error);
      setNotification({
        type: 'error',
        message: `切换失败: ${error.message}`
      });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setDataSourceLoading(false);
    }
  };

  // 测试数据源
  const testDataSource = async () => {
    setDataSourceLoading(true);
    setTestResult(null);
    try {
      const response = await axios.get('/api/data-source/test');
      if (response.data.success) {
        setTestResult({
          success: true,
          ...response.data.data
        });
      } else {
        setTestResult({
          success: false,
          error: response.data.error || '未知错误'
        });
      }
    } catch (error) {
      console.error('测试数据源失败:', error);
      setTestResult({
        success: false,
        error: error.response?.data?.error || error.message
      });
    } finally {
      setDataSourceLoading(false);
    }
  };

  // 解析JSON文本（支持空字符串）
  const parseJsonInput = (text, fallback) => {
    if (!text || !text.trim()) return fallback;
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('JSON格式错误，请检查输入内容');
    }
  };

  const resetConfigForm = () => {
    setConfigForm({
      id: null,
      toolId: '',
      command: '',
      argsText: '',
      envText: '',
      description: '',
      workingDirectory: ''
    });
  };

  const fetchConfigs = async () => {
    setConfigLoading(true);
    try {
      const response = await axios.get('/api/mcp-configs');
      setConfigs(response.data.data || []);
    } catch (error) {
      console.error('获取MCP配置失败:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleConfigSubmit = async (event) => {
    event.preventDefault();
    setConfigLoading(true);
    try {
      const payload = {
        toolId: configForm.toolId.trim(),
        command: configForm.command.trim(),
        args: parseJsonInput(configForm.argsText, []),
        env: parseJsonInput(configForm.envText, {}),
        description: configForm.description?.trim() || '',
        workingDirectory: configForm.workingDirectory?.trim() || null
      };

      if (!payload.toolId || !payload.command) {
        throw new Error('toolId 和 command 不能为空');
      }

      if (configForm.id) {
        await axios.put(`/api/mcp-configs/${configForm.id}`, payload);
        setNotification({ type: 'success', message: '配置已更新' });
      } else {
        await axios.post('/api/mcp-configs', payload);
        setNotification({ type: 'success', message: '配置已创建' });
      }

      fetchConfigs();
      resetConfigForm();
    } catch (error) {
      const message = error.response?.data?.error || error.message || '保存配置失败';
      setNotification({ type: 'error', message });
    } finally {
      setConfigLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleEditConfig = (config) => {
    setConfigForm({
      id: config.id,
      toolId: config.toolId,
      command: config.command,
      argsText: config.args && config.args.length > 0 ? JSON.stringify(config.args, null, 2) : '',
      envText: config.env && Object.keys(config.env).length > 0 ? JSON.stringify(config.env, null, 2) : '',
      description: config.description || '',
      workingDirectory: config.workingDirectory || ''
    });
  };

  const handleDeleteConfig = async (id) => {
    if (!confirm('确定删除该配置吗？')) return;
    setConfigLoading(true);
    try {
      await axios.delete(`/api/mcp-configs/${id}`);
      setNotification({ type: 'success', message: '配置已删除' });
      fetchConfigs();
      if (configForm.id === id) {
        resetConfigForm();
      }
    } catch (error) {
      const message = error.response?.data?.error || error.message || '删除失败';
      setNotification({ type: 'error', message });
    } finally {
      setConfigLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleApplyConfigs = async () => {
    setConfigLoading(true);
    try {
      await axios.post('/api/mcp-configs/apply');
      setNotification({ type: 'success', message: '已同步到 .cursor/mcp.json' });
    } catch (error) {
      const message = error.response?.data?.error || error.message || '同步失败';
      setNotification({ type: 'error', message });
    } finally {
      setConfigLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  useEffect(() => {
    // 读取本地缓存，避免刷新时出现短暂回退
    try {
      const cached = localStorage.getItem('aggr_level');
      if (cached) setStrategy((s) => ({ ...s, aggressiveness: cached }));
    } catch(_) {}
    // 根据当前Tab只刷新需要的数据，避免不必要的API调用
    if (activeTab === 'mcp') {
      // MCP Tab: 刷新MCP状态和日志
      fetchMCPStatus();
      fetchStrategy();
      fetchLogs();

      const statusInterval = setInterval(fetchMCPStatus, 10000); // 10秒更新一次（降低频率）
      let logsInterval;

      if (autoRefreshLogs) {
        logsInterval = setInterval(fetchLogs, 5000); // 5秒更新日志（降低频率）
      }

      return () => {
        clearInterval(statusInterval);
        if (logsInterval) clearInterval(logsInterval);
      };
    } else if (activeTab === 'datasource') {
      // 数据源Tab: 只刷新数据源状态
      fetchDataSourceStatus();

      const dataSourceInterval = setInterval(fetchDataSourceStatus, 10000); // 10秒更新一次

      return () => {
        clearInterval(dataSourceInterval);
      };
    } else if (activeTab === 'config') {
      // 配置管理 Tab
      fetchConfigs();
    }
  }, [activeTab, selectedToolFilter, autoRefreshLogs]);

  // MCP总开关切换
  const toggleMasterSwitch = async () => {
    if (mcpMasterSwitch) {
      // 关闭所有工具
      if (confirm('确定要停止所有MCP工具吗？')) {
        await stopAll();
        setMcpMasterSwitch(false);
      }
    } else {
      // 启动所有工具
      await startAll();
      setMcpMasterSwitch(true);
    }
  };

  // 启动工具
  const startTool = async (toolId, toolName) => {
    setActionLoading({ ...actionLoading, [toolId]: 'starting' });
    try {
      await axios.post(`/api/mcp-control/start/${toolId}`);
      await fetchMCPStatus();
      await fetchLogs();
    } catch (error) {
      console.error(`启动${toolName}失败:`, error);
      alert(`启动失败: ${error.message}`);
    } finally {
      setActionLoading({ ...actionLoading, [toolId]: null });
    }
  };

  // 停止工具
  const stopTool = async (toolId, toolName) => {
    setActionLoading({ ...actionLoading, [toolId]: 'stopping' });
    try {
      await axios.post(`/api/mcp-control/stop/${toolId}`);
      await fetchMCPStatus();
      await fetchLogs();
    } catch (error) {
      console.error(`停止${toolName}失败:`, error);
      alert(`停止失败: ${error.message}`);
    } finally {
      setActionLoading({ ...actionLoading, [toolId]: null });
    }
  };

  // 重启工具
  const restartTool = async (toolId, toolName) => {
    setActionLoading({ ...actionLoading, [toolId]: 'restarting' });
    try {
      await axios.post(`/api/mcp-control/restart/${toolId}`);
      await fetchMCPStatus();
      await fetchLogs();
    } catch (error) {
      console.error(`重启${toolName}失败:`, error);
      alert(`重启失败: ${error.message}`);
    } finally {
      setActionLoading({ ...actionLoading, [toolId]: null });
    }
  };

  // 启动所有工具
  const startAll = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/mcp-control/start-all');
      console.log('✅ 批量启动完成:', response.data.message);
      await fetchMCPStatus();
      await fetchLogs();
    } catch (error) {
      console.error('批量启动失败:', error);
      alert(`批量启动失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 停止所有工具
  const stopAll = async () => {
    setLoading(true);
    try {
      await axios.post('/api/mcp-control/stop-all');
      await fetchMCPStatus();
      await fetchLogs();
    } catch (error) {
      console.error('批量停止失败:', error);
      alert(`批量停止失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 清除日志
  const clearLogs = async () => {
    try {
      await axios.delete('/api/mcp-control/logs', {
        params: { toolId: selectedToolFilter === 'all' ? null : selectedToolFilter }
      });
      setLogs([]);
    } catch (error) {
      console.error('清除日志失败:', error);
    }
  };

  // 获取日志颜色
  const getLogColor = (level) => {
    switch (level) {
      case 'success': return 'text-accent-success';
      case 'error': return 'text-accent-danger';
      case 'warning': return 'text-accent-warning';
      default: return 'text-dark-text';
    }
  };

  // 获取日志图标
  const getLogIcon = (level) => {
    switch (level) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  if (loading && !mcpStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 通知消息 */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-3 animate-slide-in ${
          notification.type === 'success'
            ? 'bg-accent-success/20 border border-accent-success/50 text-accent-success'
            : 'bg-accent-danger/20 border border-accent-danger/50 text-accent-danger'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header with Tabs */}
      <div className="card bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">数据源管理中心</h2>
              <p className="text-sm text-dark-muted">
                统一管理CCXT和MCP数据源
              </p>
            </div>
          </div>
          {/* 激进度切换 */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-dark-muted">激进度:</span>
            {['conservative','balanced','aggressive'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => updateAggressiveness(lvl)}
                className={`px-3 py-1 rounded text-xs border ${strategy.aggressiveness === lvl ? 'bg-accent-primary text-white border-accent-primary' : 'bg-dark-bg border-dark-border text-dark-text hover:bg-dark-card'}`}
              >
                {lvl === 'conservative' ? '保守' : lvl === 'balanced' ? '均衡' : '激进'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-dark-border mb-6">
          <button
            onClick={() => setActiveTab('datasource')}
            className={`px-6 py-3 font-medium transition-all flex items-center space-x-2 ${
              activeTab === 'datasource'
                ? 'border-b-2 border-accent-primary text-accent-primary'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>数据源管理</span>
            <span className="ml-2 px-2 py-0.5 bg-accent-success/20 text-accent-success text-xs rounded-full">
              NEW
            </span>
          </button>

          <button
            onClick={() => setActiveTab('mcp')}
            className={`px-6 py-3 font-medium transition-all flex items-center space-x-2 ${
              activeTab === 'mcp'
                ? 'border-b-2 border-accent-primary text-accent-primary'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>MCP工具控制</span>
            <span className="ml-2 text-xs text-dark-muted">
              {mcpStatus?.runningTools || 0}/{mcpStatus?.totalTools || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`px-6 py-3 font-medium transition-all flex items-center space-x-2 ${
              activeTab === 'config'
                ? 'border-b-2 border-accent-primary text-accent-primary'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>MCP配置管理</span>
          </button>
        </div>
      </div>

      {/* 数据源管理内容 */}
      {activeTab === 'datasource' && (
        <>
          {/* 当前数据源状态 */}
          <div className="card bg-gradient-to-r from-blue-900/20 to-cyan-900/20 border-blue-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
                  {dataSourceStatus?.currentSource === 'ccxt' ? (
                    <Zap className="w-8 h-8 text-white" />
                  ) : (
                    <Activity className="w-8 h-8 text-white" />
                  )}
                </div>
                <div>
                  <div className="text-sm text-dark-muted mb-1">当前数据源</div>
                  <div className="text-3xl font-bold">
                    {dataSourceStatus?.currentSource?.toUpperCase() || 'LOADING...'}
                  </div>
                  <div className="text-sm text-dark-muted mt-1">
                    {dataSourceStatus?.currentSource === 'ccxt'
                      ? '🚀 CCXT免费API - 稳定快速'
                      : '🔧 MCP工具 - 功能丰富'}
                  </div>
                </div>
              </div>

              {/* 数据源状态指示器 */}
              <div className="text-right">
                <div className="flex items-center space-x-2 mb-2">
                  <div className={`status-dot ${
                    dataSourceStatus?.mcpStatus?.available ? 'bg-accent-success' : 'bg-accent-danger'
                  }`} />
                  <span className="text-sm">MCP: {dataSourceStatus?.mcpStatus?.available ? '可用' : '不可用'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`status-dot ${
                    dataSourceStatus?.ccxtStatus?.available ? 'bg-accent-success' : 'bg-accent-danger'
                  }`} />
                  <span className="text-sm">CCXT: {dataSourceStatus?.ccxtStatus?.available ? '可用' : '不可用'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 数据源切换卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CCXT数据源 */}
            <div className={`card hover:border-accent-primary transition-all cursor-pointer ${
              dataSourceStatus?.currentSource === 'ccxt' ? 'border-accent-success/50 bg-accent-success/5' : ''
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">CCXT 数据源</div>
                    <div className="text-xs text-dark-muted">免费公开API</div>
                  </div>
                </div>
                {dataSourceStatus?.currentSource === 'ccxt' && (
                  <CheckCircle className="w-6 h-6 text-accent-success" />
                )}
              </div>

              <div className="text-sm text-dark-muted mb-4 space-y-1">
                <p>✅ 无需API密钥</p>
                <p>✅ 支持200+交易所</p>
                <p>✅ 响应速度快（~100ms）</p>
                <p>✅ 稳定性高</p>
                <p>✅ 实时价格、K线、订单簿</p>
              </div>

              <button
                onClick={() => switchDataSource('ccxt')}
                disabled={dataSourceLoading || dataSourceStatus?.currentSource === 'ccxt'}
                className={`w-full btn flex items-center justify-center space-x-2 ${
                  dataSourceStatus?.currentSource === 'ccxt'
                    ? 'bg-accent-success/20 text-accent-success cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {dataSourceLoading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : dataSourceStatus?.currentSource === 'ccxt' ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>当前使用中</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>切换到CCXT</span>
                  </>
                )}
              </button>
            </div>

            {/* MCP数据源 */}
            <div className={`card hover:border-accent-primary transition-all cursor-pointer ${
              dataSourceStatus?.currentSource === 'mcp' ? 'border-accent-success/50 bg-accent-success/5' : ''
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">MCP 数据源</div>
                    <div className="text-xs text-dark-muted">Model Context Protocol</div>
                  </div>
                </div>
                {dataSourceStatus?.currentSource === 'mcp' && (
                  <CheckCircle className="w-6 h-6 text-accent-success" />
                )}
              </div>

              <div className="text-sm text-dark-muted mb-4 space-y-1">
                <p>✅ 功能丰富（166个函数）</p>
                <p>✅ 支持高级指标计算</p>
                <p>✅ CoinGecko市场数据</p>
                <p>✅ Playwright网页抓取</p>
                <p>⚠️ 需要MCP工具运行</p>
              </div>

              <button
                onClick={() => switchDataSource('mcp')}
                disabled={dataSourceLoading || dataSourceStatus?.currentSource === 'mcp' || !dataSourceStatus?.mcpStatus?.available}
                className={`w-full btn flex items-center justify-center space-x-2 ${
                  dataSourceStatus?.currentSource === 'mcp'
                    ? 'bg-accent-success/20 text-accent-success cursor-not-allowed'
                    : !dataSourceStatus?.mcpStatus?.available
                    ? 'bg-dark-border text-dark-muted cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {dataSourceLoading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : dataSourceStatus?.currentSource === 'mcp' ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>当前使用中</span>
                  </>
                ) : !dataSourceStatus?.mcpStatus?.available ? (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    <span>MCP不可用</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    <span>切换到MCP</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 测试数据源 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <TrendingUp className="w-5 h-5 text-accent-primary" />
                <h3 className="text-lg font-semibold">测试当前数据源</h3>
              </div>
              <button
                onClick={testDataSource}
                disabled={dataSourceLoading}
                className="btn bg-accent-primary hover:bg-accent-primary/80 text-white flex items-center space-x-2"
              >
                {dataSourceLoading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>测试数据获取</span>
              </button>
            </div>

            {testResult && (
              <div className={`p-4 rounded-lg ${
                testResult.success ? 'bg-accent-success/10 border border-accent-success/30' : 'bg-accent-danger/10 border border-accent-danger/30'
              }`}>
                {testResult.success ? (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 text-accent-success font-semibold">
                      <CheckCircle className="w-5 h-5" />
                      <span>✅ 数据源测试成功！</span>
                    </div>

                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-dark-text mb-2">📊 基本信息</h4>
                        <div className="text-sm text-dark-muted space-y-1">
                          <p>• 数据源: <span className="text-accent-primary font-semibold">{testResult.source?.toUpperCase()}</span></p>
                          <p>• 交易对: <span className="text-dark-text">{testResult.symbol}</span></p>
                          <p>• 交易所: <span className="text-dark-text">{testResult.exchange?.toUpperCase()}</span></p>
                          <p>• 时间周期: <span className="text-dark-text">{testResult.timeframe || '1h'}</span></p>
                          <p>• 响应时间: <span className="text-accent-warning font-semibold">{testResult.duration}</span></p>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-dark-text mb-2">💰 价格数据</h4>
                        <div className="text-sm text-dark-muted space-y-1">
                          <p>• 当前价格: <span className="text-accent-success font-semibold">${testResult.ticker?.last?.toFixed(2) || testResult.ticker?.price?.toFixed(2) || 'N/A'}</span></p>
                          <p>• 24h最高: <span className="text-dark-text">${testResult.ticker?.high?.toFixed(2) || testResult.ticker?.high24h?.toFixed(2) || 'N/A'}</span></p>
                          <p>• 24h最低: <span className="text-dark-text">${testResult.ticker?.low?.toFixed(2) || testResult.ticker?.low24h?.toFixed(2) || 'N/A'}</span></p>
                          <p>• 24h成交量: <span className="text-dark-text">{testResult.ticker?.baseVolume?.toFixed(2) || testResult.ticker?.volume24h?.toFixed(2) || 'N/A'}</span></p>
                        </div>
                      </div>
                    </div>

                    {/* K线数据 */}
                    {testResult.ohlcv && (
                      <div>
                        <h4 className="text-sm font-semibold text-dark-text mb-2">📈 K线数据</h4>
                        <div className="text-sm text-dark-muted space-y-1">
                          <p>• 数据条数: <span className="text-dark-text">{testResult.ohlcv.count}</span></p>
                          {testResult.ohlcv.latest && (
                            <>
                              <p>• 最新K线: <span className="text-dark-text">
                                开:{testResult.ohlcv.latest.open?.toFixed(2)}
                                高:{testResult.ohlcv.latest.high?.toFixed(2)}
                                低:{testResult.ohlcv.latest.low?.toFixed(2)}
                                收:{testResult.ohlcv.latest.close?.toFixed(2)}
                              </span></p>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 技术指标 */}
                    {testResult.indicators && (
                      <div>
                        <h4 className="text-sm font-semibold text-dark-text mb-2">📊 技术指标</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm text-dark-muted">
                          {/* 趋势指标 */}
                          {testResult.indicators.trend && (
                            <div>
                              <p className="font-semibold text-dark-text mb-1">趋势指标:</p>
                              {testResult.indicators.trend.sma20 && <p>• SMA(20): <span className="text-dark-text">{testResult.indicators.trend.sma20.toFixed(2)}</span></p>}
                              {testResult.indicators.trend.ema20 && <p>• EMA(20): <span className="text-dark-text">{testResult.indicators.trend.ema20.toFixed(2)}</span></p>}
                              {testResult.indicators.trend.sma50 && <p>• SMA(50): <span className="text-dark-text">{testResult.indicators.trend.sma50.toFixed(2)}</span></p>}
                            </div>
                          )}

                          {/* 动量指标 */}
                          {testResult.indicators.momentum && (
                            <div>
                              <p className="font-semibold text-dark-text mb-1">动量指标:</p>
                              {testResult.indicators.momentum.rsi14 && (
                                <p>• RSI(14): <span className={`font-semibold ${
                                  testResult.indicators.momentum.rsi14 > 70 ? 'text-accent-danger' :
                                  testResult.indicators.momentum.rsi14 < 30 ? 'text-accent-success' :
                                  'text-dark-text'
                                }`}>{testResult.indicators.momentum.rsi14.toFixed(2)}</span></p>
                              )}
                              {testResult.indicators.momentum.macd !== undefined && (
                                <p>• MACD: <span className="text-dark-text">{
                                  typeof testResult.indicators.momentum.macd === 'number'
                                    ? testResult.indicators.momentum.macd.toFixed(2)
                                    : (typeof testResult.indicators.momentum.macd?.value === 'number'
                                      ? testResult.indicators.momentum.macd.value.toFixed(2)
                                      : String(testResult.indicators.momentum.macd))
                                }</span></p>
                              )}
                              {testResult.indicators.momentum.stochK && (
                                <p>• Stoch K: <span className="text-dark-text">{testResult.indicators.momentum.stochK.toFixed(2)}</span></p>
                              )}
                            </div>
                          )}

                          {/* 波动率指标 */}
                          {testResult.indicators.volatility && (
                            <div>
                              <p className="font-semibold text-dark-text mb-1">波动率指标:</p>
                              {testResult.indicators.volatility.bbUpper && (
                                <p>• BB上轨: <span className="text-dark-text">{testResult.indicators.volatility.bbUpper.toFixed(2)}</span></p>
                              )}
                              {testResult.indicators.volatility.bbMiddle && (
                                <p>• BB中轨: <span className="text-dark-text">{testResult.indicators.volatility.bbMiddle.toFixed(2)}</span></p>
                              )}
                              {testResult.indicators.volatility.bbLower && (
                                <p>• BB下轨: <span className="text-dark-text">{testResult.indicators.volatility.bbLower.toFixed(2)}</span></p>
                              )}
                            </div>
                          )}

                          {/* 成交量指标 */}
                          {testResult.indicators.volume && (
                            <div>
                              <p className="font-semibold text-dark-text mb-1">成交量指标:</p>
                              {testResult.indicators.volume.obv && (
                                <p>• OBV: <span className="text-dark-text">{testResult.indicators.volume.obv.toFixed(0)}</span></p>
                              )}
                              {testResult.indicators.volume.vwap && (
                                <p>• VWAP: <span className="text-dark-text">{testResult.indicators.volume.vwap.toFixed(2)}</span></p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-dark-muted mt-2">测试时间: {new Date(testResult.timestamp).toLocaleString('zh-CN')}</p>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-accent-danger">
                    <AlertCircle className="w-5 h-5" />
                    <span>❌ 测试失败: {testResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 数据源说明 */}
          <div className="card bg-blue-900/10 border-blue-500/30">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold mb-2">数据源说明</div>
                <div className="text-sm text-dark-muted space-y-1">
                  <p>• <strong>CCXT数据源</strong>: 推荐使用，无需配置，稳定快速，适合生产环境</p>
                  <p>• <strong>MCP数据源</strong>: 功能更丰富，但需要MCP工具运行，适合开发测试</p>
                  <p>• 切换数据源后，所有前端组件和AI分析将自动使用新数据源</p>
                  <p>• 配置会自动保存到数据库，重启后保持</p>
                  <p className="mt-2 text-accent-success">🚀 智能资源管理: 切换到CCXT时自动停止MCP工具，节省系统资源</p>
                  <p className="text-accent-warning">💡 提示: 如果MCP工具未启动，系统会自动降级使用CCXT</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MCP配置管理 */}
      {activeTab === 'config' && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Settings className="w-5 h-5 text-accent-primary" />
                <h3 className="text-lg font-semibold">自定义MCP配置</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleApplyConfigs}
                  disabled={configLoading || configs.length === 0}
                  className="btn bg-accent-primary hover:bg-accent-primary/80 text-white flex items-center space-x-2"
                >
                  {configLoading ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>同步到 .cursor/mcp.json</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleConfigSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-muted mb-1">工具ID</label>
                  <input
                    type="text"
                    value={configForm.toolId}
                    onChange={(e) => setConfigForm({ ...configForm, toolId: e.target.value })}
                    placeholder="例如：mcp-aktools"
                    className="input"
                    disabled={!!configForm.id}
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-muted mb-1">命令</label>
                  <input
                    type="text"
                    value={configForm.command}
                    onChange={(e) => setConfigForm({ ...configForm, command: e.target.value })}
                    placeholder="例如：uvx"
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-muted mb-1">工作目录 (可选)</label>
                  <input
                    type="text"
                    value={configForm.workingDirectory}
                    onChange={(e) => setConfigForm({ ...configForm, workingDirectory: e.target.value })}
                    placeholder="例如：C:\\Projects\\mcp-aktools"
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-muted mb-1">参数 (JSON数组)</label>
                  <textarea
                    value={configForm.argsText}
                    onChange={(e) => setConfigForm({ ...configForm, argsText: e.target.value })}
                    placeholder='例如：["mcp-aktools"]'
                    className="input min-h-[120px]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-muted mb-1">环境变量 (JSON对象)</label>
                  <textarea
                    value={configForm.envText}
                    onChange={(e) => setConfigForm({ ...configForm, envText: e.target.value })}
                    placeholder='例如：{"OKX_BASE_URL":"https://okx.4url.cn"}'
                    className="input min-h-[120px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-dark-muted mb-1">描述 (可选)</label>
                <input
                  type="text"
                  value={configForm.description}
                  onChange={(e) => setConfigForm({ ...configForm, description: e.target.value })}
                  placeholder="例如：OKX/币安反代地址"
                  className="input"
                />
              </div>

              <div className="flex items-center space-x-3">
                <button
                  type="submit"
                  disabled={configLoading}
                  className="btn bg-accent-success/20 hover:bg-accent-success/30 text-accent-success flex items-center space-x-2"
                >
                  {configLoading ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{configForm.id ? '更新配置' : '保存配置'}</span>
                </button>

                {configForm.id && (
                  <button
                    type="button"
                    onClick={resetConfigForm}
                    className="btn bg-dark-border hover:bg-dark-border/80 text-dark-text"
                  >
                    取消编辑
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">配置列表</h3>
            {configs.length === 0 ? (
              <div className="text-center text-dark-muted py-12">
                暂无配置，填写上方表单后可创建
              </div>
            ) : (
              <div className="space-y-3">
                {configs.map((config) => (
                  <div key={config.id} className="p-4 rounded-lg bg-dark-bg border border-dark-border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-semibold text-dark-text">{config.toolId}</div>
                        <div className="text-xs text-dark-muted">{config.description || '未填写描述'}</div>
                      </div>
                      <div className="text-xs text-dark-muted">
                        更新于 {new Date(config.updatedAt).toLocaleString('zh-CN')}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-dark-muted">命令</div>
                        <div className="font-mono text-xs bg-dark-card p-2 rounded">{config.command}</div>
                      </div>
                      <div>
                        <div className="text-dark-muted">参数</div>
                        <div className="font-mono text-xs bg-dark-card p-2 rounded">
                          {config.args && config.args.length > 0 ? JSON.stringify(config.args) : '[]'}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-dark-muted">环境变量</div>
                        <div className="font-mono text-xs bg-dark-card p-2 rounded">
                          {config.env && Object.keys(config.env).length > 0 ? JSON.stringify(config.env) : '{}'}
                        </div>
                      </div>
                      {config.workingDirectory && (
                        <div className="md:col-span-2">
                          <div className="text-dark-muted">工作目录</div>
                          <div className="font-mono text-xs bg-dark-card p-2 rounded">{config.workingDirectory}</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center space-x-2">
                      <button
                        onClick={() => handleEditConfig(config)}
                        className="btn bg-dark-border hover:bg-dark-border/80 text-dark-text"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteConfig(config.id)}
                        className="btn bg-accent-danger/20 hover:bg-accent-danger/30 text-accent-danger"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* MCP工具控制 Tab */}
      {activeTab === 'mcp' && (
        <>
          {/* MCP总开关和控制按钮 */}
          <div className="card bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                  <Power className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">MCP 工具控制</h3>
                  <p className="text-sm text-dark-muted">
                    {mcpStatus?.runningTools || 0}/{mcpStatus?.totalTools || 0} 个工具运行中
                  </p>
                </div>
              </div>

              {/* MCP总开关 */}
              <button
                onClick={toggleMasterSwitch}
                disabled={loading}
                className={`flex items-center space-x-3 px-6 py-3 rounded-lg font-medium transition-all ${
                  mcpMasterSwitch
                    ? 'bg-accent-success text-white glow'
                    : 'bg-dark-border text-dark-muted'
                }`}
              >
                {mcpMasterSwitch ? (
                  <ToggleRight className="w-6 h-6" />
                ) : (
                  <ToggleLeft className="w-6 h-6" />
                )}
                <div className="text-left">
                  <div className="text-sm font-bold">MCP 总开关</div>
                  <div className="text-xs opacity-80">
                    {mcpMasterSwitch ? '点击停止所有工具' : '点击启动所有工具'}
                  </div>
                </div>
              </button>
            </div>

            {/* 控制按钮 */}
            <div className="flex items-center space-x-3">
              <button
                onClick={fetchMCPStatus}
                className="btn bg-dark-border hover:bg-dark-border/80 text-dark-text flex items-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>刷新状态</span>
              </button>

              <button
                onClick={startAll}
                disabled={loading}
                className="btn-success flex items-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>全部启动</span>
              </button>

              <button
                onClick={() => {
                  if (confirm('确定要停止所有MCP工具吗？')) {
                    stopAll();
                  }
                }}
                disabled={loading}
                className="btn-danger flex items-center space-x-2"
              >
                <Square className="w-4 h-4" />
                <span>全部停止</span>
              </button>
            </div>
          </div>

          {/* MCP工具列表 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {mcpStatus?.tools?.map((tool) => (
          <div key={tool.id} className={`card hover:border-accent-primary transition-all ${
            tool.status === 'running' ? 'border-accent-success/30' : ''
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  tool.status === 'running' 
                    ? 'bg-accent-success/20' 
                    : 'bg-dark-border'
                }`}>
                  {tool.status === 'running' ? (
                    <CheckCircle className="w-5 h-5 text-accent-success" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-dark-muted" />
                  )}
                </div>
                
                <div>
                  <div className="flex items-center space-x-2">
                    <div className="font-bold text-lg">{tool.name}</div>
                    {tool.isCustom && (
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-accent-primary/20 text-accent-primary">自定义</span>
                    )}
                  </div>
                  <div className="text-xs text-dark-muted">{tool.description}</div>
                  {tool.isCustom && (
                    <div className="mt-1 text-[10px] text-dark-muted/80">
                      <div>命令: <span className="font-mono">{tool.command}</span></div>
                      {tool.args?.length > 0 && (
                        <div>参数: <span className="font-mono">{tool.args.join(' ')}</span></div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 状态指示器 */}
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <div className={`status-dot ${
                    tool.status === 'running' ? 'bg-accent-success' : 'bg-dark-muted'
                  }`} />
                  {tool.status === 'running' && (
                    <span className="pulse-ring bg-accent-success" />
                  )}
                </div>
                <span className={`text-sm font-medium ${
                  tool.status === 'running' ? 'text-accent-success' : 'text-dark-muted'
                }`}>
                  {tool.status === 'running' ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>

            {/* 描述 */}
            {!tool.isCustom && (
              <p className="text-sm text-dark-muted mb-4">{tool.description}</p>
            )}

            {tool.isCustom && tool.env && Object.keys(tool.env).length > 0 && (
              <div className="mb-3 p-3 bg-dark-bg rounded text-xs text-dark-muted">
                <div className="font-semibold text-dark-text mb-1">环境变量</div>
                {Object.entries(tool.env).map(([key, value]) => (
                  <div key={key} className="font-mono">{key} = {value}</div>
                ))}
              </div>
            )}

            {/* 详细信息 */}
            {tool.status === 'running' && tool.pid && (
              <div className="mb-4 p-3 bg-dark-bg rounded-lg">
                <div className="text-xs text-dark-muted mb-1">进程信息</div>
                <div className="font-mono text-sm">
                  PID: <span className="text-accent-primary">{tool.pid}</span>
                  {tool.ready && (
                    <span className="ml-3 text-accent-success">● Ready</span>
                  )}
                </div>
              </div>
            )}

            {/* 控制按钮 */}
            <div className="flex items-center space-x-2">
              {tool.status === 'running' ? (
                <>
                  <button
                    onClick={() => stopTool(tool.id, tool.name)}
                    disabled={actionLoading[tool.id]}
                    className="flex-1 btn bg-accent-danger/20 hover:bg-accent-danger/30 text-accent-danger flex items-center justify-center space-x-2"
                  >
                    {actionLoading[tool.id] === 'stopping' ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    <span>停止</span>
                  </button>
                  
                  <button
                    onClick={() => restartTool(tool.id, tool.name)}
                    disabled={actionLoading[tool.id]}
                    className="flex-1 btn bg-accent-warning/20 hover:bg-accent-warning/30 text-accent-warning flex items-center justify-center space-x-2"
                  >
                    {actionLoading[tool.id] === 'restarting' ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>重启</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startTool(tool.id, tool.name)}
                  disabled={actionLoading[tool.id]}
                  className="w-full btn bg-accent-success/20 hover:bg-accent-success/30 text-accent-success flex items-center justify-center space-x-2"
                >
                  {actionLoading[tool.id] === 'starting' ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  <span>启动</span>
                </button>
              )}
            </div>
            </div>
          ))}
          </div>

          {/* MCP日志面板 */}
          <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Terminal className="w-5 h-5 text-accent-primary" />
            <h3 className="text-lg font-semibold">MCP 工具日志</h3>
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="text-sm text-dark-muted hover:text-dark-text"
            >
              {showLogs ? '隐藏' : '显示'}
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {/* 工具过滤 */}
            <select
              value={selectedToolFilter}
              onChange={(e) => setSelectedToolFilter(e.target.value)}
              className="input text-sm py-1"
            >
              <option value="all">所有工具</option>
              <option value="ccxt-mcp">CCXT</option>
              <option value="playwright">Playwright</option>
              <option value="crypto-indicators-mcp">技术指标</option>
              <option value="coingecko_mcp">CoinGecko</option>
              <option value="system">系统</option>
            </select>

            {/* 自动刷新 */}
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefreshLogs}
                onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-dark-muted">自动刷新</span>
            </label>

            {/* 刷新按钮 */}
            <button
              onClick={fetchLogs}
              className="btn bg-dark-border hover:bg-dark-border/80 text-dark-text flex items-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>刷新</span>
            </button>

            {/* 清除日志 */}
            <button
              onClick={clearLogs}
              className="btn bg-dark-border hover:bg-accent-danger/30 text-dark-text hover:text-accent-danger flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>清除</span>
            </button>
          </div>
        </div>

        {showLogs && (
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-dark-muted" />
                <select
                  value={logsLevelFilter}
                  onChange={(e) => setLogsLevelFilter(e.target.value)}
                  className="input text-xs py-1"
                >
                  <option value="all">所有级别</option>
                  <option value="success">成功</option>
                  <option value="warning">警告</option>
                  <option value="error">错误</option>
                  <option value="info">信息</option>
                </select>
                <div className="relative">
                  <input
                    type="text"
                    value={logsSearch}
                    onChange={(e) => setLogsSearch(e.target.value)}
                    placeholder="搜索日志..."
                    className="input text-xs pl-2 pr-6"
                  />
                  <ClockIcon className="w-4 h-4 text-dark-muted absolute right-1.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={exportLogs}
                  className="btn bg-dark-border hover:bg-dark-border/80 text-dark-text flex items-center space-x-1 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出过滤结果</span>
                </button>
              </div>
            </div>
            <div className="bg-dark-bg rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
              {filteredLogs.length > 0 ? (
                <div className="space-y-1">
                  {filteredLogs.map((log) => (
                    <div key={log.id} className={`${getLogColor(log.level)} hover:bg-dark-card px-2 py-1 rounded`}>
                      <span className="text-dark-muted">[{log.time}]</span>
                      {' '}
                      <span className="text-purple-400">[{log.toolId}]</span>
                      {' '}
                      <span>{getLogIcon(log.level)}</span>
                      {' '}
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-dark-muted">
                  <div className="text-center">
                    <Terminal className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无日志匹配条件</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
          </div>

          {/* 系统统计 */}
          {mcpStatus && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <div className="text-sm text-dark-muted mb-1">总工具数</div>
            <div className="text-3xl font-bold font-mono">{mcpStatus.totalTools}</div>
          </div>
          
          <div className="card">
            <div className="text-sm text-dark-muted mb-1">运行中</div>
            <div className="text-3xl font-bold font-mono text-accent-success">
              {mcpStatus.runningTools}
            </div>
          </div>
          
          <div className="card">
            <div className="text-sm text-dark-muted mb-1">日志总数</div>
            <div className="text-3xl font-bold font-mono text-accent-primary">
              {logs.length}
            </div>
            </div>
            </div>
          )}

          {/* 使用说明 */}
          <div className="card bg-blue-900/10 border-blue-500/30">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold mb-2">MCP工具说明</div>
                <div className="text-sm text-dark-muted space-y-1">
                  <p>• <strong>CCXT</strong>: 提供200+交易所的实时数据（价格、K线、订单簿）</p>
                  <p>• <strong>Playwright</strong>: 浏览器自动化，用于抓取网页数据</p>
                  <p>• <strong>技术指标</strong>: 计算RSI、MACD、布林带、EMA等指标</p>
                  <p>• <strong>CoinGecko</strong>: 币种基本面、市值排名、涨跌榜、市场情绪</p>
                  <p className="mt-2 text-accent-warning">💡 提示: 如果工具启动失败，系统会自动使用备用方案，不影响功能</p>
                  <p className="text-accent-success">🎯 使用MCP总开关可以一键启动/停止所有工具</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default MCPControlPanel;
