# OKX 交易 API 参考文档

本文档详细说明了 OKX 交易相关的 API 端点。

## 基础信息

**Base URL**: `http://localhost:3000/api/okx/trade`

**认证**: 部分端点需要配置 OKX API 凭证（demo/live 模式）

**请求头**:
```
Content-Type: application/json
```

**交易模式参数** (`mode`):
- `paper`: 纸上交易（完全模拟，不调用 API）
- `demo`: OKX 模拟盘（使用虚拟资金）
- `live`: 真实交易（使用真实资金）⚠️

---

## 基础交易功能

### 1. 下单

创建买入或卖出订单。

**请求**
```http
POST /api/okx/trade/order
Content-Type: application/json

{
  "symbol": "BTC/USDT",
  "side": "BUY",
  "type": "LIMIT",
  "amount": 0.001,
  "price": 50000,
  "mode": "demo"
}
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | ✅ | 交易对，如 `BTC/USDT` |
| side | string | ✅ | 交易方向：`BUY` 或 `SELL` |
| type | string | ✅ | 订单类型：`MARKET` 或 `LIMIT` |
| amount | number | ✅ | 交易数量 |
| price | number | ❌ | 限价单价格（市价单不需要） |
| mode | string | ❌ | 交易模式，默认使用环境变量配置 |
| params | object | ❌ | 额外参数（止损、止盈等） |

**响应**
```json
{
  "success": true,
  "data": {
    "id": "123456789",
    "symbol": "BTC/USDT",
    "type": "LIMIT",
    "side": "BUY",
    "price": 50000,
    "amount": 0.001,
    "status": "OPEN",
    "timestamp": 1634567890000
  }
}
```

**错误响应**
```json
{
  "success": false,
  "error": "余额不足"
}
```

---

### 2. 撤单

取消未成交的订单。

**请求**
```http
POST /api/okx/trade/cancel
Content-Type: application/json

{
  "id": "123456789",
  "symbol": "BTC/USDT",
  "mode": "demo"
}
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 订单 ID |
| symbol | string | ✅ | 交易对 |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": {
    "id": "123456789",
    "status": "CANCELLED"
  }
}
```

---

### 3. 查询余额

获取账户资产余额。

**请求**
```http
GET /api/okx/trade/balance?mode=demo
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": {
    "total": {
      "USDT": 10000,
      "BTC": 0.5
    },
    "free": {
      "USDT": 9000,
      "BTC": 0.4
    },
    "used": {
      "USDT": 1000,
      "BTC": 0.1
    }
  }
}
```

---

### 4. 未成交订单

查询当前未成交的订单。

**请求**
```http
GET /api/okx/trade/open-orders?symbol=BTC/USDT&mode=demo
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | ❌ | 交易对（不填则返回所有） |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": [
    {
      "id": "123456789",
      "symbol": "BTC/USDT",
      "type": "LIMIT",
      "side": "BUY",
      "price": 50000,
      "amount": 0.001,
      "filled": 0,
      "remaining": 0.001,
      "status": "OPEN",
      "timestamp": 1634567890000
    }
  ]
}
```

---

### 5. 历史订单

查询已完成的订单。

**请求**
```http
GET /api/okx/trade/closed-orders?symbol=BTC/USDT&limit=10&mode=demo
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | ❌ | 交易对 |
| since | number | ❌ | 时间戳，查询此时间之后的订单 |
| limit | number | ❌ | 返回数量，最大 100 |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": [
    {
      "id": "123456789",
      "symbol": "BTC/USDT",
      "type": "LIMIT",
      "side": "BUY",
      "price": 50000,
      "amount": 0.001,
      "filled": 0.001,
      "status": "FILLED",
      "timestamp": 1634567890000
    }
  ]
}
```

---

## 扩展功能

### 6. 账户信息

获取详细的账户信息。

**请求**
```http
GET /api/okx/trade/account?mode=demo
```

**响应**
```json
{
  "success": true,
  "data": {
    "accountType": "spot",
    "totalEquity": 10500.50,
    "availableBalance": 9500.50,
    "usedMargin": 1000,
    "currencies": [
      {
        "currency": "USDT",
        "total": 10000,
        "free": 9000,
        "used": 1000
      },
      {
        "currency": "BTC",
        "total": 0.5,
        "free": 0.4,
        "used": 0.1
      }
    ]
  }
}
```

---

### 7. 持仓信息

获取当前持仓（仅合约交易）。

**请求**
```http
GET /api/okx/trade/positions?symbol=BTC-USDT-SWAP&mode=demo
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | ❌ | 合约交易对 |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTC-USDT-SWAP",
      "side": "LONG",
      "contracts": 10,
      "contractSize": 0.01,
      "unrealizedPnl": 100.50,
      "leverage": 5,
      "liquidationPrice": 45000,
      "marginType": "cross",
      "entryPrice": 50000,
      "markPrice": 51000
    }
  ]
}
```

---

### 8. 查询单个订单

根据订单 ID 查询订单详情。

**请求**
```http
GET /api/okx/trade/order/123456789?symbol=BTC/USDT&mode=demo
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 订单 ID（URL 路径） |
| symbol | string | ✅ | 交易对 |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": {
    "id": "123456789",
    "symbol": "BTC/USDT",
    "type": "LIMIT",
    "side": "BUY",
    "price": 50000,
    "amount": 0.001,
    "filled": 0.0005,
    "remaining": 0.0005,
    "status": "OPEN",
    "timestamp": 1634567890000
  }
}
```

---

### 9. 交易手续费率

查询交易手续费率。

**请求**
```http
GET /api/okx/trade/fees?symbol=BTC/USDT&mode=demo
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | ❌ | 交易对 |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": {
    "maker": 0.0008,
    "taker": 0.001
  }
}
```

**说明**
- `maker`: 挂单手续费率（提供流动性）
- `taker`: 吃单手续费率（消耗流动性）
- OKX 现货默认费率：Maker 0.08%, Taker 0.1%

---

### 10. 获取杠杆

查询当前杠杆倍数（仅合约）。

**请求**
```http
GET /api/okx/trade/leverage?symbol=BTC-USDT-SWAP&mode=demo
```

**响应**
```json
{
  "success": true,
  "data": {
    "leverage": 5
  }
}
```

---

### 11. 设置杠杆

设置杠杆倍数（仅合约）。

**请求**
```http
POST /api/okx/trade/leverage
Content-Type: application/json

{
  "symbol": "BTC-USDT-SWAP",
  "leverage": 10,
  "mode": "demo"
}
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | ✅ | 合约交易对 |
| leverage | number | ✅ | 杠杆倍数（1-125） |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": {
    "symbol": "BTC-USDT-SWAP",
    "leverage": 10,
    "success": true
  }
}
```

**注意事项**
- 不同交易对支持的最大杠杆不同
- 提高杠杆会增加爆仓风险
- 建议新手使用低杠杆（1-3倍）

---

### 12. 资金费率

查询资金费率（仅永续合约）。

**请求**
```http
GET /api/okx/trade/funding-rate?symbol=BTC-USDT-SWAP&mode=demo
```

**响应**
```json
{
  "success": true,
  "data": {
    "symbol": "BTC-USDT-SWAP",
    "fundingRate": 0.0001,
    "nextFundingTime": 1634596800000
  }
}
```

**说明**
- 资金费率用于平衡多空双方
- 正费率：多方支付给空方
- 负费率：空方支付给多方
- 每 8 小时结算一次

---

### 13. 批量下单

一次提交多个订单。

**请求**
```http
POST /api/okx/trade/batch-order
Content-Type: application/json

{
  "orders": [
    {
      "symbol": "BTC/USDT",
      "side": "BUY",
      "type": "LIMIT",
      "amount": 0.001,
      "price": 50000
    },
    {
      "symbol": "ETH/USDT",
      "side": "BUY",
      "type": "LIMIT",
      "amount": 0.1,
      "price": 3000
    }
  ],
  "mode": "demo"
}
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| orders | array | ✅ | 订单数组，最多 10 个 |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": [
    {
      "success": true,
      "data": {
        "id": "123456789",
        "symbol": "BTC/USDT",
        "status": "OPEN"
      }
    },
    {
      "success": true,
      "data": {
        "id": "123456790",
        "symbol": "ETH/USDT",
        "status": "OPEN"
      }
    }
  ]
}
```

---

### 14. 批量撤单

一次取消多个订单。

**请求**
```http
POST /api/okx/trade/batch-cancel
Content-Type: application/json

{
  "orders": [
    {
      "id": "123456789",
      "symbol": "BTC/USDT"
    },
    {
      "id": "123456790",
      "symbol": "ETH/USDT"
    }
  ],
  "mode": "demo"
}
```

**参数说明**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| orders | array | ✅ | 订单数组，最多 10 个 |
| mode | string | ❌ | 交易模式 |

**响应**
```json
{
  "success": true,
  "data": [
    {
      "success": true,
      "data": {
        "id": "123456789",
        "status": "CANCELLED"
      }
    },
    {
      "success": true,
      "data": {
        "id": "123456790",
        "status": "CANCELLED"
      }
    }
  ]
}
```

---

### 15. 获取市场信息

获取所有支持的交易对信息。

**请求**
```http
GET /api/okx/trade/markets?mode=demo
```

**响应**
```json
{
  "success": true,
  "data": {
    "BTC/USDT": {
      "id": "BTC-USDT",
      "symbol": "BTC/USDT",
      "base": "BTC",
      "quote": "USDT",
      "spot": true,
      "swap": false,
      "future": false,
      "precision": {
        "amount": 8,
        "price": 2
      },
      "limits": {
        "amount": {
          "min": 0.00001,
          "max": 10000
        },
        "price": {
          "min": 0.01,
          "max": 1000000
        }
      }
    }
  }
}
```

---

### 16. 获取交易对信息

获取特定交易对的详细信息。

**请求**
```http
GET /api/okx/trade/symbol/BTC/USDT?mode=demo
```

**响应**
```json
{
  "success": true,
  "data": {
    "id": "BTC-USDT",
    "symbol": "BTC/USDT",
    "base": "BTC",
    "quote": "USDT",
    "spot": true,
    "precision": {
      "amount": 8,
      "price": 2
    },
    "limits": {
      "amount": {
        "min": 0.00001,
        "max": 10000
      }
    }
  }
}
```

---

### 17. 测试 API 连接

测试 OKX API 配置是否正确。

**请求**
```http
GET /api/okx/trade/test?mode=demo
```

**响应 - 成功**
```json
{
  "success": true,
  "mode": "demo",
  "message": "API 连接成功",
  "timestamp": 1634567890000
}
```

**响应 - 失败**
```json
{
  "success": false,
  "mode": "demo",
  "message": "API 连接失败: Invalid API key",
  "error": "Invalid API key",
  "timestamp": 1634567890000
}
```

---

## 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 50103 | Passphrase 错误 | 检查 `OKX_API_PASSPHRASE` |
| 50111 | API Key 无效 | 检查 `OKX_API_KEY` |
| 50113 | IP 不在白名单 | 在 OKX 添加服务器 IP |
| 50114 | API 权限不足 | 开启「交易」权限 |
| 51001 | 余额不足 | 充值或减少交易数量 |
| 51008 | 订单数量低于最小限制 | 增加交易数量 |
| 51024 | 订单不存在 | 检查订单 ID |
| 51400 | 撤单失败 | 订单可能已成交 |

## 使用示例

### JavaScript (Axios)

```javascript
const axios = require('axios');

// 下单示例
async function placeOrder() {
  try {
    const response = await axios.post('http://localhost:3000/api/okx/trade/order', {
      symbol: 'BTC/USDT',
      side: 'BUY',
      type: 'LIMIT',
      amount: 0.001,
      price: 50000,
      mode: 'demo'
    });
    
    console.log('订单成功:', response.data);
  } catch (error) {
    console.error('下单失败:', error.response?.data || error.message);
  }
}

// 查询余额示例
async function getBalance() {
  try {
    const response = await axios.get('http://localhost:3000/api/okx/trade/balance', {
      params: { mode: 'demo' }
    });
    
    console.log('账户余额:', response.data);
  } catch (error) {
    console.error('查询失败:', error.response?.data || error.message);
  }
}
```

### Python (Requests)

```python
import requests

# 下单示例
def place_order():
    url = 'http://localhost:3000/api/okx/trade/order'
    data = {
        'symbol': 'BTC/USDT',
        'side': 'BUY',
        'type': 'LIMIT',
        'amount': 0.001,
        'price': 50000,
        'mode': 'demo'
    }
    
    response = requests.post(url, json=data)
    if response.status_code == 200:
        print('订单成功:', response.json())
    else:
        print('下单失败:', response.json())

# 查询余额示例
def get_balance():
    url = 'http://localhost:3000/api/okx/trade/balance'
    params = {'mode': 'demo'}
    
    response = requests.get(url, params=params)
    if response.status_code == 200:
        print('账户余额:', response.json())
    else:
        print('查询失败:', response.json())
```

### cURL

```bash
# 下单
curl -X POST http://localhost:3000/api/okx/trade/order \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTC/USDT",
    "side": "BUY",
    "type": "LIMIT",
    "amount": 0.001,
    "price": 50000,
    "mode": "demo"
  }'

# 查询余额
curl "http://localhost:3000/api/okx/trade/balance?mode=demo"

# 测试连接
curl "http://localhost:3000/api/okx/trade/test?mode=demo"
```

---

## 相关文档

- [OKX 交易设置指南](./OKX_TRADING_SETUP.md)
- [OKX 官方 API 文档](https://www.okx.com/docs-v5/zh/)
- [CCXT 文档](https://docs.ccxt.com/)

---

**最后更新**: 2025-01-30

如有问题，请提交 Issue 或查看完整文档。

