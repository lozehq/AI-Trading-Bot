#!/usr/bin/env node

/**
 * 安全密钥生成工具
 * 用于生成项目所需的所有安全密钥
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('\n🔐 安全密钥生成工具\n');
console.log('='.repeat(60));

// 生成密钥
const keys = {
  API_KEY: crypto.randomBytes(32).toString('hex'),
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  INTERNAL_API_KEY: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex')
};

// 脱敏显示函数：仅显示前4后4
const mask = (s) => (s && s.length > 8) ? (s.slice(0,4) + '***' + s.slice(-4)) : '***';


console.log('\n✅ 已生成以下安全密钥（已脱敏显示，完整值将写入 .env 或请手动复制）:\n');
Object.entries(keys).forEach(([key, value]) => {
  console.log(`${key}=${mask(value)}`);
});

// 生成建议的管理员密码
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
let adminPass = '';
for (let i = 0; i < 16; i++) {
  adminPass += chars[crypto.randomInt(0, chars.length)];
}

console.log(`\n💡 建议的管理员密码（已脱敏显示，完整值将写入 .env 或请手动复制）:`);
console.log(`ADMIN_USER=admin`);
console.log(`ADMIN_PASS=${mask(adminPass)}`);

console.log('\n='.repeat(60));
console.log('\n📋 下一步操作:\n');
console.log('1. 复制上述密钥到 .env 文件');
console.log('2. 设置您的AI和交易所API凭证');
console.log('3. 确保 .env 文件不被提交到Git (已在.gitignore中)');
console.log('4. 保存好这些密钥,丢失后无法恢复加密数据');

// 可选：自动创建.env文件
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n');
rl.question('是否自动创建/更新.env文件? (y/n): ', (answer) => {
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    const envPath = path.join(__dirname, '.env');
    const envContent = `# =======================================================
# 自动生成的安全配置
# 生成时间: ${new Date().toISOString()}
# =======================================================

# -------------------- 安全密钥 (自动生成) --------------------
API_KEY=${keys.API_KEY}
JWT_SECRET=${keys.JWT_SECRET}
INTERNAL_API_KEY=${keys.INTERNAL_API_KEY}
ENCRYPTION_KEY=${keys.ENCRYPTION_KEY}

# -------------------- 管理员账户 --------------------
ADMIN_USER=admin
ADMIN_PASS=${adminPass}

# -------------------- AI服务配置 --------------------
# 请替换为您的真实API密钥
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# -------------------- 交易所API配置 --------------------
# 请替换为您的真实OKX凭证
OKX_API_KEY=your-okx-api-key-here
OKX_API_SECRET=your-okx-secret-here
OKX_API_PASSPHRASE=your-okx-passphrase-here
OKX_SIMULATED=true
TRADING_MODE=paper

# -------------------- 服务器配置 --------------------
NODE_ENV=development
PORT=3000
WS_PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000
`;

    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log(`\n✅ 已创建 .env 文件`);
    console.log(`📍 文件路径: ${envPath}`);
    console.log(`\n⚠️  请编辑 .env 文件,设置您的AI和交易所API凭证\n`);
  } else {
    console.log('\n✅ 请手动复制上述密钥到.env文件\n');
  }

  rl.close();
});
