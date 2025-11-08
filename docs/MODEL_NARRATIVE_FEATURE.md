# 模型自述功能 - nof1.ai 风格

## 概述

模型自述功能是一个**实时、事件驱动的 AI 叙述系统**，参考 nof1.ai 的设计理念，让 AI 以第一人称持续叙述"我观察→我计划→我执行→我复盘"的完整决策过程。

## 核心特性

### 1. 实时事件驱动 🔴
- **WebSocket 推送**：叙述实时推送到前端，无需刷新
- **事件触发**：AI 分析、交易执行、风险警告等关键事件自动生成叙述
- **心跳机制**：无事件时每 30 秒产出"观测-等待"叙述，保证时间连续性

### 2. 第一人称叙述 🗣️
- AI 以"我"的视角描述决策过程
- 自然语言连续体："我检测到...我决定...我执行..."
- 强制闭环：意图→行动→证据→风险→后续计划

### 3. 证据锚点 📊
- 每段叙述附带具体数据证据
- 可追溯：绑定具体 Trade#、Position#、时间窗指标数值
- 透明化：读者可从叙述跳转核验成交/持仓

### 4. 多类型叙述 🎨
- **观测 (observation)**：市场监控、无事件等待
- **分析 (ai_analysis)**：AI 分析完成、信号变化
- **交易 (trade_action)**：开仓/平仓决策
- **风险 (risk_alert)**：风险警告、交易暂停

## 技术架构

### 后端实现

#### MonitoringService 增强
```javascript
// 叙述状态管理
narrative: {
  history: [],        // 叙述历史（保留 50 条）
  lastNarrativeTime: 0,
  currentIntent: null,
  nextAction: null
}

// 核心方法
- addNarrative(data)              // 添加叙述并触发 WebSocket 推送
- generateAIAnalysisNarrative()   // AI 分析叙述
- generateTradeNarrative()        // 交易叙述
- generateRiskNarrative()         // 风险叙述
- generateHeartbeatNarrative()    // 心跳叙述
- generateInitialNarrative()      // 初始化叙述
```

#### 事件触发点
```javascript
// AI 分析完成时
updateAIAnalysis(analysis) → generateAIAnalysisNarrative()

// 交易暂停时
riskControl.on('tradingPaused') → generateRiskNarrative('trading_paused')

// 心跳定时器
setInterval(30s) → generateHeartbeatNarrative()

// 系统启动时
setTimeout(1s) → generateInitialNarrative()
```

#### WebSocket 推送
```javascript
// websocket.js
monitoringService.on('narrative', (narrative) => {
  broadcast({
    type: 'model_narrative',
    data: narrative,
    timestamp: narrative.timestamp
  });
});
```

#### API 端点
```http
GET /api/monitoring/narrative-history?limit=20
返回: { success: true, data: [叙述数组] }
```

### 前端实现

#### ModelNarrativeCard 组件
```jsx
// 状态管理
const [narrativeHistory, setNarrativeHistory] = useState([]);
const [wsConnected, setWsConnected] = useState(false);

// WebSocket 连接
useEffect(() => {
  const ws = new WebSocket(wsUrl);
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'model_narrative') {
      setNarrativeHistory(prev => [message.data, ...prev]);
    }
  };
}, [open]);

// 初始化加载
useEffect(() => {
  fetchNarrativeHistory(); // GET /api/monitoring/narrative-history
}, [open]);
```

#### UI 展示
- **时间线布局**：最新叙述在上
- **类型颜色区分**：
  - 观测 = 蓝色
  - 分析 = 紫色
  - 交易 = 绿色
  - 风险 = 红色
- **实时状态指示**：WebSocket 连接状态
- **证据卡片**：展开显示详细证据数据

## 使用指南

### 前端使用

1. **打开模型自述面板**
   - 点击页面右侧边缘的 📖 按钮
   - 面板自动加载历史叙述并连接 WebSocket

2. **查看实时叙述**
   - 叙述按时间倒序排列
   - 新叙述自动推送到顶部
   - 每条叙述显示：类型、时间、内容、意图、下一步、证据

3. **手动刷新**
   - 点击面板右上角的 🔄 按钮
   - 重新获取最新叙述历史

### 触发叙述的操作

1. **执行 AI 分析**
   ```bash
   POST /api/ai/analyze-with-tools
   { "symbol": "BTC/USDT" }
   ```
   → 自动生成"分析完成"叙述

2. **启动自动交易**
   → 交易执行时生成"交易叙述"

3. **触发风险警告**
   → 风险事件触发时生成"风险叙述"

4. **系统空闲**
   → 每 30 秒自动生成"心跳叙述"

## 数据结构

### 叙述对象
```javascript
{
  id: "narrative_1699999999999",
  timestamp: 1699999999999,
  type: "ai_analysis",           // observation | ai_analysis | trade_action | risk_alert | system
  content: "我完成了最新的市场分析...",
  evidence: {                     // 证据数据
    signal: "BUY",
    confidence: 0.75,
    reasoning: "..."
  },
  intent: "assess_market",       // 当前意图
  nextAction: "evaluate_entry"   // 下一步动作
}
```

### 叙述类型定义
```javascript
const NARRATIVE_TYPES = {
  observation: '观测',      // 市场观测、等待
  ai_analysis: '分析',      // AI 分析完成
  trade_action: '交易',     // 开仓/平仓
  risk_alert: '风险',       // 风险警告
  system: '系统'            // 系统消息
};
```

## 与 nof1.ai 的对比

| 特性 | nof1.ai | 我们的实现 | 状态 |
|-----|---------|----------|------|
| 实时 WebSocket 推送 | ✅ | ✅ | ✅ 完成 |
| 第一人称叙述 | ✅ | ✅ | ✅ 完成 |
| 事件驱动触发 | ✅ | ✅ | ✅ 完成 |
| 证据锚点展示 | ✅ | ✅ | ✅ 完成 |
| 心跳/巡检机制 | ✅ | ✅ | ✅ 完成 |
| 时间线展示 | ✅ | ✅ | ✅ 完成 |
| 与交易区联动 | ✅ | 🔄 | 🚧 待增强 |
| 可验证回链 | ✅ | 🔄 | 🚧 待增强 |
| 持久化存储 | ✅ | 🔄 | 🚧 待增强 |

## 后续优化方向

### 1. 增强证据锚点 📎
- 添加可点击的 Trade ID / Position ID
- 点击跳转到对应的交易/持仓详情
- 实现"证据验证"功能

### 2. 持久化存储 💾
- 叙述历史存入数据库
- 支持历史回放
- 导出叙述日志

### 3. 智能叙述生成 🧠
- 使用 AI 生成更自然的叙述文本
- 根据上下文优化叙述内容
- 避免重复冗余信息

### 4. 多语言支持 🌍
- 支持中英文切换
- 自动翻译叙述内容

### 5. 叙述过滤与搜索 🔍
- 按类型过滤叙述
- 搜索关键词
- 时间范围筛选

## 测试清单

- [x] 后端叙述生成逻辑
- [x] WebSocket 推送机制
- [x] 前端 WebSocket 连接
- [x] 前端叙述展示 UI
- [x] API 端点可用性
- [ ] 叙述内容质量验证
- [ ] 高频事件下的性能测试
- [ ] WebSocket 断线重连测试
- [ ] 长时间运行稳定性测试

## 故障排查

### WebSocket 未连接
1. 检查后端服务是否运行
2. 检查 WebSocket 端口 (默认 3001)
3. 查看浏览器控制台错误信息

### 叙述不更新
1. 检查 MonitoringService 是否正常运行
2. 检查事件是否正确触发
3. 查看后端日志中的 `narrative` 事件

### 叙述历史为空
1. 执行一次 AI 分析触发叙述生成
2. 等待 30 秒让心跳叙述生成
3. 检查 `/api/monitoring/narrative-history` API

## 相关文件

### 后端
- `server/services/MonitoringService.js` - 核心叙述生成逻辑
- `server/websocket.js` - WebSocket 推送配置
- `server/routes/monitoring.js` - API 路由

### 前端
- `client/src/components/ModelNarrativeCard.jsx` - 叙述面板组件
- `client/src/components/AIChatPanel.jsx` - 集成入口

## 贡献指南

欢迎贡献代码和建议！请遵循以下规范：

1. 叙述内容必须第一人称
2. 叙述必须附带证据
3. 保持叙述简洁清晰
4. 新增叙述类型需更新文档

---

**参考资料**
- nof1.ai 官网
- WebSocket MDN 文档
- Event-Driven Architecture 最佳实践
