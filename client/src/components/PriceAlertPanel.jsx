import { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * 价格预警管理面板 - V2版本（支持数据库持久化）
 *
 * 功能：
 * - 查看所有预警
 * - 创建新预警
 * - 编辑/删除预警
 * - 查看预警触发历史
 * - 启动/停止监控
 */
export default function PriceAlertPanel({ symbol = 'ETH/USDT' }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stats, setStats] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);

  // 新预警表单
  const [newAlert, setNewAlert] = useState({
    symbol,
    type: 'above',
    targetPrice: '',
    message: '',
    priority: 'medium',
    repeat: false,
    notifyBrowser: true,
    notifySound: true,
    cooldownSeconds: 60
  });

  // 加载预警列表
  const loadAlerts = async () => {
    try {
      setLoading(true);
      const contextId = (()=>{ try { return Number(localStorage.getItem('active_memory_context_id')) || null; } catch(e){ return null; } })();
      const response = await axios.get(`/api/price-alert-v2/list`, { params: { symbol, contextId } });
      if (response.data.success) {
        setAlerts(response.data.data.alerts);
      }
    } catch (error) {
      console.error('加载预警失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载统计
  const loadStats = async () => {
    try {
      const contextId = (()=>{ try { return Number(localStorage.getItem('active_memory_context_id')) || null; } catch(e){ return null; } })();
      const response = await axios.get('/api/price-alert-v2/stats', { params: { symbol, contextId } });
      if (response.data.success) {
        setStats(response.data.data.stats);
      }
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  // 创建预警
  const createAlert = async () => {
    try {
      setCreating(true);

      // 验证
      if (!newAlert.targetPrice || parseFloat(newAlert.targetPrice) <= 0) {
        alert('请输入有效的目标价格');
        return;
      }

      const contextId = (()=>{ try { return Number(localStorage.getItem('active_memory_context_id')) || null; } catch(e){ return null; } })();
      const response = await axios.post('/api/price-alert-v2/create', {
        ...newAlert,
        targetPrice: parseFloat(newAlert.targetPrice),
        contextId
      });

      if (response.data.success) {
        alert('预警创建成功！');
        setShowCreateModal(false);

        // 重置表单
        setNewAlert({
          symbol,
          type: 'above',
          targetPrice: '',
          message: '',
          priority: 'medium',
          repeat: false,
          notifyBrowser: true,
          notifySound: true,
          cooldownSeconds: 60
        });

        // 重新加载列表
        loadAlerts();
        loadStats();
      }
    } catch (error) {
      console.error('创建预警失败:', error);
      alert(`创建失败: ${error.response?.data?.error || error.message}`);
    } finally {
      setCreating(false);
    }
  };

  // 删除预警
  const deleteAlert = async (alertId) => {
    if (!confirm('确定要删除这个预警吗？')) return;

    try {
      const response = await axios.delete(`/api/price-alert-v2/${alertId}`);
      if (response.data.success) {
        alert('预警删除成功！');
        loadAlerts();
        loadStats();
      }
    } catch (error) {
      console.error('删除预警失败:', error);
      alert(`删除失败: ${error.response?.data?.error || error.message}`);
    }
  };

  // 切换预警状态
  const toggleAlert = async (alertId, currentEnabled) => {
    try {
      const response = await axios.put(`/api/price-alert-v2/${alertId}`, {
        enabled: !currentEnabled
      });

      if (response.data.success) {
        loadAlerts();
      }
    } catch (error) {
      console.error('切换预警状态失败:', error);
      alert(`操作失败: ${error.response?.data?.error || error.message}`);
    }
  };

  // 启动监控
  const startMonitoring = async () => {
    try {
      const response = await axios.post('/api/price-alert-v2/start-monitoring');
      if (response.data.success) {
        alert('价格监控已启动！');
      }
    } catch (error) {
      console.error('启动监控失败:', error);
      alert(`启动失败: ${error.response?.data?.error || error.message}`);
    }
  };
  // 安全获取当前记忆面板ID（无则返回 undefined）
  const getActiveContextId = () => {
    try {
      const v = localStorage.getItem('active_memory_context_id');
      const n = v != null ? Number(v) : NaN;
      return Number.isInteger(n) && n > 0 ? n : undefined;
    } catch (e) {
      return undefined;
    }
  };

  // 一键删除：清空当前交易对在当前记忆面板下的全部预警
  const clearCurrentSymbolAlerts = async () => {
    try {
      if (!confirm(`确认删除【${symbol}】在当前面板下的全部预警？此操作不可恢复`)) return;
      const ctxId = getActiveContextId();
      const params = { symbol };
      if (ctxId !== undefined) params.contextId = ctxId;
      const resp = await axios.delete('/api/price-alert-v2/clear', { params });
      if (resp.data && resp.data.success) {
        const deleted = resp.data.data?.deleted ?? 0;
        await loadAlerts();
        await loadStats();
        alert(`已删除 ${deleted} 个预警`);
      } else {
        throw new Error(resp.data?.error || '清理失败');
      }
    } catch (error) {
      console.error('一键删除失败:', error);
      alert(`删除失败: ${error.message}`);
    }
  };


  // 页面加载时获取数据
  useEffect(() => {
    loadAlerts();
    loadStats();
  }, [symbol]);

  // 预警类型中文映射
  const typeLabels = {
    above: '高于',
    below: '低于',
    cross_above: '突破上方',
    cross_below: '跌破下方',
    both: '接近'
  };

  // 优先级颜色
  const priorityColors = {
    low: 'text-gray-500',
    medium: 'text-blue-500',
    high: 'text-orange-500',
    critical: 'text-red-500'
  };

  return (
    <div className="bg-dark-card rounded-lg border border-dark-border p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">价格预警管理</h2>
          <p className="text-sm text-dark-muted mt-1">{symbol}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={startMonitoring}
            className="px-4 py-2 rounded-lg transition border border-dark-border bg-dark-bg hover:bg-dark-border text-accent-success"
          >
            🚀 启动监控
          </button>
          <button
            onClick={clearCurrentSymbolAlerts}
            className="px-4 py-2 rounded-lg transition border border-accent-danger text-accent-danger bg-dark-bg hover:bg-dark-border"
            title="一键删除当前交易对的全部预警"
          >
            🗑️ 一键删除
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg transition border border-dark-border bg-dark-bg hover:bg-dark-border text-accent-primary"
          >
            ➕ 创建预警
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">总预警数</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">活跃预警</div>
            <div className="text-2xl font-bold text-accent-success">{stats.active}</div>
          </div>
          <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">已触发</div>
            <div className="text-2xl font-bold text-accent-warning">{stats.triggered}</div>
          </div>
          <div className="bg-dark-card p-4 rounded-lg border border-dark-border">
            <div className="text-sm text-dark-muted">触发次数</div>
            <div className="text-2xl font-bold text-white">{stats.total_triggers}</div>
          </div>
        </div>
      )}

      {/* 预警列表 */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-dark-muted">加载中...</div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 text-dark-muted">
            暂无预警，点击"创建预警"添加新预警
          </div>
        ) : (
          alerts.map(alert => (
            <div
              key={alert.id}
              className={`border rounded-lg p-4 bg-dark-card border-dark-border`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-lg font-semibold ${priorityColors[alert.priority]} text-white`}>
                      {typeLabels[alert.type]} ${parseFloat(alert.target_price).toFixed(2)}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded border ${
                      alert.enabled ? 'border-accent-success text-accent-success' : 'border-dark-border text-dark-muted'
                    }`}>
                      {alert.enabled ? '✓ 活跃' : '✗ 已禁用'}
                    </span>
                    {alert.repeat && (
                      <span className="text-xs px-2 py-1 rounded border border-purple-500/40 text-purple-400">
                        🔄 重复
                      </span>
                    )}
                    {alert.triggered && (
                      <span className="text-xs px-2 py-1 rounded border border-accent-warning/40 text-accent-warning">
                        ⚡ 已触发 {alert.trigger_count}次
                      </span>
                    )}
                  </div>

                  {alert.message && (
                    <p className="text-sm text-dark-text mb-2">{alert.message}</p>
                  )}

                  <div className="flex gap-4 text-xs text-gray-500">
                    <span className="text-dark-muted">来源: {alert.source}</span>
                    <span className="text-dark-muted">优先级: {alert.priority}</span>
                    {alert.cooldown_until && (
                      <span className="text-accent-warning">
                        ⏳ 冷却中 (还剩 {Math.max(0, Math.ceil((new Date(alert.cooldown_until) - new Date()) / 1000))}秒)
                      </span>
                    )}
                    {alert.last_triggered_at && (
                      <span className="text-dark-muted">最后触发: {new Date(alert.last_triggered_at).toLocaleString('zh-CN')}</span>
                    )}
                  </div>

                  {alert.reasoning && (
                    <p className="text-xs text-gray-500 mt-2 italic">{alert.reasoning}</p>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => toggleAlert(alert.id, alert.enabled)}
                    className={`px-3 py-1 rounded text-sm transition border ${
                      alert.enabled
                        ? 'border-accent-warning text-accent-warning hover:bg-dark-border'
                        : 'border-accent-success text-accent-success hover:bg-dark-border'
                    }`}
                  >
                    {alert.enabled ? '暂停' : '启用'}
                  </button>
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="px-3 py-1 rounded text-sm transition border border-accent-danger text-accent-danger hover:bg-dark-border"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 创建预警模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-card border border-dark-border rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">创建新预警</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  交易对
                </label>
                <input
                  type="text"
                  value={newAlert.symbol}
                  onChange={(e) => setNewAlert({ ...newAlert, symbol: e.target.value })}
                  className="w-full border border-dark-border bg-dark-bg rounded px-3 py-2 text-white"
                  placeholder="ETH/USDT"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  预警类型
                </label>
                <select
                  value={newAlert.type}
                  onChange={(e) => setNewAlert({ ...newAlert, type: e.target.value })}
                  className="w-full border border-dark-border bg-dark-bg rounded px-3 py-2 text-white"
                >
                  <option value="above">高于</option>
                  <option value="below">低于</option>
                  <option value="cross_above">突破上方</option>
                  <option value="cross_below">跌破下方</option>
                  <option value="both">接近（±0.5%）</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  目标价格 ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newAlert.targetPrice}
                  onChange={(e) => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
                  className="w-full border border-dark-border bg-dark-bg rounded px-3 py-2 text-white"
                  placeholder="4000.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  预警消息
                </label>
                <textarea
                  value={newAlert.message}
                  onChange={(e) => setNewAlert({ ...newAlert, message: e.target.value })}
                  className="w-full border border-dark-border bg-dark-bg rounded px-3 py-2 text-white"
                  rows="3"
                  placeholder="可选：预警描述"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  优先级
                </label>
                <select
                  value={newAlert.priority}
                  onChange={(e) => setNewAlert({ ...newAlert, priority: e.target.value })}
                  className="w-full border border-dark-border bg-dark-bg rounded px-3 py-2 text-white"
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="critical">紧急</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newAlert.repeat}
                  onChange={(e) => setNewAlert({ ...newAlert, repeat: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm text-gray-700">
                  重复触发（冷却 {newAlert.cooldownSeconds} 秒后可再次触发）
                </label>
              </div>

              {newAlert.repeat && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    冷却时间（秒）
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="10"
                    max="3600"
                    value={newAlert.cooldownSeconds}
                    onChange={(e) => setNewAlert({ ...newAlert, cooldownSeconds: parseInt(e.target.value) })}
                    className="w-full border border-dark-border bg-dark-bg rounded px-3 py-2 text-white"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newAlert.notifyBrowser}
                  onChange={(e) => setNewAlert({ ...newAlert, notifyBrowser: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm text-gray-700">浏览器通知</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newAlert.notifySound}
                  onChange={(e) => setNewAlert({ ...newAlert, notifySound: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm text-gray-700">声音提醒</label>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={createAlert}
                disabled={creating}
                className="flex-1 px-4 py-2 rounded-lg transition border border-dark-border bg-dark-bg hover:bg-dark-border text-accent-primary disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建'}
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 rounded-lg transition border border-dark-border bg-dark-bg hover:bg-dark-border text-dark-muted"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

