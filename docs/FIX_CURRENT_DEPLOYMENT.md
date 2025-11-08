# 🔧 修复已部署项目的前端错误

## 您的当前情况

✅ 项目已上传到Ubuntu服务器并解压
✅ 已运行启动指令
❌ 前端报错：`TypeError: Cannot read properties of undefined (reading 'length')`

---

## 🚀 快速修复步骤（5分钟）

### 步骤1: 停止当前服务

SSH登录到您的Ubuntu服务器：

```bash
# 查看当前运行的进程
pm2 status

# 停止所有进程
pm2 delete all
```

---

### 步骤2: 更新项目文件

需要更新以下3个关键文件：

#### 文件1: `client/vite.config.js`

```bash
cd /path/to/your/project/client
nano vite.config.js
```

**完整替换为**：

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'charts': ['recharts']
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  }
});
```

按 `Ctrl+X`，然后 `Y`，然后 `Enter` 保存。

---

#### 文件2: `client/package.json`

```bash
nano package.json
```

确保 `scripts` 部分包含 `preview` 命令：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

如果没有 `preview`，手动添加。保存退出。

---

#### 文件3: `.env` (根目录)

```bash
cd /path/to/your/project
nano .env
```

确保有以下配置（替换成您的真实API Key）：

```env
# DeepSeek AI 配置
DEEPSEEK_API_KEY=your_actual_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# 服务器配置
PORT=3000
WS_PORT=3001

# 交易所配置
EXCHANGE_NAME=binance
```

保存退出。

---

### 步骤3: 重新构建前端

```bash
cd /path/to/your/project/client

# 重新构建
npm run build
```

如果看到 `dist` 目录生成成功，继续下一步。

---

### 步骤4: 启动后端

```bash
cd /path/to/your/project

# 启动后端 (端口 3000, 3001)
pm2 start server/index.js --name ai-server
```

验证：

```bash
pm2 logs ai-server --lines 20
```

应该看到：
```
Server running on port 3000
WebSocket server running on port 3001
```

---

### 步骤5: 启动前端（关键！）

**旧方式（错误）**：
```bash
# ❌ 不要这样做
pm2 serve client/dist 5173
```

**新方式（正确）**：
```bash
cd /path/to/your/project/client

# ✅ 使用 preview 模式启动（内置proxy）
pm2 start npm --name ai-web -- run preview

# 或者使用这个更详细的命令
pm2 start npm --name ai-web -- run preview -- --host 0.0.0.0 --port 5173
```

---

### 步骤6: 验证部署

```bash
# 查看进程状态
pm2 status

# 应该看到：
# │ ai-server │ online │
# │ ai-web    │ online │

# 查看前端日志
pm2 logs ai-web --lines 20

# 应该看到类似：
# preview mode server started at http://0.0.0.0:5173
```

---

### 步骤7: 测试访问

打开浏览器访问：

```
http://your-server-ip:5173
```

**按F12打开控制台，应该看到**：

✅ **成功状态**：
```
[API] GET /api/mcp/tools
Status: 200 OK
```

❌ **失败状态（修复前）**：
```
TypeError: Cannot read properties of undefined (reading 'length')
404 Not Found
```

---

### 步骤8: 保存配置

```bash
# 保存pm2配置
pm2 save

# 设置开机自启（可选）
pm2 startup
# 复制输出的命令并执行
```

---

## 🔍 问题根源解释

### 为什么会报错？

**旧的启动方式**：
```bash
pm2 serve client/dist 5173
```

这个命令相当于：
```
简单HTTP服务器监听5173端口
只能访问 dist 目录下的静态文件
没有 proxy 功能
```

当前端代码请求 `/api/xxx` 时：
```
浏览器 → http://server:5173/api/xxx
→ pm2 serve 查找 dist/api/xxx 文件
→ ❌ 文件不存在
→ 返回 404 或 undefined
→ 前端代码调用 .length
→ TypeError
```

---

### 为什么新方式能解决？

**新的启动方式**：
```bash
pm2 start npm -- run preview
```

这个命令运行的是 `vite preview`，它会：
```
1. 启动 Vite 的预览服务器
2. 读取 vite.config.js 中的 preview.proxy 配置
3. 将 /api/* 请求转发到 http://localhost:3000
4. 将 /ws 请求转发到 ws://localhost:3001
```

现在的流程：
```
浏览器 → http://server:5173/api/xxx
→ Vite preview proxy 拦截
→ 转发到 http://localhost:3000/api/xxx
→ ✅ 后端返回数据
→ 前端正常显示
```

---

## 📊 对比表

| 项目 | 旧方式 (pm2 serve) | 新方式 (npm run preview) |
|------|-------------------|------------------------|
| **命令** | `pm2 serve dist 5173` | `pm2 start npm -- run preview` |
| **服务器** | 简单HTTP服务器 | Vite预览服务器 |
| **Proxy** | ❌ 不支持 | ✅ 支持 |
| **API转发** | ❌ 无法转发 | ✅ 自动转发到3000 |
| **WS转发** | ❌ 无法转发 | ✅ 自动转发到3001 |
| **结果** | ❌ undefined错误 | ✅ 正常工作 |

---

## 🆘 常见问题

### Q1: preview 命令找不到？

```bash
cd /path/to/your/project/client

# 检查package.json
cat package.json | grep preview

# 如果没有，手动添加
nano package.json

# 在 scripts 中添加：
"preview": "vite preview"
```

### Q2: npm run preview 报错？

```bash
# 检查vite是否安装
npm list vite

# 如果没有，安装
npm install --save-dev vite

# 然后重新运行
npm run preview
```

### Q3: 端口已被占用？

```bash
# 查找占用5173的进程
sudo lsof -i :5173

# 杀死进程
sudo kill -9 <PID>

# 或者修改端口
pm2 start npm --name ai-web -- run preview -- --port 8080
```

### Q4: 访问白屏/404？

```bash
# 检查dist目录是否存在
ls -la client/dist

# 如果不存在，重新构建
cd client
npm run build

# 然后重启
pm2 restart ai-web
```

### Q5: 仍然报undefined？

```bash
# 完全重置
cd /path/to/your/project

# 1. 停止所有
pm2 delete all

# 2. 清理构建
rm -rf client/dist

# 3. 重新构建
cd client
npm run build

# 4. 确认vite.config.js有preview配置
cat vite.config.js | grep -A 10 "preview:"

# 5. 重新启动
cd ..
pm2 start server/index.js --name ai-server
cd client
pm2 start npm --name ai-web -- run preview
```

---

## ✅ 成功标志

修复成功后，您应该看到：

1. **进程状态**：
```bash
pm2 status
# ai-server: online
# ai-web: online
```

2. **浏览器访问**：
```
http://your-ip:5173
界面正常显示
左上角显示 "已连接"
```

3. **控制台（F12）**：
```javascript
// 没有 undefined 错误
// API请求正常
[API] GET /api/mcp/tools
Status: 200 OK
```

4. **数据显示**：
```
价格、图表、交易数据正常显示
WebSocket实时更新
```

---

## 🎯 核心命令总结

**必须记住的修复命令**：

```bash
# 1. 停止旧服务
pm2 delete all

# 2. 启动后端
cd /path/to/your/project
pm2 start server/index.js --name ai-server

# 3. 启动前端（关键！使用preview）
cd client
pm2 start npm --name ai-web -- run preview

# 4. 保存
pm2 save
```

---

**就这么简单！** 🎉

按照这个步骤操作，5分钟内就能修复您的问题。

有任何问题随时问我！
