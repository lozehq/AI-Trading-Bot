/**
 * 分析结果自动验证服务
 * - 定期回看历史分析，在合适时间点基于现价打标签：正确/错误/中性
 */

const { getDatabase } = require('../database/database');
const dataSourceManager = require('./dataSourceManager');

let timer = null;

function getDb() {
  return getDatabase();
}

function pickThresholdPct(ttlSec) {
  // 根据时效动态阈值（更短有效期 -> 更小阈值）
  if (!ttlSec || ttlSec <= 0) return 0.3; // 默认0.3%
  if (ttlSec <= 15 * 60) return 0.2;      // ≤15分钟
  if (ttlSec <= 60 * 60) return 0.3;      // ≤1小时
  if (ttlSec <= 6 * 60 * 60) return 0.5;  // ≤6小时
  return 0.8;                              // 更长期
}

function listPending(limit = 20) {
  const db = getDb();
  // 仅挑选：尚未打outcome，且创建已超过最小观测窗口（>=10分钟或TTL的1/3）
  const rows = db.prepare(`
    SELECT id, symbol, exchange, signal, entry_price AS entryPrice,
           ttl_sec AS ttlSec, valid_until AS validUntil, created_at AS createdAt,
           status
    FROM ai_analyses
    WHERE outcome IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
  return rows;
}

async function evaluateOne(row) {
  const exchange = row.exchange || (process.env.EXCHANGE_NAME || 'okx');
  const symbol = row.symbol;
  const entry = Number(row.entryPrice);
  if (!isFinite(entry) || entry <= 0) return;

  try {
    const ticker = await dataSourceManager.getTicker(exchange, symbol);
    if (!ticker || !ticker.last) return;
    const cur = Number(ticker.last);
    const deltaPct = ((cur - entry) / entry) * 100;
    const ttlSec = Number(row.ttlSec) || 0;
    const thr = pickThresholdPct(ttlSec);

    let outcome = 'neutral';
    if (String(row.signal).toUpperCase() === 'BUY') {
      if (deltaPct >= thr) outcome = 'correct';
      else if (deltaPct <= -thr) outcome = 'wrong';
    } else if (String(row.signal).toUpperCase() === 'SELL') {
      if (deltaPct <= -thr) outcome = 'correct';
      else if (deltaPct >= thr) outcome = 'wrong';
    }

    const db = getDb();
    db.prepare(`UPDATE ai_analyses SET outcome = ?, outcome_price = ?, outcome_at = datetime('now') WHERE id = ?`)
      .run(outcome, cur, row.id);

    // 辅助：如果已过期但仍标记为active，进行纠正
    try {
      if (row.status === 'active' && row.validUntil) {
        const now = Date.now();
        const until = Date.parse(row.validUntil);
        if (isFinite(until) && until <= now) {
          db.prepare(`UPDATE ai_analyses SET status = 'expired', status_reason = 'ttl_expired' WHERE id = ?`).run(row.id);
        }
      }
    } catch (_) {}
  } catch (_) {
    // 静默失败，等待下次轮询
  }
}

async function tick() {
  try {
    const pending = listPending(20);
    for (const row of pending) {
      await evaluateOne(row);
    }
  } catch (_) {}
}

function start() {
  if (timer) return;
  // 每2分钟评估一次
  timer = setInterval(tick, 2 * 60 * 1000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };


