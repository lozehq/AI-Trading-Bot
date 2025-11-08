/**
 * OKX 私有 WebSocket（订单/账户/持仓）
 * - 仅在 TRADING_MODE = live|demo 且配置了 OKX_API_* 时启用
 * - 订阅: orders(SPOT)；后续可扩展 account/positions
 */

const crypto = require('crypto');
const WebSocket = require('ws');
const eventBus = require('../EventBus');

const OKX_WS_PUBLIC = 'wss://ws.okx.com:8443/ws/v5/private';
const OKX_WS_DEMO = 'wss://wspap.okx.com:8443/ws/v5/private';

let ws = null;
let reconnectTimer = null;
let reconnectBackoffMs = 2000;
const RECONNECT_MAX_MS = 30000;
let loggedIn = false;

function nowISO() {
  return new Date().toISOString().replace('Z', 'Z');
}

function buildLoginMessage() {
  const apiKey = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;
  const ts = (Date.now() / 1000).toString();
  const signPayload = ts + 'GET' + '/users/self/verify';
  const sign = crypto
    .createHmac('sha256', secret)
    .update(signPayload)
    .digest('base64');
  return {
    op: 'login',
    args: [
      {
        apiKey,
        passphrase,
        timestamp: ts,
        sign
      }
    ]
  };
}

function subscribeOrders() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // instType 必须为大写：SPOT/MARGIN/SWAP/FUTURES/OPTION
  const instTypeEnv = process.env.DEFAULT_MARKET_TYPE || 'SPOT';
  const instType = String(instTypeEnv).toUpperCase();
  const msg = {
    op: 'subscribe',
    args: [
      { channel: 'orders', instType }
    ]
  };
  ws.send(JSON.stringify(msg));
}

function handleOrderMessage(msg) {
  const dataArr = Array.isArray(msg.data) ? msg.data : [];
  for (const d of dataArr) {
    const symbol = (d.instId || '').replace(/-/g, '/');
    const payload = {
      orderId: d.ordId,
      clientOrderId: d.clOrdId,
      symbol,
      side: (d.side || '').toUpperCase(),
      state: d.state,
      fillSize: parseFloat(d.accFillSz || d.fillSz || 0),
      avgPrice: d.avgPx ? parseFloat(d.avgPx) : undefined,
      price: d.px ? parseFloat(d.px) : undefined,
      size: d.sz ? parseFloat(d.sz) : undefined,
      ts: Number(d.uTime || d.cTime || Date.now())
    };
    try { eventBus.emit('order.ws_update', payload); } catch(_) {}
    if (payload.state === 'filled') {
      try { eventBus.emit('order.ws_filled', payload); } catch(_) {}
    } else if (payload.state === 'canceled' || payload.state === 'cancelled') {
      try { eventBus.emit('order.ws_canceled', payload); } catch(_) {}
    }
  }
}

function connect() {
  if (ws) {
    try { ws.close(); } catch (_) {}
    ws = null;
  }

  const mode = (process.env.TRADING_MODE || 'paper').toLowerCase();
  if (mode === 'paper') {
    console.log('[OKX WS] 跳过：paper 模式不启用私有WS');
    return;
  }
  if (!process.env.OKX_API_KEY || !process.env.OKX_API_SECRET || !process.env.OKX_API_PASSPHRASE) {
    console.warn('[OKX WS] 跳过：缺少 API 凭证');
    return;
  }

  const isDemo = mode === 'demo' || process.env.OKX_SIMULATED === 'true';
  const url = isDemo ? OKX_WS_DEMO : OKX_WS_PUBLIC;
  console.log(`[OKX WS] 连接: ${url}`);

  const headers = {};
  if (isDemo) headers['x-simulated-trading'] = '1';

  ws = new WebSocket(url, { headers });

  ws.on('open', () => {
    console.log('[OKX WS] 已连接，登录中...');
    loggedIn = false;
    ws.send(JSON.stringify(buildLoginMessage()));
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'login' && msg.code === '0') {
        loggedIn = true;
        console.log('[OKX WS] 登录成功，订阅订单通道');
        subscribeOrders();
        reconnectBackoffMs = 2000;
        return;
      }
      if (msg.event === 'error') {
        console.warn('[OKX WS] 错误事件:', msg);
        return;
      }
      if (msg.arg && msg.arg.channel === 'orders') {
        handleOrderMessage(msg);
        return;
      }
    } catch (e) {
      console.error('[OKX WS] 解析消息失败:', e.message);
    }
  });

  ws.on('close', () => {
    console.warn('[OKX WS] 连接关闭，准备重连...');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[OKX WS] 错误:', err.message);
    try { ws.close(); } catch (_) {}
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectBackoffMs = Math.min(reconnectBackoffMs * 2, RECONNECT_MAX_MS);
    connect();
  }, reconnectBackoffMs);
}

function start() {
  connect();
}

function stop() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (ws) {
    try { ws.terminate(); } catch(_) {}
    ws = null;
  }
}

module.exports = { start, stop };


