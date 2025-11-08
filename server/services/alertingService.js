const axios = require('axios');

class AlertingService {
  constructor() {
    this.cooldowns = new Map();
    this.defaultCooldownMs = (Number(process.env.ALERT_COOLDOWN_SECONDS) || 300) * 1000;
  }

  normalizeKey(key) {
    if (!key) return 'general';
    return key.replace(/\d+(?:\.\d+)?/g, '#');
  }

  shouldThrottle(key, cooldownMs) {
    const now = Date.now();
    const normalizedKey = this.normalizeKey(key);
    const last = this.cooldowns.get(normalizedKey);
    if (last && (now - last) < cooldownMs) {
      return true;
    }
    this.cooldowns.set(normalizedKey, now);
    return false;
  }

  async sendWebhook(payload) {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return { status: 'skipped', reason: 'webhook_url_missing' };

    try {
      await axios.post(url, payload, {
        timeout: Number(process.env.ALERT_WEBHOOK_TIMEOUT_MS) || 5000
      });
      return { status: 'sent' };
    } catch (error) {
      console.error('[Alerting] Webhook发送失败:', error.message);
      return { status: 'failed', error: error.message };
    }
  }

  async notify({
    level = 'info',
    title = '系统通知',
    message,
    dedupeKey,
    cooldownMs,
    context
  }) {
    if (!message) {
      return { status: 'skipped', reason: 'message_missing' };
    }

    const cooldown = Number.isFinite(cooldownMs) ? cooldownMs : this.defaultCooldownMs;
    const key = dedupeKey || `${level}:${title}`;
    if (cooldown > 0 && this.shouldThrottle(key, cooldown)) {
      return { status: 'throttled' };
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      title,
      message,
      context: context || {}
    };

    if (process.env.ALERT_WEBHOOK_URL) {
      return await this.sendWebhook(payload);
    }

    console.log(`[Alert][${level.toUpperCase()}] ${title}: ${message}`);
    return { status: 'logged' };
  }
}

module.exports = new AlertingService();

