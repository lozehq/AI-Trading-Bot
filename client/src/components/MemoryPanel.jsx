import { useEffect, useState } from 'react';
import axios from 'axios';

function MemoryPanel() {
  const [contexts, setContexts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get('/api/memory/contexts');
      if (data?.success) {
        setContexts(data.data.contexts || []);
        const active = data.data.activeId || localStorage.getItem('active_memory_context_id');
        setActiveId(active ? Number(active) : null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // 加载当前面板的历史
  const loadHistory = async (contextId) => {
    if (!contextId) { setHistory([]); return; }
    setHistoryLoading(true);
    try {
      const { data } = await axios.get('/api/ai/history', { params: { limit: 20, contextId } });
      if (data?.success) {
        setHistory(data.data?.history || []);
      }
    } catch (e) {
      // 静默
    } finally {
      setHistoryLoading(false);
    }
  };

  const createContext = async () => {
    if (!name.trim()) return;
    try {
      const { data } = await axios.post('/api/memory/contexts', { name: name.trim() });
      if (data?.success) {
        setName('');
        await load();
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const renameContext = async (id, newName) => {
    try {
      await axios.patch(`/api/memory/contexts/${id}`, { name: newName });
      await load();
    } catch (e) { setError(e.message); }
  };

  const deleteContext = async (id) => {
    try {
      await axios.delete(`/api/memory/contexts/${id}`);
      if (Number(activeId) === Number(id)) {
        localStorage.removeItem('active_memory_context_id');
        setActiveId(null);
      }
      await load();
    } catch (e) { setError(e.message); }
  };

  const clearAnalyses = async (id) => {
    try {
      await axios.delete(`/api/memory/contexts/${id}/analyses`);
    } catch (e) { setError(e.message); }
  };

  const selectActive = async (id) => {
    try {
      await axios.post(`/api/memory/contexts/${id}/select`);
      localStorage.setItem('active_memory_context_id', id);
      setActiveId(Number(id));
      loadHistory(Number(id));
    } catch (e) { setError(e.message); }
  };

  useEffect(() => {
    if (activeId) loadHistory(Number(activeId));
  }, [activeId]);

  const openDetail = async (id) => {
    try {
      setDetailLoading(true);
      const { data } = await axios.get(`/api/memory/analysis/${id}`);
      if (data?.success) setDetail(data.data);
    } catch (e) {
      setDetail({ error: e.message });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold">记忆面板</h3>
          <p className="text-xs text-dark-muted">为不同币种/策略创建独立上下文，避免互相干扰</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新建面板名称，如：ETH-短线"
          className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-sm flex-1"
        />
        <button onClick={createContext} className="px-3 py-1.5 bg-accent-success text-white rounded text-sm">新建</button>
      </div>

      {error && (
        <div className="text-xs text-accent-danger mb-2">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-dark-muted">加载中…</div>
      ) : (
        <div className="space-y-2">
          {contexts.length === 0 ? (
            <div className="text-sm text-dark-muted">暂无面板。创建一个以开始管理你的AI记忆上下文。</div>
          ) : contexts.map(ctx => (
            <div key={ctx.id} className={`flex items-center justify-between p-2 rounded border ${Number(activeId)===Number(ctx.id)?'border-accent-primary bg-accent-primary/5':'border-dark-border bg-dark-bg/50'}`}>
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  <input
                    className="bg-transparent outline-none font-semibold"
                    defaultValue={ctx.name}
                    onBlur={(e)=> renameContext(ctx.id, e.target.value)}
                  />
                </div>
                {ctx.description && (
                  <div className="text-xs text-dark-muted">{ctx.description}</div>
                )}
                <div className="text-[10px] text-dark-muted">#{ctx.id} · {new Date(ctx.updated_at).toLocaleString('zh-CN')}</div>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <button onClick={()=> selectActive(ctx.id)} className={`px-2 py-1 rounded text-xs ${Number(activeId)===Number(ctx.id)?'bg-accent-primary text-white':'bg-dark-card text-dark-text'}`}>{Number(activeId)===Number(ctx.id)?'已选择':'选择'}</button>
                <button onClick={()=> clearAnalyses(ctx.id)} className="px-2 py-1 rounded text-xs bg-yellow-600/20 text-yellow-400">清空记录</button>
                <button onClick={()=> deleteContext(ctx.id)} className="px-2 py-1 rounded text-xs bg-accent-danger/20 text-accent-danger">删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-dark-muted mt-3">选中一个面板后，AI分析会自动使用该面板的历史记忆。</div>

      {/* 历史记录（当前面板） */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">历史记录（当前面板）</h4>
          {historyLoading && <span className="text-xs text-dark-muted">加载中…</span>}
        </div>
        {(!activeId) ? (
          <div className="text-sm text-dark-muted">请选择一个面板以查看历史记录。</div>
        ) : (history.length === 0 ? (
          <div className="text-sm text-dark-muted">暂无记录。</div>
        ) : (
          <div className="space-y-2">
            {history.map(item => (
              <div key={item.id} className="p-2 rounded border border-dark-border bg-dark-bg flex items-center justify-between">
                <div className="text-xs text-dark-muted">
                  <div className="text-dark-text">
                    #{item.id} · {item.symbol} · {item.signal || 'HOLD'} ({item.confidence ?? 0}%)
                  </div>
                  <div>{new Date(item.createdAt).toLocaleString('zh-CN')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=> openDetail(item.id)} className="px-2 py-1 rounded text-xs bg-dark-card text-dark-text border border-dark-border">查看</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 详情查看 */}
      {detail && (
        <div className="mt-4 p-3 rounded border border-dark-border bg-dark-bg">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">详细内容</div>
            <button onClick={()=> setDetail(null)} className="text-xs text-dark-muted">关闭</button>
          </div>
          {detailLoading ? (
            <div className="text-sm text-dark-muted">加载中…</div>
          ) : detail.error ? (
            <div className="text-sm text-accent-danger">{detail.error}</div>
          ) : (
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(detail, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export default MemoryPanel;


