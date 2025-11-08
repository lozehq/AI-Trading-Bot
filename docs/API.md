# API 文档

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **WebSocket URL**: `ws://localhost:3001`

## 市场数据 API

### 获取实时价格
```http
GET /api/market/ticker
```

**参数**:
- `exchange` (可选): 交易所名称，默认 `okx`
- `symbol` (可选): 交易对，默认 `ETH/USDT`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "symbol": "ETH/USDT",
    "price": 3500.00,
    "high24h": 3600.00,
    "low24h": 3400.00,
    "volume24h": 1500000000,
    "change24h": 2.5,
    "bid": 3499.50,
    "ask": 3500.50,
    "timestamp": 1708560000000
  }
}
```

### 获取K线数据
```http
GET /api/market/ohlcv
```

**参数**:
- `exchange` (可选): 交易所名称
- `symbol` (可选): 交易对
- `timeframe` (可选): 时间周期，默认 `1h` (1m, 5m, 15m, 1h, 4h, 1d)
- `limit` (可选): 数据条数，默认 `100`

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "timestamp": 1708560000000,
      "open": 3480.00,
      "high": 3500.00,
      "low": 3475.00,
      "close": 3495.00,
      "volume": 1500.50
    }
  ]
}
```

### 获取订单簿
```http
GET /api/market/orderbook
```

**参数**:
- `exchange`, `symbol`, `limit`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "bids": [[3499.50, 10.5], [3499.00, 15.2]],
    "asks": [[3500.50, 8.3], [3501.00, 12.1]],
    "timestamp": 1708560000000
  }
}
```

### 获取资金费率
```http
GET /api/market/funding-rate
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "fundingRate": 0.0001
  }
}
```

---

## 技术指标 API

### 获取所有指标
```http
GET /api/indicators/all
```

**参数**:
- `exchange`, `symbol`, `timeframe`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "rsi": 65.5,
    "macd": {
      "MACD": 15.5,
      "signal": 12.3,
      "histogram": 3.2
    },
    "bollinger": {
      "upper": 3600.00,
      "middle": 3500.00,
      "lower": 3400.00
    },
    "ema": {
      "ema9": 3490.00,
      "ema21": 3480.00,
      "ema50": 3450.00
    },
    "currentPrice": 3495.00,
    "timestamp": 1708560000000
  }
}
```

### 单个指标
```http
GET /api/indicators/rsi
GET /api/indicators/macd
GET /api/indicators/bollinger
```

**参数**: 同上，可额外指定 `period` (周期)

---

## DeepSeek AI API

### AI市场分析
```http
POST /api/deepseek/analyze
```

**请求体**:
```json
{
  "marketData": {
    "symbol": "ETH/USDT",
    "price": 3500.00,
    "change24h": 2.5,
    "volume24h": 1500000000,
    "high24h": 3600.00,
    "low24h": 3400.00
  },
  "indicators": {
    "rsi": 65.5,
    "macd": {...},
    "bollinger": {...}
  },
  "newsData": [] // 可选
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "signal": "BUY",
    "confidence": 75,
    "entryPrice": 3495.00,
    "stopLoss": 3400.00,
    "takeProfit": 3650.00,
    "reasoning": "市场呈现多头趋势，RSI未超买，MACD金叉形成...",
    "riskLevel": "MEDIUM"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 流式分析
```http
POST /api/deepseek/stream-analyze
```

返回 Server-Sent Events (SSE) 流式数据

---

## 交易 API

### 获取交易信号
```http
GET /api/trading/strategy-signal
```

**参数**:
- `exchange`, `symbol`, `timeframe`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "signal": "BUY",
    "confidence": 80,
    "technicalSignal": {
      "signal": "BUY",
      "score": 4.5,
      "signals": ["RSI超卖", "MACD多头", "EMA多头排列"],
      "confidence": 75
    },
    "aiAnalysis": {
      "signal": "BUY",
      "confidence": 85,
      "reasoning": "...",
      "riskLevel": "MEDIUM"
    },
    "currentPrice": 3495.00,
    "entryPrice": 3495.00,
    "stopLoss": 3400.00,
    "takeProfit": 3650.00,
    "timestamp": 1708560000000
  }
}
```

### 获取持仓
```http
GET /api/trading/positions
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "1708560000000",
      "symbol": "ETH/USDT",
      "side": "BUY",
      "entryPrice": 3495.00,
      "amount": 1.5,
      "stopLoss": 3400.00,
      "takeProfit": 3650.00,
      "confidence": 80,
      "reasoning": "...",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "status": "open"
    }
  ]
}
```

### 获取交易历史
```http
GET /api/trading/history?limit=50
```

### 获取表现统计
```http
GET /api/trading/performance
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalTrades": 100,
    "wins": 65,
    "losses": 35,
    "winRate": "65.00",
    "totalProfit": "1250.50",
    "averageWin": "50.25",
    "averageLoss": "-25.30",
    "currentBalance": "11250.50",
    "openPositions": 2
  }
}
```

### 执行交易
```http
POST /api/trading/execute
```

**请求体**:
```json
{
  "signal": {
    "signal": "BUY",
    "entryPrice": 3495.00,
    "stopLoss": 3400.00,
    "takeProfit": 3650.00,
    "confidence": 80,
    "reasoning": "..."
  },
  "symbol": "ETH/USDT",
  "amount": 1.5 // 可选，不填则自动计算
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "status": "executed",
    "trade": {
      "id": "1708560000000",
      "symbol": "ETH/USDT",
      "side": "BUY",
      "entryPrice": 3495.00,
      "amount": 1.5,
      "status": "open",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### 启动自动交易
```http
POST /api/trading/auto/start
```

**请求体**:
```json
{
  "config": {
    "interval": 60000, // 检查间隔（毫秒）
    "symbol": "ETH/USDT",
    "exchange": "okx"
  }
}
```

### 停止自动交易
```http
POST /api/trading/auto/stop
```

---

## WebSocket API

### 连接
```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  console.log('Connected');
};
```

### 订阅交易对
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  payload: {
    exchange: 'okx',
    symbol: 'ETH/USDT'
  }
}));
```

### 接收消息

#### 价格更新
```json
{
  "type": "price_update",
  "exchange": "okx",
  "symbol": "ETH/USDT",
  "data": {
    "price": 3500.00,
    "change24h": 2.5,
    "volume24h": 1500000000,
    "indicators": {
      "rsi": 65.5,
      "macd": {...},
      "bollinger": {...}
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 交易信号
```json
{
  "type": "trade_signal",
  "data": {
    "signal": "BUY",
    "confidence": 80,
    "symbol": "ETH/USDT",
    "entryPrice": 3495.00
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 交易执行
```json
{
  "type": "trade_execution",
  "data": {
    "id": "1708560000000",
    "symbol": "ETH/USDT",
    "side": "BUY",
    "price": 3495.00,
    "amount": 1.5
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 心跳
```javascript
// 发送
ws.send(JSON.stringify({ type: 'ping' }));

// 接收
{
  "type": "pong",
  "timestamp": 1708560000000
}
```

---

## 错误响应

所有API错误遵循统一格式：

```json
{
  "success": false,
  "error": "错误描述信息"
}
```

常见HTTP状态码：
- `200` - 成功
- `400` - 请求参数错误
- `500` - 服务器内部错误

---

## 速率限制

- REST API: 无限制（开发环境）
- WebSocket: 每5秒推送一次价格更新

生产环境建议：
- REST API: 60次/分钟
- WebSocket: 合理控制订阅数量

