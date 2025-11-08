# 数据字段映射文档

## 📋 目的
确保AI提示词中描述的数据字段与代码中实际传递的数据结构完全匹配。

---

## ✅ 已验证的字段映射

### 1. 基础价格数据
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| 当前价格 | `price` | number | `marketData.price` |
| 24h涨跌幅 | `change24h` | number | `marketData.change24h` |
| 24h成交量 | `volume24h` | number | `marketData.volume24h` |
| 24h最高价 | `high24h` | number | `marketData.high24h` |
| 24h最低价 | `low24h` | number | `marketData.low24h` |
| 交易对 | `symbol` | string | `marketData.symbol` |
| 交易所 | `exchange` | string | `marketData.exchange` |

### 2. Ticker数据
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| 完整Ticker数据 | `ticker` | object | `marketData.ticker` |
| - 最新价 | `ticker.last` | number | CCXT |
| - 买一价 | `ticker.bid` | number | CCXT |
| - 卖一价 | `ticker.ask` | number | CCXT |
| - 开盘价 | `ticker.open` | number | CCXT |
| - 收盘价 | `ticker.close` | number | CCXT |

### 3. 多时间框架数据 ✅
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| 多时间框架数据 | `multiTimeframe` | object | `marketData.multiTimeframe` |
| - 时间框架集合 | `multiTimeframe.timeframes` | object | 自动获取 |
| - 1小时数据 | `multiTimeframe.timeframes['1h']` | object | DataSourceManager |
| - 4小时数据 | `multiTimeframe.timeframes['4h']` | object | DataSourceManager |
| - 日线数据 | `multiTimeframe.timeframes['1d']` | object | DataSourceManager |
| - 共振分析 | `multiTimeframe.resonance` | object | 自动计算 |

#### 时间框架对象结构
```javascript
{
  ohlcv: Array,           // K线数据
  indicators: Object,     // 技术指标
  trend: String,          // 'bullish' | 'bearish' | 'sideways'
  status: String          // 'success' | 'failed'
}
```

#### 共振分析对象结构
```javascript
{
  level: String,                // 'strong' | 'medium' | 'weak' | 'unknown'
  summary: String,              // 中文总结
  confidenceAdjustment: Number, // +20 | -20 | -10 | 0
  recommendation: String        // 操作建议
}
```

### 4. 技术指标数据
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| 技术指标 | `indicators` | object | `mcpData.indicators` |
| - 趋势指标 | `indicators.trend` | object | TechnicalIndicators |
| - 动量指标 | `indicators.momentum` | object | TechnicalIndicators |
| - 波动率指标 | `indicators.volatility` | object | TechnicalIndicators |
| - 成交量指标 | `indicators.volume` | object | TechnicalIndicators |

### 5. 衍生品数据 ✅
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| 资金费率 | `fundingRate` | object | `marketData.fundingRate` |
| 持仓量 | `openInterest` | object | `marketData.openInterest` |
| 清算数据 | `liquidations` | object | `marketData.liquidations` |

#### 资金费率对象结构
```javascript
{
  symbol: String,
  fundingRate: Number,      // 资金费率（小数）
  fundingTimestamp: Number,
  nextFundingTime: String,
  markPrice: Number,
  indexPrice: Number
}
```

### 6. 市场情绪数据 ✅
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| 市场情绪 | `sentiment` | object | `marketData.sentiment` |
| 币种详情 | `coinDetail` | object | `marketData.coinDetail` |
| 涨跌榜 | `gainersLosers` | object | `marketData.gainersLosers` |

### 7. 链上数据（AkTools）✅
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| AkTools数据 | `aktools` | object | `marketData.aktools` |
| - OKX多空比 | `aktools.longShortRatio` | object | AkTools |
| - 主动买卖量 | `aktools.activeVolume` | object | AkTools |
| - Binance AI报告 | `aktools.binanceAI` | object | AkTools |
| - 新闻资讯 | `aktools.news` | array | AkTools |

### 8. 高级指标 ✅
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| 高级指标 | `advancedIndicators` | object | `marketData.advancedIndicators` |
| - KDJ指标 | `advancedIndicators.kdj` | object | MCP |
| - Ichimoku云图 | `advancedIndicators.ichimoku` | object | MCP |
| - Aroon指标 | `advancedIndicators.aroon` | object | MCP |

### 9. 免费API数据 ✅
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| 免费API数据 | `freeAPIs` | object | `marketData.freeAPIs` |
| - 恐惧贪婪指数 | `freeAPIs.fearGreedIndex` | object | Alternative.me |
| - 社交数据 | `freeAPIs.socialData` | object | 多个来源 |

### 10. 市场微观结构 ✅
| 提示词描述 | 代码字段名 | 数据类型 | 来源 |
|-----------|-----------|---------|------|
| K线数据 | `ohlcv` | array | `marketData.ohlcv` |
| 订单簿 | `orderBook` | object | `marketData.orderBook` |
| 成交记录 | `trades` | array | `marketData.trades` |

---

## 🔍 字段命名规范

### 1. 命名风格
- **代码中**：使用 camelCase（驼峰命名）
- **提示词中**：使用中文描述 + 英文字段名

### 2. 时间相关字段
- `timestamp`: Unix时间戳（毫秒）
- `datetime`: ISO 8601格式字符串
- `created_at`: 数据库时间戳

### 3. 价格相关字段
- 所有价格字段使用 `number` 类型
- 百分比字段（如 `change24h`）为小数形式（如 5.5 表示 5.5%）

### 4. 状态字段
- `status`: 'success' | 'failed' | 'partial'
- `dataQuality`: 'EXCELLENT' | 'GOOD' | 'PARTIAL' | 'POOR'

---

## ⚠️ 注意事项

### 1. 可选字段
以下字段可能不存在，需要在提示词中说明：
- `multiTimeframe` - 仅完整模式
- `fundingRate` - 仅合约交易对
- `openInterest` - 仅合约交易对
- `liquidations` - 仅合约交易对
- `aktools` - 可能获取失败
- `freeAPIs` - 可能获取失败

### 2. 数据验证
在 `buildAnalysisPrompt` 中，应该：
1. 检查字段是否存在
2. 使用 `?.` 可选链操作符
3. 提供默认值或 'N/A'

示例：
```javascript
const price = marketData.price || 'N/A';
const fundingRate = marketData.fundingRate?.fundingRate?.toFixed(4) || 'N/A';
const multiTimeframe = marketData.multiTimeframe || null;
```

### 3. 提示词中的字段引用
在提示词中引用字段时，应该：
1. 使用完整的路径（如 `marketData.multiTimeframe.timeframes['1h'].trend`）
2. 说明字段的含义和用途
3. 提供字段缺失时的处理策略

---

## ✅ 验证清单

- [x] 基础价格数据字段一致
- [x] Ticker数据字段一致
- [x] 多时间框架数据字段一致
- [x] 技术指标数据字段一致
- [x] 衍生品数据字段一致
- [x] 市场情绪数据字段一致
- [x] 链上数据字段一致
- [x] 高级指标数据字段一致
- [x] 免费API数据字段一致
- [x] 市场微观结构数据字段一致

---

## 📝 更新日志

### 2025-01-XX
- ✅ 创建数据字段映射文档
- ✅ 验证所有字段命名一致性
- ✅ 添加字段类型和来源说明
- ✅ 添加数据结构示例
- ✅ 添加注意事项和验证清单

---

## 🔗 相关文档

- `server/routes/aiEnhanced.js` - marketData对象构建
- `server/services/deepseek.js` - buildAnalysisPrompt方法
- `server/prompts/modules/dataSourcesDescription.js` - 数据源描述
- `server/prompts/modules/responseFormat.js` - 响应格式定义

