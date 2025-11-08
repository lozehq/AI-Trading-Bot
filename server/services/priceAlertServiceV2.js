const EventEmitter = require('events');
const axios = require('axios');
const { getDatabase } = require('../database/database');
const crypto = require('crypto');

// 生成简单的随机ID（不依赖uuid包）
function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

// 可选依赖：nodemailer
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.log('ℹ️  nodemailer未安装，邮件通知功能将不可用');
}

/**
 * 价格预警服务 V2 - 支持数据库持久化
 *
 * ✅ 修复：
 * - P0-1: 数据库持久化存储
 * - P1-1: 预警恢复机制（cooldown）
 * - P1-2: 动态检查间隔
 */
class PriceAlertServiceV2 extends EventEmitter {
  constructor() {
    super();
    this.priceCache = new Map(); // 缓存最新价格
    this.monitorInterval = null;
    this.baseCheckInterval = 10000; // 基础检查间隔：10秒
    this.currentCheckInterval = 10000;

    // 兼容旧表结构: 记录是否存在旧的 price 列以及其 NOT NULL 约束
    this.hasLegacyPriceColumn = false;
    this.hasLegacyPriceNotNull = false;

    // 邮件配置
    this.emailTransporter = null;
    this.initEmailService();

    // 初始化数据库
    this.initDatabase();

    // 从数据库加载预警
    this.loadAlertsFromDatabase();
  }

  /**
   * 初始化数据库（确保表结构存在）
   */
  initDatabase() {
    try {
      const db = getDatabase();

      // 确保表存在（schema.sql应该已创建）
      db.exec(`
        CREATE TABLE IF NOT EXISTS price_alerts (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          exchange TEXT NOT NULL DEFAULT 'okx',
          type TEXT NOT NULL,
          target_price REAL NOT NULL,
          current_price REAL,
          enabled INTEGER DEFAULT 1,
          triggered INTEGER DEFAULT 0,
          last_triggered_at TEXT,
          trigger_count INTEGER DEFAULT 0,
          repeat INTEGER DEFAULT 0,
          priority TEXT DEFAULT 'medium',
          source TEXT DEFAULT 'manual',
          notify_browser INTEGER DEFAULT 1,
          notify_sound INTEGER DEFAULT 1,
          notify_email INTEGER DEFAULT 0,
          notify_webhook INTEGER DEFAULT 0,
          email TEXT,
          webhook_url TEXT,
          message TEXT,
          reasoning TEXT,
          confidence REAL,
          cooldown_until TEXT,
          cooldown_seconds INTEGER DEFAULT 60,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS alert_triggers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          exchange TEXT NOT NULL,
          trigger_price REAL NOT NULL,
          alert_price REAL NOT NULL,
          price_change_percent REAL,
          condition_type TEXT NOT NULL,
          condition_met TEXT,
          notification_sent INTEGER DEFAULT 0,
          notification_channels TEXT,
          triggered_at TEXT NOT NULL,
          FOREIGN KEY (alert_id) REFERENCES price_alerts(id) ON DELETE CASCADE
        );
      `);


      // 迁移：为旧表补齐缺失列（如 deleted_at 等），避免旧库报错
      try {
        const cols = db.pragma("table_info('price_alerts')");
        // 记录旧表结构兼容性（是否存在 legacy 列 price 以及是否 NOT NULL）
        this.hasLegacyPriceColumn = cols.some(c => c.name === 'price');
        this.hasLegacyPriceNotNull = cols.some(c => c.name === 'price' && c.notnull === 1);

        const have = new Set(cols.map(c => c.name));
        const add = (name, type, defVal) => {
          if (!have.has(name)) {
            db.exec(`ALTER TABLE price_alerts ADD COLUMN ${name} ${type}${defVal !== undefined ? ' DEFAULT ' + defVal : ''}`);
          }
        };
        // 核心字段补齐（旧表常缺失）
        add('target_price', 'REAL');
        add('current_price', 'REAL');
        add('enabled', 'INTEGER', 1);
        add('triggered', 'INTEGER', 0);
        add('deleted_at', 'TEXT');
        add('cooldown_until', 'TEXT');
        add('cooldown_seconds', 'INTEGER', 60);
        add('last_triggered_at', 'TEXT');
        add('trigger_count', 'INTEGER', 0);
        add('repeat', 'INTEGER', 0);
        // 通知与元信息字段
        add('priority', 'TEXT', "'medium'");
        add('source', 'TEXT', "'manual'");
        add('notify_browser', 'INTEGER', 1);
        add('notify_sound', 'INTEGER', 1);
        add('notify_email', 'INTEGER', 0);
        add('notify_webhook', 'INTEGER', 0);
        add('email', 'TEXT');
        add('webhook_url', 'TEXT');
        add('message', 'TEXT');
        add('reasoning', 'TEXT');
        add('confidence', 'REAL');
        add('context_id', 'INTEGER');

        // 索引：按上下文过滤
        try {
          db.exec(`CREATE INDEX IF NOT EXISTS idx_price_alerts_context ON price_alerts(context_id)`);
        } catch (e) {}
      } catch (e) {
        console.error('⚠️  价格预警表结构迁移失败（已忽略）:', e.message);
      }

      console.log('✅ 价格预警数据库表已就绪');
    } catch (error) {
      console.error('❌ 初始化价格预警数据库失败:', error);
    }
  }

  /**
   * 从数据库加载所有活跃预警
   */
  loadAlertsFromDatabase() {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM price_alerts
        WHERE enabled = 1 AND deleted_at IS NULL
        ORDER BY created_at DESC
      `);

      const alerts = stmt.all();
      console.log(`📊 从数据库加载了 ${alerts.length} 个活跃预警`);

      return alerts;
    } catch (error) {
      console.error('❌ 加载预警失败:', error);
      return [];
    }
  }

  initEmailService() {
    try {
      if (!nodemailer) return;

      if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        this.emailTransporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT || 587,
          secure: process.env.EMAIL_SECURE === 'true',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        console.log('✅ 邮件服务已配置');
      }
    } catch (error) {
      console.log('⚠️  邮件服务未配置，邮件通知将不可用');
    }
  }

  /**
   * 创建价格预警（持久化到数据库）
   * @param {Object} config - 预警配置
   */
  async createAlert(config) {
    const {
      symbol,
      exchange = 'okx',
      type,
      targetPrice,
      message,
      priority = 'medium',
      source = 'manual',
      repeat = false,
      notifyBrowser = true,
      notifySound = true,
      notifyEmail = false,
      notifyWebhook = false,
      email = null,
      webhookUrl = null,
      reasoning = null,
      confidence = null,
      cooldownSeconds = 60,
      contextId = null
    } = config;

    // 验证必要字段
    if (!symbol || !type) {
      console.error('❌ 创建预警失败: 缺少必要字段 symbol 或 type');
      return { success: false, error: '缺少必要字段 symbol 或 type' };
    }

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      console.error('❌ 创建预警失败: targetPrice 无效', { targetPrice, type: typeof targetPrice });
      return { success: false, error: `targetPrice 无效: ${targetPrice}` };
    }

    // 生成唯一ID
    const id = `alert_${Date.now()}_${generateId()}`;
    const now = new Date().toISOString();

    const alert = {
      id,
      symbol,
      exchange,
      type,
      target_price: targetPrice,
      current_price: null,
      enabled: 1,
      triggered: 0,
      last_triggered_at: null,
      trigger_count: 0,
      repeat: repeat ? 1 : 0,
      priority,
      source,
      notify_browser: notifyBrowser ? 1 : 0,
      notify_sound: notifySound ? 1 : 0,
      notify_email: notifyEmail ? 1 : 0,
      notify_webhook: notifyWebhook ? 1 : 0,
      email,
      webhook_url: webhookUrl,
      message,
      reasoning,
      confidence,
      cooldown_until: null,
      cooldown_seconds: cooldownSeconds,
      context_id: contextId || null,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };

    try {
      // 保存到数据库
      const db = getDatabase();
      // 动态构造列清单，兼容旧库的 price 列（可能 NOT NULL）
      const columns = ['id','symbol','exchange','type'];
      if (this.hasLegacyPriceColumn) {
        columns.push('price');
      }
      columns.push(
        'target_price','current_price',
        'enabled','triggered','last_triggered_at','trigger_count',
        'repeat','priority','source',
        'notify_browser','notify_sound','notify_email','notify_webhook',
        'email','webhook_url','message','reasoning','confidence',
        'cooldown_until','cooldown_seconds','context_id',
        'created_at','updated_at','deleted_at'
      );
      const placeholders = columns.map(c => '@' + c).join(', ');
      const sql = `INSERT INTO price_alerts (${columns.join(', ')}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);

      // 如果存在旧列，则为其赋值（等于 targetPrice）
      const dbRow = this.hasLegacyPriceColumn ? { ...alert, price: targetPrice } : alert;
      stmt.run(dbRow);

      console.log(`✅ 创建预警成功: ${id} (${symbol} ${type} @ ${targetPrice})`);

      // 触发事件
      this.emit('alert:created', alert);

      return { success: true, alertId: id, alert };
    } catch (error) {
      console.error('❌ 创建预警失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取所有预警
   */
  getAllAlerts(filters = {}) {
    try {
      const db = getDatabase();
      let query = 'SELECT * FROM price_alerts WHERE deleted_at IS NULL';
      const params = {};

      if (filters.symbol) {
        query += ' AND symbol = @symbol';
        params.symbol = filters.symbol;
      }

      if (filters.enabled !== undefined) {
        query += ' AND enabled = @enabled';
        params.enabled = filters.enabled ? 1 : 0;
      }

      if (filters.triggered !== undefined) {
        query += ' AND triggered = @triggered';
        params.triggered = filters.triggered ? 1 : 0;
      }

      if (filters.contextId !== undefined && filters.contextId !== null) {
        query += ' AND context_id = @contextId';
        params.contextId = Number(filters.contextId);
      }

      query += ' ORDER BY created_at DESC';

      if (filters.limit) {
        query += ` LIMIT ${parseInt(filters.limit)}`;
      }

      const stmt = db.prepare(query);
      const alerts = stmt.all(params);

      return alerts;
    } catch (error) {
      console.error('❌ 获取预警列表失败:', error);
      return [];
    }
  }

  /**
   * 获取预警详情
   */
  getAlert(alertId) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT * FROM price_alerts WHERE id = ? AND deleted_at IS NULL');
      return stmt.get(alertId);
    } catch (error) {
      console.error(`❌ 获取预警详情失败 (${alertId}):`, error);
      return null;
    }
  }

  /**
   * 更新预警
   */
  async updateAlert(alertId, updates) {
    try {
      const db = getDatabase();
      const fields = [];
      const params = { id: alertId };

      // 构建UPDATE语句
      if (updates.enabled !== undefined) {
        fields.push('enabled = @enabled');
        params.enabled = updates.enabled ? 1 : 0;
      }

      if (updates.targetPrice !== undefined) {
        if (!Number.isFinite(updates.targetPrice) || updates.targetPrice <= 0) {
          return { success: false, error: 'targetPrice 无效' };
        }
        fields.push('target_price = @target_price');
        params.target_price = updates.targetPrice;
        if (this.hasLegacyPriceColumn) {
          fields.push('price = @price');
          params.price = updates.targetPrice;
        }
      }

      if (updates.repeat !== undefined) {
        fields.push('repeat = @repeat');
        params.repeat = updates.repeat ? 1 : 0;
      }

      if (updates.priority) {
        fields.push('priority = @priority');
        params.priority = updates.priority;
      }

      // 总是更新 updated_at
      fields.push('updated_at = @updated_at');
      params.updated_at = new Date().toISOString();

      if (fields.length === 0) {
        return { success: false, error: '没有要更新的字段' };
      }

      const query = `UPDATE price_alerts SET ${fields.join(', ')} WHERE id = @id`;
      const stmt = db.prepare(query);
      const result = stmt.run(params);

      if (result.changes > 0) {
        console.log(`✅ 更新预警成功: ${alertId}`);
        this.emit('alert:updated', { alertId, updates });
        return { success: true };
      } else {
        return { success: false, error: '预警不存在' };
      }
    } catch (error) {
      console.error(`❌ 更新预警失败 (${alertId}):`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 删除预警（软删除）
   */
  async deleteAlert(alertId) {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        UPDATE price_alerts
        SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
      `);

      const now = new Date().toISOString();
      const result = stmt.run(now, now, alertId);

      if (result.changes > 0) {
        console.log(`✅ 删除预警成功: ${alertId}`);
        this.emit('alert:deleted', { alertId });
        return { success: true };
      } else {
        return { success: false, error: '预警不存在或已删除' };
      }
    } catch (error) {
      console.error(`❌ 删除预警失败 (${alertId}):`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量清理预警（软删除）
   * @param {{symbol:string, source?:string, contextId?:number}} filters
   */
  async clearAlerts(filters = {}) {
    try {
      const db = getDatabase();
      const clauses = ['deleted_at IS NULL'];
      const params = [];

      if (filters.symbol) {
        clauses.push('symbol = ?');
        params.push(filters.symbol);
      }
      if (filters.source) {
        clauses.push('source = ?');
        params.push(filters.source);
      }
      if (filters.contextId !== undefined && filters.contextId !== null) {
        clauses.push('context_id = ?');
        params.push(Number(filters.contextId));
      }

      const where = clauses.length ? ('WHERE ' + clauses.join(' AND ')) : '';
      const sql = `UPDATE price_alerts SET deleted_at = ?, updated_at = ? ${where}`;
      const now = new Date().toISOString();
      const stmt = db.prepare(sql);
      const info = stmt.run(now, now, ...params);
      const changes = info.changes || 0;
      if (changes > 0) {
        console.log(`🧹 批量清理预警: ${changes} 条 (${JSON.stringify(filters)})`);
      }
      return { success: true, deleted: changes };
    } catch (error) {
      console.error('❌ 批量清理预警失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 启动价格监控
   */
  startMonitoring() {
    if (this.monitorInterval) {
      console.log('⚠️  价格监控已在运行中');
      return;
    }

    console.log('🚀 启动价格预警监控服务...');
    console.log(`⏱️  检查间隔: ${this.currentCheckInterval / 1000}秒`);

    // 立即执行一次
    this.checkAllAlerts();

    // 定时检查
    this.monitorInterval = setInterval(() => {
      this.checkAllAlerts();
    }, this.currentCheckInterval);

    console.log('✅ 价格预警监控服务已启动');
  }

  /**
   * 停止价格监控
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('⏸️  价格预警监控服务已停止');
    }
  }

  /**
   * 检查所有预警
   */
  async checkAllAlerts() {
    try {
      // 从数据库加载活跃预警
      const alerts = this.loadAlertsFromDatabase();

      if (alerts.length === 0) {
        return;
      }

      // 获取所有需要检查的交易对
      const symbols = [...new Set(alerts.map(a => ({ symbol: a.symbol, exchange: a.exchange })))];

      // 并行获取价格
      const pricePromises = symbols.map(async ({ symbol, exchange }) => {
        try {
          const price = await this.getCurrentPrice(symbol, exchange);
          this.priceCache.set(`${exchange}:${symbol}`, { price, timestamp: Date.now() });
          return { symbol, exchange, price };
        } catch (error) {
          console.error(`❌ 获取价格失败 (${exchange}:${symbol}):`, error.message);
          return { symbol, exchange, price: null };
        }
      });

      const prices = await Promise.all(pricePromises);
      const priceMap = new Map(prices.map(p => [`${p.exchange}:${p.symbol}`, p.price]));

      // 检查每个预警
      for (const alert of alerts) {
        const key = `${alert.exchange}:${alert.symbol}`;
        const currentPrice = priceMap.get(key);

        if (currentPrice === null || currentPrice === undefined) {
          continue;
        }

        await this.checkAlert(alert, currentPrice);
      }

      // 动态调整检查间隔
      this.adjustCheckInterval(prices);

    } catch (error) {
      console.error('❌ 检查预警失败:', error);
    }
  }

  /**
   * 检查单个预警
   */
  async checkAlert(alert, currentPrice) {
    try {
      // 检查是否在冷却期
      if (alert.cooldown_until) {
        const cooldownEnd = new Date(alert.cooldown_until).getTime();
        if (Date.now() < cooldownEnd) {
          // 仍在冷却中，跳过
          return;
        } else {
          // 冷却结束，恢复预警
          await this.recoverAlert(alert.id);
        }
      }

      // 检查是否满足触发条件
      const shouldTrigger = this.checkCondition(alert.type, currentPrice, alert.target_price);

      if (shouldTrigger) {
        await this.triggerAlert(alert, currentPrice);
      }
    } catch (error) {
      console.error(`❌ 检查预警失败 (${alert.id}):`, error);
    }
  }

  /**
   * 检查是否满足触发条件
   */
  checkCondition(type, currentPrice, targetPrice) {
    switch (type) {
      case 'above':
        return currentPrice >= targetPrice;
      case 'below':
        return currentPrice <= targetPrice;
      case 'cross_above':
        return currentPrice >= targetPrice;
      case 'cross_below':
        return currentPrice <= targetPrice;
      case 'both':
        return Math.abs(currentPrice - targetPrice) / targetPrice < 0.005; // 0.5%范围内
      default:
        return false;
    }
  }

  /**
   * 触发预警
   */
  async triggerAlert(alert, currentPrice) {
    try {
      console.log(`\n🔔 预警触发: ${alert.symbol} @ $${currentPrice}`);
      console.log(`   类型: ${alert.type}`);
      console.log(`   目标价: $${alert.target_price}`);
      console.log(`   来源: ${alert.source}`);

      const priceChange = ((currentPrice - alert.target_price) / alert.target_price * 100).toFixed(2);

      // 记录触发历史
      await this.recordTrigger(alert, currentPrice, priceChange);

      // 发送通知
      await this.sendNotifications(alert, currentPrice, priceChange);

      // 更新预警状态
      const db = getDatabase();
      const now = new Date().toISOString();

      if (alert.repeat) {
        // 重复预警：进入冷却期
        const cooldownUntil = new Date(Date.now() + alert.cooldown_seconds * 1000).toISOString();
        const stmt = db.prepare(`
          UPDATE price_alerts
          SET last_triggered_at = ?,
              trigger_count = trigger_count + 1,
              cooldown_until = ?,
              updated_at = ?
          WHERE id = ?
        `);
        stmt.run(now, cooldownUntil, now, alert.id);

        console.log(`   ⏳ 进入冷却期 ${alert.cooldown_seconds}秒`);
      } else {
        // 一次性预警：禁用
        const stmt = db.prepare(`
          UPDATE price_alerts
          SET enabled = 0,
              triggered = 1,
              last_triggered_at = ?,
              trigger_count = trigger_count + 1,
              updated_at = ?
          WHERE id = ?
        `);
        stmt.run(now, now, alert.id);

        console.log(`   ❌ 预警已禁用（一次性触发）`);
      }

      // 触发事件
      this.emit('alert:triggered', { alert, currentPrice, priceChange });

    } catch (error) {
      console.error(`❌ 触发预警失败 (${alert.id}):`, error);
    }
  }

  /**
   * 记录触发历史
   */
  async recordTrigger(alert, currentPrice, priceChange) {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO alert_triggers (
          alert_id, symbol, exchange,
          trigger_price, alert_price, type,
          price_change_percent,
          notification_sent, notification_channels,
          triggered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const channels = [];
      if (alert.notify_browser) channels.push('browser');
      if (alert.notify_sound) channels.push('sound');
      if (alert.notify_email) channels.push('email');
      if (alert.notify_webhook) channels.push('webhook');

      stmt.run(
        alert.id,
        alert.symbol,
        alert.exchange,
        currentPrice,              // trigger_price: 触发时的实际价格
        alert.target_price,        // alert_price: 预警设置的目标价格
        alert.type,                // type: 预警类型
        parseFloat(priceChange),
        1,
        JSON.stringify(channels),
        new Date().toISOString()
      );

      console.log(`   📝 已记录触发历史`);
    } catch (error) {
      console.error('❌ 记录触发历史失败:', error);
    }
  }

  /**
   * 恢复预警（从冷却期恢复）
   */
  async recoverAlert(alertId) {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        UPDATE price_alerts
        SET cooldown_until = NULL, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(new Date().toISOString(), alertId);
      console.log(`✅ 预警已从冷却期恢复: ${alertId}`);

      this.emit('alert:recovered', { alertId });
    } catch (error) {
      console.error(`❌ 恢复预警失败 (${alertId}):`, error);
    }
  }

  /**
   * 动态调整检查间隔（根据真实市场波动）
   */
  adjustCheckInterval(prices) {
    if (prices.length === 0) return;

    // 计算真实波动率
    let totalVolatility = 0;
    let count = 0;

    for (const { symbol, exchange, price } of prices) {
      if (!price) continue;

      // 从缓存获取上一次价格
      const cacheKey = `volatility:${exchange}:${symbol}`;
      const lastData = this.priceCache.get(cacheKey);

      if (lastData && lastData.price) {
        // 计算价格变化百分比
        const priceChange = Math.abs(price - lastData.price) / lastData.price;
        totalVolatility += priceChange;
        count++;
      }

      // 更新缓存（用于下次计算）
      this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
    }

    if (count === 0) {
      // 首次运行，使用默认间隔
      return;
    }

    const avgVolatility = totalVolatility / count;

    // 根据真实波动率动态调整
    let newInterval;
    if (avgVolatility > 0.02) {
      newInterval = 5000;  // 高波动（>2%）：5秒
    } else if (avgVolatility > 0.01) {
      newInterval = 10000; // 中等波动（1-2%）：10秒
    } else if (avgVolatility > 0.005) {
      newInterval = 15000; // 低波动（0.5-1%）：15秒
    } else {
      newInterval = 20000; // 极低波动（<0.5%）：20秒
    }

    if (newInterval !== this.currentCheckInterval) {
      const oldInterval = this.currentCheckInterval;
      this.currentCheckInterval = newInterval;
      console.log(`⏱️  检查间隔调整: ${oldInterval / 1000}秒 → ${newInterval / 1000}秒（波动率: ${(avgVolatility * 100).toFixed(3)}%）`);

      // 重启监控以应用新间隔
      if (this.monitorInterval) {
        this.stopMonitoring();
        this.startMonitoring();
      }
    }
  }

  /**
   * 获取当前价格
   */
  async getCurrentPrice(symbol, exchange = 'okx') {
    try {
      const dataSourceManager = require('./dataSourceManager');
      const ticker = await dataSourceManager.getTicker(exchange, symbol);
      const v = ticker && (ticker.last ?? ticker.price);
      const priceNum = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        throw new Error('无效价格');
      }
      return priceNum;
    } catch (error) {
      throw new Error(`获取价格失败: ${error.message}`);
    }
  }

  /**
   * 发送通知
   */
  async sendNotifications(alert, currentPrice, priceChange) {
    const notifications = [];

    // 浏览器通知（通过WebSocket）
    if (alert.notify_browser) {
      notifications.push(this.sendBrowserNotification(alert, currentPrice, priceChange));
    }

    // 邮件通知
    if (alert.notify_email && alert.email) {
      notifications.push(this.sendEmailNotification(alert, currentPrice, priceChange));
    }

    // Webhook通知
    if (alert.notify_webhook && alert.webhook_url) {
      notifications.push(this.sendWebhookNotification(alert, currentPrice, priceChange));
    }

    await Promise.allSettled(notifications);
  }

  async sendBrowserNotification(alert, currentPrice, priceChange) {
    // 通过事件发送到WebSocket
    this.emit('notification:browser', {
      title: `价格预警: ${alert.symbol}`,
      message: alert.message || `${alert.symbol} 价格已达到 $${currentPrice} (${priceChange > 0 ? '+' : ''}${priceChange}%)`,
      type: alert.type,
      priority: alert.priority,
      data: { alert, currentPrice, priceChange }
    });
  }

  async sendEmailNotification(alert, currentPrice, priceChange) {
    if (!this.emailTransporter) return;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: alert.email,
        subject: `[价格预警] ${alert.symbol} @ $${currentPrice}`,
        html: `
          <h2>价格预警触发</h2>
          <p><strong>交易对:</strong> ${alert.symbol}</p>
          <p><strong>当前价格:</strong> $${currentPrice}</p>
          <p><strong>目标价格:</strong> $${alert.target_price}</p>
          <p><strong>价格变化:</strong> ${priceChange > 0 ? '+' : ''}${priceChange}%</p>
          <p><strong>预警类型:</strong> ${alert.type}</p>
          ${alert.message ? `<p><strong>消息:</strong> ${alert.message}</p>` : ''}
          ${alert.reasoning ? `<p><strong>原因:</strong> ${alert.reasoning}</p>` : ''}
          <p><small>触发时间: ${new Date().toLocaleString('zh-CN')}</small></p>
        `
      });
      console.log(`   ✅ 邮件通知已发送`);
    } catch (error) {
      console.error('   ❌ 邮件通知发送失败:', error.message);
    }
  }

  async sendWebhookNotification(alert, currentPrice, priceChange) {
    try {
      await axios.post(alert.webhook_url, {
        msgtype: 'text',
        text: {
          content: `【价格预警】\n交易对: ${alert.symbol}\n当前价格: $${currentPrice}\n目标价格: $${alert.target_price}\n变化: ${priceChange > 0 ? '+' : ''}${priceChange}%\n${alert.message || ''}`
        }
      });
      console.log(`   ✅ Webhook通知已发送`);
    } catch (error) {
      console.error('   ❌ Webhook通知发送失败:', error.message);
    }
  }

  /**
   * 清理已触发的历史预警（24小时前）
   */
  async cleanupOldAlerts() {
    try {
      const db = getDatabase();
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const stmt = db.prepare(`
        UPDATE price_alerts
        SET deleted_at = ?
        WHERE triggered = 1
          AND last_triggered_at < ?
          AND deleted_at IS NULL
      `);

      const result = stmt.run(new Date().toISOString(), cutoffTime);

      if (result.changes > 0) {
        console.log(`🧹 清理了 ${result.changes} 个历史预警`);
      }
    } catch (error) {
      console.error('❌ 清理历史预警失败:', error);
    }
  }

  /**
   * 获取预警统计
   */
  getStats(symbol = null, contextId = null) {
    try {
      const db = getDatabase();

      let query = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN triggered = 1 THEN 1 ELSE 0 END) as triggered,
          SUM(trigger_count) as total_triggers
        FROM price_alerts
        WHERE deleted_at IS NULL
      `;

      const conds = [];
      const params = [];
      if (symbol) { conds.push('symbol = ?'); params.push(symbol); }
      if (contextId) { conds.push('context_id = ?'); params.push(Number(contextId)); }
      if (conds.length > 0) {
        query += ' AND ' + conds.join(' AND ');
      }
      const stmt = db.prepare(query);
      const stats = params.length > 0 ? stmt.get(...params) : stmt.get();

      return stats;
    } catch (error) {
      console.error('❌ 获取预警统计失败:', error);
      return { total: 0, active: 0, triggered: 0, total_triggers: 0 };
    }
  }
}

// 导出单例
module.exports = new PriceAlertServiceV2();

