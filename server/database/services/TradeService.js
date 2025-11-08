/**
 * 交易历史服务
 */

const { getDatabase } = require('../database');

class TradeService {
  /**
   * 创建交易记录
   */
  static create(trade) {
    const db = getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO trades (
        symbol, exchange, side, type, price, amount, total,
        fee, fee_currency, status, order_id, strategy,
        entry_price, stop_loss, take_profit, pnl, pnl_percentage, notes
      ) VALUES (
        @symbol, @exchange, @side, @type, @price, @amount, @total,
        @fee, @fee_currency, @status, @order_id, @strategy,
        @entry_price, @stop_loss, @take_profit, @pnl, @pnl_percentage, @notes
      )
    `);

    const result = stmt.run({
      symbol: trade.symbol,
      exchange: trade.exchange,
      side: trade.side,
      type: trade.type || 'MARKET',
      price: trade.price,
      amount: trade.amount,
      total: trade.total,
      fee: trade.fee || 0,
      fee_currency: trade.fee_currency || null,
      status: trade.status || 'PENDING',
      order_id: trade.order_id || null,
      strategy: trade.strategy || null,
      entry_price: trade.entry_price || null,
      stop_loss: trade.stop_loss || null,
      take_profit: trade.take_profit || null,
      pnl: trade.pnl || null,
      pnl_percentage: trade.pnl_percentage || null,
      notes: trade.notes || null
    });

    console.log(`✅ 交易记录已创建: ID=${result.lastInsertRowid}`);
    return result.lastInsertRowid;
  }

  /**
   * 更新交易记录
   */
  static update(id, updates) {
    const db = getDatabase();
    
    const fields = Object.keys(updates)
      .filter(key => key !== 'id')
      .map(key => `${key} = @${key}`)
      .join(', ');

    if (!fields) return false;

    const stmt = db.prepare(`
      UPDATE trades 
      SET ${fields}, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    const result = stmt.run({ id, ...updates });
    return result.changes > 0;
  }

  /**
   * 获取单个交易记录
   */
  static getById(id) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM trades WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * 查询交易记录
   */
  static query(query = {}) {
    const db = getDatabase();

    let sql = 'SELECT * FROM trades WHERE 1=1';
    const params = [];

    if (query.symbol) {
      sql += ' AND symbol = ?';
      params.push(query.symbol);
    }

    if (query.exchange) {
      sql += ' AND exchange = ?';
      params.push(query.exchange);
    }

    if (query.side) {
      sql += ' AND side = ?';
      params.push(query.side);
    }

    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    if (query.start_date) {
      sql += ' AND created_at >= ?';
      params.push(query.start_date);
    }

    if (query.end_date) {
      sql += ' AND created_at <= ?';
      params.push(query.end_date);
    }

    // 排序 - 添加白名单验证防止SQL注入
    const allowedOrderBy = ['created_at', 'symbol', 'exchange', 'side', 'type', 'price', 'amount', 'total', 'pnl', 'pnl_percentage', 'id'];
    const allowedDirection = ['ASC', 'DESC'];

    const orderBy = allowedOrderBy.includes(query.orderBy) ? query.orderBy : 'created_at';
    const orderDirection = allowedDirection.includes(query.orderDirection) ? query.orderDirection : 'DESC';
    sql += ` ORDER BY ${orderBy} ${orderDirection}`;

    // 分页
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);

      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }
    }

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 获取所有交易记录
   */
  static getAll(limit = 100) {
    return this.query({ limit, orderBy: 'created_at', orderDirection: 'DESC' });
  }

  /**
   * 获取最近的交易记录
   */
  static getRecent(limit = 10) {
    return this.query({ limit, orderBy: 'created_at', orderDirection: 'DESC' });
  }

  /**
   * 删除交易记录
   */
  static delete(id) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM trades WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * 获取交易统计
   */
  static getStatistics(symbol, exchange) {
    const db = getDatabase();

    let sql = 'SELECT * FROM v_trade_statistics WHERE 1=1';
    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }

    if (exchange) {
      sql += ' AND exchange = ?';
      params.push(exchange);
    }

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 计算总盈亏
   */
  static getTotalPnL(symbol) {
    const db = getDatabase();

    let sql = 'SELECT SUM(pnl) as total FROM trades WHERE status = "FILLED"';
    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }

    const stmt = db.prepare(sql);
    const result = stmt.get(...params);
    return (result && result.total) || 0;
  }

  /**
   * 获取胜率
   */
  static getWinRate(symbol) {
    const db = getDatabase();

    let sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins
      FROM trades
      WHERE status = "FILLED" AND pnl IS NOT NULL
    `;
    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }

    const stmt = db.prepare(sql);
    const result = stmt.get(...params);

    if (!result || result.total === 0) return 0;
    return (result.wins / result.total) * 100;
  }

  /**
   * 获取交易数量
   */
  static getCount(query = {}) {
    const db = getDatabase();

    let sql = 'SELECT COUNT(*) as count FROM trades WHERE 1=1';
    const params = [];

    if (query.symbol) {
      sql += ' AND symbol = ?';
      params.push(query.symbol);
    }

    if (query.exchange) {
      sql += ' AND exchange = ?';
      params.push(query.exchange);
    }

    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    const stmt = db.prepare(sql);
    const result = stmt.get(...params);
    return (result && result.count) || 0;
  }

  /**
   * 批量创建交易记录
   */
  static createBatch(trades) {
    const db = getDatabase();
    
    const insert = db.transaction((trades) => {
      let count = 0;
      for (const trade of trades) {
        this.create(trade);
        count++;
      }
      return count;
    });

    return insert(trades);
  }

  /**
   * 清空所有交易记录（谨慎使用）
   */
  static truncate() {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM trades');
    const result = stmt.run();
    console.log(`⚠️ 已清空所有交易记录: ${result.changes} 条`);
    return result.changes > 0;
  }
}

module.exports = { TradeService };

