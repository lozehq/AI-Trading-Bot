/**
 * 环境变量验证模块
 * 在服务器启动时检查必需的环境变量
 */

/**
 * 验证环境变量
 */
function validateEnv() {
  console.log('\n🔍 检查环境变量配置...\n');

  // 必需的环境变量
  const required = {
    'DEEPSEEK_API_KEY': {
      description: 'DeepSeek AI API密钥',
      critical: false, // 非关键，可以使用本地备用方案
      default: null
    }
  };

  // 可选但推荐的环境变量
  const optional = {
    'EXCHANGE_NAME': {
      description: '默认交易所名称',
      default: 'binance'
    },
    'PORT': {
      description: 'HTTP服务器端口',
      default: '3002'
    },
    'WS_PORT': {
      description: 'WebSocket服务器端口',
      default: '3001'
    },
    'ALLOWED_ORIGINS': {
      description: 'CORS允许的来源（逗号分隔）',
      default: 'http://localhost:5173,http://localhost:3000'
    },
    'DATA_SOURCE': {
      description: '数据源类型 (mcp/ccxt)',
      default: 'ccxt'
    },
    'OKX_API_KEY': {
      description: 'OKX API密钥',
      default: null
    },
    'OKX_API_SECRET': {
      description: 'OKX API密钥',
      default: null
    },
    'OKX_API_PASSPHRASE': {
      description: 'OKX API密码短语',
      default: null
    },
    'OKX_SIMULATED': {
      description: 'OKX模拟盘模式 (true/false)',
      default: 'true'
    },
    'TRADING_MODE': {
      description: '交易模式 (paper/demo/live)',
      default: 'paper'
    },
    'DEFAULT_MARKET_TYPE': {
      description: '默认市场类型 (spot/swap/futures)',
      default: 'spot'
    },
    'MAX_TRADE_AMOUNT': {
      description: '最大单笔交易金额',
      default: '1000'
    },
    'MAX_POSITIONS': {
      description: '最大持仓数量',
      default: '5'
    },
    'MAX_DAILY_TRADES': {
      description: '每日最大交易次数',
      default: '20'
    }
  };

  const warnings = [];
  const info = [];

  // 检查必需的环境变量
  for (const [key, config] of Object.entries(required)) {
    if (!process.env[key]) {
      if (config.critical) {
        console.error(`❌ 缺少关键环境变量: ${key}`);
        console.error(`   说明: ${config.description}`);
        process.exit(1);
      } else {
        warnings.push({
          key,
          description: config.description,
          default: config.default
        });
      }
    } else {
      console.log(`✅ ${key}: ${maskSensitive(key, process.env[key])}`);
    }
  }

  // 检查可选的环境变量
  for (const [key, config] of Object.entries(optional)) {
    if (!process.env[key]) {
      info.push({
        key,
        description: config.description,
        default: config.default
      });
      // 设置默认值
      process.env[key] = config.default;
      console.log(`ℹ️  ${key}: ${config.default} (默认值)`);
    } else {
      console.log(`✅ ${key}: ${maskSensitive(key, process.env[key])}`);
    }
  }

  // 显示警告
  if (warnings.length > 0) {
    console.log('\n⚠️  警告: 以下环境变量未设置\n');
    warnings.forEach(({ key, description, default: defaultValue }) => {
      console.log(`   ${key}`);
      console.log(`   说明: ${description}`);
      if (defaultValue) {
        console.log(`   将使用默认值: ${defaultValue}`);
      } else {
        console.log(`   系统将使用备用方案`);
      }
      console.log('');
    });
  }

  console.log('\n✅ 环境变量检查完成\n');

  return {
    valid: true,
    warnings: warnings.length,
    info: info.length
  };
}

/**
 * 隐藏敏感信息
 */
function maskSensitive(key, value) {
  const sensitiveKeys = ['API_KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'PASSPHRASE', 'PASS', 'ENCRYPTION_KEY', 'JWT_SECRET'];
  
  if (sensitiveKeys.some(k => key.includes(k))) {
    if (value.length <= 8) {
      return '***';
    }
    return value.substring(0, 4) + '***' + value.substring(value.length - 4);
  }
  
  return value;
}

/**
 * 获取环境变量配置摘要
 */
function getEnvSummary() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3002,
    wsPort: process.env.WS_PORT || 3001,
    exchange: process.env.EXCHANGE_NAME || 'binance',
    dataSource: process.env.DATA_SOURCE || 'ccxt',
    hasDeepSeekKey: !!process.env.DEEPSEEK_API_KEY,
    allowedOrigins: process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000'
  };
}

module.exports = {
  validateEnv,
  getEnvSummary
};

