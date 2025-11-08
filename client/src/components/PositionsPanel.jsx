import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, TrendingUp, TrendingDown, Clock } from 'lucide-react';

function PositionsPanel() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchPositions = async () => {
    try {
      const response = await axios.get('/api/trading/positions');
      setPositions(response.data.data);
      setLoading(false);
    } catch (error) {
      console.error('获取持仓失败:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-primary border-t-transparent" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-xl font-semibold mb-2">暂无持仓</h3>
        <p className="text-dark-muted">开启自动交易或手动执行交易后，持仓将显示在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">当前持仓</h2>
        <div className="text-dark-muted">
          总计: {positions.length} 个仓位
        </div>
      </div>

      <div className="grid gap-4">
        {positions.map((position) => (
          <div key={position.id} className="card hover:border-accent-primary transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  position.side === 'BUY' ? 'bg-accent-success/20' : 'bg-accent-danger/20'
                }`}>
                  {position.side === 'BUY' ? (
                    <TrendingUp className="w-5 h-5 text-accent-success" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-accent-danger" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-lg">{position.symbol}</div>
                  <div className="text-sm text-dark-muted flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(position.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              <button className="text-dark-muted hover:text-accent-danger transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-dark-muted mb-1">入场价</div>
                <div className="font-mono font-bold">${position.entryPrice?.toFixed(2)}</div>
              </div>
              
              <div>
                <div className="text-xs text-dark-muted mb-1">数量</div>
                <div className="font-mono font-bold">{position.amount?.toFixed(4)}</div>
              </div>
              
              <div>
                <div className="text-xs text-dark-muted mb-1">止损</div>
                <div className="font-mono font-bold text-accent-danger">
                  ${position.stopLoss?.toFixed(2) || 'N/A'}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-dark-muted mb-1">止盈</div>
                <div className="font-mono font-bold text-accent-success">
                  ${position.takeProfit?.toFixed(2) || 'N/A'}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-dark-border">
              <div className="text-xs text-dark-muted mb-2">置信度: {position.confidence}%</div>
              <div className="text-sm text-dark-muted">{position.reasoning}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PositionsPanel;

