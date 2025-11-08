/**
 * AI决策验证层
 * 确保AI决策符合交易规则，防止错误信号
 */

const getNumberFromEnv = (key, fallback) => {
  const raw = process.env?.[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getListFromEnv = (key, fallback = []) => {
  const raw = process.env?.[key];
  if (!raw) return fallback;
  const list = raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.toUpperCase());
  return list.length > 0 ? list : fallback;
};

class AIDecisionValidator {
  constructor() {
    const minConfidenceSoft = getNumberFromEnv('AI_VALIDATION_MIN_CONFIDENCE_SOFT', 55);
    const minConfidenceHard = getNumberFromEnv(
      'AI_VALIDATION_MIN_CONFIDENCE_HARD',
      Math.max(minConfidenceSoft - 10, 40)
    );
    const minTimeframes = getNumberFromEnv('AI_VALIDATION_MIN_TIMEFRAMES', 2);
    const recommendedTimeframes = getNumberFromEnv('AI_VALIDATION_RECOMMENDED_TIMEFRAMES', 3);
    const cautionRiskLevels = getListFromEnv('AI_VALIDATION_CAUTION_RISK_LEVELS', ['HIGH']);
    const forceHoldRiskLevels = getListFromEnv('AI_VALIDATION_FORCE_HOLD_RISK_LEVELS', ['EXTREME']);

    this.validationRules = {
      // 信号验证规则
      signal: ['BUY', 'SELL', 'HOLD'],
      
      // 置信度范围
      confidenceRange: { min: 0, max: 100 },
      
      // 风险等级
      riskLevels: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'],
      
      // 多时间框架共振要求
      minTimeframesForBuy: minTimeframes,
      minTimeframesForSell: minTimeframes,
      recommendedTimeframesForBuy: Math.max(recommendedTimeframes, minTimeframes),
      recommendedTimeframesForSell: Math.max(recommendedTimeframes, minTimeframes),
      
      // 置信度阈值
      minConfidenceForTrade: minConfidenceSoft,
      absoluteMinConfidence: Math.min(minConfidenceHard, minConfidenceSoft),
      
      // 风险等级处理
      cautionRiskLevels,
      forceHoldRiskLevels,
      
      // 止损止盈验证
      minStopLossPercent: 1,   // 最小止损1%
      maxStopLossPercent: 10,  // 最大止损10%
      minTakeProfitPercent: 1.5, // 最小止盈1.5%
      minRiskRewardRatio: 1.5  // 最小风险回报比1.5:1
    };
  }

  /**
   * 验证AI决策
   * @param {Object} analysis - AI分析结果
   * @param {Object} marketData - 市场数据
   * @param {Object} indicators - 技术指标
   * @returns {Object} 验证结果
   */
  validate(analysis, marketData, indicators) {
    console.log('🔍 开始AI决策验证...');
    
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: [],
      corrections: [],
      originalDecision: { ...analysis.decision },
      validatedDecision: null
    };

    try {
      // 1. 基础字段验证
      this.validateBasicFields(analysis, validationResults);
      
      // 2. 信号合理性验证
      this.validateSignalLogic(analysis, marketData, indicators, validationResults);
      
      // 3. 多时间框架一致性验证
      this.validateTimeframeConsistency(analysis, validationResults);
      
      // 4. 止损止盈验证
      this.validateStopLossTakeProfit(analysis, marketData, validationResults);
      
      // 5. 风险管理验证
      this.validateRiskManagement(analysis, validationResults);
      
      // 6. 应用修正
      validationResults.validatedDecision = this.applyCorrections(
        analysis.decision,
        validationResults
      );
      
      // 7. 生成验证报告
      this.generateValidationReport(validationResults);
      
    } catch (error) {
      console.error('❌ AI决策验证失败:', error);
      validationResults.isValid = false;
      validationResults.errors.push(`验证过程出错: ${error.message}`);
    }

    return validationResults;
  }

  /**
   * 1. 基础字段验证
   */
  validateBasicFields(analysis, results) {
    const { decision } = analysis;

    // 验证信号字段
    if (!decision || !decision.signal) {
      results.errors.push('缺少决策信号');
      results.isValid = false;
      return;
    }

    // 规范化信号为大写（兼容AI返回的小写格式）
    decision.signal = decision.signal.toUpperCase();

    // 验证信号值
    if (!this.validationRules.signal.includes(decision.signal)) {
      results.errors.push(`无效的信号: ${decision.signal}`);
      results.isValid = false;
    }

    // 规范化风险等级为大写（如果存在）
    if (decision.riskLevel && typeof decision.riskLevel === 'string') {
      decision.riskLevel = decision.riskLevel.toUpperCase();
    }

    // 验证置信度
    if (typeof decision.confidence !== 'number') {
      results.errors.push('置信度必须是数字');
      results.isValid = false;
    } else if (
      decision.confidence < this.validationRules.confidenceRange.min ||
      decision.confidence > this.validationRules.confidenceRange.max
    ) {
      results.errors.push(
        `置信度超出范围: ${decision.confidence} (应在0-100之间)`
      );
      results.isValid = false;
    }

    // 验证风险等级
    if (decision.riskLevel && !this.validationRules.riskLevels.includes(decision.riskLevel)) {
      results.warnings.push(`无效的风险等级: ${decision.riskLevel}，将使用MEDIUM`);
      results.corrections.push({
        field: 'riskLevel',
        from: decision.riskLevel,
        to: 'MEDIUM',
        reason: '无效的风险等级'
      });
    }
  }

  /**
   * 2. 信号合理性验证
   */
  validateSignalLogic(analysis, marketData, indicators, results) {
    const { decision } = analysis;
    const signal = decision.signal;
    
    // HOLD信号不需要验证
    if (signal === 'HOLD') {
      return;
    }
    
    // 验证置信度阈值
    if (decision.confidence < this.validationRules.minConfidenceForTrade) {
      results.warnings.push(
        `${signal}信号置信度偏低: ${decision.confidence}% (建议≥${this.validationRules.minConfidenceForTrade}%)`
      );

      if (decision.confidence < this.validationRules.absoluteMinConfidence) {
      results.corrections.push({
        field: 'signal',
        from: signal,
        to: 'HOLD',
          reason: `置信度${decision.confidence}%低于安全阈值${this.validationRules.absoluteMinConfidence}%`
      });
      }
    }
    
    // 验证技术指标支持
    if (indicators) {
      this.validateIndicatorSupport(signal, indicators, results);
    }
  }

  /**
   * 验证技术指标支持
   */
  validateIndicatorSupport(signal, indicators, results) {
    const supportCount = {
      bullish: 0,
      bearish: 0,
      neutral: 0
    };
    
    // RSI验证
    if (indicators.rsi) {
      if (indicators.rsi < 30) supportCount.bullish++;
      else if (indicators.rsi > 70) supportCount.bearish++;
      else supportCount.neutral++;
    }
    
    // MACD验证
    if (indicators.macd && indicators.macdSignal) {
      if (indicators.macd > indicators.macdSignal) supportCount.bullish++;
      else if (indicators.macd < indicators.macdSignal) supportCount.bearish++;
    }
    
    // 布林带验证
    if (indicators.bb_lower && indicators.bb_upper) {
      const price = indicators.close || 0;
      if (price < indicators.bb_lower) supportCount.bullish++;
      else if (price > indicators.bb_upper) supportCount.bearish++;
      else supportCount.neutral++;
    }
    
    // 验证信号与指标一致性
    if (signal === 'BUY' && supportCount.bearish > supportCount.bullish) {
      results.warnings.push(
        `BUY信号与技术指标不一致: ${supportCount.bearish}个看跌指标 vs ${supportCount.bullish}个看涨指标`
      );
    } else if (signal === 'SELL' && supportCount.bullish > supportCount.bearish) {
      results.warnings.push(
        `SELL信号与技术指标不一致: ${supportCount.bullish}个看涨指标 vs ${supportCount.bearish}个看跌指标`
      );
    }
  }

  /**
   * 3. 多时间框架一致性验证
   */
  validateTimeframeConsistency(analysis, results) {
    const { decision } = analysis;
    const signal = decision.signal;
    
    // HOLD信号不需要验证
    if (signal === 'HOLD') {
      return;
    }
    
    // 检查多时间框架分析
    const mtfAnalysis = analysis.multiTimeframeAnalysis;
    if (!mtfAnalysis || !mtfAnalysis.timeframes) {
      results.warnings.push('缺少多时间框架分析数据');
      return;
    }
    
    // 统计支持的时间框架数量
    const timeframes = mtfAnalysis.timeframes;
    const supportingTimeframes = Object.entries(timeframes).filter(([tf, data]) => {
      if (!data || data.status === 'failed') return false;

      // 归一化趋势值为大写，兼容AI返回的小写格式
      const trend = (data.trend || '').toUpperCase();

      // 支持 BUY 信号的趋势
      if (signal === 'BUY' && (trend === 'BULLISH' || trend === 'STRONG_BULLISH')) return true;

      // 支持 SELL 信号的趋势
      if (signal === 'SELL' && (trend === 'BEARISH' || trend === 'STRONG_BEARISH')) return true;

      return false;
    });
    
    const supportCount = supportingTimeframes.length;
    const minRequired = signal === 'BUY' 
      ? this.validationRules.minTimeframesForBuy 
      : this.validationRules.minTimeframesForSell;
    const recommended = signal === 'BUY'
      ? this.validationRules.recommendedTimeframesForBuy
      : this.validationRules.recommendedTimeframesForSell;
    
    if (supportCount < minRequired) {
      results.warnings.push(
        `${signal}信号缺乏多时间框架支持: 仅${supportCount}/${minRequired} 个关键周期` 
      );

      if (supportCount === 0) {
      results.corrections.push({
        field: 'signal',
        from: signal,
        to: 'HOLD',
          reason: '缺少任何与信号方向一致的时间框架支持'
      });
      }
    } else if (supportCount < recommended) {
      results.warnings.push(
        `${signal}信号的多时间框架共振不足: ${supportCount}/${recommended} (建议≥${recommended})`
      );
    }
  }

  /**
   * 4. 止损止盈验证
   */
  validateStopLossTakeProfit(analysis, marketData, results) {
    const { decision } = analysis;
    const signal = decision.signal;
    
    // HOLD信号不需要止损止盈
    if (signal === 'HOLD') {
      return;
    }
    
    const entryPrice = decision.entryPrice || marketData.price || marketData.ticker?.last || 0;
    const stopLoss = decision.stopLoss;
    const takeProfit = decision.takeProfit;
    
    if (!entryPrice || entryPrice <= 0) {
      results.errors.push('入场价格无效');
      results.isValid = false;
      return;
    }
    
    // 验证止损
    if (!stopLoss || stopLoss <= 0) {
      results.warnings.push('缺少止损价格');
    } else {
      const stopLossPercent = Math.abs((stopLoss - entryPrice) / entryPrice * 100);
      
      if (stopLossPercent < this.validationRules.minStopLossPercent) {
        results.warnings.push(`止损过小: ${stopLossPercent.toFixed(2)}% (最低${this.validationRules.minStopLossPercent}%)`);
      } else if (stopLossPercent > this.validationRules.maxStopLossPercent) {
        results.warnings.push(`止损过大: ${stopLossPercent.toFixed(2)}% (最高${this.validationRules.maxStopLossPercent}%)`);
      }
      
      // 验证止损方向
      if (signal === 'BUY' && stopLoss >= entryPrice) {
        results.errors.push(`BUY信号的止损价格应低于入场价: 止损${stopLoss} >= 入场${entryPrice}`);
        results.isValid = false;
      } else if (signal === 'SELL' && stopLoss <= entryPrice) {
        results.errors.push(`SELL信号的止损价格应高于入场价: 止损${stopLoss} <= 入场${entryPrice}`);
        results.isValid = false;
      }
    }
    
    // 验证止盈
    if (!takeProfit || takeProfit <= 0) {
      results.warnings.push('缺少止盈价格');
    } else {
      const takeProfitPercent = Math.abs((takeProfit - entryPrice) / entryPrice * 100);
      
      if (takeProfitPercent < this.validationRules.minTakeProfitPercent) {
        results.warnings.push(`止盈过小: ${takeProfitPercent.toFixed(2)}% (最低${this.validationRules.minTakeProfitPercent}%)`);
      }
      
      // 验证止盈方向
      if (signal === 'BUY' && takeProfit <= entryPrice) {
        results.errors.push(`BUY信号的止盈价格应高于入场价: 止盈${takeProfit} <= 入场${entryPrice}`);
        results.isValid = false;
      } else if (signal === 'SELL' && takeProfit >= entryPrice) {
        results.errors.push(`SELL信号的止盈价格应低于入场价: 止盈${takeProfit} >= 入场${entryPrice}`);
        results.isValid = false;
      }
    }
    
    // 验证风险回报比
    if (stopLoss && takeProfit) {
      const risk = Math.abs(entryPrice - stopLoss);
      const reward = Math.abs(takeProfit - entryPrice);
      const riskRewardRatio = reward / risk;
      
      if (riskRewardRatio < this.validationRules.minRiskRewardRatio) {
        results.warnings.push(
          `风险回报比过低: ${riskRewardRatio.toFixed(2)}:1 (最低${this.validationRules.minRiskRewardRatio}:1)`
        );
      }
    }
  }

  /**
   * 5. 风险管理验证
   */
  validateRiskManagement(analysis, results) {
    const { decision } = analysis;
    
    // 高风险信号验证
    if (!decision.riskLevel) {
      return;
    }

    if (this.validationRules.cautionRiskLevels.includes(decision.riskLevel)) {
      results.warnings.push(
        `风险等级为${decision.riskLevel}，执行${decision.signal}需谨慎` 
      );
    }

    if (this.validationRules.forceHoldRiskLevels.includes(decision.riskLevel)) {
      if (decision.signal !== 'HOLD') {
        results.corrections.push({
          field: 'signal',
          from: decision.signal,
          to: 'HOLD',
          reason: `风险等级${decision.riskLevel}触发强制观望`
        });
      }
    }
  }

  /**
   * 6. 应用修正
   */
  applyCorrections(originalDecision, results) {
    let correctedDecision = { ...originalDecision };
    
    // 如果有严重错误，强制HOLD
    if (!results.isValid) {
      console.warn('⚠️ 发现严重错误，强制修正为HOLD');
      correctedDecision.signal = 'HOLD';
      correctedDecision.confidence = 0;
      correctedDecision.reasoning = `验证失败: ${results.errors.join('; ')}`;
      return correctedDecision;
    }
    
    // 应用所有修正
    results.corrections.forEach(correction => {
      console.warn(`⚠️ 应用修正: ${correction.field} ${correction.from} → ${correction.to} (${correction.reason})`);
      correctedDecision[correction.field] = correction.to;
      
      // 如果修正为HOLD，降低置信度
      if (correction.field === 'signal' && correction.to === 'HOLD') {
        correctedDecision.confidence = Math.min(correctedDecision.confidence, 50);
        correctedDecision.reasoning = `${correctedDecision.reasoning || ''}\n⚠️ 验证修正: ${correction.reason}`;
      }
    });
    
    return correctedDecision;
  }

  /**
   * 7. 生成验证报告
   */
  generateValidationReport(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 AI决策验证报告');
    console.log('='.repeat(60));
    
    console.log(`\n验证结果: ${results.isValid ? '✅ 通过' : '❌ 失败'}`);
    
    if (results.errors.length > 0) {
      console.log(`\n❌ 错误 (${results.errors.length}):`);
      results.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error}`);
      });
    }
    
    if (results.warnings.length > 0) {
      console.log(`\n⚠️  警告 (${results.warnings.length}):`);
      results.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning}`);
      });
    }
    
    if (results.corrections.length > 0) {
      console.log(`\n🔧 修正 (${results.corrections.length}):`);
      results.corrections.forEach((correction, i) => {
        console.log(`   ${i + 1}. ${correction.field}: ${correction.from} → ${correction.to}`);
        console.log(`      原因: ${correction.reason}`);
      });
    }
    
    console.log(`\n原始决策: ${results.originalDecision.signal} (置信度: ${results.originalDecision.confidence}%)`);
    console.log(`验证后决策: ${results.validatedDecision.signal} (置信度: ${results.validatedDecision.confidence}%)`);
    
    console.log('='.repeat(60) + '\n');
  }
}

module.exports = new AIDecisionValidator();

