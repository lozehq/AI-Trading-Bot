const { getDatabase } = require('../database/database');

function safeStringify(value, fallback = 'null') {
  try {
    return JSON.stringify(value, (key, val) => {
      if (val === undefined || val === null) return null;
      if (typeof val === 'number' && !isFinite(val)) return null;
      if (typeof val === 'function') return undefined;
      return val;
    });
  } catch (e) {
    return fallback;
  }
}

class BacktestMemoryService {
  saveResult(contextId, symbol, strategy, params, result) {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO ai_backtests (context_id, symbol, strategy, params_json, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);
      const info = stmt.run(
        contextId || null,
        symbol,
        strategy,
        safeStringify(params, 'null'),
        safeStringify(result, 'null')
      );
      return { success: true, id: info.lastInsertRowid };
    } catch (error) {
      console.error('❌ 保存回测结果失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  listResults({ contextId = null, symbol = null, limit = 50 } = {}) {
    try {
      const db = getDatabase();
      let sql = `SELECT * FROM ai_backtests WHERE 1=1`;
      const params = {};
      if (contextId !== null && contextId !== undefined) { sql += ' AND context_id = @contextId'; params.contextId = Number(contextId); }
      if (symbol) { sql += ' AND symbol = @symbol'; params.symbol = symbol; }
      sql += ' ORDER BY id DESC LIMIT @limit';
      params.limit = Math.max(1, Math.min(250, Number(limit) || 50));

      const rows = db.prepare(sql).all(params);
      return rows.map(r => ({
        id: r.id,
        contextId: r.context_id,
        symbol: r.symbol,
        strategy: r.strategy,
        params: (()=>{ try { return JSON.parse(r.params_json || 'null'); } catch(e){ return null; } })(),
        result: (()=>{ try { return JSON.parse(r.result_json || 'null'); } catch(e){ return null; } })(),
        createdAt: r.created_at
      }));
    } catch (error) {
      console.error('❌ 查询回测结果失败:', error.message);
      return [];
    }
  }

  clearContext(contextId) {
    try {
      const db = getDatabase();
      const res = db.prepare('DELETE FROM ai_backtests WHERE context_id = ?').run(contextId);
      return { success: true, deleted: res.changes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new BacktestMemoryService();


