/**
 * 优化的AI交易系统提示词
 * 使用优化的模块化架构，保持数据完整性同时简化结构
 */

const { buildOptimizedFullPrompt, buildOptimizedSimplePrompt, buildOptimizedSmartPrompt } = require('./optimizedPromptBuilder');

// 简化版提示词（用于快速响应）
const OPTIMIZED_TRADING_SYSTEM_PROMPT_SIMPLE = buildOptimizedSimplePrompt();

// 完整版提示词（用于深度分析）- 优化后的版本
const OPTIMIZED_TRADING_SYSTEM_PROMPT = buildOptimizedFullPrompt({
  includeMultiTimeframe: true,
  includeDetailedFormat: true
});

// 智能提示词构建器（根据数据可用性动态选择）
const buildOptimizedPrompt = buildOptimizedSmartPrompt;

module.exports = {
  OPTIMIZED_TRADING_SYSTEM_PROMPT,
  OPTIMIZED_TRADING_SYSTEM_PROMPT_SIMPLE,
  buildOptimizedPrompt,

  // 导出构建器供高级使用
  buildOptimizedFullPrompt,
  buildOptimizedSimplePrompt,
  buildOptimizedSmartPrompt
};