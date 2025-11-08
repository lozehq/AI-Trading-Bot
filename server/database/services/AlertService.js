/**
 * 预警数据库服务
 * 提供预警的持久化存储和查询功能
 */

const { getDatabase } = require('../database');

class AlertService {
  /**
   * 创建预警
   */
  static create(alert) {
    const db = getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO price_alerts (
        id, symbol, exchange, type, price, message,
        notification_email, notification_webhook, notification_browser, notification_sound,
        repeat, enabled, source, reason
      ) VALUES (
        @id, @symbol, @exchange, @type, @price, @message,
        @notification_email, @notification_webhook, @notification_browser, @notification_sound,
        @repeat, @enabled, @source, @reason
      )
    `);

    const result = stmt.run({
      id: alert.id,
      symbol: alert.symbol,
      exchange: alert.exchange || 'binance',
      type: alert.type,
      price: alert.price,
      message: alert.message || '',
      notification_email: alert.notification?.email ? 1 : 0,
      notification_webhook: alert.notification?.webhook ? 1 : 0,
      notification_browser: alert.notification?.browser !== false ? 1 : 0,
      notification_sound: alert.notification?.sound !== false ? 1 : 0,
      repeat: alert.repeat ? 1 : 0,
      enabled: alert.enabled !== false ? 1 : 0,
      source: alert.source || 'manual',
      reason: alert.reason || ''
    });

    console.log(`✅ 预警已保存到数据库: ID=${alert.id}`);
    return result.changes > 0;
  }

  /**
   * 更新预警
   */
  static update(id, updates) {
    const db = getDatabase();
    
    // 构建更新字段
    const fields = [];
    const params = { id };
    
    if (updates.enabled !== undefined) {
      fields.push('enabled = @enabled');
      params.enabled = updates.enabled ? 1 : 0;
    }
    
    if (updates.lastTriggered !== undefined) {
      fields.push('last_triggered = @last_triggered');
      params.last_triggered = updates.lastTriggered;
    }
    
    if (updates.triggerCount !== undefined) {
      fields.push('trigger_count = @trigger_count');
      params.trigger_count = updates.triggerCount;
    }
    
    if (updates.cooldownUntil !== undefined) {
      fields.push('cooldown_until = @cooldown_until');
      params.cooldown_until = updates.cooldownUntil;
    }
    
    if (updates.price !== undefined) {
      fields.push('price = @price');
      params.price = updates.price;
    }
    
    if (updates.message !== undefined) {
      fields.push('message = @message');
      params.message = updates.message;
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = CURRENT_TIMESTAMP');

    const stmt = db.prepare(`
      UPDATE price_alerts 
      SET ${fields.join(', ')}
      WHERE id = @id
    `);

    const result = stmt.run(params);
    return result.changes > 0;
  }

  /**
   * 删除预警
   */
  static delete(id) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM price_alerts WHERE id = ?');
    const result = stmt.run(id);
    
    if (result.changes > 0) {
      console.log(`✅ 预警已从数据库删除: ID=${id}`);
    }
    
    return result.changes > 0;
  }

  /**
   * 批量删除预警
   */
  static deleteBatch(ids) {
    const db = getDatabase();
    
    const deleteMany = db.transaction((ids) => {
      let count = 0;
      for (const id of ids) {
        if (this.delete(id)) {
          count++;
        }
      }
      return count;
    });

    return deleteMany(ids);
  }

  /**
   * 获取单个预警
   */
  static getById(id) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM price_alerts WHERE id = ?');
    const row = stmt.get(id);
    
    return row ? this.deserialize(row) : null;
  }

  /**
   * 获取所有预警
   */
  static getAll(filters = {}) {
    const db = getDatabase();
    
    let sql = 'SELECT * FROM price_alerts WHERE 1=1';
    const params = [];

    if (filters.symbol) {
      sql += ' AND symbol = ?';
      params.push(filters.symbol);
    }

    if (filters.exchange) {
      sql += ' AND exchange = ?';
      params.push(filters.exchange);
    }

    if (filters.enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(filters.enabled ? 1 : 0);
    }

    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.source) {
      sql += ' AND source = ?';
      params.push(filters.source);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => this.deserialize(row));
  }

  /**
   * 获取活跃预警（启用且未在冷却期）
   */
  static getActive(symbol = null) {
    const db = getDatabase();
    
    let sql = `
      SELECT * FROM price_alerts 
      WHERE enabled = 1 
      AND (cooldown_until IS NULL OR cooldown_until < datetime('now'))
    `;
    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => this.deserialize(row));
  }

  /**
   * 记录预警触发
   */
  static recordTrigger(alertId, triggerPrice, alertPrice, type, message) {
    const db = getDatabase();
    
    // 获取预警信息
    const alert = this.getById(alertId);
    if (!alert) {
      console.warn(`⚠️ 预警不存在: ${alertId}`);
      return false;
    }

    // 插入触发记录
    const stmt = db.prepare(`
      INSERT INTO alert_triggers (
        alert_id, symbol, trigger_price, alert_price, type, message, notification_sent
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(alertId, alert.symbol, triggerPrice, alertPrice, type, message);

    // 更新预警的触发信息
    this.update(alertId, {
      lastTriggered: new Date().toISOString(),
      triggerCount: alert.triggerCount + 1
    });

    console.log(`✅ 预警触发已记录: ${alertId}`);
    return true;
  }

  /**
   * 获取预警触发历史
   */
  static getTriggerHistory(alertId = null, limit = 100) {
    const db = getDatabase();
    
    let sql = 'SELECT * FROM alert_triggers';
    const params = [];

    if (alertId) {
      sql += ' WHERE alert_id = ?';
      params.push(alertId);
    }

    sql += ' ORDER BY triggered_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 清理过期预警
   */
  static cleanupExpired() {
    const db = getDatabase();
    
    // 删除已触发且不重复的预警（24小时后）
    const stmt = db.prepare(`
      DELETE FROM price_alerts 
      WHERE enabled = 0 
      AND repeat = 0 
      AND last_triggered IS NOT NULL
      AND datetime(last_triggered, '+24 hours') < datetime('now')
    `);

    const result = stmt.run();
    
    if (result.changes > 0) {
      console.log(`🧹 清理了 ${result.changes} 个过期预警`);
    }
    
    return result.changes;
  }

  /**
   * 获取预警统计
   */
  static getStatistics(symbol = null) {
    const db = getDatabase();
    
    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN enabled = 0 THEN 1 ELSE 0 END) as inactive,
        SUM(trigger_count) as total_triggers,
        COUNT(DISTINCT symbol) as unique_symbols
      FROM price_alerts
    `;
    const params = [];

    if (symbol) {
      sql += ' WHERE symbol = ?';
      params.push(symbol);
    }

    const stmt = db.prepare(sql);
    return stmt.get(...params);
  }

  /**
   * 反序列化数据库行为对象
   */
  static deserialize(row) {
    return {
      id: row.id,
      symbol: row.symbol,
      exchange: row.exchange,
      type: row.type,
      price: parseFloat(row.price),
      message: row.message,
      notification: {
        email: row.notification_email === 1,
        webhook: row.notification_webhook === 1,
        browser: row.notification_browser === 1,
        sound: row.notification_sound === 1
      },
      repeat: row.repeat === 1,
      enabled: row.enabled === 1,
      lastTriggered: row.last_triggered,
      triggerCount: row.trigger_count,
      cooldownUntil: row.cooldown_until,
      source: row.source,
      reason: row.reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = { AlertService };

