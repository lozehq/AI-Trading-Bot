const WebSocket = require('ws');
const { getDatabase } = require('../database/database');
const networkOptimizer = require('../utils/networkOptimizer');

// OKX Public WS
const OKX_WS_PUBLIC = 'wss://ws.okx.com:8443/ws/v5/public';

function toInstId(symbol) {
  return String(symbol).replace('/', '-').toUpperCase();
}

class TickRecorder {
  constructor() {
    this.sessions = new Map(); // key: symbol -> { ws, running }
  }

  isRunning(symbol) {
    const s = this.sessions.get(symbol);
    return !!(s && s.running);
  }

  start(symbol) {
    if (this.isRunning(symbol)) return true;
    const instId = toInstId(symbol);
    const ws = new WebSocket(OKX_WS_PUBLIC);
    const state = { ws, running: true };
    this.sessions.set(symbol, state);

    ws.on('open', () => {
      try {
        ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'trades', instId }] }));
        // 也可订阅books5做增量回放，这里先聚焦trades
      } catch (_) {}
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'subscribe' || msg.arg?.channel !== 'trades') return;
        const arr = Array.isArray(msg.data) ? msg.data : [];
        if (arr.length === 0) return;
        const db = getDatabase();
        const stmt = db.prepare(`INSERT INTO tick_trades (symbol, exchange, price, size, side, ts) VALUES (?, 'okx', ?, ?, ?, ?)`);
        for (const d of arr) {
          const price = Number(d.px);
          const size = Number(d.sz);
          const side = d.side;
          const ts = Number(d.ts);
          if (Number.isFinite(price) && Number.isFinite(ts)) {
            try { stmt.run(symbol, price, size, side, ts); } catch (_) {}
          }
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      state.running = false;
      this.sessions.delete(symbol);
    });

    ws.on('error', () => {
      try { ws.close(); } catch (_) {}
    });
    return true;
  }

  stop(symbol) {
    const s = this.sessions.get(symbol);
    if (!s) return true;
    try { s.ws.close(); } catch (_) {}
    s.running = false;
    this.sessions.delete(symbol);
    return true;
  }

  async backfillRecent(symbol, limit = 500) {
    const instId = toInstId(symbol);
    // OKX 最近成交（最多100一页），循环抓取直到limit或无更多
    let fetched = 0;
    let after = undefined; // OKX trades不支持翻页游标，简单抓一次
    const page = Math.min(Math.max(limit, 1), 100);
    try {
      const url = `https://www.okx.com/api/v5/market/trades`;
      const res = await networkOptimizer.get(url, { params: { instId, limit: page }, timeout: 8000 });
      const data = res?.data?.data || [];
      const db = getDatabase();
      const stmt = db.prepare(`INSERT INTO tick_trades (symbol, exchange, price, size, side, ts) VALUES (?, 'okx', ?, ?, ?, ?)`);
      for (const d of data) {
        const price = Number(d.px);
        const size = Number(d.sz);
        const side = d.side;
        const ts = Number(d.ts);
        if (Number.isFinite(price) && Number.isFinite(ts)) {
          try { stmt.run(symbol, price, size, side, ts); fetched++; } catch (_) {}
        }
      }
    } catch (_) {}
    return { fetched };
  }

  stats(symbol) {
    try {
      const db = getDatabase();
      const row = db.prepare(`SELECT COUNT(*) AS cnt, MIN(ts) AS minTs, MAX(ts) AS maxTs FROM tick_trades WHERE symbol = ?`).get(symbol);
      return row || { cnt: 0 };
    } catch (e) {
      return { cnt: 0 };
    }
  }
}

module.exports = new TickRecorder();


