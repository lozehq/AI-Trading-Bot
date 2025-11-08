# OKX 真实交易快速入门

5 分钟快速配置 OKX 真实交易账号。

## 📋 前提条件

- ✅ 已完成 KYC 认证的 OKX 账户
- ✅ 项目已安装并能正常运行
- ✅ 了解加密货币交易基础知识

---

## 🚀 快速配置（5 步）

### 第 1 步：创建 OKX API 密钥

1. 登录 [OKX 官网](https://www.okx.com)
2. 进入 **账户** → **API** 管理页面
3. 点击 **创建 V5 API 密钥**
4. 完成安全验证（邮箱、手机、Google 验证器）

**权限设置**：
- ✅ **读取** - 必选
- ✅ **交易** - 必选
- ❌ **提现** - 不要开启！

**IP 白名单**（强烈推荐）：
```bash
# 查看服务器 IP
curl ifconfig.me
# 将此 IP 添加到白名单
```

**Passphrase**：
- 设置一个强密码（至少 12 位）
- 务必保存好，后续无法查看

5. 保存以下三个凭证：
   - API Key
   - Secret Key（只显示一次！）
   - Passphrase

---

### 第 2 步：配置环境变量

在项目根目录创建 `.env` 文件：

```bash
# 复制示例文件
cp env.example .env

# 编辑配置
nano .env
```

添加 OKX API 配置：

```env
# OKX API 配置
OKX_API_KEY=your_api_key_here
OKX_API_SECRET=your_secret_here
OKX_API_PASSPHRASE=your_passphrase_here

# 交易模式（先用模拟盘测试）
OKX_SIMULATED=true
TRADING_MODE=demo

# 市场类型
DEFAULT_MARKET_TYPE=spot
```

⚠️ **重要**：
- 替换 `your_xxx_here` 为你的真实凭证
- 先使用 `demo` 模式测试 1-2 周
- 确保 `.env` 文件不要提交到 Git

---

### 第 3 步：测试 API 连接

运行测试脚本验证配置：

```bash
# 测试模拟盘
node scripts/test-okx-api.js demo
```

**预期输出**：
```
═══════════════════════════════════════════════════════════
🧪 OKX API 连接测试
═══════════════════════════════════════════════════════════

✅ API 凭证已配置
  API Key: a1b2c3d4...7890
  Secret: ABCD***STUV
  Passphrase: ***

ℹ️  创建 OKX 交易所实例...
ℹ️  已启用模拟盘模式

═══════════════════════════════════════════════════════════
📊 测试 1: 获取账户余额
═══════════════════════════════════════════════════════════

✅ 余额查询成功！

账户余额：
  USDT:
    总计: 10000
    可用: 10000
    冻结: 0

✨ 所有测试通过！
```

**如果测试失败**，请查看错误提示并参考 [常见问题](./OKX_TRADING_SETUP.md#常见问题)。

---

### 第 4 步：启动服务

```bash
# 开发模式
npm run dev

# 或使用 pm2（生产环境）
pm2 restart all
```

服务启动后访问：http://localhost:5173

---

### 第 5 步：在前端切换交易模式

1. 打开浏览器访问 http://localhost:5173
2. 在右上角找到交易模式选择器
3. 点击选择 **「OKX模拟」**（蓝色图标）

现在你可以在模拟环境下测试交易了！

---

## 🧪 模拟盘测试（推荐）

在切换到真实交易前，建议先在模拟盘测试 **1-2 周**：

### 测试清单

- [ ] **余额查询**：查看账户资产
- [ ] **市价单**：测试快速买入/卖出
- [ ] **限价单**：测试指定价格下单
- [ ] **撤单**：测试取消未成交订单
- [ ] **批量操作**：测试批量下单/撤单
- [ ] **止损止盈**：测试风控功能
- [ ] **自动交易**：测试策略自动执行

### 测试建议

1. **从小额开始**：
   - 即使是模拟盘，也建议用小额测试
   - 培养良好的交易习惯

2. **记录交易**：
   - 记录每次交易的原因和结果
   - 分析策略表现

3. **压力测试**：
   - 测试在市场波动时的表现
   - 验证风控参数是否合理

---

## ⚠️ 切换到真实交易

**只有在模拟盘测试充分后**，才应考虑切换到真实交易。

### 步骤 1：修改配置

编辑 `.env` 文件：

```env
# 关闭模拟盘模式
OKX_SIMULATED=false

# 切换到真实交易
TRADING_MODE=live
```

### 步骤 2：重启服务

```bash
pm2 restart all
```

### 步骤 3：测试连接

```bash
# 测试真实交易连接
node scripts/test-okx-api.js live
```

### 步骤 4：前端切换

在前端界面右上角选择 **「真实交易」**（红色图标）

---

## 🛡️ 真实交易安全建议

### 风险控制

在 `.env` 中配置风险参数：

```env
# 最大单笔交易金额（USDT）
MAX_TRADE_AMOUNT=100

# 最大持仓数量
MAX_POSITIONS=3

# 每日最大交易次数
MAX_DAILY_TRADES=10

# 止损百分比（5%）
STOP_LOSS_PERCENTAGE=0.05

# 止盈百分比（10%）
TAKE_PROFIT_PERCENTAGE=0.10
```

### 资金管理

1. **从小额开始**：
   - 建议初始投入不超过总资金的 5-10%
   - 每次交易金额不超过总资金的 1-2%

2. **分散投资**：
   - 不要把所有资金投入单一交易对
   - 分散到 3-5 个不同的交易对

3. **定期提现**：
   - 定期将利润提现到冷钱包
   - 不要让交易所账户存有大量资金

### 监控和告警

1. **实时监控**：
```bash
# 查看实时日志
pm2 logs ai-server

# 查看交易记录
sqlite3 data/trading.db "SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;"
```

2. **设置告警**（可选）：
```env
# 邮件告警
ALERT_EMAIL=your-email@example.com

# Webhook 告警
ALERT_WEBHOOK=https://your-webhook-url
```

---

## 📊 API 使用示例

### 查询余额

```bash
curl "http://localhost:3000/api/okx/trade/balance?mode=live"
```

### 下单

```bash
curl -X POST http://localhost:3000/api/okx/trade/order \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTC/USDT",
    "side": "BUY",
    "type": "LIMIT",
    "amount": 0.001,
    "price": 50000,
    "mode": "live"
  }'
```

### 查询订单

```bash
curl "http://localhost:3000/api/okx/trade/open-orders?symbol=BTC/USDT&mode=live"
```

更多 API 示例请查看 [API 参考文档](./OKX_API_REFERENCE.md)。

---

## 🆘 遇到问题？

### 常见问题速查

| 问题 | 解决方案 |
|------|----------|
| API Key 无效 | 检查 `OKX_API_KEY` 是否正确复制 |
| Passphrase 错误 | 检查 `OKX_API_PASSPHRASE` |
| IP 不在白名单 | 在 OKX 添加服务器 IP |
| 余额不足 | 充值 USDT 到交易账户 |
| 订单被拒绝 | 检查交易数量是否符合最小限制 |

### 查看日志

```bash
# 服务器日志
pm2 logs ai-server --lines 50

# 错误日志
pm2 logs ai-server --err
```

### 获取帮助

- 📖 [完整设置指南](./OKX_TRADING_SETUP.md)
- 📘 [API 参考文档](./OKX_API_REFERENCE.md)
- 🌐 [OKX 官方文档](https://www.okx.com/docs-v5/zh/)
- 💬 提交 Issue 到项目仓库

---

## 📚 相关资源

### 学习资料

- [OKX API 官方教程](https://www.okx.com/docs-v5/zh/#overview)
- [加密货币交易基础](https://www.okx.com/academy)
- [风险管理指南](https://www.okx.com/support/hc/zh-cn/categories/360001513912)

### 工具推荐

- [TradingView](https://www.tradingview.com/) - 技术分析工具
- [CoinGecko](https://www.coingecko.com/) - 行情数据
- [CryptoCompare](https://www.cryptocompare.com/) - 市场分析

---

## ⚖️ 免责声明

- 加密货币交易存在**高风险**，可能导致全部资金损失
- 本系统仅供**学习和研究**使用，不构成投资建议
- 使用本系统进行真实交易所产生的任何损失，**开发者概不负责**
- 请确保你具备足够的交易知识和风险承受能力

---

**祝你交易顺利！** 🚀

记住：
- 📝 先纸上交易学习功能
- 🧪 再模拟盘充分测试
- ⚠️ 最后真实交易从小额开始

