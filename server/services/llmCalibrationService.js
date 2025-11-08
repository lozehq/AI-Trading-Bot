/**
 * LLM 信号离线评估与阈值校准服务（P3 - 最小落地版）
 * - 基于 ai_analyses 表中已打 outcome 的历史，按置信度分桶统计命中率
 * - 提供：
 *   1) getStats(symbol, { lookbackDays, bucket, minBin }) → 分桶统计
 *   2) getMinConfidenceForTargetWinRate(symbol, target, opts) → 达成目标胜率所需的最小置信度
 *   3) getDynamicMinConfidence({ symbol, signal, targetWinRate }) → 单次阈值查询（带10分钟缓存）
 */

const { getDatabase } = require('../database/database');

class LLMCalibrationService {
  constructor() {
    this.cache = new Map(); // key -> { ts, data }
    this.cacheTtlMs = 10 * 60 * 1000; // 10分钟
  }

  getDb() {
    return getDatabase();
  }

  _cacheKey(symbol, lookbackDays, bucket, minBin, perSignal, alignment) {
    return [symbol || '*', lookbackDays, bucket, minBin, perSignal ? 1 : 0, alignment || ''].join('|');
  }

  /**
   * 读取已评估历史并按置信度分桶
   */
  getStats(symbol, { lookbackDays = 30, bucket = 5, minBin = 10, perSignal = false, alignment = null } = {}) {
    try {
      const db = this.getDb();
      const params = [];
      let sql = `
        SELECT confidence, outcome, signal, analysis_result, created_at
        FROM ai_analyses
        WHERE outcome IS NOT NULL
      `;
      if (symbol) { sql += ' AND symbol = ?'; params.push(symbol); }
      if (lookbackDays && lookbackDays > 0) {
        sql += ` AND datetime(created_at) >= datetime('now', ?)`;
        params.push(`-${Math.floor(lookbackDays)} days`);
      }
      sql += ' ORDER BY created_at DESC LIMIT 2000';

      const rows = db.prepare(sql).all(...params);
      if (!rows || rows.length === 0) return { bins: [], total: 0 };

      const makeKey = (c) => {
        const s = Math.max(0, Math.min(100, Math.floor(c)));
        const start = Math.floor(s / bucket) * bucket;
        const end = Math.min(100, start + bucket);
        return { start, end, key: `${start}-${end}` };
      };

      const bins = new Map(); // key -> { start, end, total, correct, signal? }

      const classifyAlignment = (row) => {
        try {
          const sig = String(row.signal || '').toUpperCase();
          const raw = row.analysis_result;
          const obj = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
          const regime = obj?.analysis?.regime || obj?.regime || null;
          const name = String(regime?.name || '').toUpperCase();
          const dir = String(regime?.direction || 'NEUTRAL').toUpperCase();
          if (name !== 'TREND') return null; // 非 TREND 不参与对齐分桶
          if (sig !== 'BUY' && sig !== 'SELL') return null;
          const anti = (sig === 'BUY' && dir === 'BEAR') || (sig === 'SELL' && dir === 'BULL');
          return anti ? 'counter' : 'aligned';
        } catch (_) {
          return null;
        }
      };

      for (const r of rows) {
        const conf = Number(r.confidence);
        if (!Number.isFinite(conf)) continue;

        // 按趋势对齐过滤（可选）
        if (alignment) {
          const aln = classifyAlignment(r);
          if (aln !== alignment) continue;
        }

        const k = makeKey(conf);
        const sigKey = String(r.signal || '').toUpperCase();
        const key = perSignal ? `${k.key}|${sigKey}` : k.key;
        if (!bins.has(key)) bins.set(key, { start: k.start, end: k.end, total: 0, correct: 0, signal: perSignal ? sigKey : null });
        const b = bins.get(key);
        b.total += 1;
        if (String(r.outcome) === 'correct') b.correct += 1;
      }

      // 过滤样本过少的桶
      const arr = Array.from(bins.values()).filter(b => b.total >= minBin);
      arr.sort((a, b) => a.start - b.start);
      return { bins: arr, total: rows.length };
    } catch (e) {
      return { bins: [], total: 0, error: e.message };
    }
  }

  /**
   * 达成目标胜率所需的最小置信度（按桶）
   */
  getMinConfidenceForTargetWinRate(symbol, target = 0.55, { lookbackDays = 30, bucket = 5, minBin = 10, signal = null, alignment = null } = {}) {
    const perSignal = !!signal;
    const stats = this.getStats(symbol, { lookbackDays, bucket, minBin, perSignal, alignment });
    if (!stats.bins || stats.bins.length === 0) return null;

    const bins = stats.bins.filter(b => !signal || b.signal === String(signal).toUpperCase());
    if (bins.length === 0) return null;

    for (const b of bins) {
      const hit = b.correct / b.total;
      if (hit >= target) {
        return b.start; // 取桶起点作为最低置信度要求
      }
    }
    return null;
  }

  /**
   * 单次阈值查询（带缓存）
   */
  getDynamicMinConfidence({ symbol, signal = null, alignment = null, targetWinRate = 0.55, lookbackDays = 30, bucket = 5, minBin = 10 } = {}) {
    const key = this._cacheKey(symbol, lookbackDays, bucket, minBin, !!signal, alignment || null) + `|${targetWinRate}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && (now - cached.ts) < this.cacheTtlMs) return cached.data;

    const v = this.getMinConfidenceForTargetWinRate(symbol, targetWinRate, { lookbackDays, bucket, minBin, signal, alignment });
    this.cache.set(key, { ts: now, data: v });
    return v;
  }
}

module.exports = new LLMCalibrationService();

