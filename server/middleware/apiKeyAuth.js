/**
 * API Key 认证中间件
 * 提供基于 API Key 的身份验证和访问控制
 */

const crypto = require('crypto');
const { getDatabase } = require('../database/database');

// API Key 配置
const API_KEY_HEADER = 'X-API-Key';
const API_SECRET_HEADER = 'X-API-Secret';

// 白名单路由（不需要认证）
const WHITELIST_ROUTES = [
  '/api/health',
  '/api/status',
  '/api/market/ticker', // 公开市场数据
  '/api/market/symbols'
];

// 高风险路由（需要 API Key + Secret + IP 白名单）
const HIGH_RISK_ROUTES = [
  '/api/trading/execute',
  '/api/trading/cancel',
  '/api/auto-trade',
  '/api/okx/trade',
  '/api/database/reset',
  '/api/api-keys' // 管理 API Key 也应该是高风险的
];

/**
 * 生成 API Key
 */
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成 API Secret (高熵随机字符串)
 */
function generateApiSecret() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * 对 Secret 进行加盐哈希
 * @param {string} secret 明文 Secret
 * @param {string} salt 盐值 (hex)
 */
function hashApiSecret(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 10000, 64, 'sha512').toString('hex');
}

/**
 * 验证 API Key
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'API Key 缺失或格式错误' };
  }

  try {
    const db = getDatabase();
    const key = db.prepare('SELECT id, key, expires_at, ip_whitelist FROM api_keys WHERE key = ? AND is_active = 1').get(apiKey);
    
    if (!key) {
      return { valid: false, error: 'API Key 无效或已禁用' };
    }

    // 检查过期时间
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return { valid: false, error: 'API Key 已过期' };
    }

    // 更新最后使用时间
    db.prepare('UPDATE api_keys SET last_used_at = datetime("now") WHERE id = ?').run(key.id);

    return { valid: true, key };
  } catch (error) {
    console.error('API Key 验证失败:', error.message);
    return { valid: false, error: '验证过程出错' };
  }
}

/**
 * 验证 API Secret（用于高风险操作）
 * 修复：使用安全的哈希比对，不再比对明文
 */
function validateApiSecret(apiKey, apiSecret) {
  if (!apiSecret) {
    return { valid: false, error: 'API Secret 缺失' };
  }

  try {
    const db = getDatabase();
    // 只查询 secret 字段，不查询其他信息
    const row = db.prepare('SELECT secret FROM api_keys WHERE key = ?').get(apiKey);
    
    if (!row || !row.secret) {
      return { valid: false, error: 'API Secret 验证失败' };
    }

    // 解析存储的 secret (格式: salt:hash)
    const parts = row.secret.split(':');
    if (parts.length !== 2) {
      console.error('[Security] 发现旧版明文存储的 Secret，请重新生成 API Key');
      return { valid: false, error: '密钥存储格式旧，请重新生成' };
    }

    const [salt, storedHash] = parts;
    const inputHash = hashApiSecret(apiSecret, salt);

    // 使用时序安全的比对
    if (crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(storedHash, 'hex'))) {
      return { valid: true };
    }

    return { valid: false, error: 'API Secret 错误' };
  } catch (error) {
    console.error('API Secret 验证失败:', error.message);
    return { valid: false, error: '验证过程出错' };
  }
}

/**
 * 验证 IP 白名单
 */
function validateIpWhitelist(apiKey, clientIp) {
  try {
    const db = getDatabase();
    const key = db.prepare('SELECT ip_whitelist FROM api_keys WHERE key = ?').get(apiKey);
    
    if (!key || !key.ip_whitelist) {
      return { valid: true }; // 没有设置白名单，允许所有IP
    }

    let whitelist;
    try {
      whitelist = JSON.parse(key.ip_whitelist);
    } catch (e) {
      return { valid: true }; // 解析失败视为无限制（或应视为全拒绝，视安全策略而定，这里暂且宽松）
    }

    if (!Array.isArray(whitelist) || whitelist.length === 0) {
      return { valid: true };
    }

    // 支持 CIDR 或简单 IP 比对 (这里简化为直接比对)
    if (!whitelist.includes(clientIp)) {
      // 尝试处理本地开发环境的 IPv6 映射
      if (clientIp === '::1' && whitelist.includes('127.0.0.1')) return { valid: true };
      if (clientIp.startsWith('::ffff:') && whitelist.includes(clientIp.replace('::ffff:', ''))) return { valid: true };

      return { valid: false, error: `IP ${clientIp} 不在白名单中` };
    }

    return { valid: true };
  } catch (error) {
    console.error('IP 白名单验证失败:', error.message);
    return { valid: false, error: '验证过程出错' };
  }
}

/**
 * API Key 认证中间件
 */
function apiKeyAuth(options = {}) {
  const { 
    required = true,
    requireSecret = false
  } = options;

  return (req, res, next) => {
    const path = req.path;

    // 检查是否在白名单中
    if (WHITELIST_ROUTES.some(route => path.startsWith(route))) {
      return next();
    }

    // 检查是否需要认证
    if (!required) {
      return next();
    }

    // 获取 API Key
    const apiKey = req.headers[API_KEY_HEADER.toLowerCase()] || req.query.apiKey;
    
    // 验证 API Key
    const keyValidation = validateApiKey(apiKey);
    if (!keyValidation.valid) {
      return res.status(401).json({
        success: false,
        error: keyValidation.error
      });
    }

    // 检查是否是高风险路由
    const isHighRisk = HIGH_RISK_ROUTES.some(route => path.startsWith(route));
    
    if (isHighRisk || requireSecret) {
      // 验证 API Secret
      const apiSecret = req.headers[API_SECRET_HEADER.toLowerCase()];
      const secretValidation = validateApiSecret(apiKey, apiSecret);
      
      if (!secretValidation.valid) {
        return res.status(403).json({
          success: false,
          error: secretValidation.error
        });
      }

      // 验证 IP 白名单
      const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
      // 清理 IP 格式
      const cleanIp = clientIp.replace('::ffff:', '');
      
      const ipValidation = validateIpWhitelist(apiKey, cleanIp);
      
      if (!ipValidation.valid) {
        console.warn(`[Security] IP被拒绝: ${cleanIp} (Key: ${apiKey.slice(0, 8)}...)`);
        return res.status(403).json({
          success: false,
          error: ipValidation.error
        });
      }
    }

    // 将 API Key 信息附加到请求对象
    req.apiKey = keyValidation.key;
    next();
  };
}

module.exports = {
  apiKeyAuth,
  generateApiKey,
  generateApiSecret,
  hashApiSecret, // 导出供路由使用
  validateApiKey,
  validateApiSecret,
  validateIpWhitelist
};