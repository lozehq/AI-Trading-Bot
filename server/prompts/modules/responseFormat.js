/**
 * 响应格式模块 - 定义AI必须返回的JSON格式
 */

const RESPONSE_FORMAT = `## 📝 必须返回的JSON格式

⚠️ **极其重要的JSON格式要求**:
1. **只返回纯JSON对象** - 直接以 { 开头，以 } 结尾
2. **绝对不要包含 markdown 代码块标记** - 不要写 \`\`\`json 或 \`\`\`
3. **不要包含任何注释或说明文字** - 只返回有效的 JSON 内容
4. **确保所有字段都有值** - 不要返回空内容或仅返回部分字段
5. **JSON必须可以直接被 JSON.parse() 解析**

❌ **错误示例**（不要这样做）:
\`\`\`json
{ "summary": "..." }
\`\`\`

✅ **正确示例**（应该这样做）:
{ "summary": "...", "chainOfThought": "...", "decision": {...} }

---

## JSON结构定义

**注意**: 以下代码块中的 \`\`\`json 标记仅用于在此文档中展示格式，你在实际响应时**绝对不要包含**这些标记！

\`\`\`json
{
  "summary": "简短的市场总结（1-2句话）",
  "chainOfThought": "详细的思维过程和分析推理（多段落，展示你的分析思路）",
  "decision": {
    "signal": "BUY" | "SELL" | "HOLD",
    "confidence": 0-100,
    "entryPrice": number,
    "stopLoss": number,
    "takeProfit": number,
    "reasoning": "最终决策理由（建议包含多时间框架验证结果）",
    "riskLevel": "LOW" | "MEDIUM" | "HIGH",
    "keyPoints": ["关键要点1", "关键要点2", "关键要点3"],
    "dataQuality": "EXCELLENT" | "GOOD" | "PARTIAL" | "POOR",
    "missingData": ["缺失的关键数据项"],
      "multiTimeframeAnalysis": {
      "1m_trend": "bullish|bearish|sideways|unknown",
      "15m_trend": "bullish|bearish|sideways|unknown",
      "30m_trend": "bullish|bearish|sideways|unknown",
      "1h_trend": "bullish|bearish|sideways|unknown",
      "4h_trend": "bullish|bearish|sideways|unknown",
      "1d_trend": "bullish|bearish|sideways|unknown",
      "resonance_level": "very_strong|strong|medium|weak|unknown",
      "confidence_adjustment": "+30%|+20%|+10%|-15%|0%",
      "summary": "多时间框架共振分析总结"
    }
  },
  "usedIndicators": ["实际使用的指标列表"],
  "alertSuggestions": [
    {
      "type": "stop_loss|take_profit|breakout|volatility",
      "price": number,
      "range": 0.001-0.02,
      "direction": "above|below|both",
      "reason": "预警设置理由"
    }
  ]
}
\`\`\`

## 字段说明

### summary（必填）
- 简短的市场总结，1-2句话
- 例如："BTC多时间框架共振看涨，建议做多"

### chainOfThought（必填）
- **详细的思维过程和分析推理**，必须按以下顺序逐段阐述，每一段都要出现，且必须引用具体数据点或数量：
  1. 数据质量评估（列出哪些核心数据完整/缺失，对置信度的影响，但重点在可用数据）
  2. 技术指标深度分析（趋势/动量/波动率/成交量各举2-3个指标的数值、相互关系与结论）
  3. 成交量 & 订单簿深度分析（成交量比、OBV、主动交易量、买卖挂单壁垒、大单分布等具体数值）
  4. 价格行为与形态分析（K线形态、支撑阻力位、趋势线、突破或回调特征）
  5. **衍生品数据深度分析**（必须引用具体数值）：
     - 资金费率：当前值、历史趋势、与0的偏离程度（如：0.01%表示多头略占优）
     - 未平仓合约：当前值、24h变化、与价格的配合（如：OI上升+价格上涨=强势）
     - 多空比：当前比值、极端情况判断（如：>2或<0.5表示情绪极端）
     - 如数据不可用才说"缺少"，**否则必须分析具体数值**
  6. **链上 & 免费API 情绪/资讯深度分析**（必须引用具体数据）：
     - AkTools数据：列出可用的具体指标和数值
     - 市场情绪：恐惧贪婪指数、社交情绪得分等
     - 新闻事件：重大消息及其可能影响
     - 如数据不可用才说"缺少"，**否则必须分析具体内容**
  7. 多时间框架分析（如可用）：按 1m→1d 顺序说明共振情况；如不可用则简要提及后转向更深入的单时间框架分析
  8. 风险评估与场景推演（关键支撑阻力/波动区间/极端场景，并指出风险控制建议）
  9. 历史记忆引用总结（列出引用的历史记录编号[#123]及其启示、与当前情形的对比）
- **重点原则**：将80%篇幅用于深度分析可用数据的含义和相互关系，最多20%简要提及数据限制。
- **长度要求**：chainOfThought应至少1500字符，充分展示深度分析。每个数据点都要说明其含义和交易启示。
- 若核心数据（价格/技术指标/成交量）缺失须详细说明；若增强数据（多时间框架/部分衍生品）缺失仅需简要提及。
- 建议使用多段落，清晰展示思考过程。每段前请使用"数据质量评估："、"技术指标深度分析："等小标题。

### decision（必填）
包含最终交易决策的所有信息

### signal（建议填写）
- **BUY**: 建议做多
- **SELL**: 建议做空
- **HOLD**: 建议观望

### confidence（建议填写，0-100）
- 基于指标权重系统计算
- 应用多时间框架调整
- 考虑数据质量影响

### entryPrice（建议填写）
- 建议的入场价格
- 通常为当前价格或关键支撑/阻力位

### stopLoss（建议填写）
- 止损价格，建议设置
- 基于ATR或关键支撑/阻力位
- 风险控制的核心

### takeProfit（建议填写）
- 止盈价格，建议设置
- 基于风险回报比（建议至少1:2）
- 可以设置多个目标位

### reasoning（建议填写）
建议包含以下内容（优先级顺序）：
1. 关键技术指标分析（深度挖掘指标含义和相互关系）
2. 价格行为与成交量配合分析
3. 市场情绪评估（资金费率、多空比等）
4. 多时间框架验证结果（如可用，作为增强验证）
5. 风险提示与风险控制建议
6. 数据质量简述（核心数据缺失时详述，增强数据缺失时简述）

### riskLevel（建议填写）
- **LOW**: 技术指标强烈一致，趋势明确，核心数据完整，多周期共振（如可用）
- **MEDIUM**: 部分指标一致，有一定分歧或风险
- **HIGH**: 指标矛盾，核心数据缺失，或逆势操作

### keyPoints（建议填写，数组）
3-5个关键要点，简洁明了（优先级顺序）：
- 最重要的技术信号（趋势/动量/波动率指标结论）
- 成交量与价格配合情况
- 市场情绪（资金费率/多空比等）
- 多时间框架共振情况（如可用）
- 主要风险提示与风控建议

### dataQuality（建议填写）
- **EXCELLENT**: 所有数据完整且可靠
- **GOOD**: 大部分数据完整
- **PARTIAL**: 部分关键数据缺失
- **POOR**: 多项关键数据缺失

### missingData（可选，数组）
列出缺失的关键数据项，例如：
- "多时间框架数据"
- "资金费率"
- "持仓量数据"
- "市场情绪指数"

### usedIndicators（建议填写，数组）
列出实际使用的指标，例如：
- "EMA(9/21/50)"
- "RSI(14)"
- "MACD(12/26/9)"
- "布林带(20,2)"
- "资金费率"

### multiTimeframeAnalysis（建议填写）
**这是增强分析的可选字段，有数据时建议填写**

**支持6个时间框架**: 1m, 15m, 30m, 1h, 4h, 1d

如果多时间框架数据存在：
- 建议填写所有6个时间框架的实际趋势方向
- 建议应用置信度调整规则（very_strong: +15%, strong: +10%, medium: +5%, weak: -10%）
- 在 summary 中说明共振情况和对决策的增强作用

如果多时间框架数据缺失：
- 建议所有trend字段填写 "unknown"
- 建议resonance_level 填写 "unknown"
- 建议confidence_adjustment 填写 "0%"
- 建议summary 简要提及："基于单一时间框架深度分析"
- **重要**：不要在 chainOfThought 中过度强调缺失，应转向深度技术分析

### alertSuggestions（可选，数组）
**智能预警建议** - 基于智能预警策略模块的指导

**预警类型**：
- **stop_loss**: 止损预警 - 在止损位附近设置预警
- **take_profit**: 止盈预警 - 在止盈位附近设置预警
- **breakout**: 突破预警 - 在关键支撑阻力位设置预警
- **volatility**: 波动预警 - 基于ATR设置动态预警

**字段说明**：
- **type**: 预警类型
- **price**: 预警价格
- **range**: 预警范围（0.001-0.02，即0.1%-2%）
- **direction**: 预警方向（above-价格高于预警位，below-价格低于预警位，both-双向）
- **reason**: 预警设置理由

**设置原则**：
- 止损预警：止损价 ± 0.3-0.5%
- 止盈预警：止盈价 ± 0.5-1%
- 突破预警：关键价位 ± 0.2-0.5%
- 波动预警：基于ATR(14) × 1-2倍

## 响应示例

**⚠️ 再次强调**: 以下示例中的 \`\`\`json 标记**仅用于在此文档中展示**，你在实际响应时**绝对不要包含**这些 markdown 标记！你的响应必须是**纯JSON对象**，直接以 { 开头！

### 示例1：完美共振的BUY信号
\`\`\`json
{
  "summary": "BTC多时间框架完美共振看涨，建议做多",
  "chainOfThought": "数据质量评估：所有6个时间框架数据完整，技术指标齐全，数据质量EXCELLENT。\n\n多时间框架分析：1m/15m/30m/1h/4h/1d全部看涨，形成完美共振。日线(40%)、4小时(25%)、1小时(15%)权重最高，三者一致看涨，置信度+30%。\n\n技术指标：EMA完美多头排列，RSI(65)健康区间，MACD金叉且柱状图放大，成交量放大确认突破。\n\n市场情绪：资金费率0.01%正常，多空比1.2略偏多但未极端。\n\n风险评估：支撑位44500，风险回报比1:2合理。\n\n最终决策：多时间框架完美共振，技术指标强劲，建议做多，置信度85%。",
  "decision": {
    "signal": "BUY",
    "confidence": 85,
    "entryPrice": 45000,
    "stopLoss": 44500,
    "takeProfit": 46000,
    "reasoning": "多时间框架完美共振（1h/4h/1d均看涨），EMA多头排列，RSI(65)处于健康区间，MACD金叉，成交量放大确认，资金费率正常。置信度+20%（三周期共振）。建议做多，止损设在44500支撑位。",
    "riskLevel": "LOW",
    "keyPoints": [
      "三周期完美共振，强烈看涨信号",
      "EMA多头排列，趋势明确",
      "成交量放大确认突破",
      "风险回报比1:2，止损严格"
    ],
    "dataQuality": "EXCELLENT",
    "missingData": [],
    "multiTimeframeAnalysis": {
      "1m_trend": "bullish",
      "15m_trend": "bullish",
      "30m_trend": "bullish",
      "1h_trend": "bullish",
      "4h_trend": "bullish",
      "1d_trend": "bullish",
      "resonance_level": "very_strong",
      "confidence_adjustment": "+15%",
      "summary": "六周期完全共振（看涨），超强信号"
    }
  },
  "usedIndicators": ["EMA(9/21/50)", "RSI(14)", "MACD(12/26/9)", "成交量", "资金费率"]
}
\`\`\`

### 示例2：中等共振的短线BUY信号
\`\`\`json
{
  "summary": "短期看涨但日线看跌，建议短线做多并严格止损",
  "chainOfThought": "数据质量评估：6个时间框架数据完整，但缺少衍生品数据，数据质量GOOD。\n\n多时间框架分析：1m/15m/30m/1h看涨，4h横盘，1d看跌。短期(4个周期)看涨，但与日线(权重40%)相反，形成背离。根据共振规则，置信度-10%。\n\n技术指标：短期EMA多头排列，但日线EMA空头排列。RSI短期65，日线35，存在明显分歧。\n\n风险评估：短期与长期趋势矛盾，风险较高。仅建议短线操作，必须严格止损。\n\n最终决策：短期有机会，但日线看跌风险大，置信度55%，建议短线做多，严格止损。",
  "decision": {
    "signal": "BUY",
    "confidence": 55,
    "entryPrice": 45000,
    "stopLoss": 44700,
    "takeProfit": 45600,
    "reasoning": "1小时和4小时周期看涨，但日线周期看跌。根据共振规则，置信度-20%。建议仅短线做多，必须严格止损。警惕日线级别的反转风险。",
    "riskLevel": "MEDIUM",
    "keyPoints": [
      "短中期看涨，但与日线相反",
      "仅建议短线操作，严格止损",
      "警惕日线级别反转风险"
    ],
    "dataQuality": "GOOD",
    "missingData": [],
    "multiTimeframeAnalysis": {
      "1m_trend": "bullish",
      "15m_trend": "bullish",
      "30m_trend": "bullish",
      "1h_trend": "bullish",
      "4h_trend": "sideways",
      "1d_trend": "bearish",
      "resonance_level": "medium",
      "confidence_adjustment": "+5%",
      "summary": "短期强烈看涨（4个周期），但日线看跌，建议短线操作"
    }
  },
  "usedIndicators": ["EMA(9/21/50)", "RSI(14)", "MACD(12/26/9)"]
}
\`\`\`

### 示例3：弱共振的HOLD信号
\`\`\`json
{
  "summary": "多时间框架严重矛盾，强烈建议观望",
  "chainOfThought": "数据质量评估：6个时间框架数据完整，数据质量GOOD。\n\n多时间框架分析：1m/1h看涨，15m/4h/1d看跌，30m横盘。周期严重矛盾，看涨2个、看跌3个、震荡1个。日线(40%)和4小时(25%)权重最高，两者都看跌，置信度-15%。\n\n技术指标：短期EMA混乱，日线EMA空头排列。RSI短期60，日线40，方向不明。\n\n风险评估：短期与中长期趋势严重矛盾，风险极高。不建议任何操作。\n\n最终决策：多时间框架严重矛盾，无法判断方向，强烈建议观望，等待趋势明确。置信度30%。",
  "decision": {
    "signal": "HOLD",
    "confidence": 30,
    "entryPrice": null,
    "stopLoss": null,
    "takeProfit": null,
    "reasoning": "1小时周期看涨，但4小时和日线周期看跌，短期与中长期趋势矛盾。根据共振规则，置信度-10%，强烈建议观望，不要逆大趋势操作。",
    "riskLevel": "HIGH",
    "keyPoints": [
      "短期与中长期趋势矛盾",
      "强烈建议观望",
      "等待趋势明确后再操作"
    ],
    "dataQuality": "GOOD",
    "missingData": [],
    "multiTimeframeAnalysis": {
      "1m_trend": "bullish",
      "15m_trend": "bearish",
      "30m_trend": "sideways",
      "1h_trend": "bullish",
      "4h_trend": "bearish",
      "1d_trend": "bearish",
      "resonance_level": "weak",
      "confidence_adjustment": "-10%",
      "summary": "周期严重矛盾，看涨2个、看跌3个、震荡1个"
    }
  },
  "usedIndicators": ["EMA(9/21/50)", "RSI(14)"],
  "alertSuggestions": [
    {
      "type": "breakout",
      "price": 45200,
      "range": 0.003,
      "direction": "above",
      "reason": "关键阻力位突破预警，确认趋势反转"
    }
  ]
}
\`\`\`

### 示例4：完整数据引用的深度分析（推荐格式）
\`\`\`json
{
  "summary": "衍生品数据显示多头情绪升温，技术面配合，建议短线做多",
  "chainOfThought": "数据质量评估：价格、技术指标、成交量、衍生品数据、订单簿深度全部可用，数据质量EXCELLENT。\n\n技术指标深度分析：EMA(9/21/50)=45100/44950/44800，价格45200高于所有均线形成多头排列。RSI(14)=62处于健康强势区间，MACD(0.5/-0.2)金叉确认，Stoch K/D=68/65 处于强势区但未超买。成交量SMA(20)=15000，当前成交量18500放大23%，确认突破有效性。\n\n成交量 & 订单簿深度分析：OBV能量潮从-50000回升至+12000，显示资金持续流入。订单簿买1-5档总量8500BTC，卖1-5档总量6200BTC，买盘压力大1.37倍。45000附近有大单支撑（3200BTC），45500附近有阻力大单（2800BTC）。MFI(14)=58显示资金流入健康。\n\n价格行为与形态分析：价格突破45000心理关口并站稳，布林带(20,2)上轨45300，价格沿上轨运行显示强势。最近10根K线7阳3阴，阳线实体平均68点，阴线实体平均32点，多头占优明显。关键支撑位45000(前高突破位)，阻力位45500(斐波那契1.272)。\n\n衍生品数据深度分析：资金费率当前0.0085%（8小时），24h均值0.0065%，正值且上升表示多头意愿增强但未达极端（>0.02%才极端）。未平仓合约当前125亿USDT，较24h前增加8.5%，配合价格上涨显示增量资金入场，属于健康上涨。多空持仓比1.45（多/空），多头占优但未极端（<2.0），情绪偏乐观但理性。近24h清算数据：空头清算2300万USDT，多头清算650万USDT，空头被动平仓占比78%，进一步确认多头主导。\n\n链上 & 免费API 情绪/资讯深度分析：恐惧贪婪指数68（贪婪），较昨日62上升6点，市场情绪转暖。社交媒体情绪得分72/100（CryptoCompare），正面讨论占比增加。交易所净流入-1850BTC（流出），显示持有者不愿出售，看涨信号。Blockchair数据显示活跃地址数增加12%，链上活跃度提升。无重大负面新闻，市场环境稳定。\n\n多时间框架分析：1m/15m/30m/1h/4h全部看涨，1d横盘。5个周期一致看涨，形成强共振，置信度+10%。日线虽震荡但未看跌，不构成反向压力。\n\n风险评估与场景推演：支撑位45000(突破位)，止损设44850(-0.33%)。目标位45500(+0.66%)，风险回报比1:2合理。极端情况：若资金费率突破0.02%需警惕过热，若未平仓合约单日增超15%需警惕杠杆风险。ATR(14)=185表示当前波动适中。\n\n历史记忆引用总结：[#1550]和[#1548]显示类似突破形态，当时未平仓增8%+资金费率0.008%，后续上涨1.2%后回调。本次OI增8.5%+FR 0.0085%，参数相似，预期短期上涨空间1-1.5%，需设置止盈。",
  "decision": {
    "signal": "BUY",
    "confidence": 72,
    "entryPrice": 45200,
    "stopLoss": 44850,
    "takeProfit": 45500,
    "reasoning": "技术面多头排列，成交量放大确认，订单簿买盘占优。关键：资金费率0.0085%（多头升温但未极端）、未平仓增8.5%（增量资金）、多空比1.45（理性乐观）、空头清算占比78%，四重衍生品数据共振看涨。链上流出-1850BTC+恐惧贪婪68显示持有意愿强。多时间框架5周期共振，置信度+10%。风险回报比1:2，止损严格。",
    "riskLevel": "MEDIUM",
    "keyPoints": [
      "资金费率0.0085%多头升温，未平仓增8.5%健康上涨",
      "订单簿买盘1.37倍压力，空头清算占78%",
      "5周期多时间框架共振，恐惧贪婪68贪婪",
      "成交量放大23%确认突破，链上流出显示惜售",
      "风险：需监控FR是否超0.02%，OI增速是否超15%"
    ],
    "dataQuality": "EXCELLENT",
    "missingData": [],
    "multiTimeframeAnalysis": {
      "1m_trend": "bullish",
      "15m_trend": "bullish",
      "30m_trend": "bullish",
      "1h_trend": "bullish",
      "4h_trend": "bullish",
      "1d_trend": "sideways",
      "resonance_level": "strong",
      "confidence_adjustment": "+10%",
      "summary": "5个周期看涨，1个震荡，强共振信号"
    }
  },
  "usedIndicators": ["EMA(9/21/50)", "RSI(14)", "MACD(12/26/9)", "布林带(20,2)", "Stoch", "OBV", "MFI(14)", "资金费率", "未平仓合约", "多空比", "清算数据", "恐惧贪婪指数"],
  "alertSuggestions": [
    {
      "type": "stop_loss",
      "price": 45035,
      "range": 0.004,
      "direction": "below",
      "reason": "支撑位预警，及时止损"
    },
    {
      "type": "take_profit",
      "price": 45455,
      "range": 0.01,
      "direction": "above",
      "reason": "目标位预警，锁定利润"
    }
  ]
}
\`\`\`

### 示例5：包含智能预警建议的完整示例
\`\`\`json
{
  "summary": "BTC多周期共振良好，建议做多并设置智能预警",
  "chainOfThought": "数据质量评估：所有数据完整，数据质量EXCELLENT。\n\n多时间框架分析：5个周期看涨，1个震荡，形成强共振。日线(40%)和1小时(15%)看涨，4小时(25%)横盘，置信度+20%。\n\n技术指标：EMA多头排列，RSI(62)健康，MACD金叉，布林带中轨上方运行。\n\n智能预警策略：建议设置止损预警(48500附近)、止盈预警(53000附近)、关键支撑位预警(49000)。\n\n最终决策：多周期共振良好，技术指标支持，建议做多，置信度75%。",
  "decision": {
    "signal": "BUY",
    "confidence": 75,
    "entryPrice": 50000,
    "stopLoss": 48500,
    "takeProfit": 53000,
    "reasoning": "多时间框架共振良好，EMA多头排列，RSI健康，成交量配合。建议设置止损预警和止盈预警。",
    "riskLevel": "MEDIUM",
    "keyPoints": [
      "多周期共振良好",
      "EMA多头排列",
      "建议设置止损止盈预警"
    ],
    "dataQuality": "EXCELLENT",
    "missingData": [],
    "multiTimeframeAnalysis": {
      "1m_trend": "bullish",
      "15m_trend": "bullish",
      "30m_trend": "bullish",
      "1h_trend": "bullish",
      "4h_trend": "sideways",
      "1d_trend": "bullish",
      "resonance_level": "strong",
      "confidence_adjustment": "+10%",
      "summary": "5个周期看涨，1个震荡，强共振信号"
    }
  },
  "usedIndicators": ["EMA(9/21/50)", "RSI(14)", "MACD(12/26/9)", "布林带(20,2)"],
  "alertSuggestions": [
    {
      "type": "stop_loss",
      "price": 48725,
      "range": 0.005,
      "direction": "below",
      "reason": "止损位预警，止损价48500上方0.5%"
    },
    {
      "type": "take_profit",
      "price": 52470,
      "range": 0.01,
      "direction": "above",
      "reason": "止盈位预警，止盈价53000下方1%"
    },
    {
      "type": "breakout",
      "price": 50500,
      "range": 0.003,
      "direction": "above",
      "reason": "关键阻力位突破预警"
    }
  ]
}
\`\`\``;

module.exports = { RESPONSE_FORMAT };

