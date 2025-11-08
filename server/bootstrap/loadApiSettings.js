/**
 * 启动时从数据库加载API设置到环境变量
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 加密密钥管理（与settings.js保持一致）
const ENC_KEY_FILE = path.join(__dirname, '../../data/.enc_key');
function getEncryptionKeyBuffer() {
  if (process.env.ENCRYPTION_KEY) {
    const keyHex = process.env.ENCRYPTION_KEY.trim();
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

// 解密函数
function decrypt(text) {
  try {
    if (!text) return '';
    const parts = String(text).split(':');
    const iv = Buffer.from(parts.shift() || '', 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUF, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    return '';
  }
}

function loadApiSettingsFromDatabase() {
  try {
    const { getDatabase } = require('../database/database');
    const db = getDatabase();
    
    // 确保api_settings表存在
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

    // 加载AI设置
    const aiSettings = db.prepare(`
      SELECT key, value, is_encrypted 
      FROM api_settings 
      WHERE category = 'ai'
    `).all();

    aiSettings.forEach(setting => {
      const value = setting.is_encrypted ? decrypt(setting.value) : setting.value;
      if (value) {
        switch(setting.key) {
          case 'deepseekApiKey':
            if (!process.env.DEEPSEEK_API_KEY) {
              process.env.DEEPSEEK_API_KEY = value;
              console.log('从数据库加载 DEEPSEEK_API_KEY');
            }
            break;
          case 'deepseekBaseUrl':
            if (!process.env.DEEPSEEK_BASE_URL) {
              process.env.DEEPSEEK_BASE_URL = value;
              console.log('从数据库加载 DEEPSEEK_BASE_URL:', value);
            }
            break;
          case 'endpointPath':
            if (!process.env.DEEPSEEK_ENDPOINT_PATH) {
              process.env.DEEPSEEK_ENDPOINT_PATH = value;
              console.log('从数据库加载 DEEPSEEK_ENDPOINT_PATH:', value);
            }
            break;
          case 'endpointUrl':
            if (!process.env.DEEPSEEK_ENDPOINT_URL) {
              process.env.DEEPSEEK_ENDPOINT_URL = value;
              console.log('从数据库加载 DEEPSEEK_ENDPOINT_URL:', value);
            }
            break;
          case 'modelName':
            if (!process.env.DEEPSEEK_MODEL) {
              process.env.DEEPSEEK_MODEL = value;
              console.log('从数据库加载 DEEPSEEK_MODEL:', value);
            }
            break;
        }
      }
    });

    // 加载OKX设置
    const okxSettings = db.prepare(`
      SELECT key, value, is_encrypted 
      FROM api_settings 
      WHERE category = 'okx'
    `).all();

    let _testnetFlag = null;
    let _enableRealFlag = null;

    okxSettings.forEach(setting => {
      const value = setting.is_encrypted ? decrypt(setting.value) : setting.value;
      if (value !== undefined && value !== null) {
        switch(setting.key) {
          case 'apiKey':
            if (!process.env.OKX_API_KEY) {
              process.env.OKX_API_KEY = value;
              console.log('从数据库加载 OKX_API_KEY');
            }
            break;
          case 'secretKey':
            if (!process.env.OKX_API_SECRET) {
              process.env.OKX_API_SECRET = value;
              console.log('从数据库加载 OKX_API_SECRET');
            }
            break;
          case 'passphrase':
            if (!process.env.OKX_API_PASSPHRASE) {
              process.env.OKX_API_PASSPHRASE = value;
              console.log('从数据库加载 OKX_API_PASSPHRASE');
            }
            break;
          case 'testnet':
            _testnetFlag = (value === '1');
            process.env.OKX_SIMULATED = _testnetFlag ? 'true' : 'false';
            break;
          case 'enableRealTrading':
            _enableRealFlag = (value === '1');
            break;
        }
      }
    });

    if (_enableRealFlag === true) {
      process.env.TRADING_MODE = 'live';
    } else if (_testnetFlag === true) {
      process.env.TRADING_MODE = 'demo';
    } else if (!process.env.TRADING_MODE) {
      process.env.TRADING_MODE = 'paper';
    }

    console.log('API设置加载完成');
  } catch (error) {
    console.error('加载API设置失败:', error.message);
    // 不抛出错误，允许服务继续启动
  }
}

module.exports = { loadApiSettingsFromDatabase };