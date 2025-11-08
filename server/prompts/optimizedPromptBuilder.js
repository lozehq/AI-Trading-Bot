/**
 * 优化的提示词构建器 - 保持数据完整性，简化结构
 */

const { OPTIMIZED_CORE_INSTRUCTIONS } = require('./modules/optimizedCoreInstructions');
const { OPTIMIZED_DATA_SOURCES_DESCRIPTION } = require('./modules/optimizedDataSourcesDescription');

/**
 * 构建优化的完整版提示词
 * @param {Object} options - 配置选项
 * @returns {string} 组装后的提示词
 */
function buildOptimizedFullPrompt(options = {}) {
  const {
    includeMultiTimeframe = true,
    includeDetailedFormat = true
  } = options;

  const sections = [
    OPTIMIZED_CORE_INSTRUCTIONS,
    OPTIMIZED_DATA_SOURCES_DESCRIPTION
  ];

  return sections.join('\n\n');
}

/**
 * 构建优化的简化版提示词
 * @returns {string} 简化版提示词
 */
function buildOptimizedSimplePrompt() {
  return `你是一个专业的加密货币交易分析师。

## 📊 你的任务
基于系统为你收集的实时市场数据和技术指标，给出专业的交易建议。

## 📝 数据说明
系统已为你收集以下数据（如果某项数据缺失，会在数据中标注）：
- 实时价格和K线数据
- 技术指标（RSI、MACD、布林带、KDJ、威廉指标等）
- 市场情绪和币种详情
- 订单簿和交易记录
- 新闻资讯和市场动态

⚠️ **重要**：如果某项关键数据缺失或标记为失败，请在分析中明确说明这对你的判断有何影响。

## 🎯 必须返回的JSON格式（请严格按字段名返回）
\`\`\`json
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": 0-100,
  "entryPrice": number,
  "stopLoss": number,
  "takeProfit": number,
  "reasoning": "详细分析理由（如有数据缺失，请说明影响）",
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "keyPoints": ["关键要点1", "关键要点2", "关键要点3"],
  "dataQuality": "EXCELLENT" | "GOOD" | "PARTIAL" | "POOR",
  "usedIndicators": ["实际使用的指标名称列表，如 RSI(14), MACD(12/26/9), BB(20,2)"]
}
\`\`\`

## 📋 分析要点
1. **技术面分析**：综合多个技术指标（RSI、MACD、布林带、KDJ等）
2. **趋势判断**：评估市场趋势和动能
3. **风险管理**：设置合理的止损止盈位
4. **数据质量评估**：根据可用数据的完整性，在 dataQuality 字段中标注
5. **明确建议**：给出清晰的交易建议和风险提示
6. **指明依据**：在 usedIndicators 中列出你在本次判断中实际使用到的关键指标（含参数）

## 📊 置信度指南
- **80-100%**：所有关键数据完整，多个指标一致，趋势明确
- **60-79%**：大部分数据完整，指标基本一致
- **40-59%**：部分数据缺失，指标有分歧
- **0-39%**：关键数据缺失，市场不明朗，建议HOLD

## ⚡ 重要原则
1. **数据驱动**：基于实际数据而非假设
2. **质量优先**：数据质量差时降低置信度
3. **风险管理**：必须设置止损止盈位
4. **透明度**：清晰说明分析依据
5. **保守原则**：不确定时选择HOLD`;
}

/**
 * 根据数据可用性智能选择提示词
 * @param {Object} dataAvailability - 数据可用性信息
 * @returns {string} 智能选择的提示词
 */
function buildOptimizedSmartPrompt(dataAvailability = {}) {
  const {
    hasMultiTimeframe = false,
    mode = 'complete'
  } = dataAvailability;

  // 快速模式：使用简化版提示词
  if (mode === 'fast') {
    return buildOptimizedSimplePrompt();
  }

  // 完整模式：使用完整版提示词
  return buildOptimizedFullPrompt({
    includeMultiTimeframe: hasMultiTimeframe,
    includeDetailedFormat: true
  });
}

/**
 * 获取提示词统计信息
 * @param {string} prompt - 提示词内容
 * @returns {Object} 统计信息
 */
function getOptimizedPromptStats(prompt) {
  const lines = prompt.split('\n').length;
  const chars = prompt.length;
  const words = prompt.split(/\s+/).length;
  const estimatedTokens = Math.ceil(chars / 4); // 粗略估算

  return {
    lines,
    chars,
    words,
    estimatedTokens
  };
}

/**
 * 验证提示词是否包含必要的模块
 * @param {string} prompt - 提示词内容
 * @returns {Object} 验证结果
 */
function validateOptimizedPrompt(prompt) {
  const checks = {
    hasCoreInstructions: prompt.includes('你是一个专业的加密货币交易分析师'),
    hasDataSources: prompt.includes('系统已为你收集的数据'),
    hasResponseFormat: prompt.includes('必须返回的JSON格式'),
    hasDecisionRules: prompt.includes('信号生成条件')
  };

  const allPassed = Object.values(checks).every(v => v);

  return {
    checks,
    allPassed,
    missingModules: Object.keys(checks).filter(k => !checks[k])
  };
}

module.exports = {
  buildOptimizedFullPrompt,
  buildOptimizedSimplePrompt,
  buildOptimizedSmartPrompt,
  getOptimizedPromptStats,
  validateOptimizedPrompt,
  
  // 导出原始模块供直接使用
  modules: {
    OPTIMIZED_CORE_INSTRUCTIONS,
    OPTIMIZED_DATA_SOURCES_DESCRIPTION
  }
};