import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { TrendingUp, TrendingDown, Filter, RefreshCw } from 'lucide-react';

function CompletedTradesPanel({ selectedSymbol }) {
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | FILLED | PENDING | CANCELLED | PAPER
  const [sideFilter, setSideFilter] = useState('ALL'); // ALL | BUY | SELL
  const [limit, setLimit] = useState(50);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = { limit, exchange: 'okx' };
      if (selectedSymbol) params.symbol = selectedSymbol;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (sideFilter !== 'ALL') params.side = sideFilter;
      const [listRes, statsRes] = await Promise.all([
        axios.get('/api/database/trades', { params }),
        axios.get('/api/database/trades/statistics', { params: { symbol: selectedSymbol, exchange: 'okx' } })
      ]);
      setTrades(listRes.data?.data || []);
      setStats((statsRes.data?.data && statsRes.data.data[0]) || null);
    } catch (e) {
      console.error('获取交易历史失败:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, statusFilter, sideFilter, limit]);

  const headerStats = useMemo(() => {
    if (!stats) return null;
    return [
      { label: '总笔数', value: stats.total_trades },
      { label: '胜率', value: `${Number(stats.win_rate || 0).toFixed(1)}%` },
      { label: '累计PnL', value: `${Number(stats.total_pnl || 0).toFixed(2)}` },
      { label: '成交量', value: `${Number(stats.total_volume || 0).toFixed(2)}` }
    ];
  }, [stats]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-accent-primary rounded" />
          <h3 className="text-sm font-bold">Completed Trades</h3>
          {selectedSymbol && (
            <span className="text-[10px] px-2 py-0.5 bg-dark-bg rounded border border-dark-border text-dark-muted">{selectedSymbol}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <button
            onClick={fetchData}
            className="px-2 py-1 rounded bg-dark-bg hover:bg-dark-border border border-dark-border flex items-center gap-1"
            title="刷新"
          >
            <RefreshCw className="w-3 h-3" /> 刷新
          </button>
          <div className="px-2 py-1 rounded bg-dark-bg border border-dark-border flex items-center gap-1">
            <Filter className="w-3 h-3" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs"
            >
              <option value="ALL">全部状态</option>
              <option value="FILLED">FILLED</option>
              <option value="PENDING">PENDING</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="PAPER">PAPER</option>
            </select>
          </div>
          <div className="px-2 py-1 rounded bg-dark-bg border border-dark-border">
            <select
              value={sideFilter}
              onChange={e => setSideFilter(e.target.value)}
              className="bg-transparent text-xs"
            >
              <option value="ALL">全部方向</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
          <div className="px-2 py-1 rounded bg-dark-bg border border-dark-border">
            <select
              value={limit}
              onChange={e => setLimit(parseInt(e.target.value))}
              className="bg-transparent text-xs"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {headerStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
          {headerStats.map((s, i) => (
            <div key={i} className="px-2 py-2 bg-dark-bg rounded border border-dark-border">
              <div className="text-dark-muted">{s.label}</div>
              <div className="text-sm font-semibold">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-dark-muted">加载中…</div>
      ) : trades.length === 0 ? (
        <div className="text-center py-6 text-dark-muted">暂无交易记录</div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {trades.map((t) => {
            const isBuy = String(t.side).toUpperCase() === 'BUY';
            const SideIcon = isBuy ? TrendingUp : TrendingDown;
            const pnl = Number(t.pnl);
            const pnlPct = Number(t.pnl_percentage);
            const ts = t.created_at || t.updated_at;
            return (
              <div key={t.id} className="p-2 bg-dark-bg rounded border border-dark-border hover:border-accent-primary transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded grid place-items-center ${isBuy ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
                      <SideIcon className={`w-3.5 h-3.5 ${isBuy ? 'text-green-400' : 'text-red-400'}`} />
                    </div>
                    <div className="text-sm font-semibold">{t.symbol} · {t.side}</div>
                    <span className="text-[10px] text-dark-muted">{new Date(ts).toLocaleString('zh-CN')}</span>
                  </div>
                  <div className="text-[10px] px-2 py-0.5 rounded border border-dark-border">
                    {t.status}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2 text-xs">
                  <div className="bg-dark-card rounded p-2">
                    <div className="text-dark-muted">价格</div>
                    <div className="font-mono font-semibold">${Number(t.price).toFixed(4)}</div>
                  </div>
                  <div className="bg-dark-card rounded p-2">
                    <div className="text-dark-muted">数量</div>
                    <div className="font-mono font-semibold">{Number(t.amount).toFixed(6)}</div>
                  </div>
                  <div className="bg-dark-card rounded p-2">
                    <div className="text-dark-muted">成交额</div>
                    <div className="font-mono font-semibold">${Number(t.total || (t.price * t.amount)).toFixed(2)}</div>
                  </div>
                  <div className="bg-dark-card rounded p-2">
                    <div className="text-dark-muted">PnL</div>
                    <div className={`font-mono font-semibold ${Number.isFinite(pnl) ? (pnl >= 0 ? 'text-green-400' : 'text-red-400') : 'text-dark-text'}`}>
                      {Number.isFinite(pnl) ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}` : '--'}
                      {Number.isFinite(pnlPct) && <span className="ml-1 text-[10px] text-dark-muted">({pnlPct.toFixed(2)}%)</span>}
                    </div>
                  </div>
                  <div className="bg-dark-card rounded p-2">
                    <div className="text-dark-muted">策略</div>
                    <div className="font-mono">{t.strategy || '—'}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CompletedTradesPanel;


