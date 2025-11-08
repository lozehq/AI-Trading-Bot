# 重构迁移指南

> 本指南帮助开发者从旧代码迁移到新的重构架构

---

## 📋 目录

1. [数据收集器迁移](#数据收集器迁移)
2. [API 认证迁移](#api-认证迁移)
3. [缓存使用迁移](#缓存使用迁移)
4. [验证器迁移](#验证器迁移)

---

## 数据收集器迁移

### 旧代码（已废弃）

```javascript
// ❌ 旧方式 - 直接调用 gatherAllMCPData
const mcpData = await gatherAllMCPData(symbol);
```

### 新代码（推荐）

```javascript
// ✅ 新方式 - 使用数据收集器编排器
const dataCollectorOrchestrator = require('./services/dataCollectors');

// 收集所有数据
const data = await dataCollectorOrchestrator.collectAll('okx', symbol, {
  forceRefresh: false,
  includeMultiTimeframe: true
});

// 或者只收集特定类型的数据
const coreData = await dataCollectorOrchestrator.collectors.core.collect('okx', symbol);
const derivativesData = await dataCollectorOrchestrator.collectors.derivatives.collect('okx', symbol);
const emotionData = await dataCollectorOrchestrator.collectors.emotion.collect(symbol);
const newsData = await dataCollectorOrchestrator.collectors.news.collect(symbol);
```

### 数据结构对比

新的数据收集器返回的数据结构与旧版本兼容，但更加清晰：

```javascript
{
  // 核心数据
  ticker: { ... },
  ohlcv: [ ... ],
  indicators: { ... },
  orderBook: { ... },
  trades: [ ... ],
  
  // 多时间框架
  multiTimeframe: {
    '1m': { ohlcv, indicators },
    '15m': { ohlcv, indicators },
    // ...
  },
  
  // 衍生品数据
  fundingRate: { ... },
  openInterest: { ... },
  liquidations: [ ... ],
  
  // 情绪数据
  sentiment: { ... },
  coinDetail: { ... },
  
  // 新闻数据
  aktools: { news: [ ... ] },
  
  // 元数据
  timestamp: 1234567890,
  collectionTime: 1500, // ms
  source: 'okx'
}
```

---

## API 认证迁移

### 1. 数据库迁移

首先运行数据库迁移以创建 `api_keys` 表：

```bash
npm run db:init
```

### 2. 创建 API Key

```javascript
// 通过 API 创建
const response = await fetch('http://localhost:3000/api/api-keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Application',
    permissions: ['read', 'write'],
    ipWhitelist: ['127.0.0.1', '192.168.1.100']
  })
});

const { key, secret } = await response.json();
// 保存 key 和 secret，secret 只显示一次！
```

### 3. 在路由中使用认证

```javascript
const { apiKeyAuth } = require('../middleware/apiKeyAuth');

// 只读路由 - 只需要 API Key
router.get('/data', 
  apiKeyAuth({ required: true }), 
  async (req, res) => {
    // req.apiKey 包含认证信息
    res.json({ data: 'protected data' });
  }
);

// 高风险路由 - 需要 API Key + Secret + IP 白名单
router.post('/trade', 
  apiKeyAuth({ 
    required: true, 
    requireSecret: true,
    requireIpWhitelist: true 
  }), 
  async (req, res) => {
    // 执行交易
  }
);
```

### 4. 客户端使用

```javascript
// 在请求头中添加 API Key
const response = await axios.get('/api/market/ticker', {
  headers: {
    'X-API-Key': 'your-api-key-here'
  }
});

// 高风险操作需要同时提供 Secret
const tradeResponse = await axios.post('/api/trading/execute', data, {
  headers: {
    'X-API-Key': 'your-api-key-here',
    'X-API-Secret': 'your-api-secret-here'
  }
});
```

---

## 缓存使用迁移

### 旧代码（分散的缓存）

```javascript
// ❌ 旧方式 - 每个服务自己管理缓存
class MyService {
  constructor() {
    this.cache = new Map();
  }
  
  async getData(key) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const data = await fetchData(key);
    this.cache.set(key, data);
    return data;
  }
}
```

### 新代码（统一缓存管理）

```javascript
// ✅ 新方式 - 使用统一的缓存管理器
const { CacheManager } = require('./services/cache');

class MyService {
  async getData(key) {
    return await CacheManager.getOrSet('myservice', key, async () => {
      return await fetchData(key);
    }, 60000); // 60秒缓存
  }
}
```

### 缓存管理器 API

```javascript
const { CacheManager } = require('./services/cache');

// 设置缓存
CacheManager.set('namespace', 'key', value, ttl);

// 获取缓存
const value = CacheManager.get('namespace', 'key');

// 获取或设置（推荐）
const value = await CacheManager.getOrSet('namespace', 'key', async () => {
  return await fetchData();
}, ttl);

// 删除缓存
CacheManager.delete('namespace', 'key');

// 清空命名空间
CacheManager.clear('namespace');

// 批量删除（正则匹配）
CacheManager.deletePattern('namespace', '^user_.*');

// 获取统计
const stats = CacheManager.getStats('namespace');
console.log(stats.hitRate); // "75.5%"
```

---

## 验证器迁移

### 旧代码（手动验证）

```javascript
// ❌ 旧方式 - 手动验证
router.post('/trade', async (req, res) => {
  const { symbol, amount } = req.body;
  
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Invalid symbol' });
  }
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  
  // 处理请求...
});
```

### 新代码（使用验证器）

```javascript
// ✅ 新方式 - 使用统一验证器
const { validateBody, schemas } = require('../validators');

router.post('/trade', 
  validateBody(schemas.trading.executeTrade),
  async (req, res) => {
    // req.body 已经过验证和清理
    const { symbol, amount } = req.body;
    // 处理请求...
  }
);
```

### 自定义验证模式

```javascript
const Joi = require('joi');
const { validate } = require('../validators');

// 定义自定义验证模式
const mySchema = Joi.object({
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(18).max(120).required(),
  tags: Joi.array().items(Joi.string()).max(10).optional()
});

// 使用验证
router.post('/register', 
  validate(mySchema, 'body'),
  async (req, res) => {
    // 处理请求...
  }
);
```

---

## 🔧 常见问题

### Q: 旧代码会立即停止工作吗？

A: 不会。我们保留了向后兼容性。旧的 `gatherAllMCPData` 函数仍然可用，但标记为 `@deprecated`。建议逐步迁移到新的数据收集器。

### Q: 如何测试新的重构代码？

A: 运行测试脚本：

```bash
node scripts/test-refactoring.js
```

### Q: 缓存会占用多少内存？

A: 缓存管理器使用 LRU 策略，默认最多保存 1000 条记录。可以通过配置调整：

```javascript
const CacheManager = require('./services/cache/CacheManager');
// 在初始化时配置
```

### Q: API Key 认证是强制的吗？

A: 不是。你可以选择性地在需要保护的路由上使用 `apiKeyAuth` 中间件。公开路由（如 `/api/health`）不需要认证。

---

## 📚 更多资源

- [重构总结文档](./REFACTORING_SUMMARY.md)
- [代码清理计划](./reports/CODE_CLEANUP_PLAN.md)
- [API 文档](./API.md)

---

**最后更新**: 2025-11-06

