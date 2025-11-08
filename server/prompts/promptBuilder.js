/**
 * 模块化提示词构建器
 * 根据数据可用性动态组装提示词
 */

const { CORE_INSTRUCTIONS } = require('./modules/coreInstructions');
const { DATA_SOURCES_DESCRIPTION } = require('./modules/dataSourcesDescription');
const { MULTI_TIMEFRAME_RULES } = require('./modules/multiTimeframeRules');
const { INDICATOR_WEIGHTS } = require('./modules/indicatorWeights');
const { RESPONSE_FORMAT } = require('./modules/responseFormat');
const { SIMPLE_PROMPT } = require('./modules/simplePrompt');
const { DATA_QUALITY_HANDLING } = require('./modules/dataQualityHandling'); // 🆕 数据质量处理模块
const { CONFIDENCE_CALCULATION } = require('./modules/confidenceCalculation'); // 🆕 置信度计算指导模块
const { RISK_CONSTRAINTS } = require('./modules/riskConstraints'); // 🆕 风险约束规则模块
const { ALERT_STRATEGIES } = require('./modules/alertStrategies'); // 🆕 智能预警策略模块

/**
 * 构建完整版提示词
 * @param {Object} options - 配置选项
 * @param {boolean} options.includeMultiTimeframe - 是否包含多时间框架规则
 * @param {boolean} options.includeWeights - 是否包含指标权重系统
 * @param {boolean} options.includeDetailedFormat - 是否包含详细的响应格式
 * @param {boolean} options.includeDataQuality - 是否包含数据质量处理指导
 * @param {boolean} options.includeConfidenceCalc - 是否包含置信度计算指导
 * @param {boolean} options.includeRiskConstraints - 是否包含风险约束规则
 * @param {boolean} options.includeAlertStrategies - 是否包含智能预警策略
 * @returns {string} 组装后的提示词
 */
function buildFullPrompt(options = {}) {
  const {
    includeMultiTimeframe = true,
    includeWeights = true,
    includeDetailedFormat = true,
    includeDataQuality = true, // 🆕 默认包含数据质量处理
    includeConfidenceCalc = true, // 🆕 默认包含置信度计算指导
    includeRiskConstraints = true, // 🆕 默认包含风险约束规则
    includeAlertStrategies = true // 🆕 默认包含智能预警策略
  } = options;

  const sections = [
    CORE_INSTRUCTIONS,
    DATA_SOURCES_DESCRIPTION
  ];

  if (includeMultiTimeframe) {
    sections.push(MULTI_TIMEFRAME_RULES);
  }

  if (includeWeights) {
    sections.push(INDICATOR_WEIGHTS);
  }

  // 🆕 添加置信度计算指导（在数据质量之前，因为需要先了解如何计算）
  if (includeConfidenceCalc) {
    sections.push(CONFIDENCE_CALCULATION);
  }

  // 🆕 添加数据质量处理指导
  if (includeDataQuality) {
    sections.push(DATA_QUALITY_HANDLING);
  }

  // 🆕 添加风险约束规则（在响应格式之前，确保AI了解约束）
  if (includeRiskConstraints) {
    sections.push(RISK_CONSTRAINTS);
  }

  // 🆕 添加智能预警策略（在响应格式之前）
  if (includeAlertStrategies) {
    sections.push(ALERT_STRATEGIES);
  }

  if (includeDetailedFormat) {
    sections.push(RESPONSE_FORMAT);
  }

  return sections.join('\n\n');
}

/**
 * 构建简化版提示词
 * @returns {string} 简化版提示词
 */
function buildSimplePrompt() {
  return SIMPLE_PROMPT;
}

/**
 * 根据数据可用性智能选择提示词
 * @param {Object} dataAvailability - 数据可用性信息
 * @param {boolean} dataAvailability.hasMultiTimeframe - 是否有多时间框架数据
 * @param {boolean} dataAvailability.hasDerivatives - 是否有衍生品数据
 * @param {boolean} dataAvailability.hasSentiment - 是否有市场情绪数据
 * @param {string} dataAvailability.mode - 模式：'fast' | 'complete'
 * @returns {string} 智能选择的提示词
 */
function buildSmartPrompt(dataAvailability = {}) {
  const {
    hasMultiTimeframe = false,
    hasDerivatives = false,
    hasSentiment = false,
    mode = 'complete'
  } = dataAvailability;

  // 快速模式：使用简化版提示词
  if (mode === 'fast') {
    return buildSimplePrompt();
  }

  // 完整模式：根据数据可用性动态调整
  const options = {
    includeMultiTimeframe: hasMultiTimeframe,
    includeWeights: true, // 权重系统始终包含
    includeDetailedFormat: true // 详细格式始终包含
  };

  return buildFullPrompt(options);
}

/**
 * 获取提示词统计信息
 * @param {string} prompt - 提示词内容
 * @returns {Object} 统计信息
 */
function getPromptStats(prompt) {
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
function validatePrompt(prompt) {
  const checks = {
    hasCoreInstructions: prompt.includes('你是一个专业的加密货币交易分析师'),
    hasDataSources: prompt.includes('系统已为你收集的数据'),
    hasMultiTimeframe: prompt.includes('多时间框架验证'),
    hasWeights: prompt.includes('指标权重系统'),
    hasResponseFormat: prompt.includes('必须返回的JSON格式')
  };

  const allPassed = Object.values(checks).every(v => v);

  return {
    checks,
    allPassed,
    missingModules: Object.keys(checks).filter(k => !checks[k])
  };
}

module.exports = {
  buildFullPrompt,
  buildSimplePrompt,
  buildSmartPrompt,
  getPromptStats,
  validatePrompt,
  
  // 导出原始模块供直接使用
  modules: {
    CORE_INSTRUCTIONS,
    DATA_SOURCES_DESCRIPTION,
    MULTI_TIMEFRAME_RULES,
    INDICATOR_WEIGHTS,
    RESPONSE_FORMAT,
    SIMPLE_PROMPT,
    DATA_QUALITY_HANDLING, // 🆕 导出数据质量处理模块
    CONFIDENCE_CALCULATION, // 🆕 导出置信度计算指导模块
    RISK_CONSTRAINTS, // 🆕 导出风险约束规则模块
    ALERT_STRATEGIES // 🆕 导出智能预警策略模块
  }
};

