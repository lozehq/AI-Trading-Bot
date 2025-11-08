/**
 * 数据库事务管理器
 * 提供原子性事务操作支持
 */

const { getDatabase } = require('./database');

class TransactionManager {
  /**
   * 执行事务操作
   * @param {Function} callback - 事务回调函数
   * @param {Object} options - 事务选项
   * @returns {Promise<any>} 事务执行结果
   */
  static async execute(callback, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 100,
      isolation = 'DEFERRED' // DEFERRED | IMMEDIATE | EXCLUSIVE
    } = options;

    const db = getDatabase();

    // 重试逻辑处理SQLITE_BUSY错误
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 创建事务
        const transaction = db.transaction(callback);

        // 设置隔离级别
        if (isolation === 'IMMEDIATE') {
          transaction.immediate();
        } else if (isolation === 'EXCLUSIVE') {
          transaction.exclusive();
        }

        // 执行事务
        const result = transaction();

        // 事务成功
        return {
          success: true,
          data: result,
          attempts: attempt
        };

      } catch (error) {
        console.error(`[事务] 执行失败 (尝试 ${attempt}/${maxRetries}):`, error.message);

        // 检查是否为SQLITE_BUSY错误
        if (error.code === 'SQLITE_BUSY' && attempt < maxRetries) {
          console.log(`[事务] 数据库繁忙，${retryDelay}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          continue;
        }

        // 最后一次尝试失败或非BUSY错误
        if (attempt === maxRetries) {
          throw new Error(`事务失败（已重试${maxRetries}次）: ${error.message}`);
        }

        throw error;
      }
    }
  }

  /**
   * 批量插入操作（事务优化）
   * @param {string} tableName - 表名
   * @param {Array} records - 记录数组
   * @param {Object} options - 插入选项
   * @returns {Promise<Object>} 插入结果
   */
  static async batchInsert(tableName, records, options = {}) {
    const {
      onConflict = 'IGNORE', // IGNORE | REPLACE | FAIL
      chunkSize = 100
    } = options;

    if (!Array.isArray(records) || records.length === 0) {
      return { success: true, inserted: 0 };
    }

    const db = getDatabase();
    let totalInserted = 0;

    // 分块插入避免单个事务过大
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);

      await this.execute(() => {
        // 构建插入语句
        const columns = Object.keys(chunk[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const conflictClause = onConflict === 'IGNORE' ? 'OR IGNORE' :
                               onConflict === 'REPLACE' ? 'OR REPLACE' : '';

        const sql = `INSERT ${conflictClause} INTO ${tableName}
                     (${columns.join(', ')}) VALUES (${placeholders})`;

        const stmt = db.prepare(sql);

        // 执行批量插入
        for (const record of chunk) {
          const values = columns.map(col => record[col]);
          const result = stmt.run(...values);
          totalInserted += result.changes;
        }
      });
    }

    return {
      success: true,
      inserted: totalInserted,
      total: records.length
    };
  }

  /**
   * 批量更新操作（事务优化）
   * @param {string} tableName - 表名
   * @param {Array} updates - 更新数组 [{id, data}]
   * @returns {Promise<Object>} 更新结果
   */
  static async batchUpdate(tableName, updates) {
    if (!Array.isArray(updates) || updates.length === 0) {
      return { success: true, updated: 0 };
    }

    const db = getDatabase();

    return await this.execute(() => {
      let totalUpdated = 0;

      for (const { id, data } of updates) {
        const columns = Object.keys(data);
        const setClause = columns.map(col => `${col} = ?`).join(', ');
        const values = columns.map(col => data[col]);

        const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
        const stmt = db.prepare(sql);
        const result = stmt.run(...values, id);
        totalUpdated += result.changes;
      }

      return {
        success: true,
        updated: totalUpdated,
        total: updates.length
      };
    });
  }

  /**
   * 原子性转账操作示例
   * @param {number} fromAccountId - 转出账户ID
   * @param {number} toAccountId - 转入账户ID
   * @param {number} amount - 转账金额
   * @returns {Promise<Object>} 转账结果
   */
  static async atomicTransfer(fromAccountId, toAccountId, amount) {
    const db = getDatabase();

    return await this.execute(() => {
      // 检查转出账户余额
      const fromAccount = db.prepare('SELECT balance FROM accounts WHERE id = ?')
        .get(fromAccountId);

      if (!fromAccount || fromAccount.balance < amount) {
        throw new Error('余额不足');
      }

      // 扣减转出账户
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?')
        .run(amount, fromAccountId);

      // 增加转入账户
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?')
        .run(amount, toAccountId);

      // 记录转账日志
      db.prepare(`INSERT INTO transfer_logs (from_id, to_id, amount, created_at)
                  VALUES (?, ?, ?, datetime('now'))`)
        .run(fromAccountId, toAccountId, amount);

      return {
        success: true,
        fromAccountId,
        toAccountId,
        amount,
        timestamp: new Date().toISOString()
      };
    }, {
      isolation: 'IMMEDIATE' // 使用IMMEDIATE级别防止死锁
    });
  }

  /**
   * 创建保存点（嵌套事务）
   * @param {string} name - 保存点名称
   * @param {Function} callback - 操作回调
   * @returns {Promise<any>} 操作结果
   */
  static async savepoint(name, callback) {
    const db = getDatabase();

    try {
      // 创建保存点
      db.prepare(`SAVEPOINT ${name}`).run();

      // 执行操作
      const result = await callback(db);

      // 释放保存点
      db.prepare(`RELEASE SAVEPOINT ${name}`).run();

      return result;

    } catch (error) {
      // 回滚到保存点
      db.prepare(`ROLLBACK TO SAVEPOINT ${name}`).run();
      throw error;
    }
  }

  /**
   * 数据一致性检查
   * @returns {Promise<Object>} 检查结果
   */
  static async consistencyCheck() {
    const db = getDatabase();
    const issues = [];

    try {
      // 检查外键约束
      const fkCheck = db.pragma('foreign_key_check');
      if (fkCheck.length > 0) {
        issues.push({
          type: 'FOREIGN_KEY',
          message: '发现外键约束违反',
          details: fkCheck
        });
      }

      // 检查数据完整性
      const integrityCheck = db.pragma('integrity_check');
      if (integrityCheck[0].integrity_check !== 'ok') {
        issues.push({
          type: 'INTEGRITY',
          message: '数据完整性检查失败',
          details: integrityCheck
        });
      }

      // 检查孤立记录
      const orphanedOrders = db.prepare(`
        SELECT COUNT(*) as count FROM orders
        WHERE position_id NOT IN (SELECT id FROM positions)
        AND position_id IS NOT NULL
      `).get();

      if (orphanedOrders.count > 0) {
        issues.push({
          type: 'ORPHANED_DATA',
          message: `发现${orphanedOrders.count}条孤立订单记录`,
          table: 'orders'
        });
      }

      return {
        healthy: issues.length === 0,
        issues,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[一致性检查] 失败:', error.message);
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = TransactionManager;