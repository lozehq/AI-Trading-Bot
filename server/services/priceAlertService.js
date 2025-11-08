const EventEmitter = require('events');
const axios = require('axios');
const { AlertService } = require('../database/services/AlertService');

// 可选依赖：nodemailer（如果需要邮件通知功能，请安装：npm install nodemailer）
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.log('ℹ️  nodemailer未安装，邮件通知功能将不可用');
}

class PriceAlertService extends EventEmitter {
  constructor() {
    super();
    // ✅ 使用数据库持久化存储，不再使用内存Map
    // this.alerts = new Map(); // ❌ 已移除
    this.priceCache = new Map(); // 缓存最新价格（仍使用内存）
    this.monitorInterval = null;
    this.checkInterval = 10000; // 10秒检查一次

    // 邮件配置（需要在.env中配置）
    this.emailTransporter = null;
    this.initEmailService();

    // Webhook配置（用于发送到钉钉、企业微信等）
    this.webhooks = [];

    // ✅ 启动时从数据库加载预警
    this.loadAlertsFromDatabase();
  }

  /**
   * 从数据库加载预警
   */
  loadAlertsFromDatabase() {
    try {
      const alerts = AlertService.getActive();
      console.log(`✅ 从数据库加载了 ${alerts.length} 个活跃预警`);

      // TEMPORARILY DISABLED: 自动启动监控（为AI分析预留API配额）
      // 如需启动价格预警监控，请手动调用 /api/price-alert-v2/start-monitoring
      console.log('⚠️  价格预警自动启动已临时禁用');

      // if (alerts.length > 0) {
      //   this.startMonitoring();
      // }
    } catch (error) {
      console.error('❌ 从数据库加载预警失败:', error.message);
    }
  }

  initEmailService() {
    try {
    if (!nodemailer) {
      return; // nodemailer未安装，跳过邮件服务初始化
    }

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

  // 创建价格预警
  createAlert(alertConfig) {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alert = {
      id: alertId,
      symbol: alertConfig.symbol,
      exchange: alertConfig.exchange || 'binance',
      type: alertConfig.type, // 'above', 'below', 'cross'
      price: parseFloat(alertConfig.price),
      message: alertConfig.message || `价格预警触发: ${alertConfig.symbol}`,
      notification: {
        email: alertConfig.email || false,
        webhook: alertConfig.webhook || false,
        browser: alertConfig.browser !== false, // 默认开启浏览器通知
        sound: alertConfig.sound !== false // 默认开启声音
      },
      repeat: alertConfig.repeat || false, // 是否重复触发
      enabled: true,
      source: alertConfig.source || 'manual', // 预警来源
      reason: alertConfig.reason || '', // 预警原因
      createdAt: new Date(),
      lastTriggered: null,
      triggerCount: 0
    };

    // ✅ 保存到数据库
    try {
      AlertService.create(alert);
    } catch (error) {
      console.error('❌ 保存预警到数据库失败:', error.message);
      throw error;
    }

    // 如果是第一个预警，启动监控
    const activeAlerts = AlertService.getActive();
    if (activeAlerts.length === 1) {
      this.startMonitoring();
    }

    console.log(`📍 创建价格预警: ${alert.symbol} ${alert.type} ${alert.price}`);

    return alert;
  }

  // 更新预警配置
  updateAlert(alertId, updates) {
    // ✅ 从数据库获取预警
    const alert = AlertService.getById(alertId);
    if (!alert) {
      throw new Error(`预警不存在: ${alertId}`);
    }

    // ✅ 更新到数据库
    try {
      AlertService.update(alertId, updates);
    } catch (error) {
      console.error('❌ 更新预警失败:', error.message);
      throw error;
    }

    // 返回更新后的预警
    return AlertService.getById(alertId);
  }

  // 删除预警
  deleteAlert(alertId) {
    // ✅ 从数据库删除
    try {
      const deleted = AlertService.delete(alertId);

      // 如果没有预警了，停止监控
      const activeAlerts = AlertService.getActive();
      if (activeAlerts.length === 0) {
        this.stopMonitoring();
      }

      return deleted;
    } catch (error) {
      console.error('❌ 删除预警失败:', error.message);
      return false;
    }
  }

  // 获取所有预警
  getAlerts(symbol = null) {
    // ✅ 从数据库获取
    try {
      if (symbol) {
        return AlertService.getAll({ symbol });
      }
      return AlertService.getAll();
    } catch (error) {
      console.error('❌ 获取预警失败:', error.message);
      return [];
    }
  }

  // 启动价格监控
  startMonitoring() {
    if (this.monitorInterval) {
      return;
    }
    
    console.log('🔍 启动价格监控...');
    
    // 立即执行一次检查
    this.checkAlerts();
    
    // 设置定期检查
    this.monitorInterval = setInterval(() => {
      this.checkAlerts();
    }, this.checkInterval);
  }

  // 停止监控
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('⏹️ 停止价格监控');
    }
  }

  // 检查所有预警
  async checkAlerts() {
    // ✅ 从数据库获取活跃预警
    const alerts = AlertService.getActive();

    if (alerts.length === 0) {
      return; // 没有活跃预警，直接返回
    }

    // 获取需要监控的交易对
    const symbolsToCheck = new Set();
    for (const alert of alerts) {
      symbolsToCheck.add(`${alert.exchange}:${alert.symbol}`);
    }

    // 批量获取价格
    const prices = await this.fetchPrices(Array.from(symbolsToCheck));

    // 检查每个预警
    for (const alert of alerts) {
      const priceKey = `${alert.exchange}:${alert.symbol}`;
      const currentPrice = prices.get(priceKey);

      if (currentPrice) {
        this.checkAlertCondition(alert, currentPrice);
      }
    }
  }

  // 获取价格数据
  async fetchPrices(symbols) {
    const prices = new Map();
    
    for (const symbol of symbols) {
      const [exchange, pair] = symbol.split(':');
      
      try {
        let price = null;
        
        if (exchange === 'binance') {
          const response = await axios.get(
            `https://api.binance.com/api/v3/ticker/price?symbol=${pair.replace('/', '')}`
          );
          price = parseFloat(response.data.price);
        } else if (exchange === 'okx') {
          const response = await axios.get(
            `https://www.okx.com/api/v5/market/ticker?instId=${pair.replace('/', '-')}`
          );
          price = parseFloat(response.data.data[0].last);
        }
        
        if (price) {
          prices.set(symbol, price);
          this.priceCache.set(symbol, {
            price,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error(`获取价格失败 ${symbol}:`, error.message);
      }
    }
    
    return prices;
  }

  // 检查预警条件
  checkAlertCondition(alert, currentPrice) {
    const lastPrice = this.priceCache.get(`${alert.exchange}:${alert.symbol}`)?.lastCheckedPrice;
    let triggered = false;
    
    switch (alert.type) {
      case 'above':
        triggered = currentPrice >= alert.price;
        break;
      case 'below':
        triggered = currentPrice <= alert.price;
        break;
      case 'cross':
        if (lastPrice) {
          triggered = (lastPrice < alert.price && currentPrice >= alert.price) ||
                     (lastPrice > alert.price && currentPrice <= alert.price);
        }
        break;
    }
    
    // 更新最后检查价格
    const cacheKey = `${alert.exchange}:${alert.symbol}`;
    const cache = this.priceCache.get(cacheKey) || {};
    cache.lastCheckedPrice = currentPrice;
    this.priceCache.set(cacheKey, cache);
    
    if (triggered) {
      // 检查是否需要触发（避免重复触发）
      const shouldTrigger = alert.repeat || !alert.lastTriggered ||
        (Date.now() - new Date(alert.lastTriggered).getTime() > 60000); // 至少间隔1分钟
      
      if (shouldTrigger) {
        this.triggerAlert(alert, currentPrice);
      }
    }
  }

  // 触发预警
  async triggerAlert(alert, currentPrice) {
    console.log(`🚨 价格预警触发: ${alert.symbol} 当前价格: ${currentPrice}, 预设: ${alert.type} ${alert.price}`);

    // 构建通知内容
    const notification = {
      title: `价格预警: ${alert.symbol}`,
      message: alert.message,
      details: {
        symbol: alert.symbol,
        currentPrice,
        alertPrice: alert.price,
        type: alert.type,
        time: new Date().toLocaleString()
      }
    };

    // ✅ 记录触发到数据库
    try {
      AlertService.recordTrigger(
        alert.id,
        currentPrice,
        alert.price,
        alert.type,
        alert.message
      );
    } catch (error) {
      console.error('❌ 记录预警触发失败:', error.message);
    }

    // 发送各种通知
    const promises = [];

    // 浏览器通知（通过WebSocket）
    if (alert.notification.browser) {
      this.emit('alert', notification);
    }

    // 邮件通知
    if (alert.notification.email && this.emailTransporter) {
      promises.push(this.sendEmailNotification(alert, notification));
    }

    // Webhook通知
    if (alert.notification.webhook) {
      promises.push(this.sendWebhookNotification(alert, notification));
    }

    // 声音通知（通过前端）
    if (alert.notification.sound) {
      this.emit('sound', alert.id);
    }

    await Promise.allSettled(promises);

    // ✅ 如果不重复，禁用该预警（更新到数据库）
    if (!alert.repeat) {
      try {
        AlertService.update(alert.id, { enabled: false });
      } catch (error) {
        console.error('❌ 更新预警状态失败:', error.message);
      }
    }
  }

  // 发送邮件通知
  async sendEmailNotification(alert, notification) {
    if (!this.emailTransporter) return;
    
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: process.env.EMAIL_TO || process.env.EMAIL_USER,
        subject: notification.title,
        html: `
          <h2>${notification.title}</h2>
          <p>${notification.message}</p>
          <ul>
            <li>交易对: ${notification.details.symbol}</li>
            <li>当前价格: ${notification.details.currentPrice}</li>
            <li>预警价格: ${notification.details.alertPrice}</li>
            <li>预警类型: ${notification.details.type}</li>
            <li>触发时间: ${notification.details.time}</li>
          </ul>
        `
      };
      
      await this.emailTransporter.sendMail(mailOptions);
      console.log('📧 邮件通知已发送');
    } catch (error) {
      console.error('发送邮件失败:', error);
    }
  }

  // 发送Webhook通知（钉钉、企业微信等）
  async sendWebhookNotification(alert, notification) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;
    
    try {
      // 钉钉机器人格式
      if (webhookUrl.includes('dingtalk')) {
        await axios.post(webhookUrl, {
          msgtype: 'text',
          text: {
            content: `【价格预警】\n${notification.message}\n` +
                    `交易对: ${notification.details.symbol}\n` +
                    `当前价格: ${notification.details.currentPrice}\n` +
                    `预警价格: ${notification.details.alertPrice}\n` +
                    `时间: ${notification.details.time}`
          }
        });
      }
      // 企业微信格式
      else if (webhookUrl.includes('weixin')) {
        await axios.post(webhookUrl, {
          msgtype: 'text',
          text: {
            content: `【价格预警】\n${notification.message}\n` +
                    `交易对: ${notification.details.symbol}\n` +
                    `当前价格: ${notification.details.currentPrice}\n` +
                    `预警价格: ${notification.details.alertPrice}\n` +
                    `时间: ${notification.details.time}`
          }
        });
      }
      // 通用格式
      else {
        await axios.post(webhookUrl, notification);
      }
      
      console.log('🔔 Webhook通知已发送');
    } catch (error) {
      console.error('发送Webhook失败:', error);
    }
  }

  // 获取价格历史
  getPriceHistory(symbol, exchange = 'binance') {
    const key = `${exchange}:${symbol}`;
    return this.priceCache.get(key);
  }

  // 清理过期预警
  cleanupExpiredAlerts() {
    // ✅ 使用数据库服务清理
    try {
      const cleaned = AlertService.cleanupExpired();
      // 日志已在 AlertService 中输出
      return cleaned;
    } catch (error) {
      console.error('❌ 清理过期预警失败:', error.message);
      return 0;
    }
  }
}

// 单例模式
let alertServiceInstance = null;

function getAlertService() {
  if (!alertServiceInstance) {
    alertServiceInstance = new PriceAlertService();
  }
  return alertServiceInstance;
}

module.exports = {
  getAlertService,
  PriceAlertService
};