const mcpIntegration = require('./services/mcpIntegration'); // 使用MCP集成
const monitoringService = require('./services/MonitoringService'); // 监控服务
const { caches } = require('./utils/cache'); // 引入缓存系统
const eventBus = require('./services/EventBus');
const { TIMEOUTS, WEBSOCKET } = require('./config/constants'); // 使用配置常量

const clients = new Set();
const runtimeStrategy = require('./services/runtimeStrategy');
let priceUpdateInterval = null;
const priceUpdateTimers = new Map(); // 跟踪价格更新定时器，防止泄漏
let monitoringSummaryInterval = null; // 存储监控摘要定时器引用

// 🔧 日志等级控制：LOG_LEVEL=debug 或 WS_DEBUG=true 时输出详细日志
const LOG_LEVEL = (process.env.LOG_LEVEL || '').toLowerCase();
const WS_DEBUG = (process.env.WS_DEBUG === '1' || process.env.WS_DEBUG === 'true' || LOG_LEVEL === 'debug');
const dlog = (...args) => { if (WS_DEBUG) console.log(...args); };

// 退避机制状态
const backoffState = new Map(); // key: exchange:symbol, value: { failures, backoffMs, lastAttempt }
const MAX_BACKOFF_MS = 60000; // 最大退避时间 60 秒
const MIN_BACKOFF_MS = 5000; // 最小退避时间 5 秒

// ✅ 使用配置常量
const HEARTBEAT_INTERVAL = WEBSOCKET.HEARTBEAT_INTERVAL;
const HEARTBEAT_TIMEOUT = WEBSOCKET.HEARTBEAT_TIMEOUT;

function setupWebSocket(wss) {
  wss.on('connection', (ws) => {
    console.log('🔗 新的WebSocket连接');
    clients.add(ws);

    // 初始化心跳
    ws.isAlive = true;
    ws.missedHeartbeats = 0;
    ws.heartbeatTimer = null;
    // 监听底层pong（浏览器会自动回复pong帧，比应用层更可靠）
    if (typeof ws.on === 'function') {
      try {
        ws.on('pong', () => {
          ws.isAlive = true;
          ws.missedHeartbeats = 0;
        });
      } catch (_) {}
    }

    // 设置心跳检测
    const setupHeartbeat = () => {
      // 清除之前的定时器
      if (ws.heartbeatTimer) {
        clearInterval(ws.heartbeatTimer);
      }

      // 设置新的心跳定时器
      ws.heartbeatTimer = setInterval(() => {
        if (ws.isAlive === false) {
          ws.missedHeartbeats = (ws.missedHeartbeats || 0) + 1;
          if (ws.missedHeartbeats >= 2) {
            console.log('❌ WebSocket心跳连续超时，断开连接');
          clearInterval(ws.heartbeatTimer);
          ws.terminate();
          return;
          }
        }

        ws.isAlive = false;

        // 优先底层 ping 帧，浏览器会自动回 pong
        try {
          if (typeof ws.ping === 'function') {
            ws.ping();
          }
        } catch (_) {}

        // 同时发送应用层心跳，兼容旧客户端
        try {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch (error) {
          console.error('❌ 心跳发送失败:', error.message);
          clearInterval(ws.heartbeatTimer);
          ws.terminate();
        }
      }, HEARTBEAT_INTERVAL);
    };

    // 启动心跳
    setupHeartbeat();

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'connected',
    message: '已连接到交易AI服务器',
    timestamp: new Date().toISOString(),
    config: {
      heartbeatInterval: HEARTBEAT_INTERVAL,
      heartbeatTimeout: HEARTBEAT_TIMEOUT
    }
  }));

  // 🆕 立即尝试推送一次最近快照，缩短首屏等待
  try {
    const exchange = ws.subscribedExchange || (process.env.EXCHANGE_NAME || 'binance');
    const symbol = ws.subscribedSymbol || 'ETH/USDT';
    const cacheKey = `ws_ticker:${exchange}:${symbol}`;
    const snap = caches.price.get(cacheKey);
    if (snap) {
      ws.send(JSON.stringify({
        type: 'price_update',
        exchange,
        symbol,
        data: snap,
        timestamp: new Date().toISOString(),
        cached: true
      }));
    }
  } catch (_) {}

  // 默认订阅（使用Binance）
  ws.subscribedSymbol = 'ETH/USDT';
  ws.subscribedExchange = process.env.EXCHANGE_NAME || 'binance';
  ws.subscribedMonitoring = false; // 监控订阅状态

  // 处理客户端消息
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        await handleClientMessage(ws, data);
      } catch (error) {
        console.error('处理消息错误:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }
    });

    // 连接关闭
    ws.on('close', () => {
      console.log('❌ WebSocket连接关闭');
      clients.delete(ws);

      // 清理心跳定时器
      if (ws.heartbeatTimer) {
        clearInterval(ws.heartbeatTimer);
      }

      // 如果没有客户端了，停止价格更新
      if (clients.size === 0 && priceUpdateInterval) {
        clearInterval(priceUpdateInterval);
        priceUpdateInterval = null;
      }
    });

    // 处理错误
    ws.on('error', (error) => {
      console.error('WebSocket错误:', error.message);
      if (ws.heartbeatTimer) {
        clearInterval(ws.heartbeatTimer);
      }
    });

    // 启动实时价格推送
    if (!priceUpdateInterval) {
      startPriceUpdates();
    }
  });
}

async function handleClientMessage(ws, data) {
  const { type, payload } = data;

  switch (type) {
    case 'subscribe':
      // 订阅特定交易对
      await handleSubscribe(ws, payload);
      break;

    case 'unsubscribe':
      // 取消订阅
      handleUnsubscribe(ws, payload);
      break;

    case 'subscribe_monitoring':
      // 订阅实时监控
      ws.subscribedMonitoring = true;
      console.log('📡 [WebSocket] 客户端订阅监控成功');
      
      ws.send(JSON.stringify({
        type: 'monitoring_subscribed',
        message: '已订阅实时监控',
        timestamp: Date.now()
      }));
      
      // 立即发送当前状态
      ws.send(JSON.stringify({
        type: 'monitoring_summary',
        data: monitoringService.getSummary(),
        timestamp: Date.now()
      }));
      
      // 发送叙述历史
      const narrativeHistory = monitoringService.getNarrativeHistory(5);
      dlog(`📡 [WebSocket] 发送叙述历史: ${narrativeHistory.length} 条`);
      if (narrativeHistory.length > 0) {
        ws.send(JSON.stringify({
          type: 'narrative_history',
          data: narrativeHistory,
          timestamp: Date.now()
        }));
      }
      break;

    case 'unsubscribe_monitoring':
      // 取消订阅监控
      ws.subscribedMonitoring = false;
      dlog('📡 [WebSocket] 客户端取消监控订阅');
      
      ws.send(JSON.stringify({
        type: 'monitoring_unsubscribed',
        message: '已取消监控订阅',
        timestamp: Date.now()
      }));
      break;

    case 'ping':
      // 客户端心跳请求
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'pong':
      // 客户端心跳响应
      ws.isAlive = true;
      dlog('💓 收到心跳响应');
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        error: '未知的消息类型'
      }));
  }
}

async function handleSubscribe(ws, payload) {
  const { exchange = process.env.EXCHANGE_NAME || 'binance', symbol = 'ETH/USDT' } = payload || {};
  
  ws.subscribedSymbol = symbol;
  ws.subscribedExchange = exchange;
  
  ws.send(JSON.stringify({
    type: 'subscribed',
    symbol,
    exchange,
    timestamp: new Date().toISOString()
  }));
}

function handleUnsubscribe(ws, payload) {
  delete ws.subscribedSymbol;
  delete ws.subscribedExchange;
  
  ws.send(JSON.stringify({
    type: 'unsubscribed',
    timestamp: new Date().toISOString()
  }));
}

// 检查是否应跳过（因退避）
function shouldSkipDueToBackoff(key) {
  const state = backoffState.get(key);
  if (!state) return false;
  const elapsed = Date.now() - state.lastAttempt;
  return elapsed < state.backoffMs;
}

// 记录失败并增加退避
function recordFailure(key, isRateLimitError) {
  const state = backoffState.get(key) || { failures: 0, backoffMs: MIN_BACKOFF_MS, lastAttempt: 0 };
  state.failures++;
  state.lastAttempt = Date.now();
  
  // 仅在限流错误时增加退避
  if (isRateLimitError) {
    state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
  }
  
  backoffState.set(key, state);
}

// 重置退避状态
function resetBackoff(key) {
  backoffState.delete(key);
}

// OKX公共API fallback
async function getTickerFromOKXPublicAPI(symbol) {
  const axios = require('axios');
  try {
    // 将 BTC/USDT 转为 BTC-USDT
    const instId = symbol.replace('/', '-');
    const res = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { timeout: 5000 });
    if (res.data?.data?.[0]) {
      const d = res.data.data[0];
      return {
        symbol,
        last: parseFloat(d.last),
        bid: parseFloat(d.bidPx),
        ask: parseFloat(d.askPx),
        high: parseFloat(d.high24h),
        low: parseFloat(d.low24h),
        volume: parseFloat(d.vol24h),
        timestamp: Date.now(),
      };
    }
  } catch (e) {
    // 忽略
  }
  return null;
}

function startPriceUpdates() {
  console.log('📊 开始实时价格推送 (5秒间隔 + 自适应退避)');
  
  priceUpdateInterval = setInterval(async () => {
    const uniqueSymbols = new Map();
    
    // 收集所有订阅
    clients.forEach(client => {
      if (client.subscribedSymbol && client.readyState === 1) {
        const key = `${client.subscribedExchange}:${client.subscribedSymbol}`;
        uniqueSymbols.set(key, {
          exchange: client.subscribedExchange,
          symbol: client.subscribedSymbol
        });
      }
    });

    // 清理旧的定时器
    for (const timer of priceUpdateTimers.values()) {
      clearTimeout(timer);
    }
    priceUpdateTimers.clear();

    // ✅ 性能优化：获取并推送价格数据（使用缓存 + 退避）
    const dataSourceManager = require('./services/dataSourceManager');
    let delay = 0;
    for (const [key, { exchange, symbol }] of uniqueSymbols) {
      const timer = setTimeout(async () => {
        try {
          // 检查退避
          if (shouldSkipDueToBackoff(key)) {
            const state = backoffState.get(key);
            const remaining = Math.ceil((state.backoffMs - (Date.now() - state.lastAttempt)) / 1000);
            // console.log(`⏸️ [退避] 跳过 ${symbol}，剩余 ${remaining}秒`);
            return;
          }

          // ✅ 使用缓存获取ticker（可被全局实时策略缩短/绕过）
          const tickerCacheKey = `ws_ticker:${exchange}:${symbol}`;
          const globalRealtime = runtimeStrategy.isGlobalRealtime();
          let ticker;
          if (globalRealtime) {
            ticker = await dataSourceManager.getTicker(exchange, symbol);
          } else {
            ticker = caches.price.get(tickerCacheKey);
            if (!ticker) {
              ticker = await dataSourceManager.getTicker(exchange, symbol);
              caches.price.set(tickerCacheKey, ticker, runtimeStrategy.getTickerTTL());
            }
          }

          // ✅ 使用缓存获取指标（可被全局实时策略缩短/绕过）
          const indicatorsCacheKey = `ws_indicators:${exchange}:${symbol}`;
          let indicators;
          if (globalRealtime) {
            indicators = await dataSourceManager.getAllIndicators(exchange, symbol, '1h');
          } else {
            indicators = caches.indicators.get(indicatorsCacheKey);
            if (!indicators) {
              indicators = await dataSourceManager.getAllIndicators(exchange, symbol, '1h');
              caches.indicators.set(indicatorsCacheKey, indicators, runtimeStrategy.getIndicatorsTTL());
            }
          }

          // 成功：重置退避
          resetBackoff(key);

          const update = {
            type: 'price_update',
            exchange,
            symbol,
            data: {
              ...ticker,
              indicators: {
                rsi: indicators?.momentum?.rsi14,
                macd: indicators?.momentum?.macd,
                bollinger: indicators?.volatility?.bollingerBands
              }
            },
            timestamp: new Date().toISOString(),
            cached: !globalRealtime && ticker === caches.price.get(tickerCacheKey) // 标记是否来自缓存
          };

          // 调试日志：检查indicators数据（仅在DEBUG开启时输出，避免刷屏）
          if (WS_DEBUG && symbol === 'ETH/USDT') {
            dlog(`📊 [WebSocket] 发送${symbol}数据 - RSI14: ${indicators?.momentum?.rsi14}, MACD: ${indicators?.momentum?.macd?.MACD}`);
            dlog(`📊 [WebSocket] indicators对象结构:`, Object.keys(indicators || {}));
          }

          // 推送给订阅的客户端
          broadcast(update, (client) => {
            return client.subscribedSymbol === symbol &&
                   client.subscribedExchange === exchange;
          });
        } catch (error) {
          // 检测是否为限流错误
          const isRateLimit = error.message.includes('429') || 
                             error.message.includes('throttle queue') ||
                             error.message.includes('Too Many Requests');
          
          recordFailure(key, isRateLimit);
          
          // 限流错误不打印，避免刷屏
          if (!isRateLimit) {
            console.error(`获取 ${symbol} 价格失败:`, error.message);
          }
        } finally {
          // 清理已完成的定时器
          priceUpdateTimers.delete(key);
        }
      }, delay);

      // 保存定时器引用
      priceUpdateTimers.set(key, timer);
      delay += 500; // 每个交易对间隔0.5秒（降低并发）
    }

    // 热门交易对聚合推送（WS优先，避免前端轮询）
    // 使用更宽松的策略：优先缓存，失败时用 OKX 公共 API
    try {
      const HOT = ['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT'];
      const hotMap = {};
      for (const sym of HOT) {
        // 跳过已在订阅列表中的（避免重复）
        const alreadySubscribed = Array.from(uniqueSymbols.values()).some(s => s.symbol === sym);
        if (alreadySubscribed) continue;

        const hotKey = `okx:${sym}`;
        if (shouldSkipDueToBackoff(hotKey)) continue;

        try {
          const cacheKey = `ws_hot_ticker:okx:${sym}`;
          let ticker = caches.price.get(cacheKey);
          
          if (!ticker || runtimeStrategy.isGlobalRealtime()) {
            // 先尝试 dataSourceManager
            try {
              ticker = await dataSourceManager.getTicker('okx', sym);
              caches.price.set(cacheKey, ticker, runtimeStrategy.getTickerTTL());
              resetBackoff(hotKey);
            } catch (e) {
              // CCXT 失败：尝试 OKX 公共 API
              const isRateLimit = e.message.includes('429') || e.message.includes('throttle queue');
              if (isRateLimit) {
                ticker = await getTickerFromOKXPublicAPI(sym);
                if (ticker) {
                  caches.price.set(cacheKey, ticker, 10000); // 缓存10秒
                  resetBackoff(hotKey);
                } else {
                  recordFailure(hotKey, true);
                }
              } else {
                recordFailure(hotKey, false);
              }
            }
          }
          
          if (ticker) hotMap[sym] = ticker;
        } catch (e) {
          // 忽略单个失败
        }
      }
      if (Object.keys(hotMap).length > 0) {
        broadcast({ type: 'hot_tickers', data: hotMap, timestamp: new Date().toISOString() });
      }
    } catch (e) {
      // 忽略
    }
  }, WEBSOCKET.PRICE_UPDATE_INTERVAL); // ✅ 使用配置常量 (5000ms)
}

function broadcast(message, filter = null) {
  const data = JSON.stringify(message);
  
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      if (!filter || filter(client)) {
        client.send(data);
      }
    }
  });
}

// 导出广播函数供其他模块使用
function broadcastTradeSignal(signal) {
  broadcast({
    type: 'trade_signal',
    data: signal,
    timestamp: new Date().toISOString()
  });
}

function broadcastTradeExecution(trade) {
  broadcast({
    type: 'trade_execution',
    data: trade,
    timestamp: new Date().toISOString()
  });
}

// 设置监控服务的事件监听器（广播给订阅的客户端）
function setupMonitoringBroadcast() {
  // 状态更新事件
  monitoringService.on('statusUpdate', ({ type, data }) => {
    broadcast({
      type: 'monitoring_update',
      updateType: type,
      data,
      timestamp: Date.now()
    }, (client) => client.subscribedMonitoring);
  });

  // AI分析事件
  monitoringService.on('aiAnalysis', (analysis) => {
    broadcast({
      type: 'ai_analysis',
      data: analysis,
      timestamp: Date.now()
    }, (client) => client.subscribedMonitoring);
  });

  // 订单成交事件
  monitoringService.on('orderFilled', ({ orderId, order }) => {
    broadcast({
      type: 'order_filled',
      data: { orderId, order },
      timestamp: Date.now()
    }, (client) => client.subscribedMonitoring);
  });

  // 持仓变化事件
  monitoringService.on('positionOpened', (position) => {
    broadcast({
      type: 'position_opened',
      data: position,
      timestamp: Date.now()
    }, (client) => client.subscribedMonitoring);
  });

  monitoringService.on('positionClosed', (position) => {
    broadcast({
      type: 'position_closed',
      data: position,
      timestamp: Date.now()
    }, (client) => client.subscribedMonitoring);
  });

  // 错误和警告事件
  monitoringService.on('error', ({ message, timestamp }) => {
    broadcast({
      type: 'monitoring_error',
      message,
      timestamp
    }, (client) => client.subscribedMonitoring);
  });

  monitoringService.on('warning', ({ message, timestamp }) => {
    broadcast({
      type: 'monitoring_warning',
      message,
      timestamp
    }, (client) => client.subscribedMonitoring);
  });

  // 模型叙述事件（nof1.ai 风格）
  monitoringService.on('narrative', (narrative) => {
    dlog(`📡 [WebSocket] 收到叙述事件: type=${narrative.type}, id=${narrative.id}`);
    
    // 统计订阅的客户端数量（使用模块级 clients Set）
    const subscribedCount = Array.from(clients).filter(c => c.subscribedMonitoring && c.readyState === 1).length;
    dlog(`📡 [WebSocket] 订阅监控的客户端数: ${subscribedCount}`);
    
    broadcast({
      type: 'model_narrative',
      data: narrative,
      timestamp: narrative.timestamp || Date.now()
    }, (client) => client.subscribedMonitoring);
    
    dlog(`📡 [WebSocket] 叙述已广播`);
  });

  // 每5秒广播一次摘要（给订阅的客户端）
  if (monitoringSummaryInterval) {
    clearInterval(monitoringSummaryInterval);
  }
  monitoringSummaryInterval = setInterval(() => {
    const summary = monitoringService.getSummary();
    broadcast({
      type: 'monitoring_summary',
      data: summary
    }, (client) => client.subscribedMonitoring);
  }, 5000);

  console.log('[WebSocket] 监控事件广播已启动');

  // 🆕 OMS事件转发
  eventBus.on('order.submitting', (evt) => {
    broadcast({ type: 'oms_event', subType: 'order_submitting', data: evt, timestamp: Date.now() }, (client) => client.subscribedMonitoring);
  });
  eventBus.on('order.submitted', (evt) => {
    broadcast({ type: 'oms_event', subType: 'order_submitted', data: evt, timestamp: Date.now() }, (client) => client.subscribedMonitoring);
  });
  eventBus.on('order.error', (evt) => {
    broadcast({ type: 'oms_event', subType: 'order_error', data: evt, timestamp: Date.now() }, (client) => client.subscribedMonitoring);
  });
  eventBus.on('position.opened', (evt) => {
    broadcast({ type: 'oms_event', subType: 'position_opened', data: evt, timestamp: Date.now() }, (client) => client.subscribedMonitoring);
  });

  // 🆕 OKX 私有WS订单事件
  eventBus.on('order.ws_update', (evt) => {
    broadcast({ type: 'oms_event', subType: 'order_ws_update', data: evt, timestamp: Date.now() }, (client) => client.subscribedMonitoring);
  });
  eventBus.on('order.ws_filled', (evt) => {
    broadcast({ type: 'oms_event', subType: 'order_ws_filled', data: evt, timestamp: Date.now() }, (client) => client.subscribedMonitoring);
  });
  eventBus.on('order.ws_canceled', (evt) => {
    broadcast({ type: 'oms_event', subType: 'order_ws_canceled', data: evt, timestamp: Date.now() }, (client) => client.subscribedMonitoring);
  });
}

// 清理所有WebSocket资源
function cleanup() {
  // 清理价格更新定时器
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
    priceUpdateInterval = null;
  }

  // 清理所有价格更新定时器
  for (const timer of priceUpdateTimers.values()) {
    clearTimeout(timer);
  }
  priceUpdateTimers.clear();

  // 清理监控摘要定时器
  if (monitoringSummaryInterval) {
    clearInterval(monitoringSummaryInterval);
    monitoringSummaryInterval = null;
  }

  // 清理退避状态
  backoffState.clear();

  // 断开所有客户端连接
  clients.forEach(client => {
    if (client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
    }
    client.terminate();
  });
  clients.clear();

  console.log('[WebSocket] 所有资源已清理');
}

// 启动监控广播
setupMonitoringBroadcast();

module.exports = {
  setupWebSocket,
  broadcast,
  broadcastTradeSignal,
  broadcastTradeExecution,
  cleanup  // 导出cleanup函数供index.js使用
};
