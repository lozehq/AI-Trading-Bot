const { getDatabase } = require('../database');

class ExecutionService {
  static insert(exe) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO executions (
        client_order_id, order_id, symbol, exchange, side, type,
        expected_price, actual_price, requested_amount, filled_amount,
        slippage_bps, slippage_percent, latency_ms, fill_rate, status,
        analysis_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(
      exe.clientOrderId || null,
      exe.orderId || null,
      exe.symbol,
      exe.exchange || (process.env.EXCHANGE_NAME || 'okx'),
      exe.side,
      exe.type,
      exe.expectedPrice ?? null,
      exe.actualPrice ?? null,
      exe.requestedAmount ?? null,
      exe.filledAmount ?? null,
      exe.slippageBps ?? null,
      exe.slippagePercent ?? null,
      exe.latencyMs ?? null,
      exe.fillRate ?? null,
      exe.status || null,
      exe.analysisId || null
    );
  }

  static getRecent(limit = 10) {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM executions ORDER BY created_at DESC LIMIT ?
    `);
    return stmt.all(limit);
  }

  static query({ symbol, analysisId, limit = 50, offset = 0, orderBy = 'created_at', orderDirection = 'DESC' } = {}) {
    const db = getDatabase();
    const safeOrderBy = ['created_at','order_time','execution_time','symbol','status'].includes(String(orderBy)) ? orderBy : 'created_at';
    const safeDir = String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    let sql = 'SELECT * FROM executions WHERE 1=1';
    const params = [];
    if (symbol) { sql += ' AND symbol = ?'; params.push(symbol); }
    if (analysisId) { sql += ' AND analysis_id = ?'; params.push(String(analysisId)); }
    sql += ` ORDER BY ${safeOrderBy} ${safeDir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }
}

module.exports = ExecutionService;


