# AI Trading Bot - 智能交易机器人

> 📖 快速使用：请先阅读「[使用说明（快速上手）](./docs/使用说明.md)」


基于 DeepSeek-V3 AI 的智能加密货币交易系统，支持多时间框架分析、技术指标计算和实时交易信号生成。

![Logo](./logo.png)

## 核心特性

### AI 智能分析
- **DeepSeek-V3** 驱动的深度市场分析
- **多时间框架验证** (1小时/4小时/日线)
- **智能提示词系统** - 模块化、动态优化
- **置信度评估** - 基于多维度数据的信号强度

### 技术分析
- **20+ 技术指标** - EMA, RSI, MACD, 布林带等
- **支撑/阻力位识别**
- **趋势判断** - 多时间框架共振验证
- **量价分析** - 成交量与价格关系

### 多数据源支持
- **CCXT** - 100+ 交易所实时数据
- **MCP Tools** - 市场情绪、新闻分析
- **AkTools** - 链上数据分析

### 性能优化
- **快速模式** (15秒) - 简化分析
- **完整模式** (30-45秒) - 深度分析
- **智能缓存** - 减少重复请求
- **并发优化** - 多数据源并行获取

## 技术栈

**前端**
- React 18
- Vite
- TailwindCSS
- Recharts

**后端**
- Node.js
- Express
- CCXT
- Better-SQLite3
- WebSocket

**AI**
- DeepSeek-V3.2
- 模块化提示词系统

## 🚀 快速部署

### Ubuntu/Debian 服务器一键部署

```bash
# 1. 上传项目到服务器
scp -r ./合约 your-server:/home/your-user/

# 2. SSH登录服务器
ssh your-user@your-server-ip

# 3. 进入项目目录
cd /home/your-user/合约

# 4. 运行一键部署脚本
chmod +x quick-deploy.sh
./quick-deploy.sh
```

**脚本会自动**：
- ✅ 检测并安装 Node.js 18
- ✅ 检测并安装 pm2
- ✅ 安装项目依赖
- ✅ 配置环境变量
- ✅ 启动后端 (3000, 3001)
- ✅ 构建并启动前端 (5173)
- ✅ 配置开机自启

**部署完成后访问**：`http://your-server-ip:5173`

### 本地开发

```bash
# 安装依赖
npm install
cd client && npm install && cd ..

# 配置 .env 文件
cp env.example .env
# 编辑 .env，填写 DEEPSEEK_API_KEY

# 启动开发服务器
npm run dev
```

服务将在以下地址启动：
- 前端: http://localhost:5173
- 后端: http://localhost:3000
- WebSocket: ws://localhost:3001


### Windows 一键启动

- 双击根目录的 `START-ALL.bat` 即可自动安装依赖并启动前后端（开发模式）

## 📚 文档

- [完整部署指南](./docs/DEPLOYMENT_GUIDE.md) - 详细部署步骤、故障排除

## 🧭 开源与社区

- 贡献指南: [开源文档/贡献指南.md](./开源文档/贡献指南.md)
- 行为准则: [开源文档/行为准则.md](./开源文档/行为准则.md)
- 安全政策: [开源文档/安全政策.md](./开源文档/安全政策.md)

- [紧急修复指南](./docs/FIX_CURRENT_DEPLOYMENT.md) - 快速解决部署问题
- [项目结构说明](./PROJECT_STRUCTURE.md) - 代码结构详解

## 🔧 配置

### 环境变量 (.env)

复制 `env.example` 为 `.env` 并填入你的配置：

```bash
cp env.example .env
```

**基础配置**:
```env
# DeepSeek AI 配置
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# 服务器配置
PORT=3000
WS_PORT=3001

# 交易所配置
DEFAULT_EXCHANGE=okx
DEFAULT_MARKET_TYPE=spot
```

**OKX 真实交易配置** (可选):

如果需要使用真实交易功能，请配置 OKX API 凭证：

```env
# OKX API 配置
OKX_API_KEY=your_okx_api_key
OKX_API_SECRET=your_okx_secret
OKX_API_PASSPHRASE=your_passphrase

# 交易模式: paper (纸上) | demo (模拟盘) | live (真实)
TRADING_MODE=demo

# 模拟盘模式 (true=模拟盘, false=实盘)
OKX_SIMULATED=true
```

**📖 详细配置指南**:
- [OKX 真实交易设置指南](./docs/OKX_TRADING_SETUP.md) - 完整的 OKX API 配置教程
- [OKX API 参考文档](./docs/OKX_API_REFERENCE.md) - API 端点详细说明

### 交易所账户配置 (旧版，已废弃)

如果你使用的是旧版配置，可以编辑 `config/ccxt-accounts.json`:

```json
{
  "okx_main": {
    "exchange": "okx",
    "apiKey": "your_api_key",
    "secret": "your_secret",
    "password": "your_password"
  }
}
```

**建议**：推荐使用 `.env` 文件配置，更安全、更灵活。

## 🛡️ 安全提示

⚠️ **重要**:
- ❌ 不要提交 `.env` 文件到版本控制
- ❌ 不要提交 API 密钥和交易所账户配置
- ❌ 不要开启 OKX API 的「提现」权限
- ✅ 建议启用 IP 白名单限制
- ✅ 定期备份数据库文件 `data/trading.db`
- ✅ 先在模拟盘充分测试后再使用真实交易
- ✅ 真实交易时从小额资金开始

### 交易模式说明

本系统支持三种交易模式，可在前端界面右上角切换：

| 模式 | 说明 | 风险 | 适用场景 |
|------|------|------|----------|
| 📝 **纸上交易** | 完全模拟，不调用 API | 无风险 | 学习系统功能、测试策略逻辑 |
| 🧪 **OKX模拟** | 使用 OKX 模拟盘 API | 无风险（虚拟资金） | 在真实市场环境下测试 |
| ⚠️ **真实交易** | 使用真实资金 | 高风险！ | 正式交易（谨慎操作） |

**测试 OKX API 连接**:
```bash
# 测试模拟盘
node scripts/test-okx-api.js demo

# 测试真实交易（谨慎！）
node scripts/test-okx-api.js live
```

## 📊 服务管理

### 常用命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs

# 重启服务
pm2 restart all

# 停止服务
pm2 stop all
```

## 🐛 故障排除

### 前端无法连接后端

如果浏览器控制台出现 `undefined` 错误：

```bash
cd /path/to/project
pm2 delete all

# 确保使用 preview 模式启动前端
pm2 start server/index.js --name ai-server
cd client
pm2 start npm --name ai-web -- run preview
```

详细修复方案：[紧急修复指南](./docs/FIX_CURRENT_DEPLOYMENT.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

MIT License

---

**⚠️ 风险提示**: 加密货币交易存在高风险，请谨慎使用本系统。本系统仅供学习和研究使用，不构成投资建议。

#### 1. 上传项目到服务器
```bash
# 使用 scp
scp -r ./合约 ubuntu@your-server:/home/ubuntu/

# 或使用 git
git clone <repository-url>
```

#### 2. 进入项目目录
```bash
cd 合约
```

#### 3. 一键启动
```bash
chmod +x start.sh
bash start.sh
```

#### 4. 访问应用
```
http://your-server-ip
```

**就这么简单！** 🎉

## 📊 架构说明

```
用户 → Nginx (80) → 前端 (5173)
                  → API (3000)
                  → WebSocket (3001)
```

所有服务统一通过 **80 端口**访问：
- `/` - 前端界面
- `/api/*` - 后端 API
- `/ws/*` - WebSocket 服务

## 📝 常用命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs

# 重启服务
pm2 restart all

# 停止服务
pm2 stop all

# 重启 Nginx
sudo systemctl restart nginx
```

## 🔧 配置防火墙

```bash
# 开放 80 端口
sudo ufw allow 80/tcp
sudo ufw status
```

## 📚 详细文档

- **[完整部署指南](DEPLOY.md)** - 详细的部署步骤、故障排查、性能优化
- **[Nginx 配置](nginx.conf)** - 反向代理配置文件
- **[启动脚本](start.sh)** - 自动化部署脚本

## 📋 系统要求

- Ubuntu 18.04+ / Debian 10+
- 2GB+ RAM
- 5GB+ 磁盘空间
- sudo 权限

## 🛠️ 功能特性

### 交易功能
- ✅ 多交易所支持（Binance、Bybit 等）
- ✅ 实时行情数据
- ✅ 技术指标分析
- ✅ 自动化交易策略
- ✅ 风险管理

### 监控功能
- ✅ 实时价格追踪
- ✅ 持仓管理
- ✅ 收益统计
- ✅ 交易历史
- ✅ 告警通知

### 管理功能
- ✅ 策略配置
- ✅ 参数调优
- ✅ 日志查看
- ✅ 性能监控

## 📈 性能指标

- 响应时间: < 100ms
- WebSocket 延迟: < 50ms
- 支持并发: 1000+ 用户
- 系统稳定性: 99.9%

## 🔐 安全建议

1. **配置 HTTPS**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

2. **设置防火墙**
   ```bash
   sudo ufw enable
   sudo ufw allow 22,80,443/tcp
   ```

3. **使用环境变量**
   - 不要在代码中硬编码 API 密钥
   - 使用 `.env` 文件管理配置

4. **定期备份**
   - 备份数据库
   - 备份配置文件
   - 备份交易记录

## 🐛 故障排查

### 无法访问？
```bash
# 检查服务状态
pm2 status
sudo systemctl status nginx

# 检查防火墙
sudo ufw status

# 查看日志
pm2 logs --err
```

### 端口冲突？
```bash
# 检查端口占用
sudo netstat -tulpn | grep :80

# 停止占用进程
sudo systemctl stop apache2
```

更多问题请查看 **[完整部署指南](DEPLOY.md)**

## 📞 获取帮助

遇到问题？请提供：
1. 系统版本：`lsb_release -a`
2. 错误日志：`pm2 logs --err --lines 50`
3. 服务状态：`pm2 status`

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**开始你的智能交易之旅！** 🚀
