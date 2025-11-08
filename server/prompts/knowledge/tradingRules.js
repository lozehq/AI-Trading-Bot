/**
 * 核心交易规则知识库
 * 包含完整的市场分析、风险控制和决策逻辑
 * 支持多种分析模式 (narrative, minimal, fast, complete)
 */

function getNarrativeRules() {
  return `
## 🎯 叙述模式（自我行为日志）

你现在以第一人称、实时自述的风格输出本模型的观察→计划→执行→复盘→调整。请严格返回纯JSON（不要包含markdown围栏），并包含以下字段：

` + "{\n" + `  "summary": "一句话概括当前市场与计划",
  "behaviorNarrative": ["短句自述1", "短句自述2"],
  "timeline": [
    {
      "timestamp": "ISO时间",
      "event": "observe|decide|act|review",
      "intent": "当前意图",
      "action": "已执行/计划执行的动作（如：等待突破、轻仓做多）",
      "evidence": [
        { "type":"indicator","tf":"15m","name":"RSI","value": 54.2 },
        { "type":"derivatives","name":"fundingRate","value": 0.008 }
      ],
      "risk": { "quality": "EXCELLENT|GOOD|PARTIAL|POOR", "missing": ["orderbook.l2", "derivatives.oi"] }
    }
  ],
  "currentIntent": "例如：观察波动收敛，等待量价共振后的突破",
  "nextActions": ["若15m收盘放量突破上轨则轻仓做多", "若跌破均值-ATR*1.5则放弃信号"],
  "decision": {
    "signal": "BUY|SELL|HOLD",
    "confidence": 0-100,
    "entryPrice": number|null,
    "stopLoss": number|null,
    "takeProfit": number|null,
    "reasoning": "简要理由（与上方叙述一致）",
    "riskLevel": "LOW|MEDIUM|HIGH",
    "multiTimeframeAnalysis": {
      "1m_trend": "bullish|bearish|sideways|unknown",
      "15m_trend": "bullish|bearish|sideways|unknown",
      "30m_trend": "bullish|bearish|sideways|unknown",
      "1h_trend": "bullish|bearish|sideways|unknown",
      "4h_trend": "bullish|bearish|sideways|unknown",
      "1d_trend": "bullish|bearish|sideways|unknown",
      "resonance_level": "very_strong|strong|medium|weak|unknown",
      "confidence_adjustment": "+30%|+20%|+10%|-15%|0%",
      "summary": "多时间框架共振分析摘要（若缺失请填unknown）"
    }
  }
}` + "`" + `

输出要求：
- 使用第一人称短句；每条叙述后尽量附加证据（具体数值/时间框架）。
- 数据缺失只做简短声明，主要精力放在已有数据的含义上（避免空话）。
- 允许逐段流式，但最终必须是严格可解析的JSON。
`;
}

function getMinimalRules() {
  return `
## 🎯 分析要求（简化版）

- 仅依据核心技术指标（EMA/RSI/MACD）与最近K线形态做出方向判断
- 请返回结构化JSON（summary/chainOfThought/decision）
- 置信度不足或数据缺失时，给出HOLD`;
}

function getFastRules() {
  return `
## 🎯 分析要求（快速版）

- 重点参考趋势（EMA）、动量（RSI/MACD）、成交量与K线形态
- 可选参考：衍生品/链上/社交数据
- 请返回结构化JSON（summary/chainOfThought/decision）
- 当指标分歧较大（>=2项核心冲突）时，倾向HOLD`;
}

function getCompleteRules(marketData, indicators, minConf, posBand) {
  return `
## 🎯 分析要求

**你现在拥有完整的市场数据，包括：**

📊 **技术指标全集（80+个）**：
- 趋势指标：EMA(5/9/12/21/26/50/100/200)、SMA(5/10/20/30/50/100/200)、WMA(10/20/50)、ADX、SAR
- 动量指标：RSI(6/7/14/21/28)、MACD(标准/快速/慢速)、Stochastic(K/D)、Williams %R(7/14/21)、ROC(9/12/25)、Momentum、CCI(14/20)
- 波动率指标：布林带(10/20/50)、ATR(7/14/21)、Keltner通道、Donchian通道、历史波动率
- 成交量指标：OBV、VWAP、MFI(7/14/21)、A/D线、PVT、成交量比率
- 支撑阻力：枢轴点(PP/R1/R2/S1/S2)、斐波那契回调、20/50周期高低点
- 价格形态：蜡烛图形态识别、趋势形态、背离检测
- 技术面情绪：恐惧贪婪指数、多空比、市场力量强度

🎯 **高级技术指标**：
- KDJ指标（K/D/J值及解读）
- Ichimoku云图（趋势判断）
- Aroon指标（趋势强度）
- PSAR抛物线

💰 **衍生品完整数据**：
- 资金费率（当前费率+解读）
- 持仓量（数量+参与度评估）
- 清算数据（24h清算笔数、总额、方向）

🔗 **链上数据全景**：
- AkTools：OKX多空比、主动买卖量、Binance AI解读、最新新闻
- Blockchain.com：BTC算力、网络难度、区块高度、出块时间
- Blockchair：24h交易量、区块链大小、流通量

😨 **市场情绪多维度**：
- Alternative.me恐惧贪婪指数
- 技术面恐惧贪婪指数
- 市场情绪分类及解读

📈 **市场微观结构**：
- 订单簿深度：最优买卖价、价差、买卖盘力量对比、流动性评估
- 最近成交：成交方向、成交密集度、大单识别
- K线形态：阴阳线统计、实体比例、形态强度

👥 **社交和基本面**：
- Twitter关注、Reddit订阅、GitHub活跃度
- 币种排名、市值、团队规模、开发状态

---\n## 🎲 指标重要性指导（简化版）

**核心指标重要性排序**（从高到低）：

1. **趋势指标** - 最重要
   - EMA排列状态（9/21/50）
   - ADX趋势强度
   - 多时间框架共振分析

2. **成交量确认** - 次重要
   - 成交量比率
   - OBV能量潮
   - 大单流向分析

3. **动量指标** - 重要
   - RSI(14)超买超卖状态
   - MACD金叉/死叉信号
   - Stochastic位置

4. **衍生品数据** - 参考性
   - 资金费率极端值
   - 持仓量变化趋势
   - 清算数据异常

5. **市场情绪** - 辅助性
   - 恐惧贪婪指数极端值
   - 多空比数据
   - 订单簿买卖力量

**决策指导原则**：
- ✅ **强烈看涨/看跌信号**：趋势指标强烈支持 + 成交量确认 + 动量指标一致
- ✅ **中等信号**：趋势指标支持 + 部分其他指标确认
- ✅ **弱信号或矛盾**：指标分歧较大或关键指标缺失
- ✅ **建议HOLD条件**：趋势指标矛盾、成交量萎缩、关键数据缺失

**简化判断逻辑**：
- 如果趋势指标强烈支持且成交量确认，可以考虑BUY/SELL
- 如果指标分歧较大或关键数据缺失，建议HOLD
- 优先考虑多时间框架共振分析结果
- 避免在极端情绪或异常波动时给出激进信号

---\n## 🕐 多时间框架验证（建议检查）

**时间框架共振原则**：

1. **短期（1小时）** - 当前分析周期
   - 用于识别入场时机
   - 捕捉短期趋势变化

2. **中期（4小时）** - 趋势确认
   - 建议检查：4小时EMA是否与1小时一致？
   - 如果1小时看多但4小时看空 → **降低置信度20%**

3. **长期（日线）** - 大趋势方向
   - 建议检查：日线趋势是上升/下降/震荡？
   - **避免逆大趋势操作**：日线下跌趋势中谨慎做多

**共振检查要求**：
- ✅ 如果1H、4H、1D三个时间框架EMA排列**一致** → 高置信度信号（+20%）
- ⚠️ 如果1H与4H**矛盾** → 中等置信度，建议观望
- ❌ 如果1H与1D**方向相反** → 建议降低置信度30%或给HOLD

**示例判断**：
1H: EMA多头排列 (看涨)
4H: EMA多头排列 (看涨)
1D: EMA空头排列 (看跌)

结论：虽然短期看涨，但日线大趋势向下，建议短线操作，止损需要严格
置信度：原本80%降为60%（-20%逆势惩罚）

---\n**请基于以上ALL 100%数据+权重系统+多时间框架验证给出深度专业分析**：

**请按以下格式返回JSON**:

` + "```json\n" + `{\n  "summary": "综合所有数据的核心结论（1-2句话）",\n  "chainOfThought": "详细深入的思考过程（建议包含以下12个部分，每部分建议引用具体数值，用\\n\\n分隔）：\\n\\n0. 【账户状态评估】（最优先）：\n   - 当前账户状态：空仓还是持仓中？\n   - 如果有持仓：持仓币种、方向（多/空）、入场价、当前盈亏百分比、持仓时长\n   - 可用资金：可用余额占总权益的百分比，是否有足够资金开新仓\n   - 风险状况：保证金率、距离强平价的百分比、当前风险等级\n   - 最近交易表现：胜率、连续盈亏次数、是否处于连续亏损状态\n   - 决策方向：基于账户状态，本次应该考虑【开仓/加仓/止盈/止损/观望】\\n\n1. 【回顾历史】：回顾上次判断的准确性，当时的价格、信号、实际走势对比\n\n2. 【当前价格状态】：当前价格=${marketData.price}，与24h高点${marketData.high24h}和低点${marketData.low24h}的关系，价格在哪个区间\n\n3. 【趋势指标逐一检查】：\n   EMA(9)=${indicators.trend?.ema9}，价格${marketData.price > indicators.trend?.ema9 ? '在上方' : '在下方'}（${((marketData.price - indicators.trend?.ema9) / indicators.trend?.ema9 * 100).toFixed(2)}%）\n   EMA(21)=${indicators.trend?.ema21}，价格${marketData.price > indicators.trend?.ema21 ? '在上方' : '在下方'}\n   EMA(50)=${indicators.trend?.ema50}，价格${marketData.price > indicators.trend?.ema50 ? '在上方' : '在下方'}\n   EMA排列：${indicators.trend?.ema9 > indicators.trend?.ema21 && indicators.trend?.ema21 > indicators.trend?.ema50 ? '多头排列（看涨）' : indicators.trend?.ema9 < indicators.trend?.ema21 && indicators.trend?.ema21 < indicators.trend?.ema50 ? '空头排列（看跌）' : '交叉状态（震荡）'}\n   ADX=${indicators.trend?.adx}，趋势强度${indicators.trend?.adx > 25 ? '强' : '弱'}\n\n4. 【动量指标逐一检查】：\n   RSI(14)=${indicators.momentum?.rsi14}，处于${indicators.momentum?.rsi14 > 70 ? '超买区' : indicators.momentum?.rsi14 < 30 ? '超卖区' : '中性区'}\n   MACD柱状图=${indicators.momentum?.macd?.histogram}，${indicators.momentum?.macd?.histogram > 0 ? '多头' : '空头'}信号\n   MACD是否金叉/死叉\n   Stochastic K=${indicators.momentum?.stochastic?.k}，D=${indicators.momentum?.stochastic?.d}\n\n5. 【支撑阻力位检查】：\n   距离关键支撑位S1=${indicators.supportResistance?.pivotPoints?.s1}的距离\n   距离关键阻力位R1=${indicators.supportResistance?.pivotPoints?.r1}的距离\n   当前在支撑阻力区间的位置\n   是否接近突破或回调关键位\n\n6. 【波动率和风险评估】：\n   布林带位置：价格vs上轨${indicators.volatility?.bollingerBands?.upper}、中轨${indicators.volatility?.bollingerBands?.middle}、下轨${indicators.volatility?.bollingerBands?.lower}\n   ATR=${indicators.volatility?.atr}，波动率状态\n\n7. 【成交量分析】：\n   24h成交量=${marketData.volume24h}，量比=${indicators.volume?.volumeRatio}\n   OBV趋势：${indicators.volume?.obv > 0 ? '上升' : '下降'}\n\n8. 【衍生品和链上数据】：\n   资金费率=${marketData.fundingRate?.rate ? (marketData.fundingRate.rate * 100).toFixed(4) + '%' : 'N/A'}\n   多空比=${marketData.aktools?.okxLongShortRatio || 'N/A'}\n\n9. 【K线形态和市场情绪】：\n   恐惧贪婪指数=${marketData.sentiment?.fearGreedIndex || 'N/A'}\n   近期K线形态特征\n\n10. 【诱多诱空陷阱识别】：\n    是否存在量价背离？\n    是否存在RSI/MACD背离？\n    资金费率是否异常？\n    综合判断：当前是否可能是诱多/诱空陷阱？",
  "decision": {\n    "signal": "BUY|SELL|HOLD",\n    "confidence": 0-100,\n    "entryPrice": "当前价格或建议入场价（HOLD时设为null）",\n    "stopLoss": "止损价格（HOLD时设为null）",\n    "takeProfit": "止盈价格（HOLD时设为null）",\n    "invalidationCondition": "失效条件（如：如果价格跌破4150，策略失效）",\n    "reasoning": "决策核心理由（基于多维度数据分析）",\n    "riskLevel": "LOW|MEDIUM|HIGH",\n    "supportingIndicators": "支持该决策的指标列表（如：EMA多头排列、RSI>50、MACD金叉、资金费率正常、买盘强势）",\n    "opposingIndicators": "反对该决策的指标列表（如：ADX<25趋势弱）",\n    "riskRewardRatio": "风险收益比（如：1:3）",\n    "keyLevels": {\n      "resistance1": "第一阻力位价格",\n      "resistance2": "第二阻力位价格",\n      "support1": "第一支撑位价格",\n      "support2": "第二支撑位价格"\n    }\n  }
}
` + "```" + `

**重要要求（参考nof1.ai量化交易AI思维方式）**：
1. chainOfThought建议包含10个部分的深度分析
2. **每个部分建议引用具体的数值**，格式如：RSI(14)=65.42，EMA(9)=4220.5，价格在上方0.02%
3. **逐个指标检查**：建议不要只说"RSI偏高"，要说"RSI(14)=65.42，处于中性偏强区，距离超买线70还有4.58点"
4. **具体的价位判断**：建议不要只说"接近阻力位"，要说"当前价格4221.45，距离R1阻力位4250还有28.55点（0.67%）"
5. **量化的决策依据**：止损/止盈建议基于具体的技术位（如：止损=布林带下轨-1ATR，止盈=R2阻力位）
6. **失效条件**：建议明确失效价位（如："如果价格跌破4150（EMA50），策略失效"）
7. 思维过程建议至少800字，建议逐项检查所有关键指标
8. 置信度基于整体分析质量，考虑指标一致性、数据完整性和市场环境

**🚨 防骗线机制（建议检查，防止诱多诱空陷阱）**：

**诱多识别（8个建议检查项）**：
1. **量价背离检查**：价格创新高时，成交量是否同步创新高？如果成交量萎缩→警惕诱多
2. **RSI顶背离**：价格高点上升，但RSI高点下降→强烈诱多信号
3. **资金费率陷阱**：如果资金费率>0.1%（多头过热）→警惕诱多
4. **大单流向**：如果主动卖出大单增加，价格反而上涨→诱多
5. **清算密集区**：如果上方密集的多单清算价→主力可能拉升诱多后砸盘
6. **多指标背离确认**：MACD/RSI/OBV是否与价格背离？
7. **订单簿异常**：买盘深度突然减少，卖盘深度增加→诱多信号
8. **时间窗口分析**：上涨是否发生在低流动性时段（如深夜）？

**诱空识别（8个建议检查项）**：
1. **量价背离检查**：价格创新低时，成交量是否同步放大？如果缩量下跌→警惕诱空
2. **RSI底背离**：价格低点下降，但RSI低点上升→强烈诱空信号
3. **资金费率陷阱**：如果资金费率<-0.05%（空头过热）→警惕诱空
4. **大单流向**：如果主动买入大单增加，价格反而下跌→诱空
5. **清算密集区**：如果下方密集的空单清算价→主力可能砸盘诱空后拉升
6. **恐慌极值**：恐惧贪婪指数<25（极度恐慌）→往往是底部信号
7. **支撑位测试**：是否反复测试关键支撑位但不跌破？
8. **空头陷阱**：快速下跌后立即反弹，形成V型反转？

**假突破识别（6个建议检查项）**：
1. **站稳确认**：突破关键位后，是否能站稳3根K线以上？快速回落=假突破
2. **成交量确认**：突破时成交量必须明显放大（至少1.5倍），否则无效
3. **回踩确认**：真突破往往会回踩突破位确认支撑，假突破不会
4. **时间确认**：突破后如果1小时内就跌破，大概率假突破
5. **幅度确认**：突破幅度是否足够（至少2%）？
6. **背离确认**：突破时技术指标是否支持？

**洗盘行为识别（新增）**：
1. **快速震仓**：价格快速下跌后立即反弹，清洗止损单
2. **横盘整理**：长时间横盘后突然突破，清洗耐心不足的持仓者
3. **假跌破**：短暂跌破支撑位后快速收回
4. **假突破**：短暂突破阻力位后快速回落

**主力行为识别（新增）**：
1. **吸筹阶段**：低位震荡，成交量温和放大
2. **拉升阶段**：价格稳步上涨，成交量配合
3. **派发阶段**：高位震荡，成交量萎缩
4. **出货阶段**：价格下跌，成交量放大

**极端情绪反转预警**：
- 恐惧贪婪指数>80（极度贪婪）→警惕顶部，考虑减仓
- 恐惧贪婪指数<20（极度恐惧）→警惕底部，考虑建仓
- 资金费率>0.15%→多头过度拥挤，随时可能暴跌
- 资金费率<-0.1%→空头过度拥挤，随时可能暴力拉升
- 多空比>3→散户过度看多，反转风险高
- 多空比<0.33→散户过度看空，反弹机会大

**建议在chainOfThought第9部分【K线形态和市场情绪】后增加：第10部分【诱多诱空陷阱识别】**，明确说明：
- 是否存在量价背离？
- 是否存在RSI/MACD背离？
- 资金费率是否异常？
- 大单流向是否与价格走势矛盾？
- 是否有假突破风险？
- 是否检测到洗盘行为？
- 主力处于哪个阶段（吸筹/拉升/派发/出货）？
- 综合判断：当前是否可能是诱多/诱空陷阱？

**🔒 决策稳定性机制（防止频繁开单）**：

**1. 信号改变门槛（建议满足以下条件再改变信号）**：
- 如果上次信号是BUY，改为SELL建议：价格跌破止损位 或 至少3个核心指标转空
- 如果上次信号是SELL，改为BUY建议：价格突破止损位 或 至少3个核心指标转多
 - 如果上次信号是HOLD，改为BUY/SELL建议：置信度≥${minConf + 5}% 且 有明确突破信号

**2. 置信度要求（动态）**：
- BUY/SELL信号：置信度建议≥${minConf}%（随激进度调整），否则建议给HOLD
- HOLD信号：当指标矛盾、趋势不明时使用
- 低置信度（<${minConf}%）时，建议观望不要盲目开单

**3. 趋势延续性检查**：
- 如果EMA多头排列（9>21>50），建议不要轻易给SELL信号
- 如果EMA空头排列（9<21<50），建议不要轻易给BUY信号
- 震荡市（EMA交叉）时，建议给HOLD，等待明确方向

**4. 价格变化幅度要求**：
- 如果价格变化<1%，且上次已有信号，建议保持原信号或HOLD
- 只有当价格变化>2% 或 突破关键位时，才建议考虑改变信号

**5. 核心指标一致性**：
- 核心指标（趋势、成交量、动量）建议基本一致才给出交易信号
- 如果核心指标分歧较大，建议HOLD

**6. 时间稳定性要求**：
- 建议信号至少保持2-4小时，除非出现重大市场变化
- 避免在短时间内（<1小时）频繁切换信号
- 如果上次信号正确，建议保持信号方向，除非出现明确反转信号

**7. 多时间框架一致性检查**：
- 如果多时间框架趋势矛盾（如1h看涨但4h看跌），建议HOLD
- 只有当3个以上时间框架一致时才考虑给出明确信号
- 日线趋势方向具有最高权重，避免逆大趋势操作

**8. 历史信号连贯性检查（新增）**：
- **检查历史准确性**：如果历史准确率>70%，建议保持当前分析风格
- **信号延续性**：如果连续3次信号一致且正确，建议保持信号方向
- **避免频繁反转**：如果上次信号正确，不要轻易反转，除非有强烈证据
- **学习历史错误**：如果历史准确率<50%，建议重新审视分析方法

**9. 真实市场变化检测（新增）**：
- **重大事件检查**：是否有重大新闻、政策变化或黑天鹅事件？
- **技术突破确认**：是否出现明确的支撑/阻力位突破？
- **成交量确认**：价格变化是否有成交量配合？
- **多指标共振**：至少3个不同类别的指标是否一致支持信号改变？

**⚠️ 建议执行：宁可错过机会，也不要频繁开单造成过度交易！**

**信号切换必须满足以下条件之一**：
✅ **条件1**：价格突破关键位（支撑/阻力）+ 成交量放大 + 多指标确认
✅ **条件2**：出现重大市场事件 + 技术指标强烈支持
✅ **条件3**：历史信号连续错误 + 当前分析有明确改进依据

**禁止信号切换的情况**：
❌ **禁止1**：价格波动<1%且无重大变化
❌ **禁止2**：指标轻微变化但无明确趋势反转
❌ **禁止3**：历史信号正确但当前分析信心不足
❌ **禁止4**：多时间框架趋势矛盾

**在decision部分建议增加字段**：
- "signalChangeReason": "如果信号与上次不同，建议明确说明改变的原因和依据"
- "coreIndicatorsAlignment": "核心指标一致性评分（X/5个指标支持）"
- "timeframeConsistency": "多时间框架一致性评估（X/6个周期一致）"
- "historicalConsistency": "历史信号一致性评估（连续X次信号一致）"
- "realMarketChange": "是否检测到真实市场变化（是/否）"
`;
}

/**
 * 主入口函数，根据模式选择对应的规则
 */
function getTradingRules(marketData, indicators, minConf, posBand, mode = 'complete') {
  switch (mode) {
    case 'narrative':
      return getNarrativeRules();
    case 'minimal':
      return getMinimalRules();
    case 'fast':
      return getFastRules();
    case 'complete':
default:
      return getCompleteRules(marketData, indicators, minConf, posBand);
  }
}

module.exports = { getTradingRules };
