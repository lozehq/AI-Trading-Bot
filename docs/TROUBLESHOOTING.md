# 常见问题排查

## 前端报 500 错误但后端正常

### 症状
- 浏览器控制台大量 `500 Internal Server Error`
- 直接 curl 后端接口返回 200 正常
- WebSocket 初始连接失败后又成功

### 原因
1. 前端页面加载时后端服务还未完全启动
2. 浏览器缓存了初始的错误响应
3. React StrictMode 导致组件双重挂载，发送重复请求

### 解决方法

#### 方法1：刷新页面（最简单）
```bash
# 确保后端已启动
curl http://localhost:3000/health

# 如果返回 {"status":"ok",...} 则后端正常
# 此时刷新浏览器页面（Ctrl+F5 或 Cmd+Shift+R）
```

#### 方法2：正确的启动顺序
```bash
# 1. 先启动后端
cd D:\AIGC-dm\合约
npm run dev   # 或 node server/index.js

# 2. 等待后端启动完成（看到 "✅ 数据库初始化成功"）

# 3. 再启动前端（如果已启动则刷新页面）
cd client
npm run dev
```

#### 方法3：清除浏览器缓存
- Chrome/Edge: `Ctrl+Shift+Delete` → 清除缓存
- 或在 DevTools 中右键刷新按钮 → 选择"清空缓存并硬性重新加载"

#### 方法4：禁用 React StrictMode（开发环境）
编辑 `client/src/main.jsx`：
```javascript
// 临时移除 <React.StrictMode>
root.render(
  // <React.StrictMode>   // 注释掉
    <App />
  // </React.StrictMode>
);
```

### 验证修复
打开 DevTools Network 标签，刷新页面：
- ✅ `/api/market/ticker` 返回 200
- ✅ `/api/ai/history` 返回 200  
- ✅ WebSocket 显示 "✅ WebSocket连接成功"

---

## 后端启动失败

### 症状
```bash
curl http://localhost:3000/health
# curl: (7) Failed to connect
```

### 检查清单
1. **检查端口占用**
   ```bash
   netstat -ano | findstr :3000
   # 如果有输出，说明端口被占用
   ```

2. **查看后端日志**
   ```bash
   # 启动后端并查看输出
   node server/index.js
   ```

3. **检查数据库**
   ```bash
   # 确保 data/trading.db 可访问
   dir data\trading.db
   ```

4. **检查依赖**
   ```bash
   npm install
   ```

---

## WebSocket 连接失败

### 症状
```
WebSocket connection to 'ws://localhost:3001/' failed
```

### 解决方法
1. 确认后端 WebSocket 服务已启动（端口 3001）
2. 检查防火墙是否阻止 3001 端口
3. 查看后端日志是否有 WebSocket 启动信息：
   ```
   🔌 WebSocket服务器运行在 ws://localhost:3001
   ```

---

## 数据源切换问题

### 如何切换数据源
```bash
# 方法1：通过前端 UI
# 打开设置 → 数据源管理 → 选择 CCXT 或 MCP

# 方法2：通过 API
curl -X POST http://localhost:3000/api/data-source/switch \
  -H "Content-Type: application/json" \
  -d '{"source":"ccxt"}'
```

### 当前数据源查询
```bash
curl http://localhost:3000/api/data-source/status
```

---

## MCP 工具问题

### MCP 工具启动失败
1. 检查 Python/Node.js 环境
2. 查看 `data/trading.db` 中的 `mcp_configs` 表
3. 查看 MCP 日志：
   ```bash
   curl http://localhost:3000/api/mcp-control/logs
   ```

### 切换到 CCXT 作为临时方案
```bash
# MCP 有问题时，切换到更稳定的 CCXT
curl -X POST http://localhost:3000/api/data-source/switch \
  -H "Content-Type: application/json" \
  -d '{"source":"ccxt"}'
```

---

## 性能问题

### AI 分析很慢
1. 检查网络连接（DeepSeek API）
2. 查看 MCP 工具状态
3. 考虑使用缓存的分析结果

### 价格更新延迟
1. 检查 WebSocket 连接状态
2. 降低订阅的交易对数量
3. 检查后端 CPU 使用率

---

## 联系支持

如果以上方法都无法解决问题：

1. **收集日志**
   - 浏览器 DevTools Console 截图
   - 后端控制台输出
   - `data/trading.db` 备份

2. **提交 Issue**
   - 描述问题症状
   - 附上日志和截图
   - 说明操作系统和 Node.js 版本

---

*最后更新：2025-10-25*

