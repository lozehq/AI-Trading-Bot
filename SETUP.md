# 项目设置指南

## 🚀 快速开始

### 1. 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- SQLite3

### 2. 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

### 3. 配置环境变量

#### 3.1 创建根目录 .env 文件

复制 `.env.example` 并重命名为 `.env`，然后填写以下配置：

```bash
cp .env.example .env
```

主要配置项：

```env
# DeepSeek AI配置
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com

# 服务器配置
PORT=3000
NODE_ENV=development

# 数据库配置
DATABASE_PATH=./data/trading.db
```

#### 3.2 创建交易所API配置

复制 `config/ccxt-accounts.example.json` 并重命名为 `config/ccxt-accounts.json`：

```bash
cp config/ccxt-accounts.example.json config/ccxt-accounts.json
```

编辑 `config/ccxt-accounts.json`，填入您的交易所API密钥：

```json
{
  "accounts": {
    "okx_main": {
      "exchange": "okx",
      "apiKey": "YOUR_OKX_API_KEY",
      "secret": "YOUR_OKX_SECRET",
      "password": "YOUR_OKX_PASSWORD",
      "options": {
        "defaultType": "swap"
      }
    }
  }
}
```

⚠️ **安全提示**：
- 不要将 `.env` 和 `ccxt-accounts.json` 提交到版本控制
- 建议使用只读或交易权限受限的API密钥
- 定期轮换API密钥

### 4. 初始化数据库

```bash
# 数据库会自动创建，schema在 server/database/schema.sql
node server/database/init.js
```

### 5. 启动服务

#### 开发模式

```bash
# 启动后端服务器 (端口 3000)
npm run dev

# 新终端窗口：启动前端开发服务器 (端口 5173)
cd client
npm run dev
```

#### 生产模式

```bash
# 构建前端
cd client
npm run build
cd ..

# 启动生产服务器
npm start
```

或使用PM2：

```bash
npm run pm2:start
```

### 6. 访问应用

- 前端界面：http://localhost:5173 (开发模式)
- 后端API：http://localhost:3000
- WebSocket：ws://localhost:3000

## 📁 项目结构

```
.
├── client/              # 前端Vue项目
│   ├── src/
│   │   ├── components/  # Vue组件
│   │   ├── views/       # 页面视图
│   │   ├── stores/      # Pinia状态管理
│   │   └── api/         # API接口
│   └── dist/            # 构建产物（不提交）
├── server/              # 后端Node.js服务
│   ├── routes/          # API路由
│   ├── services/        # 业务逻辑服务
│   ├── database/        # 数据库相关
│   └── utils/           # 工具函数
├── config/              # 配置文件
├── data/                # 数据库文件（不提交）
└── logs/                # 日志文件（不提交）
```

## 🔧 常见问题

### Q: 数据库初始化失败？

A: 确保 `data/` 目录存在且有写入权限：

```bash
mkdir -p data
chmod 755 data
```

### Q: API密钥配置后仍然报错？

A: 检查以下几点：
1. API密钥格式是否正确
2. 是否已在交易所开启API权限
3. IP白名单是否配置正确

### Q: 前端连接不到后端？

A: 检查：
1. 后端服务是否正常启动（端口3000）
2. 前端 `.env.development` 中的 `VITE_API_BASE_URL` 配置
3. CORS配置是否正确

## 📝 开发指南

### 添加新的数据源

1. 在 `server/services/` 创建新服务
2. 在 `server/routes/` 添加对应路由
3. 更新 `server/services/mcpDataFetcher.js` 集成数据源

### 修改AI提示词

编辑 `server/prompts/tradingSystemPrompt.js`

### 自定义技术指标

在 `server/services/technicalAnalysis.js` 添加新指标计算

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## ⚠️ 免责声明

本项目仅供学习和研究使用。加密货币交易存在高风险，使用本系统进行实盘交易所产生的任何损失，开发者不承担任何责任。请谨慎使用，风险自负。
