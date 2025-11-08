import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url) {
  const [connected, setConnected] = useState(false);
  const [marketData, setMarketData] = useState(null);
  const [tradeSignals, setTradeSignals] = useState([]);
  const [hotTickers, setHotTickers] = useState({});
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const endpointIndexRef = useRef(0);
  const endpointsRef = useRef([]);

  const scheduleReconnect = useCallback((connectFn) => {
    if (!shouldReconnectRef.current) return;
    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    const baseDelay = 1000 * Math.pow(2, attempt - 1);
    const delay = Math.min(baseDelay, 30000) + Math.random() * 500;
    console.log(`🔄 ${(delay / 1000).toFixed(1)}秒后尝试第 ${attempt} 次重连...`);
    reconnectTimeoutRef.current = setTimeout(() => {
      connectFn(true);
    }, delay);
  }, []);

  const connect = useCallback((isRetry = false) => {
    try {
      if (!shouldReconnectRef.current) return;

      const existing = wsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      if (!endpointsRef.current.length || endpointsRef.current[0] !== url) {
        endpointsRef.current = [url];
        endpointIndexRef.current = 0;
      }

      const endpoints = endpointsRef.current;
      const index = isRetry ? (endpointIndexRef.current + 1) % endpoints.length : endpointIndexRef.current;
      endpointIndexRef.current = index;
      const targetUrl = endpoints[index];

      const ws = new WebSocket(targetUrl);

      ws.onopen = () => {
        console.log(`✅ WebSocket连接成功: ${targetUrl}`);
        setConnected(true);
        reconnectAttemptsRef.current = 0; // 重置重连计数
        endpointIndexRef.current = 0;

        // 订阅默认交易对（使用Binance）
        ws.send(JSON.stringify({
          type: 'subscribe',
          payload: {
            exchange: 'okx',
            symbol: 'ETH/USDT'
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('解析消息失败:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
          try { ws.close(); } catch (_) {}
        }
      };

      ws.onclose = () => {
        console.log('❌ WebSocket连接关闭');
        setConnected(false);
        wsRef.current = null;

        if (!shouldReconnectRef.current) return;

        scheduleReconnect(connect);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('WebSocket连接失败:', error);
      scheduleReconnect(connect);
    }
  }, [scheduleReconnect, url]);

  const handleMessage = (message) => {
    switch (message.type) {
      case 'connected':
        // 降低控制台噪音，除非显式开启调试
        if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.__WS_DEBUG__) {
          // eslint-disable-next-line no-console
          console.log('📡 服务器连接配置:', message.config);
        }
        // 不需要设置客户端心跳，服务器会主动发送ping
        break;

      case 'ping':
        // 响应服务器心跳
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
          // 心跳日志过多，默认静默，仅在开启调试时输出
          if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.__WS_DEBUG__) {
            // eslint-disable-next-line no-console
            console.log('💓 响应服务器心跳');
          }
        }
        break;

      case 'price_update':
        setMarketData(message.data);
        break;
      case 'hot_tickers':
        setHotTickers(prev => ({ ...prev, ...(message.data || {}) }));
        break;

      case 'trade_signal':
        setTradeSignals(prev => [message.data, ...prev].slice(0, 10));
        break;

      case 'trade_execution':
        console.log('交易执行:', message.data);
        break;

      default:
        if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.__WS_DEBUG__) {
          // eslint-disable-next-line no-console
          console.log('收到消息:', message);
        }
    }
  };

  const subscribe = useCallback((exchange, symbol) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        payload: { exchange, symbol }
      }));
    }
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      reconnectAttemptsRef.current = 0;
      wsRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOnline = () => {
      if (!shouldReconnectRef.current) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      connect();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [connect]);

  return {
    connected,
    marketData,
    tradeSignals,
    subscribe,
    hotTickers
  };
}

