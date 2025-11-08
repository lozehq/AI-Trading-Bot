/**
 * 配置服务
 */

const { getDatabase } = require('../database');

class SettingService {
  /**
   * 获取配置值
   */
  static get(key) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM settings WHERE key = ?');
    const setting = stmt.get(key);

    if (!setting) return null;

    // 根据类型转换值
    switch (setting.type) {
      case 'NUMBER':
        return parseFloat(setting.value);
      case 'BOOLEAN':
        return (setting.value === 'true');
      case 'JSON':
        try {
          return JSON.parse(setting.value);
        } catch {
          return setting.value;
        }
      default:
        return setting.value;
    }
  }

  /**
   * 设置配置值
   */
  static set(key, value, options = {}) {
    const db = getDatabase();

    // 将值转换为字符串
    let valueStr;
    let type = options.type || 'STRING';

    if (typeof value === 'number') {
      valueStr = value.toString();
      type = 'NUMBER';
    } else if (typeof value === 'boolean') {
      valueStr = value.toString();
      type = 'BOOLEAN';
    } else if (typeof value === 'object') {
      valueStr = JSON.stringify(value);
      type = 'JSON';
    } else {
      valueStr = String(value);
    }

    const stmt = db.prepare(`
      INSERT INTO settings (key, value, type, category, description)
      VALUES (@key, @value, @type, @category, @description)
      ON CONFLICT(key) DO UPDATE SET
        value = @value,
        type = @type,
        category = COALESCE(@category, category),
        description = COALESCE(@description, description),
        updated_at = CURRENT_TIMESTAMP
    `);

    const result = stmt.run({
      key,
      value: valueStr,
      type,
      category: options.category || null,
      description: options.description || null
    });

    return result.changes > 0;
  }

  /**
   * 获取所有配置
   */
  static getAll(category) {
    const db = getDatabase();

    let sql = 'SELECT * FROM settings';
    const params = [];

    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }

    sql += ' ORDER BY category, key';

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 获取所有配置（键值对形式）
   */
  static getAllAsObject(category) {
    const settings = this.getAll(category);
    const result = {};

    settings.forEach(setting => {
      // 直接在这里转换，避免N+1查询
      switch (setting.type) {
        case 'NUMBER':
          result[setting.key] = parseFloat(setting.value);
          break;
        case 'BOOLEAN':
          result[setting.key] = (setting.value === 'true');
          break;
        case 'JSON':
          try {
            result[setting.key] = JSON.parse(setting.value);
          } catch {
            result[setting.key] = setting.value;
          }
          break;
        default:
          result[setting.key] = setting.value;
      }
    });

    return result;
  }

  /**
   * 删除配置
   */
  static delete(key) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM settings WHERE key = ?');
    const result = stmt.run(key);
    return result.changes > 0;
  }

  /**
   * 批量设置配置
   */
  static setBatch(settings) {
    const db = getDatabase();

    const update = db.transaction((settings) => {
      let count = 0;
      for (const [key, value] of Object.entries(settings)) {
        if (this.set(key, value)) {
          count++;
        }
      }
      return count;
    });

    return update(settings);
  }

  /**
   * 重置为默认值
   */
  static resetToDefaults() {
    const db = getDatabase();

    const defaults = {
      default_exchange: 'binance',
      default_symbol: 'ETH/USDT',
      default_timeframe: '1h',
      risk_percentage: 0.02,
      max_position_size: 10000,
      auto_trading_enabled: false,
      mcp_cache_ttl: 60000,
      ai_temperature: 0.3,
      ai_max_tokens: 2000
    };

    return this.setBatch(defaults) > 0;
  }

  /**
   * 导出配置
   */
  static export() {
    const settings = this.getAllAsObject();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * 导入配置
   */
  static import(json) {
    try {
      const settings = JSON.parse(json);
      return this.setBatch(settings);
    } catch (error) {
      console.error('❌ 导入配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取交易配置
   */
  static getTradingConfig() {
    return {
      exchange: this.get('default_exchange'),
      symbol: this.get('default_symbol'),
      timeframe: this.get('default_timeframe'),
      riskPercentage: this.get('risk_percentage'),
      maxPositionSize: this.get('max_position_size'),
      autoTradingEnabled: this.get('auto_trading_enabled')
    };
  }

  /**
   * 获取AI配置
   */
  static getAIConfig() {
    return {
      temperature: this.get('ai_temperature'),
      maxTokens: this.get('ai_max_tokens')
    };
  }

  /**
   * 获取MCP配置
   */
  static getMCPConfig() {
    return {
      cacheTTL: this.get('mcp_cache_ttl')
    };
  }
}

module.exports = { SettingService };

