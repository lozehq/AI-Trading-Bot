# 🌐 代理配置指南

**适用场景**: 国内用户访问国际交易所API（Binance, OKX, Bybit等）

---

## 📋 目录

1. [为什么需要代理](#为什么需要代理)
2. [支持的代理类型](#支持的代理类型)
3. [配置方法](#配置方法)
4. [常用代理软件配置](#常用代理软件配置)
5. [API使用](#api使用)
6. [故障排查](#故障排查)

---

## 🤔 为什么需要代理

### 问题
- Binance、OKX等国际交易所API在国内被墙
- 直接访问会出现超时、连接失败等错误
- 影响市场数据获取、技术指标计算等功能

### 解决方案
- 使用本地代理软件（Clash、V2Ray、Shadowsocks等）
- 配置项目通过代理访问交易所API
- 无需VPN，只需本地代理即可

---

## 🔧 支持的代理类型

### 1. HTTP/HTTPS代理
```
http://127.0.0.1:7890
https://127.0.0.1:7890
```

### 2. SOCKS5代理
```
socks5://127.0.0.1:1080
socks://127.0.0.1:1080
```

### 3. 带认证的代理
```
http://username:password@proxy.example.com:8080
socks5://username:password@127.0.0.1:1080
```

---

## ⚙️ 配置方法

### 方法1: 环境变量配置（推荐）

**编辑 `.env` 文件**:
```bash
# 取消注释并修改为你的代理地址
PROXY_URL=http://127.0.0.1:7890
```

**重启服务器**:
```bash
npm run dev
```

**验证**:
```
✅ 已启用HTTP/HTTPS代理: http://127.0.0.1:7890
🔌 [BINANCE] 使用代理连接
```

---

### 方法2: API动态配置

**启用代理**:
```bash
curl -X POST http://localhost:3000/api/proxy/enable \
  -H "Content-Type: application/json" \
  -d '{"proxyUrl":"http://127.0.0.1:7890"}'
```

**测试代理**:
```bash
curl http://localhost:3000/api/proxy/test
```

**查看状态**:
```bash
curl http://localhost:3000/api/proxy/status
```

**禁用代理**:
```bash
curl -X POST http://localhost:3000/api/proxy/disable
```

---

## 🛠️ 常用代理软件配置

### 1. Clash for Windows

**默认配置**:
- HTTP端口: `7890`
- SOCKS5端口: `7891`

**配置步骤**:
1. 启动Clash for Windows
2. 确保"系统代理"已开启
3. 在`.env`中配置:
   ```bash
   PROXY_URL=http://127.0.0.1:7890
   ```

**验证**:
```bash
# 测试HTTP代理
curl -x http://127.0.0.1:7890 https://api.binance.com/api/v3/ping

# 应该返回: {}
```

---

### 2. V2RayN

**默认配置**:
- HTTP端口: `10809`
- SOCKS5端口: `10808`

**配置步骤**:
1. 启动V2RayN
2. 右键托盘图标 → 启用系统代理
3. 在`.env`中配置:
   ```bash
   PROXY_URL=http://127.0.0.1:10809
   ```

**验证**:
```bash
curl -x http://127.0.0.1:10809 https://api.binance.com/api/v3/ping
```

---

### 3. Shadowsocks

**默认配置**:
- SOCKS5端口: `1080`

**配置步骤**:
1. 启动Shadowsocks
2. 确保"启用系统代理"已开启
3. 在`.env`中配置:
   ```bash
   PROXY_URL=socks5://127.0.0.1:1080
   ```

**验证**:
```bash
curl -x socks5://127.0.0.1:1080 https://api.binance.com/api/v3/ping
```

---

### 4. 自定义代理

**如果你的代理端口不同**:
1. 查看代理软件的端口设置
2. 修改`.env`中的端口号
3. 重启服务器

**示例**:
```bash
# 自定义HTTP端口
PROXY_URL=http://127.0.0.1:8888

# 自定义SOCKS5端口
PROXY_URL=socks5://127.0.0.1:9999
```

---

## 🔌 API使用

### 获取代理状态
```javascript
// GET /api/proxy/status
{
  "success": true,
  "data": {
    "enabled": true,
    "url": "http://127.0.0.1:7890",
    "type": "http"
  }
}
```

### 启用代理
```javascript
// POST /api/proxy/enable
{
  "proxyUrl": "http://127.0.0.1:7890"
}

// Response
{
  "success": true,
  "message": "代理已启用",
  "data": {
    "enabled": true,
    "url": "http://127.0.0.1:7890",
    "type": "http"
  }
}
```

### 测试代理连接
```javascript
// GET /api/proxy/test
{
  "success": true,
  "data": {
    "success": true,
    "message": "代理连接正常",
    "latency": "245ms",
    "proxyUrl": "http://127.0.0.1:7890",
    "proxyType": "http"
  }
}
```

### 获取配置示例
```javascript
// GET /api/proxy/examples
{
  "success": true,
  "data": {
    "examples": [
      {
        "name": "Clash代理（默认端口）",
        "url": "http://127.0.0.1:7890",
        "description": "适用于Clash for Windows默认配置"
      },
      // ... 更多示例
    ]
  }
}
```

---

## 🐛 故障排查

### 问题1: 代理连接失败

**错误信息**:
```
❌ 代理连接失败: connect ECONNREFUSED 127.0.0.1:7890
```

**解决方法**:
1. ✅ 确认代理软件已启动
2. ✅ 检查端口号是否正确
3. ✅ 确认代理软件的"允许来自局域网的连接"已开启
4. ✅ 尝试在浏览器中访问 http://127.0.0.1:7890 测试

---

### 问题2: 代理已启用但仍然超时

**错误信息**:
```
⚠️ [BINANCE] 获取ETH/USDT价格失败: fetch failed
```

**解决方法**:
1. ✅ 测试代理连接: `curl http://localhost:3000/api/proxy/test`
2. ✅ 检查代理软件的规则配置（确保允许访问交易所API）
3. ✅ 尝试切换代理节点
4. ✅ 检查代理软件日志

---

### 问题3: SOCKS5代理不工作

**错误信息**:
```
❌ 代理配置失败: Invalid SOCKS version
```

**解决方法**:
1. ✅ 确认使用 `socks5://` 而不是 `socks://`
2. ✅ 检查SOCKS5端口是否正确
3. ✅ 尝试使用HTTP代理替代

---

### 问题4: 带认证的代理失败

**错误信息**:
```
❌ 代理连接失败: 407 Proxy Authentication Required
```

**解决方法**:
1. ✅ 确认用户名密码正确
2. ✅ 检查URL格式: `http://username:password@host:port`
3. ✅ 如果密码包含特殊字符，需要URL编码

---

## 📊 性能优化

### 选择最快的代理节点
```bash
# 测试代理延迟
curl http://localhost:3000/api/proxy/test

# 选择延迟最低的节点
# 延迟 < 200ms: 优秀
# 延迟 200-500ms: 良好
# 延迟 > 500ms: 建议更换节点
```

### 代理规则优化
在代理软件中配置规则，只对交易所API使用代理：
```yaml
# Clash规则示例
rules:
  - DOMAIN-SUFFIX,binance.com,PROXY
  - DOMAIN-SUFFIX,okx.com,PROXY
  - DOMAIN-SUFFIX,bybit.com,PROXY
  - DOMAIN-SUFFIX,huobi.com,PROXY
  - MATCH,DIRECT
```

---

## 🔒 安全建议

1. ✅ 只使用可信的代理服务
2. ✅ 不要在代理URL中使用明文密码（使用环境变量）
3. ✅ 定期更换代理密码
4. ✅ 不要将`.env`文件提交到Git仓库
5. ✅ 使用本地代理而不是公共代理

---

## 📝 常见问题

### Q: 必须使用代理吗？
A: 如果你在国内，访问Binance等国际交易所API需要代理。如果在国外或使用VPN，可以不配置代理。

### Q: 代理会影响性能吗？
A: 会有一定延迟（通常50-300ms），但比直接访问被墙的API要快得多。

### Q: 可以使用免费代理吗？
A: 不推荐。免费代理通常不稳定、速度慢、安全性差。建议使用自己的代理软件。

### Q: 代理配置后需要重启吗？
A: 通过环境变量配置需要重启。通过API配置立即生效。

### Q: 如何验证代理是否生效？
A: 查看服务器日志，应该看到 `🔌 [BINANCE] 使用代理连接`。

---

## 🚀 快速开始

**最简单的配置（Clash用户）**:

1. 启动Clash for Windows
2. 编辑`.env`:
   ```bash
   PROXY_URL=http://127.0.0.1:7890
   ```
3. 重启服务器:
   ```bash
   npm run dev
   ```
4. 验证:
   ```bash
   curl http://localhost:3000/api/proxy/test
   ```

**完成！** 🎉

---

## 📞 获取帮助

如果遇到问题：
1. 查看服务器日志
2. 测试代理连接: `curl http://localhost:3000/api/proxy/test`
3. 查看代理软件日志
4. 参考本文档的故障排查部分

---

**配置完成后，项目将能够正常访问国际交易所API！** ✅

