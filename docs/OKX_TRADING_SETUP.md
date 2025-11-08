# OKX 真实交易账号配置指南

本指南将帮助你配置 OKX 真实交易账号，实现自动化交易功能。

## 📋 目录

1. [前提条件](#前提条件)
2. [创建 OKX API 密钥](#创建-okx-api-密钥)
3. [配置环境变量](#配置环境变量)
4. [测试连接](#测试连接)
5. [切换交易模式](#切换交易模式)
6. [安全建议](#安全建议)
7. [常见问题](#常见问题)

---

## 前提条件

1. ✅ 拥有已完成 KYC 认证的 OKX 账户
2. ✅ 账户中有足够的资金用于交易
3. ✅ 了解加密货币交易的基本知识和风险

⚠️ **风险提示**：真实交易涉及真实资金，请务必谨慎操作！

---

## 创建 OKX API 密钥

### 第一步：登录 OKX 账户

1. 访问 [OKX 官网](https://www.okx.com)
2. 登录你的账户

### 第二步：进入 API 管理页面

1. 点击右上角头像 → **账户** → **API**
2. 或直接访问：https://www.okx.com/account/my-api

### 第三步：创建新的 API 密钥

1. 点击 **创建 V5 API 密钥**
2. 完成安全验证（邮箱验证码、手机验证码、Google 验证器）

### 第四步：配置 API 权限

**重要**：请根据需要选择合适的权限

#### 推荐权限配置

| 权限 | 是否启用 | 说明 |
|------|---------|------|
| **读取** | ✅ 必选 | 查询账户余额、持仓、订单等 |
| **交易** | ✅ 必选 | 下单、撤单等交易操作 |
| **提现** | ❌ 不推荐 | 涉及资金转出，不建议开启 |

#### API 权限说明

- **读取权限**：
  - 查询账户资产
  - 查询订单信息
  - 查询持仓信息
  - 查询交易历史

- **交易权限**：
  - 现货交易
  - 合约交易
  - 下单/撤单
  - 修改订单

⚠️ **安全提示**：
- ❌ 不要开启「提现」权限（除非确实需要）
- ✅ 建议开启 IP 白名单限制
- ✅ 设置复杂的 Passphrase 密码

### 第五步：配置 IP 白名单（强烈推荐）

1. 在 API 创建页面，选择 **指定 IP 地址**
2. 添加你的服务器 IP 地址

```bash
# 查看服务器公网 IP
curl ifconfig.me
```

3. 如果使用多台服务器，可以添加多个 IP

### 第六步：设置 Passphrase

1. 输入一个**强密码**作为 API Passphrase
2. **务必保存好这个密码**，后续无法查看！

推荐密码格式：
```
大写字母 + 小写字母 + 数字 + 特殊符号
至少 12 位，例如：MyP@ssw0rd2024!
```

### 第七步：保存 API 凭证

创建成功后，你会获得以下三个凭证：

```
API Key:        a1b2c3d4-e5f6-7890-abcd-ef1234567890
Secret Key:     ABCDEF1234567890GHIJKLMNOPQRSTUV
Passphrase:     MyP@ssw0rd2024!
```

⚠️ **重要**：
- Secret Key 只会显示一次，请立即保存！
- 如果忘记 Secret Key，需要删除后重新创建 API
- 妥善保管这三个凭证，不要泄露给任何人

---

## 配置环境变量

### 方法一：创建 .env 文件（推荐）

1. 在项目根目录创建 `.env` 文件：

```bash
cd /path/to/your/project
nano .env
```

2. 添加以下配置：

```env
# OKX API 配置
OKX_API_KEY=a1b2c3d4-e5f6-7890-abcd-ef1234567890
OKX_API_SECRET=ABCDEF1234567890GHIJKLMNOPQRSTUV
OKX_API_PASSPHRASE=MyP@ssw0rd2024!

# 交易模式（先用模拟盘测试）
OKX_SIMULATED=true
TRADING_MODE=demo

# 市场类型（spot=现货，swap=合约）
DEFAULT_MARKET_TYPE=spot
```

3. 保存并退出（Ctrl+O, Enter, Ctrl+X）

### 方法二：直接设置环境变量

```bash
# Linux/Mac
export OKX_API_KEY="your_api_key"
export OKX_API_SECRET="your_secret"
export OKX_API_PASSPHRASE="your_passphrase"
export OKX_SIMULATED=true
export TRADING_MODE=demo

# Windows PowerShell
$env:OKX_API_KEY="your_api_key"
$env:OKX_API_SECRET="your_secret"
$env:OKX_API_PASSPHRASE="your_passphrase"
$env:OKX_SIMULATED="true"
$env:TRADING_MODE="demo"
```

---

## 测试连接

### 1. 启动服务器

```bash
# 如果使用 pm2
pm2 restart all

# 如果直接运行
npm run dev
```

### 2. 测试 API 连接

#### 方法一：使用前端界面

1. 打开浏览器访问 `http://localhost:5173`
2. 在右上角找到交易模式选择器
3. 选择 **「OKX模拟」** 或 **「真实交易」**
4. 点击 **「交易总览」** 查看余额

#### 方法二：使用 API 测试

```bash
# 测试余额查询
curl -X GET "http://localhost:3000/api/okx/trade/balance?mode=demo"

# 预期返回（模拟盘）
{
  "success": true,
  "data": {
    "total": {
      "USDT": 10000,
      "BTC": 0.5
    },
    "free": {
      "USDT": 10000,
      "BTC": 0.5
    },
    "used": {}
  }
}
```

#### 方法三：使用内置测试脚本

创建测试脚本 `test-okx.js`：

```javascript
const axios = require('axios');

async function testOKX() {
  try {
    console.log('🧪 测试 OKX API 连接...\n');

    // 1. 测试余额查询
    console.log('1️⃣ 测试余额查询...');
    const balance = await axios.get('http://localhost:3000/api/okx/trade/balance', {
      params: { mode: 'demo' }
    });
    console.log('✅ 余额查询成功:', JSON.stringify(balance.data, null, 2));

    // 2. 测试未成交订单查询
    console.log('\n2️⃣ 测试未成交订单查询...');
    const openOrders = await axios.get('http://localhost:3000/api/okx/trade/open-orders', {
      params: { symbol: 'BTC/USDT', mode: 'demo' }
    });
    console.log('✅ 订单查询成功:', JSON.stringify(openOrders.data, null, 2));

    console.log('\n✅ 所有测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    process.exit(1);
  }
}

testOKX();
```

运行测试：

```bash
node test-okx.js
```

---

## 切换交易模式

本系统支持三种交易模式：

### 1️⃣ 纸上交易（Paper Trading）

- **说明**：完全模拟交易，不调用真实 API
- **用途**：学习系统功能、测试策略逻辑
- **风险**：无风险
- **配置**：

```env
TRADING_MODE=paper
```

**前端切换**：选择「纸上交易」模式

### 2️⃣ 模拟盘交易（Demo Trading）

- **说明**：使用 OKX 模拟盘 API
- **用途**：在真实市场环境下测试，但使用虚拟资金
- **风险**：无风险（虚拟资金）
- **配置**：

```env
OKX_SIMULATED=true
TRADING_MODE=demo
```

**前端切换**：选择「OKX模拟」模式

### 3️⃣ 真实交易（Live Trading）

- **说明**：使用真实资金进行交易
- **用途**：正式交易
- **风险**：⚠️ 高风险！可能导致资金损失
- **配置**：

```env
OKX_SIMULATED=false
TRADING_MODE=live
```

**前端切换**：选择「真实交易」模式

⚠️ **重要提示**：
1. ✅ **强烈建议**先使用「模拟盘」测试 1-2 周
2. ✅ 确保策略稳定盈利后再切换到「真实交易」
3. ✅ 真实交易前，务必设置止损止盈参数
4. ✅ 建议从小额资金开始

---

## 安全建议

### 🔐 API 密钥安全

1. **不要提交到 Git**

```bash
# 确保 .env 在 .gitignore 中
echo ".env" >> .gitignore
```

2. **定期轮换 API 密钥**

- 建议每 1-3 个月更换一次
- 如果发现异常立即更换

3. **使用环境变量**

- ❌ 不要在代码中硬编码 API 密钥
- ✅ 使用环境变量或密钥管理服务

4. **启用 IP 白名单**

- 只允许服务器 IP 访问
- 避免 API 被盗用

### 🛡️ 交易安全

1. **设置风险控制参数**

```env
# 最大单笔交易金额（USDT）
MAX_TRADE_AMOUNT=1000

# 最大持仓数量
MAX_POSITIONS=5

# 每日最大交易次数
MAX_DAILY_TRADES=20

# 止损百分比
STOP_LOSS_PERCENTAGE=0.05

# 止盈百分比
TAKE_PROFIT_PERCENTAGE=0.10
```

2. **监控交易活动**

```bash
# 实时查看日志
pm2 logs ai-server --lines 100

# 查看交易记录
sqlite3 data/trading.db "SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;"
```

3. **设置告警通知**

```env
# 邮件告警
ALERT_EMAIL=your-email@example.com

# Webhook 告警（如 Telegram Bot）
ALERT_WEBHOOK=https://api.telegram.org/bot<token>/sendMessage
```

### 💾 数据备份

1. **定期备份数据库**

```bash
# 创建备份脚本
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp data/trading.db "backups/trading_${DATE}.db"
echo "✅ 备份完成: trading_${DATE}.db"
EOF

chmod +x backup.sh

# 添加到 crontab（每天凌晨 2 点备份）
crontab -e
# 添加：0 2 * * * /path/to/backup.sh
```

2. **备份配置文件**

```bash
# 备份环境变量
cp .env .env.backup

# 备份 API 配置
cp config/ccxt-accounts.json config/ccxt-accounts.backup.json
```

---

## 常见问题

### ❓ Q1: API 密钥配置后无法连接？

**A**: 检查以下几点：

1. **验证凭证是否正确**

```bash
# 检查环境变量
echo $OKX_API_KEY
echo $OKX_API_SECRET
echo $OKX_API_PASSPHRASE
```

2. **检查 IP 白名单**

- 确保服务器 IP 在 OKX API 白名单中
- 获取服务器 IP：`curl ifconfig.me`

3. **查看错误日志**

```bash
pm2 logs ai-server --err --lines 50
```

4. **常见错误码**

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 50103 | Passphrase 错误 | 检查 OKX_API_PASSPHRASE 是否正确 |
| 50111 | API Key 无效 | 检查 OKX_API_KEY 是否正确 |
| 50113 | IP 不在白名单 | 添加服务器 IP 到白名单 |
| 50114 | API 权限不足 | 在 OKX 开启「交易」权限 |

### ❓ Q2: 如何切换现货和合约交易？

**A**: 修改 `DEFAULT_MARKET_TYPE` 环境变量：

```env
# 现货交易
DEFAULT_MARKET_TYPE=spot

# 合约交易（永续合约）
DEFAULT_MARKET_TYPE=swap

# 交割合约
DEFAULT_MARKET_TYPE=futures
```

重启服务：

```bash
pm2 restart ai-server
```

### ❓ Q3: 模拟盘和真实账户数据不一致？

**A**: 这是正常现象：

- **模拟盘**：使用虚拟资金，订单不会进入真实市场
- **真实账户**：使用真实资金，订单会在市场成交

两者数据相互独立，互不影响。

### ❓ Q4: 如何查看交易历史？

**A**: 有多种方式：

1. **前端界面**

- 打开浏览器访问 http://localhost:5173
- 点击「交易总览」→「历史订单」

2. **API 查询**

```bash
# 查询已完成订单
curl "http://localhost:3000/api/okx/trade/closed-orders?symbol=BTC/USDT&limit=10&mode=live"
```

3. **数据库查询**

```bash
sqlite3 data/trading.db "SELECT * FROM trades WHERE status='FILLED' ORDER BY created_at DESC LIMIT 20;"
```

### ❓ Q5: 如何设置止损止盈？

**A**: 在 `.env` 文件中配置：

```env
# 止损：价格下跌 5% 时自动卖出
STOP_LOSS_PERCENTAGE=0.05

# 止盈：价格上涨 10% 时自动卖出
TAKE_PROFIT_PERCENTAGE=0.10
```

或者在下单时指定：

```javascript
// 使用 API 下单
const response = await axios.post('http://localhost:3000/api/okx/trade/order', {
  symbol: 'BTC/USDT',
  side: 'BUY',
  type: 'LIMIT',
  amount: 0.001,
  price: 50000,
  mode: 'live',
  params: {
    stopLoss: 47500,     // 止损价
    takeProfit: 55000    // 止盈价
  }
});
```

### ❓ Q6: 如何处理订单被拒绝的情况？

**A**: 常见原因和解决方案：

| 原因 | 解决方案 |
|------|----------|
| 余额不足 | 充值或减少交易数量 |
| 数量低于最小限制 | 增加交易数量 |
| 价格不在允许范围 | 检查价格是否偏离市价过多 |
| API 权限不足 | 在 OKX 开启「交易」权限 |
| 市场暂停交易 | 等待市场恢复或选择其他交易对 |

查看详细错误：

```bash
pm2 logs ai-server --err
```

### ❓ Q7: 如何启用自动交易？

**A**: 

1. **在前端界面启用**

- 点击右上角「自动交易 OFF」→ 变为「自动交易 ON」

2. **配置交易策略**

- 进入「AI增强」→「策略配置」
- 选择或自定义交易策略

3. **设置风险参数**

```env
MAX_TRADE_AMOUNT=1000
MAX_POSITIONS=5
MAX_DAILY_TRADES=20
```

⚠️ **注意**：
- 自动交易前务必充分测试策略
- 建议设置保守的风险参数
- 定期检查交易表现

---

## 📞 获取帮助

如果遇到问题，请提供以下信息：

1. **错误日志**

```bash
pm2 logs ai-server --err --lines 50 > error.log
```

2. **配置信息**（隐藏敏感信息）

```bash
# 检查环境变量（部分）
echo "OKX_API_KEY: ${OKX_API_KEY:0:8}..."
echo "TRADING_MODE: $TRADING_MODE"
echo "DEFAULT_MARKET_TYPE: $DEFAULT_MARKET_TYPE"
```

3. **系统信息**

```bash
node --version
npm --version
lsb_release -a  # Linux
```

---

## 📚 参考资料

- [OKX API 官方文档](https://www.okx.com/docs-v5/zh/)
- [CCXT 文档](https://docs.ccxt.com/)
- [项目完整文档](../README.md)

---

## ⚖️ 免责声明

本系统仅供学习和研究使用，不构成投资建议。加密货币交易存在高风险，可能导致部分或全部资金损失。使用本系统进行真实交易前，请确保：

1. ✅ 充分了解加密货币市场风险
2. ✅ 具备足够的交易知识和经验
3. ✅ 只投入可承受损失的资金
4. ✅ 已充分测试交易策略

**使用本系统所产生的任何损失，开发者概不负责。**

---

**开始你的 OKX 自动化交易之旅！** 🚀

如有问题，请提交 Issue 或联系技术支持。

