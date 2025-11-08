import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

export function useMarketData(symbol = 'ETH/USDT', exchange = 'okx') {
  const [ticker, setTicker] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [ohlcv, setOhlcv] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetchingRef = useRef(false); // 防止重复请求
  const intervalRef = useRef(null); // 保存interval引用

  const fetchData = useCallback(async (retryCount = 0) => {
      // 防止并发请求
      if (fetchingRef.current) {
        return;
      }
      fetchingRef.current = true;

      try {
        setLoading(true);

        // 仅拉取指标与OHLCV，ticker改由WS提供（避免限流）
        const [indicatorsRes, ohlcvRes] = await Promise.all([
          axios.get('/api/indicators/all', {
            params: { exchange, symbol, timeframe: '1h' },
            timeout: 25000
          }),
          axios.get('/api/market/ohlcv', {
            params: { exchange, symbol, timeframe: '1h', limit: 50 },
            timeout: 25000
          })
        ]);

        setIndicators(indicatorsRes.data.data);
        setOhlcv(ohlcvRes.data.data);
        setError(null);
      } catch (err) {
        // 如果是网络错误且重试次数小于2，则重试
        if (retryCount < 2 && (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK')) {
          const delayMs = 2000 * (retryCount + 1) + Math.floor(Math.random() * 500);
          console.log(`🔄 网络错误，${Math.round(delayMs/1000)}秒后重试... (${retryCount + 1}/2)`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          fetchingRef.current = false;
          return fetchData(retryCount + 1);
        }

        const errorMsg = err.response?.data?.error || err.message || '网络连接失败';
        setError(errorMsg);
        console.warn('获取市场数据失败:', errorMsg);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    }, [symbol, exchange]);

  useEffect(() => {
    // 清除之前的interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    fetchData();
    // 错开请求时间：每60秒更新
    intervalRef.current = setInterval(() => {
      if (!fetchingRef.current) {
        fetchData(0);
      }
    }, 60000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      fetchingRef.current = false;
    };
  }, [fetchData]); // 依赖fetchData

  return { 
    ticker, 
    indicators, 
    ohlcv, 
    loading, 
    error,
    refresh: fetchData // 提供手动刷新方法
  };
}

