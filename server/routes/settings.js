const express = require('express');
const router = express.Router();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
const { getDatabase } = require('../database/database');

// 数据库连接（复用全局实例）
const db = getDatabase();

// 加密密钥管理：优先用环境变量，否则持久化到 data/.enc_key
const ENC_KEY_FILE = path.join(__dirname, '../../data/.enc_key');
function getEncryptionKeyBuffer() {
  if (process.env.ENCRYPTION_KEY) {
    const keyHex = process.env.ENCRYPTION_KEY.trim();
    // 允许提供原始32字节或64位hex
    if (keyHex.length === 64) return Buffer.from(keyHex, 'hex');
    if (keyHex.length === 32) return Buffer.from(keyHex, 'utf8');
  }
  try {
    if (fs.existsSync(ENC_KEY_FILE)) {
      const storedHex = fs.readFileSync(ENC_KEY_FILE, 'utf8').trim();
      return Buffer.from(storedHex, 'hex');
    }
  } catch (_) {}
  const buf = crypto.randomBytes(32);
  try { fs.writeFileSync(ENC_KEY_FILE, buf.toString('hex'), { mode: 0o600 }); } catch (_) {}
  return buf;
}
const ENCRYPTION_KEY_BUF = getEncryptionKeyBuffer();
const IV_LENGTH = 16;

// 加密函数 (使用AES-256-GCM，带认证)
function encrypt(text) {
  if (!text && text !== '') return '';
  const iv = crypto.randomBytes(12); // GCM推荐12字节IV
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY_BUF, iv);
  let encrypted = cipher.update(String(text), 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

// 解密函数 (支持AES-256-GCM)
function decrypt(text) {
  try {
    if (!text) return '';
    const parts = String(text).split(':');

    // 兼容旧的CBC格式 (2部分: iv:ciphertext)
    if (parts.length === 2) {
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUF, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    }

    // 新的GCM格式 (3部分: iv:authTag:ciphertext)
    if (parts.length === 3) {
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = Buffer.from(parts[2], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY_BUF, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    }

    return '';
  } catch (error) {
    console.error('解密失败 (数据可能已损坏):', error.message);
    return '';
  }
}

// 确保设置表存在
db.exec(`
  CREATE TABLE IF NOT EXISTS api_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    is_encrypted INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
  );
`);

// 获取所有密钥配置（脱敏显示 + 提供hasValue标记）
router.get('/keys', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT category, key, value, is_encrypted
      FROM api_settings
      WHERE category IN ('ai', 'okx')
    `).all();

    const result = { ai: {}, okx: {} };

    rows.forEach(r => {
      let display = r.value || '';
      let hasValue = !!display;
      if (r.is_encrypted && display) {
        const plain = decrypt(display);
        hasValue = !!plain;
        // 仅用于显示：脱敏
        if (plain && plain.length > 8) {
          display = plain.substring(0, 4) + '*'.repeat(8) + plain.substring(plain.length - 4);
        } else {
          display = plain ? '****' : '';
        }
      }
      result[r.category][r.key] = display;
      result[r.category][`${r.key}Saved`] = hasValue ? 1 : 0;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存AI密钥配置（仅当提供密钥时才更新密钥，避免误清空）
router.post('/ai-keys', (req, res) => {
  try {
    const { deepseekApiKey, deepseekBaseUrl, endpointUrl, endpointPath, modelName } = req.body || {};

    const upsert = db.prepare(`
      INSERT INTO api_settings (category, key, value, is_encrypted, created_at, updated_at)
      VALUES (@category, @key, @value, @is_encrypted, datetime('now'), datetime('now'))
      ON CONFLICT(category, key) DO UPDATE SET
        value = excluded.value,
        is_encrypted = excluded.is_encrypted,
        updated_at = datetime('now')
    `);

    const txn = db.transaction(() => {
      // 非敏感：总是更新
      upsert.run({ category: 'ai', key: 'deepseekBaseUrl', value: deepseekBaseUrl || 'https://api.deepseek.com', is_encrypted: 0 });
      upsert.run({ category: 'ai', key: 'endpointUrl', value: endpointUrl || '', is_encrypted: 0 });
      upsert.run({ category: 'ai', key: 'endpointPath', value: endpointPath || '/v1/chat/completions', is_encrypted: 0 });
      upsert.run({ category: 'ai', key: 'modelName', value: modelName || 'deepseek-chat', is_encrypted: 0 });
      // 敏感：仅当提供时更新
      if (typeof deepseekApiKey === 'string' && deepseekApiKey.trim()) {
        upsert.run({ category: 'ai', key: 'deepseekApiKey', value: encrypt(deepseekApiKey.trim()), is_encrypted: 1 });
        process.env.DEEPSEEK_API_KEY = deepseekApiKey.trim();
      }
      if (deepseekBaseUrl) process.env.DEEPSEEK_BASE_URL = deepseekBaseUrl;
      if (endpointUrl !== undefined) process.env.DEEPSEEK_ENDPOINT_URL = endpointUrl;
      if (endpointPath) process.env.DEEPSEEK_ENDPOINT_PATH = endpointPath;
    });

    txn();

    res.json({ success: true, message: 'AI配置保存成功' });
  } catch (error) {
    console.error('保存AI配置失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存OKX密钥配置（仅当提供密钥时才更新密钥）
router.post('/okx-keys', (req, res) => {
  try {
    const { apiKey, secretKey, passphrase, testnet, enableRealTrading } = req.body || {};

    const upsert = db.prepare(`
      INSERT INTO api_settings (category, key, value, is_encrypted, created_at, updated_at)
      VALUES (@category, @key, @value, @is_encrypted, datetime('now'), datetime('now'))
      ON CONFLICT(category, key) DO UPDATE SET
        value = excluded.value,
        is_encrypted = excluded.is_encrypted,
        updated_at = datetime('now')
    `);

    const txn = db.transaction(() => {
      // 布尔项总是更新
      upsert.run({ category: 'okx', key: 'testnet', value: testnet ? '1' : '0', is_encrypted: 0 });
      upsert.run({ category: 'okx', key: 'enableRealTrading', value: enableRealTrading ? '1' : '0', is_encrypted: 0 });
      // 敏感：仅当提供时更新
      if (typeof apiKey === 'string' && apiKey.trim()) upsert.run({ category: 'okx', key: 'apiKey', value: encrypt(apiKey.trim()), is_encrypted: 1 });
      if (typeof secretKey === 'string' && secretKey.trim()) upsert.run({ category: 'okx', key: 'secretKey', value: encrypt(secretKey.trim()), is_encrypted: 1 });
      if (typeof passphrase === 'string' && passphrase.trim()) upsert.run({ category: 'okx', key: 'passphrase', value: encrypt(passphrase.trim()), is_encrypted: 1 });

      // 立即生效到环境变量
      if (typeof apiKey === 'string' && apiKey.trim()) process.env.OKX_API_KEY = apiKey.trim();
      if (typeof secretKey === 'string' && secretKey.trim()) process.env.OKX_API_SECRET = secretKey.trim();
      if (typeof passphrase === 'string' && passphrase.trim()) process.env.OKX_API_PASSPHRASE = passphrase.trim();
      process.env.OKX_SIMULATED = testnet ? 'true' : 'false';
      process.env.TRADING_MODE = enableRealTrading ? 'live' : (testnet ? 'demo' : 'paper');
    });

    txn();

    res.json({ success: true, message: 'OKX配置保存成功' });
  } catch (error) {
    console.error('保存OKX配置失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 从DB获取并解密配置
function getSetting(category, key, decrypted = false) {
  const row = db.prepare(`SELECT value, is_encrypted FROM api_settings WHERE category = ? AND key = ?`).get(category, key);
  if (!row) return null;
  const val = row.value || '';
  if (decrypted && row.is_encrypted) return decrypt(val);
  return val;
}

// 获取可用模型列表
router.post('/fetch-models', async (req, res) => {
  try {
    let { apiKey, baseUrl } = req.body || {};

    if (!apiKey) apiKey = getSetting('ai', 'deepseekApiKey', true);
    if (!baseUrl) baseUrl = getSetting('ai', 'deepseekBaseUrl', false) || 'https://api.deepseek.com';

    if (!apiKey) {
      return res.json({ success: false, message: 'API密钥不能为空' });
    }

    // 调用模型列表API
    const response = await axios.get(
      `${baseUrl}/v1/models`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const models = response.data?.data || [];
    res.json({
      success: true,
      models: models.map(m => ({
        id: m.id,
        object: m.object,
        created: m.created,
        owned_by: m.owned_by
      }))
    });
  } catch (error) {
    console.error('获取模型列表失败:', error.response?.data || error.message);
    res.json({
      success: false,
      message: error.response?.data?.error?.message || error.message || '获取模型列表失败'
    });
  }
});

// 测试AI连接（如果未提供则使用已保存配置）
router.post('/test-ai', async (req, res) => {
  try {
    let { deepseekApiKey, deepseekBaseUrl, endpointUrl, endpointPath, modelName } = req.body || {};

    if (!deepseekApiKey) deepseekApiKey = getSetting('ai', 'deepseekApiKey', true);
    if (!deepseekBaseUrl) deepseekBaseUrl = getSetting('ai', 'deepseekBaseUrl', false) || 'https://api.deepseek.com';
    if (!endpointUrl) endpointUrl = getSetting('ai', 'endpointUrl', false) || process.env.DEEPSEEK_ENDPOINT_URL || '';
    if (!endpointPath) endpointPath = getSetting('ai', 'endpointPath', false) || '/v1/chat/completions';
    if (!modelName) modelName = getSetting('ai', 'modelName', false) || 'deepseek-chat';

    if (!deepseekApiKey) {
      return res.json({ success: false, message: 'API密钥不能为空' });
    }

    // 测试API连接
    const url = endpointUrl && endpointUrl.trim() ? endpointUrl.trim() : `${deepseekBaseUrl.replace(/\/$/, '')}${endpointPath.startsWith('/') ? endpointPath : ('/' + endpointPath)}`;
    const response = await axios.post(
      url,
      {
        model: modelName,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    // 🔧 兼容多种API响应格式（与iflow.cn、DeepSeek、OpenAI等）
    const data = response.data;
    console.log('🔍 AI测试响应结构:', JSON.stringify({
      hasData: !!data,
      hasChoices: !!(data?.choices),
      hasMessage: !!(data?.message),
      hasContent: !!(data?.content),
      hasStatus: !!(data?.status),
      keys: data ? Object.keys(data) : []
    }));

    // 检查是否能提取到有效响应
    let hasValidResponse = false;

    // 🔧 iflow.cn 特殊处理：检查 {status, msg, body} 格式
    if (data?.body && typeof data.body === 'object') {
      console.log('🔍 检测到 iflow.cn 包裹格式，解包 body 字段...');
      const innerData = data.body;
      // 检查 body 内是否有标准响应
      if (Array.isArray(innerData?.choices) && innerData.choices.length > 0) {
        hasValidResponse = true;
        console.log('✅ iflow.cn body 内包含有效的 choices 数据');
      }
    }
    // 标准 OpenAI 格式
    else if (Array.isArray(data?.choices) && data.choices.length > 0) {
      hasValidResponse = true;
      console.log('✅ 标准 OpenAI 格式');
    }
    // 简化格式
    else if (data?.message?.content || data?.content || data?.text) {
      hasValidResponse = true;
      console.log('✅ 简化响应格式');
    }
    // 直接返回文本
    else if (typeof data === 'string' && data.trim().length > 0) {
      hasValidResponse = true;
      console.log('✅ 直接文本响应');
    }

    if (hasValidResponse) {
      res.json({ success: true, message: 'AI连接测试成功' });
    } else {
      console.error('❌ 无法识别的响应格式:', JSON.stringify(data, null, 2));
      res.json({
        success: false,
        message: `响应格式不正确。请检查API端点和密钥是否正确。响应结构: ${JSON.stringify(Object.keys(data || {}))}`
      });
    }
  } catch (error) {
    res.json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
});

// 测试OKX连接（如果未提供则使用已保存配置）
router.post('/test-okx', async (req, res) => {
  try {
    let { apiKey, secretKey, passphrase, testnet } = req.body || {};

    if (!apiKey) apiKey = getSetting('okx', 'apiKey', true);
    if (!secretKey) secretKey = getSetting('okx', 'secretKey', true);
    if (!passphrase) passphrase = getSetting('okx', 'passphrase', true);
    if (testnet === undefined || testnet === null) testnet = (getSetting('okx', 'testnet', false) || '0') === '1';

    if (!apiKey || !secretKey || !passphrase) {
      return res.json({ success: false, message: 'API凭证不完整' });
    }

    const baseUrl = 'https://www.okx.com';
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/account/balance';

    // 创建签名（OKX要求签名path必须包含/api/v5前缀）
    const prehash = timestamp + method + requestPath;
    const signature = crypto.createHmac('sha256', secretKey).update(prehash).digest('base64');

    const response = await axios.get(
      `${baseUrl}${requestPath}`,
      {
        headers: {
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase,
          'Content-Type': 'application/json',
          'x-simulated-trading': testnet ? '1' : '0'
        },
        timeout: 10000
      }
    );

    if (response.data && (response.data.code === '0' || response.data.code === 0)) {
      res.json({ success: true, message: 'OKX连接测试成功' });
    } else {
      res.json({ success: false, message: response.data?.msg || '连接失败' });
    }
  } catch (error) {
    res.json({ success: false, message: error.response?.data?.msg || error.message });
  }
});

// 获取解密后的配置（内部使用）
router.get('/internal/decrypted', (req, res) => {
  // 验证内部请求
  const internalKey = req.headers['x-internal-key'];
  const expectedKey = process.env.INTERNAL_API_KEY;

  // 强制要求设置INTERNAL_API_KEY
  if (!expectedKey) {
    console.error('SECURITY ERROR: INTERNAL_API_KEY not set in environment');
    return res.status(500).json({
      success: false,
      message: 'Server configuration error'
    });
  }

  // 验证密钥
  if (!internalKey || internalKey !== expectedKey) {
    return res.status(403).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  // 额外的IP白名单验证（仅允许本地访问）
  const clientIp = req.ip || req.connection.remoteAddress;
  const isLocalhost = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(clientIp);

  if (!isLocalhost) {
    console.warn(`SECURITY WARNING: Internal API accessed from non-localhost IP: ${clientIp}`);
    return res.status(403).json({
      success: false,
      message: 'Access denied: Only localhost allowed'
    });
  }

  try {
    const settings = db.prepare(`
      SELECT category, key, value, is_encrypted
      FROM api_settings
      WHERE category IN ('ai', 'okx')
    `).all();

    const result = {};

    settings.forEach(setting => {
      if (!result[setting.category]) {
        result[setting.category] = {};
      }

      let value = setting.value;
      // 解密
      if (setting.is_encrypted && value) {
        value = decrypt(value);
      }

      result[setting.category][setting.key] = value;
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取解密配置失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// ---- 新增：AI校准与风险参数设置 ----
// 获取 AI 校准目标胜率
router.get('/ai/validation-target', (req, res) => {
  try {
    const row = db.prepare(`SELECT value FROM api_settings WHERE category='ai' AND key='validationTargetWinrate'`).get();
    const envVal = process.env.AI_VALIDATION_TARGET_WINRATE;
    const value = row?.value ?? (envVal ? String(envVal) : '0.55');
    res.json({ success: true, data: { targetWinRate: Number(value) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 设置 AI 校准目标胜率（0-1）
router.post('/ai/validation-target', (req, res) => {
  try {
    let { targetWinRate } = req.body || {};
    const v = Number(targetWinRate);
    if (!Number.isFinite(v) || v <= 0 || v >= 1) {
      return res.status(400).json({ success: false, message: 'targetWinRate 必须是 (0,1) 之间的小数，例如 0.60' });
    }
    const upsert = db.prepare(`
      INSERT INTO api_settings (category, key, value, is_encrypted, created_at, updated_at)
      VALUES ('ai','validationTargetWinrate', @value, 0, datetime('now'), datetime('now'))
      ON CONFLICT(category, key) DO UPDATE SET value=excluded.value, is_encrypted=0, updated_at=datetime('now')
    `);
    upsert.run({ value: String(v) });
    process.env.AI_VALIDATION_TARGET_WINRATE = String(v);
    res.json({ success: true, message: 'AI目标胜率已更新', data: { targetWinRate: v } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取 风险参数（回撤阈值与连亏缩放基数）
router.get('/risk/params', (req, res) => {
  try {
    const get = (k, def) => {
      const r = db.prepare(`SELECT value FROM api_settings WHERE category='risk' AND key=?`).get(k);
      return r?.value ?? (process.env[k] ?? def);
    };
    const drawdownL2 = Number(get('RISK_DRAWDOWN_L2', '-1.5'));
    const drawdownL3 = Number(get('RISK_DRAWDOWN_L3', '-3'));
    const consecutiveLossBase = Number(get('RISK_CONSEC_BASE', '0.8'));
    res.json({ success: true, data: { drawdownL2, drawdownL3, consecutiveLossBase } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 设置 风险参数
router.post('/risk/params', (req, res) => {
  try {
    let { drawdownL2, drawdownL3, consecutiveLossBase } = req.body || {};
    const l2 = Number(drawdownL2), l3 = Number(drawdownL3), base = Number(consecutiveLossBase);
    if (!Number.isFinite(l2) || !Number.isFinite(l3) || !Number.isFinite(base)) {
      return res.status(400).json({ success: false, message: '参数必须为数值' });
    }
    const upsert = db.prepare(`
      INSERT INTO api_settings (category, key, value, is_encrypted, created_at, updated_at)
      VALUES ('risk', @key, @value, 0, datetime('now'), datetime('now'))
      ON CONFLICT(category, key) DO UPDATE SET value=excluded.value, is_encrypted=0, updated_at=datetime('now')
    `);
    const txn = db.transaction(() => {
      upsert.run({ key: 'RISK_DRAWDOWN_L2', value: String(l2) });
      upsert.run({ key: 'RISK_DRAWDOWN_L3', value: String(l3) });
      upsert.run({ key: 'RISK_CONSEC_BASE', value: String(base) });
    });
    txn();
    process.env.RISK_DRAWDOWN_L2 = String(l2);
    process.env.RISK_DRAWDOWN_L3 = String(l3);
    process.env.RISK_CONSEC_BASE = String(base);
    res.json({ success: true, message: '风险参数已更新', data: { drawdownL2: l2, drawdownL3: l3, consecutiveLossBase: base } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// 获取 反趋势保护参数
router.get('/ai/anti-trend', (req, res) => {
  try {
    const getVal = (key, def) => {
      const row = db.prepare(`SELECT value FROM api_settings WHERE category='ai' AND key=?`).get(key);
      const env = process.env[key];
      const v = row?.value ?? env ?? def;
      const num = Number(v);
      return Number.isFinite(num) ? num : Number(def);
    };
    const hardGatePct = getVal('ANTI_TREND_HARD_GATE_PCT', '85');
    const softPenaltyPct = getVal('ANTI_TREND_SOFT_PENALTY_PCT', '70');
    const softPenaltyAdd = getVal('ANTI_TREND_SOFT_PENALTY_ADD', '10');
    res.json({ success: true, data: { hardGatePct, softPenaltyPct, softPenaltyAdd } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 设置 反趋势保护参数
router.post('/ai/anti-trend', (req, res) => {
  try {
    let { hardGatePct, softPenaltyPct, softPenaltyAdd } = req.body || {};
    const a = Number(hardGatePct);
    const b = Number(softPenaltyPct);
    const c = Number(softPenaltyAdd);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      return res.status(400).json({ success: false, message: '参数必须为数值' });
    }
    if (a < 0 || a > 100 || b < 0 || b > 100 || c < 0 || c > 50) {
      return res.status(400).json({ success: false, message: '范围不合法: hardGatePct/softPenaltyPct 应在 0~100，softPenaltyAdd 建议 0~50(pp)' });
    }
    const upsert = db.prepare(`
      INSERT INTO api_settings (category, key, value, is_encrypted, created_at, updated_at)
      VALUES ('ai', @key, @value, 0, datetime('now'), datetime('now'))
      ON CONFLICT(category, key) DO UPDATE SET value=excluded.value, is_encrypted=0, updated_at=datetime('now')
    `);
    const txn = db.transaction(() => {
      upsert.run({ key: 'ANTI_TREND_HARD_GATE_PCT', value: String(a) });
      upsert.run({ key: 'ANTI_TREND_SOFT_PENALTY_PCT', value: String(b) });
      upsert.run({ key: 'ANTI_TREND_SOFT_PENALTY_ADD', value: String(c) });
    });
    txn();
    process.env.ANTI_TREND_HARD_GATE_PCT = String(a);
    process.env.ANTI_TREND_SOFT_PENALTY_PCT = String(b);
    process.env.ANTI_TREND_SOFT_PENALTY_ADD = String(c);
    res.json({ success: true, message: '反趋势保护参数已更新', data: { hardGatePct: a, softPenaltyPct: b, softPenaltyAdd: c } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;