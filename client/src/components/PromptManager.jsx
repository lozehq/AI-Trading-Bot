import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FilePlus, Trash2, Check, ChevronDown, ChevronUp } from 'lucide-react';

export default function PromptManager() {
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState('default');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [name, setName] = useState('我的提示词');
  const [content, setContent] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/prompts');
      if (res.data?.success) {
        setProfiles(res.data.data.profiles || []);
        setActiveId(res.data.data.activeId || 'default');
      }
    } catch (e) {
      console.error('加载提示词失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activate = async (id) => {
    try {
      await axios.post('/api/prompts/activate', { id });
      setActiveId(id);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('确认删除该提示词？此操作不可撤销。')) return;
    try {
      await axios.delete(`/api/prompts/${id}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const doImport = async () => {
    if (!name.trim() || !content.trim()) {
      alert('名称与内容不能为空');
      return;
    }
    setImporting(true);
    try {
      await axios.post('/api/prompts/import', { name: name.trim(), content: content.trim() });
      setName('我的提示词');
      setContent('');
      setShowImport(false);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold">提示词管理</div>
          <div className="text-xs text-dark-muted">默认提示词不可删除；可导入自定义提示词并切换使用</div>
        </div>
        <button
          onClick={() => setShowImport(v => !v)}
          className="px-3 py-1 text-sm rounded bg-dark-bg border border-dark-border hover:border-accent-primary inline-flex items-center gap-1"
        >
          <FilePlus className="w-4 h-4" /> {showImport ? '收起' : '自定义/导入提示词'} {showImport ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
        </button>
      </div>

      {showImport && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={name}
              onChange={e=>setName(e.target.value)}
              placeholder="名称"
              className="px-3 py-2 bg-dark-bg border border-dark-border rounded"
            />
            <div className="md:col-span-2 text-right">
              <button
                disabled={importing}
                onClick={doImport}
                className={`px-3 py-2 rounded bg-accent-primary hover:bg-accent-secondary ${importing?'opacity-60 cursor-not-allowed':''}`}
              >{importing ? '导入中...' : '导入并使用'}</button>
            </div>
          </div>
          <textarea
            value={content}
            onChange={e=>setContent(e.target.value)}
            placeholder="将你的提示词粘贴到这里..."
            rows={8}
            className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded font-mono text-sm"
          />
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-dark-muted">加载中...</div>
        ) : (
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className={`flex items-center justify-between p-2 rounded border ${activeId===p.id?'border-accent-primary bg-accent-primary/5':'border-dark-border bg-dark-bg/50'}`}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name} <span className="text-xs text-dark-muted">({p.type})</span></div>
                  <div className="text-xs text-dark-muted">{p.deletable ? '可删除' : '内置'}</div>
                </div>
                <div className="flex items-center gap-2">
                  {activeId === p.id ? (
                    <span className="text-xs text-accent-success inline-flex items-center gap-1"><Check className="w-3 h-3"/> 使用中</span>
                  ) : (
                    <button onClick={()=>activate(p.id)} className="px-2 py-1 text-xs rounded bg-dark-bg border border-dark-border hover:border-accent-primary">使用</button>
                  )}
                  {p.deletable && (
                    <button onClick={()=>remove(p.id)} className="px-2 py-1 text-xs rounded bg-dark-bg border border-dark-border text-red-400 hover:text-red-300 inline-flex items-center gap-1"><Trash2 className="w-3 h-3"/> 删除</button>
                  )}
                </div>
              </div>
            ))}
            {profiles.length === 0 && (
              <div className="text-sm text-dark-muted">暂无提示词</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

