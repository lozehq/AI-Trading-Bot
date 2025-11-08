/**
 * 数据库服务
 * 使用SQLite作为本地数据库
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 数据库实例
let db = null;

// 数据库文件路径
const DB_PATH = path.join(__dirname, '../../data/trading.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * 运行数据库迁移
 * 注意：必须在db初始化后调用
 */
function runMigrations() {
  if (!db) {
    console.error('❌ 数据库未初始化，无法运行迁移');
    return;
  }

  try {
    console.log('🔄 检查数据库迁移...');

    // 检查ai_analyses表是否存在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const haveAnalyses = tables.some(t => t.name === 'ai_analyses');
    const haveContexts = tables.some(t => t.name === 'ai_memory_contexts');
    
    if (!haveAnalyses) {
      console.log('ℹ️  ai_analyses表不存在，跳过相关迁移');
    }

    // 检查ai_analyses表是否有相关字段
    const tableInfo = haveAnalyses ? db.pragma('table_info(ai_analyses)') : [];
    const hasAiActions = tableInfo.some(col => col.name === 'ai_actions');
    const hasChainOfThought = tableInfo.some(col => col.name === 'chain_of_thought');
    const hasContextId = tableInfo.some(col => col.name === 'context_id');

    let migrationCount = 0;

    if (haveAnalyses && !hasAiActions) {
      console.log('  → 添加ai_actions字段到ai_analyses表');
      db.exec('ALTER TABLE ai_analyses ADD COLUMN ai_actions TEXT');
      migrationCount++;
    }

    if (haveAnalyses && !hasChainOfThought) {
      console.log('  → 添加chain_of_thought字段到ai_analyses表');
      db.exec('ALTER TABLE ai_analyses ADD COLUMN chain_of_thought TEXT');
      migrationCount++;
    }

    // 新增：创建记忆面板表 ai_memory_contexts
    if (!haveContexts) {
      console.log('  → 创建 ai_memory_contexts 表');
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_memory_contexts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          is_default INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_memory_contexts_name ON ai_memory_contexts(name);
      `);
      migrationCount++;
    }

    // 新增：ai_analyses 增加 context_id 列与索引
    if (haveAnalyses && !hasContextId) {
      console.log('  → 为 ai_analyses 添加 context_id 列');
      db.exec(`
        ALTER TABLE ai_analyses ADD COLUMN context_id INTEGER;
      `);
      console.log('  → 创建 ai_analyses(context_id) 索引');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ai_analyses_context ON ai_analyses(context_id);
      `);
      migrationCount++;
    }

    // 新增：创建 trade_history 表（供账户状态服务读取最近平仓记录）
    const haveTradeHistory = tables.some(t => t.name === 'trade_history');
    if (!haveTradeHistory) {
      console.log('  → 创建 trade_history 表');
      db.exec(`
        CREATE TABLE IF NOT EXISTS trade_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol VARCHAR(20) NOT NULL,
          side VARCHAR(10) NOT NULL,
          entry_price DECIMAL(20, 8),
          exit_price DECIMAL(20, 8),
          pnl DECIMAL(20, 8),
          pnl_percent DECIMAL(10, 4),
          exit_time DATETIME,
          exit_reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_trade_history_symbol ON trade_history(symbol);
        CREATE INDEX IF NOT EXISTS idx_trade_history_exit_time ON trade_history(exit_time);
      `);
      migrationCount++;
    }

    // 新增：创建策略回测结果表 ai_backtests（按记忆面板隔离）
    const haveBacktests = tables.some(t => t.name === 'ai_backtests');
    if (!haveBacktests) {
      console.log('  → 创建 ai_backtests 表');
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_backtests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          context_id INTEGER,
          symbol TEXT NOT NULL,
          strategy TEXT NOT NULL,
          params_json TEXT,
          result_json TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ai_backtests_context ON ai_backtests(context_id);
        CREATE INDEX IF NOT EXISTS idx_ai_backtests_symbol ON ai_backtests(symbol);
      `);
      migrationCount++;
    }

    // 新增：创建 executions 表（OMS执行记录）
    const haveExecutions = tables.some(t => t.name === 'executions');
    if (!haveExecutions) {
      console.log('  → 创建 executions 表');
      db.exec(`
        CREATE TABLE IF NOT EXISTS executions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_order_id TEXT,
          order_id TEXT,
          symbol TEXT NOT NULL,
          exchange TEXT DEFAULT 'okx',
          side TEXT,
          type TEXT,
          expected_price REAL,
          actual_price REAL,
          requested_amount REAL,
          filled_amount REAL,
          slippage_bps REAL,
          slippage_percent REAL,
          latency_ms INTEGER,
          fill_rate REAL,
          status TEXT,
          analysis_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_exec_symbol ON executions(symbol);
        CREATE INDEX IF NOT EXISTS idx_exec_created ON executions(created_at);
        CREATE INDEX IF NOT EXISTS idx_exec_client ON executions(client_order_id);
      `);
      migrationCount++;
    }

    // 🆕 新增：逐笔交易tick表（用于tick回放/回测）
    const haveTickTrades = tables.some(t => t.name === 'tick_trades');
    if (!haveTickTrades) {
      console.log('  → 创建 tick_trades 表');
      db.exec(`
        CREATE TABLE IF NOT EXISTS tick_trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          exchange TEXT DEFAULT 'okx',
          price REAL NOT NULL,
          size REAL,
          side TEXT,
          ts INTEGER NOT NULL,          -- 交易所毫秒时间戳
          received_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON tick_trades(symbol, ts);
      `);
      migrationCount++;
    }

    // 🆕 新增：聊天会话与消息表
    const haveChatConversations = tables.some(t => t.name === 'chat_conversations');
    const haveChatMessages = tables.some(t => t.name === 'chat_messages');
    if (!haveChatConversations) {
      console.log('  → 创建 chat_conversations 表');
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          last_message_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at);
      `);
      migrationCount++;
    }
    if (!haveChatMessages) {
      console.log('  → 创建 chat_messages 表');
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL,
          role TEXT CHECK(role IN ('user','assistant','system')) NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY(conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
      `);
      migrationCount++;
    }

    // 新增：修复 alert_triggers 表缺失字段
    const haveAlertTriggers = tables.some(t => t.name === 'alert_triggers');
    if (haveAlertTriggers) {
      const alertTriggersInfo = db.pragma('table_info(alert_triggers)');
      const hasExchange = alertTriggersInfo.some(col => col.name === 'exchange');
      const hasPriceChangePercent = alertTriggersInfo.some(col => col.name === 'price_change_percent');
      const hasConditionType = alertTriggersInfo.some(col => col.name === 'condition_type');
      const hasConditionMet = alertTriggersInfo.some(col => col.name === 'condition_met');
      const hasNotificationChannels = alertTriggersInfo.some(col => col.name === 'notification_channels');
      const hasTargetPrice = alertTriggersInfo.some(col => col.name === 'target_price');

      if (!hasExchange) {
        console.log('  → 为 alert_triggers 添加 exchange 字段');
        db.exec("ALTER TABLE alert_triggers ADD COLUMN exchange VARCHAR(50) DEFAULT 'binance'");
        migrationCount++;
      }

      if (!hasPriceChangePercent) {
        console.log('  → 为 alert_triggers 添加 price_change_percent 字段');
        db.exec('ALTER TABLE alert_triggers ADD COLUMN price_change_percent DECIMAL(10, 4)');
        migrationCount++;
      }

      if (!hasConditionType) {
        console.log('  → 为 alert_triggers 添加 condition_type 字段');
        db.exec('ALTER TABLE alert_triggers ADD COLUMN condition_type VARCHAR(20)');
        migrationCount++;
      }

      if (!hasConditionMet) {
        console.log('  → 为 alert_triggers 添加 condition_met 字段');
        db.exec('ALTER TABLE alert_triggers ADD COLUMN condition_met VARCHAR(10)');
        migrationCount++;
      }

      if (!hasNotificationChannels) {
        console.log('  → 为 alert_triggers 添加 notification_channels 字段');
        db.exec('ALTER TABLE alert_triggers ADD COLUMN notification_channels TEXT');
        migrationCount++;
      }

      if (!hasTargetPrice) {
        console.log('  → 为 alert_triggers 添加 target_price 字段');
        db.exec('ALTER TABLE alert_triggers ADD COLUMN target_price DECIMAL(20, 8)');
        migrationCount++;
      }
    }

    if (migrationCount > 0) {
      console.log(`✅ 完成 ${migrationCount} 个数据库迁移`);
    } else {
      console.log('✅ 数据库Schema已是最新版本');
    }
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error.message);
    // 不抛出错误，允许应用继续运行
  }
}

/**
 * 初始化数据库
 */
function initDatabase() {
  try {
    // 确保data目录存在
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('✅ 创建数据目录:', dataDir);
    }

    // 创建或打开数据库
    db = new Database(DB_PATH, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
    });

    console.log('✅ 数据库连接成功:', DB_PATH);

    // ✅ 性能优化：启用外键约束
    db.pragma('foreign_keys = ON');

    // ✅ 性能优化：设置WAL模式以提高并发性能（3-5倍写入性能提升）
    db.pragma('journal_mode = WAL');

    // ✅ 性能优化：设置同步模式为NORMAL（平衡性能和安全性）
    db.pragma('synchronous = NORMAL');

    // ✅ 性能优化：增加缓存大小到64MB
    db.pragma('cache_size = -64000'); // 负数表示KB

    // ✅ 性能优化：临时文件存储在内存中
    db.pragma('temp_store = MEMORY');

    // ✅ 性能优化：设置mmap大小（内存映射）
    db.pragma('mmap_size = 30000000000'); // 30GB

    // ✅ 性能优化：设置页面大小（默认4096，可以设置更大）
    db.pragma('page_size = 4096');

    console.log('✅ 数据库性能优化配置完成');
    console.log('   - WAL模式: 已启用');
    console.log('   - 缓存大小: 64MB');
    console.log('   - 同步模式: NORMAL');
    console.log('   - 临时存储: 内存');

    // 执行Schema初始化
    if (fs.existsSync(SCHEMA_PATH)) {
      const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
      db.exec(schema);
      console.log('✅ 数据库Schema初始化完成');
    } else {
      console.warn('⚠️ Schema文件不存在:', SCHEMA_PATH);
    }

    // 执行数据库迁移（添加新字段）
    runMigrations();

    return db;
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}



/**
 * 获取数据库实例
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('✅ 数据库连接已关闭');
  }
}

/**
 * 执行事务
 */
function transaction(fn) {
  const database = getDatabase();
  const txn = database.transaction(fn);
  return txn(database);
}

/**
 * 备份数据库
 */
function backupDatabase(backupPath) {
  const database = getDatabase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultBackupPath = path.join(
    path.dirname(DB_PATH),
    `backup_${timestamp}.db`
  );
  const finalBackupPath = backupPath || defaultBackupPath;

  database.backup(finalBackupPath);
  console.log('✅ 数据库备份完成:', finalBackupPath);
  
  return finalBackupPath;
}

/**
 * 清理旧数据
 * @param days 保留最近N天的数据
 */
function cleanupOldData(days = 30) {
  const database = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString();

  try {
    database.transaction(() => {
      // 清理旧的MCP日志
      const mcpResult = database.prepare(
        'DELETE FROM mcp_logs WHERE created_at < ?'
      ).run(cutoffDateStr);
      console.log(`✅ 清理MCP日志: ${mcpResult.changes} 条`);

      // 清理旧的市场快照
      const snapshotResult = database.prepare(
        'DELETE FROM market_snapshots WHERE created_at < ?'
      ).run(cutoffDateStr);
      console.log(`✅ 清理市场快照: ${snapshotResult.changes} 条`);

      // 清理旧的系统日志
      const logResult = database.prepare(
        'DELETE FROM system_logs WHERE created_at < ? AND level != "ERROR"'
      ).run(cutoffDateStr);
      console.log(`✅ 清理系统日志: ${logResult.changes} 条`);
    })();

    // 优化数据库
    database.pragma('optimize');
    console.log('✅ 数据库优化完成');
  } catch (error) {
    console.error('❌ 清理数据失败:', error);
    throw error;
  }
}

/**
 * 获取数据库统计信息
 */
function getDatabaseStats() {
  const database = getDatabase();
  
  const stats = {
    file_size: fs.statSync(DB_PATH).size,
    page_count: database.pragma('page_count', { simple: true }),
    page_size: database.pragma('page_size', { simple: true }),
    tables: {}
  };

  // 获取各表的记录数
  const tables = [
    'trades',
    'settings',
    'mcp_logs',
    'market_snapshots',
    'ai_analyses',
    'positions',
    'strategy_performance',
    'system_logs'
  ];

  tables.forEach(table => {
    try {
      const result = database.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      stats.tables[table] = result.count;
    } catch (error) {
      stats.tables[table] = 0;
    }
  });

  return stats;
}

/**
 * 导出数据为JSON
 */
function exportToJSON(tableName, outputPath) {
  const database = getDatabase();
  
  try {
    const rows = database.prepare(`SELECT * FROM ${tableName}`).all();
    const json = JSON.stringify(rows, null, 2);
    
    if (outputPath) {
      fs.writeFileSync(outputPath, json, 'utf-8');
      console.log(`✅ 数据导出完成: ${outputPath}`);
      return outputPath;
    }
    
    return json;
  } catch (error) {
    console.error(`❌ 导出数据失败 (${tableName}):`, error);
    throw error;
  }
}

/**
 * 从JSON导入数据
 */
function importFromJSON(tableName, jsonPath) {
  const database = getDatabase();
  
  try {
    const json = fs.readFileSync(jsonPath, 'utf-8');
    const rows = JSON.parse(json);
    
    if (!Array.isArray(rows)) {
      throw new Error('JSON数据必须是数组格式');
    }

    let imported = 0;
    database.transaction(() => {
      rows.forEach((row) => {
        const columns = Object.keys(row).join(', ');
        const placeholders = Object.keys(row).map(() => '?').join(', ');
        const values = Object.values(row);
        
        database.prepare(
          `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`
        ).run(...values);
        
        imported++;
      });
    })();

    console.log(`✅ 数据导入完成: ${imported} 条记录`);
    return imported;
  } catch (error) {
    console.error(`❌ 导入数据失败 (${tableName}):`, error);
    throw error;
  }
}

/**
 * 执行原始SQL查询
 */
function executeSQL(sql, params = []) {
  const database = getDatabase();

  try {
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return database.prepare(sql).all(...params);
    } else {
      return database.prepare(sql).run(...params);
    }
  } catch (error) {
    console.error('❌ SQL执行失败:', error);
    throw error;
  }
}

/**
 * 获取配置项
 */
function getConfig(key) {
  const database = getDatabase();

  try {
    const result = database.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).get(key);

    return result ? JSON.parse(result.value) : null;
  } catch (error) {
    console.error(`❌ 获取配置失败 (${key}):`, error);
    return null;
  }
}

/**
 * 设置配置项
 */
function setConfig(key, value) {
  const database = getDatabase();

  try {
    const jsonValue = JSON.stringify(value);

    database.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `).run(key, jsonValue);

    return true;
  } catch (error) {
    console.error(`❌ 设置配置失败 (${key}):`, error);
    throw error;
  }
}

/**
 * 删除配置项
 */
function deleteConfig(key) {
  const database = getDatabase();

  try {
    const result = database.prepare(
      'DELETE FROM settings WHERE key = ?'
    ).run(key);

    return result.changes > 0;
  } catch (error) {
    console.error(`❌ 删除配置失败 (${key}):`, error);
    throw error;
  }
}

/**
 * 获取所有配置
 */
function getAllConfigs() {
  const database = getDatabase();

  try {
    const rows = database.prepare('SELECT key, value FROM settings').all();
    const configs = {};

    rows.forEach(row => {
      try {
        configs[row.key] = JSON.parse(row.value);
      } catch (error) {
        configs[row.key] = row.value;
      }
    });

    return configs;
  } catch (error) {
    console.error('❌ 获取所有配置失败:', error);
    return {};
  }
}

// CommonJS导出
module.exports = {
  db,
  initDatabase,
  getDatabase,
  closeDatabase,
  transaction,
  backupDatabase,
  cleanupOldData,
  getDatabaseStats,
  exportToJSON,
  importFromJSON,
  executeSQL,
  getConfig,
  setConfig,
  deleteConfig,
  getAllConfigs
};

