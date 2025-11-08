import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

function PriceTicker({ symbols }) {
  const [tickers, setTickers] = useState({});
  // WebSocket URL: 生产环境使用相对路径，开发环境使用 localhost
  const WS_URL = process.env.NODE_ENV === 'production' 
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
    : 'ws://localhost:3001';
  const { hotTickers } = useWebSocket(WS_URL);

  useEffect(() => {
    if (hotTickers && Object.keys(hotTickers).length > 0) {
      // 仅保留需要展示的交易对
      const filtered = {};
      for (const s of symbols || []) {
        if (hotTickers[s]) filtered[s] = hotTickers[s];
      }
      if (Object.keys(filtered).length > 0) {
        setTickers(filtered); // 直接替换而非合并，避免无限循环
      }
    }
  }, [hotTickers]); // 移除symbols依赖，避免循环

  return (
    <div className="bg-dark-card border-b border-dark-border overflow-hidden">
      <div className="flex space-x-8 ticker-scroll px-4 py-3">
        {Object.entries(tickers).map(([symbol, data]) => {
          const price = data?.last || data?.price || 0;
          const change = data?.percentage || data?.change24h || 0;
          const isPositive = change >= 0;
          
          return (
            <div key={symbol} className="flex items-center space-x-3 min-w-max">
              <span className="font-semibold text-dark-text">{symbol}</span>
              <span className="font-mono text-lg">${price?.toFixed(2) || '---'}</span>
              <div className={`flex items-center space-x-1 ${
                isPositive ? 'text-accent-success' : 'text-accent-danger'
              }`}>
                {isPositive ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span className="font-mono text-sm">
                  {change?.toFixed(2) || '0.00'}%
                </span>
              </div>
            </div>
          );
        })}
        
        {/* 重复一次实现无缝滚动 */}
        {Object.entries(tickers).map(([symbol, data]) => {
          const price = data?.last || data?.price || 0;
          const change = data?.percentage || data?.change24h || 0;
          const isPositive = change >= 0;
          
          return (
            <div key={`${symbol}-dup`} className="flex items-center space-x-3 min-w-max">
              <span className="font-semibold text-dark-text">{symbol}</span>
              <span className="font-mono text-lg">${price?.toFixed(2) || '---'}</span>
              <div className={`flex items-center space-x-1 ${
                isPositive ? 'text-accent-success' : 'text-accent-danger'
              }`}>
                {isPositive ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span className="font-mono text-sm">
                  {change?.toFixed(2) || '0.00'}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PriceTicker;

