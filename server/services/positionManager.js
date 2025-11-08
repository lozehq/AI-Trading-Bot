/**
 * 智能仓位管理系统
 * 基于风险和置信度动态计算建议仓位大小
 */

class PositionManager {
  constructor() {
    // 仓位管理参数
    this.params = {
      maxPositionSize: 100,      // 最大仓位百分比
      minPositionSize: 5,        // 最小仓位百分比
      basePositionSize: 20,      // 基础仓位百分比

      // 风险等级对应的仓位系数
      riskMultipliers: {
        'LOW': 1.5,              // 低风险：增加50%
        'MEDIUM': 1.0,           // 中等风险：保持基础
        'HIGH': 0.5,             // 高风险：减少50%
        'EXTREME': 0.2           // 极高风险：减少80%
      },

      // 置信度阈值
      confidenceThresholds: {
        veryHigh: 80,            // 非常高置信度
        high: 70,                // 高置信度
        medium: 60,              // 中等置信度
        low: 50                  // 低置信度
      }
    };
  }

  /**
   * 计算建议仓位大小
   * @param {Object} decision - AI决策对象
   * @param {Object} marketData - 市场数据
   * @param {Object} options - 额外选项
   * @returns {Object} 仓位建议
   */
  calculatePosition(decision, marketData, options = {}) {
    const result = {
      recommendedSize: 0,       // 建议仓位百分比
      maxSize: 0,               // 最大允许仓位
      reasoning: [],            // 决策理由
      warnings: [],             // 警告信息
      adjustments: [],          // 调整记录
      baseSize: 0,              // 基础仓位（新增：便于前端展示 Base→Final）
      limitedApplied: false,    // 是否因最小/最大限制被截断
      hardGateHoldApplied: false // 反趋势强共振硬门槛（直接HOLD）
    };

    // 1. 检查信号类型
    if (decision.signal === 'HOLD') {
      result.recommendedSize = 0;
      result.reasoning.push('信号为HOLD，建议不开仓');
      return result;
    }

    // 2. 基于置信度计算基础仓位
    const baseSize = this.calculateBaseSizeByConfidence(decision.confidence);
    result.baseSize = baseSize;
    result.recommendedSize = baseSize;
    result.reasoning.push(`基于置信度${decision.confidence}%，基础仓位${baseSize}%`);

    // 3. 基于风险等级调整
    const riskAdjustment = this.adjustByRiskLevel(result.recommendedSize, decision.riskLevel);
    result.recommendedSize = riskAdjustment.size;
    result.adjustments.push(riskAdjustment);
    result.reasoning.push(riskAdjustment.reason);

    // 4. 基于多时间框架共振调整
    if (marketData.multiTimeframe) {
      const resonanceAdjustment = this.adjustByResonance(
        result.recommendedSize,
        marketData.multiTimeframe.resonance
      );
      result.recommendedSize = resonanceAdjustment.size;
      result.adjustments.push(resonanceAdjustment);
      result.reasoning.push(resonanceAdjustment.reason);
    }

    // 5. 基于背离信号调整
    if (marketData.divergence && marketData.divergence.hasDivergence) {
      const divergenceAdjustment = this.adjustByDivergence(
        result.recommendedSize,
        marketData.divergence,
        decision.signal
      );
      result.recommendedSize = divergenceAdjustment.size;
      result.adjustments.push(divergenceAdjustment);
      result.reasoning.push(divergenceAdjustment.reason);
    }
    // 6. 基于 Regime 调整（含反趋势硬门槛）
    const regime = options && options.regime ? options.regime : null;
    if (regime && regime.name) {
      // 反趋势强共振硬门槛：直接 HOLD（跳过最小仓位限制）
      try {
        const name = String(regime.name || '').toUpperCase();
        const dir = String(regime.direction || 'NEUTRAL').toUpperCase();
        const rawConf = typeof regime.confidence === 'number' ? regime.confidence : null;
        const confPct = rawConf != null ? (rawConf <= 1 ? rawConf * 100 : rawConf) : null;
        const thrHardRaw = process.env.ANTI_TREND_HARD_GATE_PCT ?? process.env.ANTI_TREND_HARD_GATE ?? '85';
        let thrHardPct = Number(thrHardRaw);
        if (!Number.isFinite(thrHardPct)) thrHardPct = 85;
        if (thrHardPct <= 1) thrHardPct = thrHardPct * 100;

        const antiTrend =
          name === 'TREND' &&
          ((decision.signal === 'BUY' && dir === 'BEAR') || (decision.signal === 'SELL' && dir === 'BULL'));

        if (antiTrend && confPct != null && confPct >= thrHardPct) {
          const reason = `反趋势强共振(置信${Math.round(confPct)}%)，硬门槛：建议HOLD`;
          result.adjustments.push({ factor: 'trend_hard_gate', multiplier: 0, reason });
          result.reasoning.push(reason);
          result.warnings.push('趋势反向且高置信，触发硬门槛');
          result.recommendedSize = 0;
          result.hardGateHoldApplied = true;
          // 直接设置最大仓位并返回（跳过后续所有调整与限制）
          result.maxSize = 0;
          result.recommendedSize = Math.round(result.recommendedSize);
          result.maxSize = Math.round(result.maxSize);
          return result;
        }
      } catch (_) {}

      // 正常的 Regime 乘数调整
      const regimeAdjustment = this.adjustByRegime(
        result.recommendedSize,
        regime,
        decision.signal
      );
      result.recommendedSize = regimeAdjustment.size;
      result.adjustments.push(regimeAdjustment);
      result.reasoning.push(regimeAdjustment.reason);
    }


    // 6. 基于市场波动率调整
    if (marketData.indicators && marketData.indicators.atr) {
      const volatilityAdjustment = this.adjustByVolatility(
        result.recommendedSize,
        marketData.indicators.atr,
        marketData.price
      );
      result.recommendedSize = volatilityAdjustment.size;
      result.adjustments.push(volatilityAdjustment);
      result.reasoning.push(volatilityAdjustment.reason);
    }

    // 7.1 基于数据质量调整
    const dq = options && options.dataQuality ? options.dataQuality : null;
    if (dq) {
      const dqAdjustment = this.adjustByDataQuality(result.recommendedSize, dq);
      result.recommendedSize = dqAdjustment.size;
      result.adjustments.push(dqAdjustment);
      result.reasoning.push(dqAdjustment.reason);
    }

    // 7.2 风险上下文调整（预留）
    const rctx = options && options.riskContext ? options.riskContext : null;
    if (rctx) {
      const rcAdjustment = this.adjustByRiskContext(result.recommendedSize, rctx);
      result.recommendedSize = rcAdjustment.size;
      result.adjustments.push(rcAdjustment);
      result.reasoning.push(rcAdjustment.reason);
    }

    // 7. 应用最小/最大限制（若触发硬门槛则跳过）
    if (!result.hardGateHoldApplied) {
      const originalSize = result.recommendedSize;
      result.recommendedSize = Math.max(
        this.params.minPositionSize,
        Math.min(this.params.maxPositionSize, result.recommendedSize)
      );

      if (result.recommendedSize !== originalSize) {
        result.reasoning.push(`应用限制：${originalSize.toFixed(1)}% → ${result.recommendedSize.toFixed(1)}%`);
        result.limitedApplied = true;
      }
    }

    // 8. 设置最大仓位（用于分批建仓）
    result.maxSize = Math.min(result.recommendedSize * 1.5, this.params.maxPositionSize);

    // 9. 生成警告
    this.generateWarnings(result, decision, marketData);

    // 10. 四舍五入到整数
    result.recommendedSize = Math.round(result.recommendedSize);
    result.maxSize = Math.round(result.maxSize);

    return result;
  }

  /**
   * 基于置信度计算基础仓位
   */
  calculateBaseSizeByConfidence(confidence) {
    const thresholds = this.params.confidenceThresholds;

    if (confidence >= thresholds.veryHigh) {
      // 80%+: 40-50%仓位
      return 40 + (confidence - thresholds.veryHigh) * 0.5;
    } else if (confidence >= thresholds.high) {
      // 70-80%: 30-40%仓位
      return 30 + (confidence - thresholds.high);
    } else if (confidence >= thresholds.medium) {
      // 60-70%: 20-30%仓位
      return 20 + (confidence - thresholds.medium);
    } else if (confidence >= thresholds.low) {
      // 50-60%: 10-20%仓位
      return 10 + (confidence - thresholds.low);
    } else {
      // <50%: 5-10%仓位
      return 5 + confidence * 0.1;
    }
  }

  /**
   * 基于风险等级调整
   */
  adjustByRiskLevel(currentSize, riskLevel) {
    const multiplier = this.params.riskMultipliers[riskLevel] || 1.0;
    const newSize = currentSize * multiplier;

    return {
      size: newSize,
      reason: `风险等级${riskLevel}，仓位调整系数${multiplier}x (${currentSize.toFixed(1)}% → ${newSize.toFixed(1)}%)`,
      factor: 'risk',
      multiplier
    };
  }

  /**
   * 基于多时间框架共振调整
   */
  adjustByResonance(currentSize, resonance) {
    if (!resonance) {
      return { size: currentSize, reason: '无共振数据', factor: 'resonance', multiplier: 1.0 };
    }

    let multiplier = 1.0;
    let reason = '';

    switch (resonance.level) {
      case 'very_strong':
        multiplier = 1.3;  // 超强共振：增加30%
        reason = `超强共振(${resonance.weightedScore?.toFixed(1)}%)，增加仓位30%`;
        break;
      case 'strong':
        multiplier = 1.15; // 强共振：增加15%
        reason = `强共振(${resonance.weightedScore?.toFixed(1)}%)，增加仓位15%`;
        break;
      case 'medium':
        multiplier = 1.0;  // 中等共振：保持
        reason = `中等共振(${resonance.weightedScore?.toFixed(1)}%)，保持仓位`;
        break;
      case 'weak':
        multiplier = 0.7;  // 弱共振：减少30%
        reason = `弱共振，减少仓位30%`;
        break;
      default:
        multiplier = 0.8;
        reason = '共振未知，谨慎减少仓位20%';
    }

    const newSize = currentSize * multiplier;
    return {
      size: newSize,
      reason: `${reason} (${currentSize.toFixed(1)}% → ${newSize.toFixed(1)}%)`,
      factor: 'resonance',
      multiplier
    };
  }

  /**
   * 基于背离信号调整
   */
  adjustByDivergence(currentSize, divergence, signal) {
    if (!divergence.hasDivergence) {
      return { size: currentSize, reason: '无背离信号', factor: 'divergence', multiplier: 1.0 };
    }

    let multiplier = 1.0;
    let reason = '';

    // 检查背离方向是否与信号一致
    const divergenceSignal = divergence.signal;
    const isAligned =
      (signal === 'BUY' && divergenceSignal === 'BULLISH') ||
      (signal === 'SELL' && divergenceSignal === 'BEARISH');

    if (isAligned) {
      // 背离支持信号：增加仓位
      const confidenceBonus = divergence.confidence / 100;
      multiplier = 1.0 + (confidenceBonus * 0.2); // 最多增加20%
      reason = `背离信号支持(${divergence.confidence}%)，增加仓位${((multiplier - 1) * 100).toFixed(1)}%`;
    } else if (divergenceSignal === 'MIXED') {
      // 混合背离：略微减少
      multiplier = 0.9;
      reason = '混合背离信号，谨慎减少仓位10%';
    } else {
      // 背离与信号相反：大幅减少
      multiplier = 0.6;
      reason = '⚠️ 背离信号与交易方向相反，大幅减少仓位40%';
    }

    const newSize = currentSize * multiplier;
    return {
      size: newSize,
      reason: `${reason} (${currentSize.toFixed(1)}% → ${newSize.toFixed(1)}%)`,
      factor: 'divergence',
      multiplier
    };
  }

  /**
   * 基于市场波动率调整
   */
  adjustByVolatility(currentSize, atr, price) {
    const atrPercent = (atr / price) * 100;
    let multiplier = 1.0;
    let reason = '';

    if (atrPercent > 8) {
      // 极高波动：减少50%
      multiplier = 0.5;
      reason = `极高波动(ATR ${atrPercent.toFixed(2)}%)，减少仓位50%`;
    } else if (atrPercent > 5) {
      // 高波动：减少30%
      multiplier = 0.7;
      reason = `高波动(ATR ${atrPercent.toFixed(2)}%)，减少仓位30%`;
    } else if (atrPercent > 2) {
      // 中等波动：减少10%
      multiplier = 0.9;
      reason = `中等波动(ATR ${atrPercent.toFixed(2)}%)，减少仓位10%`;
    } else {
      // 低波动：保持
      multiplier = 1.0;
      reason = `低波动(ATR ${atrPercent.toFixed(2)}%)，保持仓位`;
    }

    const newSize = currentSize * multiplier;
    return {
      size: newSize,
      reason: `${reason} (${currentSize.toFixed(1)}% → ${newSize.toFixed(1)}%)`,
      factor: 'volatility',
      multiplier
    };
  }
  /**
   * 基于 Regime 调整
   */
  adjustByRegime(currentSize, regime, signal) {
    let multiplier = 1.0;
    let reason = '';

    const name = String(regime.name || '').toUpperCase();
    const dir = String(regime.direction || 'NEUTRAL').toUpperCase();
    const rawConf = typeof regime.confidence === 'number' ? regime.confidence : null;
    const conf = rawConf != null ? (rawConf > 1 ? rawConf / 100 : rawConf) : null; // 统一到 0~1

    if (name === 'HIGH_VOL') {
      multiplier = 0.6; // 高波动强收缩
      reason = '高波动环境，收缩仓位40%';
    } else if (name === 'EVENT') {
      multiplier = 0.7; // 事件期谨慎
      reason = '事件期，谨慎收缩仓位30%';
    } else if (name === 'TREND') {
      const aligned =
        (signal === 'BUY' && dir === 'BULL') ||
        (signal === 'SELL' && dir === 'BEAR');

      if (aligned) {
        // 趋势同向：根据置信度阶梯式增加
        if (conf != null && conf >= 0.85) { multiplier = 1.30; reason = `趋势同向(置信${Math.round(conf*100)}%)，增加仓位30%`; }
        else if (conf != null && conf >= 0.70) { multiplier = 1.15; reason = `趋势同向(置信${Math.round(conf*100)}%)，增加仓位15%`; }
        else { multiplier = 1.05; reason = '趋势同向，轻微增加仓位5%'; }
      } else {
        // 趋势反向：根据置信度加重惩罚
        if (conf != null && conf >= 0.85) { multiplier = 0.25; reason = `强反趋势(置信${Math.round(conf*100)}%)，收缩仓位75%`; }
        else if (conf != null && conf >= 0.70) { multiplier = 0.50; reason = `反趋势(置信${Math.round(conf*100)}%)，减少仓位50%`; }
        else { multiplier = 0.85; reason = '趋势反向，适度减少仓位15%'; }
      }
    } else {
      // RANGE
      multiplier = 0.85; // 震荡环境小幅收缩
      reason = '震荡环境，适度减少仓位15%';
    }

    const newSize = currentSize * multiplier;
    return { size: newSize, reason: `${reason} (${currentSize.toFixed(1)}% → ${newSize.toFixed(1)}%)`, factor: 'regime', multiplier };
  }

  /**
   * 基于数据质量调整（覆盖率）
   */
  adjustByDataQuality(currentSize, dataQuality) {
    if (!dataQuality || typeof dataQuality.coverage !== 'number') {
      return { size: currentSize, reason: '数据质量未知，保持仓位', factor: 'data_quality', multiplier: 1.0 };
    }
    const c = dataQuality.coverage;
    let multiplier = 1.0;
    let reason = '';
    if (c < 0.5) { multiplier = 0.5; reason = `数据覆盖率低(${Math.round(c*100)}%)，减少仓位50%`; }
    else if (c < 0.7) { multiplier = 0.7; reason = `数据覆盖率一般(${Math.round(c*100)}%)，减少仓位30%`; }
    else { multiplier = 1.0; reason = `数据覆盖率良好(${Math.round(c*100)}%)，保持仓位`; }
    const newSize = currentSize * multiplier;
    return { size: newSize, reason: `${reason} (${currentSize.toFixed(1)}% → ${newSize.toFixed(1)}%)`, factor: 'data_quality', multiplier };
  }

  /**
   * 基于风险上下文调整（日回撤/连亏）
   */
  adjustByRiskContext(currentSize, riskContext) {
    let size = currentSize;
    let reasons = [];
    let totalMultiplier = 1.0;

    if (typeof riskContext?.dailyDrawdownPct === 'number') {
      const l2 = Number(process.env.RISK_DRAWDOWN_L2 ?? '-1.5');
      const l3 = Number(process.env.RISK_DRAWDOWN_L3 ?? '-3');
      if (riskContext.dailyDrawdownPct <= l3) { size *= 0.5; totalMultiplier *= 0.5; reasons.push(`日回撤≤${l3}%，熔断减半仓位`); }
      else if (riskContext.dailyDrawdownPct <= l2) { size *= 0.75; totalMultiplier *= 0.75; reasons.push(`日回撤≤${l2}%，减少仓位25%`); }
    }

    if (typeof riskContext?.consecutiveLosses === 'number' && riskContext.consecutiveLosses >= 2) {
      const k = Math.min(5, riskContext.consecutiveLosses);
      const base = (() => { const b = Number(process.env.RISK_CONSEC_BASE ?? '0.8'); return Number.isFinite(b) && b > 0 && b < 1 ? b : 0.8; })();
      const mult = Math.pow(base, k - 1); // 2连亏:0.8, 3:0.64...
      size *= mult; totalMultiplier *= mult;
      reasons.push(`连续亏损${riskContext.consecutiveLosses}次，缩放系数${mult.toFixed(2)}（基数${base}）`);
    }

    if (reasons.length === 0) {
      return { size: currentSize, reason: '风险上下文正常，保持仓位', factor: 'risk_context', multiplier: 1.0 };
    }
    return { size, reason: `${reasons.join('；')} (${currentSize.toFixed(1)}% → ${size.toFixed(1)}%)`, factor: 'risk_context', multiplier: totalMultiplier };
  }


  /**
   * 生成警告信息
   */
  generateWarnings(result, decision, marketData) {
    // 低置信度警告
    if (decision.confidence < 60) {
      result.warnings.push('⚠️ 置信度较低(<60%)，建议谨慎交易或观望');
    }

    // 高风险警告
    if (decision.riskLevel === 'HIGH' || decision.riskLevel === 'EXTREME') {
      result.warnings.push(`⚠️ 风险等级${decision.riskLevel}，强烈建议减小仓位`);
    }

    // 弱共振警告
    if (marketData.multiTimeframe?.resonance?.level === 'weak') {
      result.warnings.push('⚠️ 多时间框架共振弱，趋势不明确');
    }

    // 背离冲突警告
    if (marketData.divergence?.hasDivergence) {
      const divergenceSignal = marketData.divergence.signal;
      const isConflict =
        (decision.signal === 'BUY' && divergenceSignal === 'BEARISH') ||
        (decision.signal === 'SELL' && divergenceSignal === 'BULLISH');

      if (isConflict) {
        result.warnings.push('🚨 背离信号与交易方向相反，可能面临反转风险');
      }
    }

    // 小仓位警告
    if (result.recommendedSize < 10) {
      result.warnings.push('💡 建议仓位较小，可能不值得交易（考虑手续费）');
    }
  }

  /**
   * 格式化仓位建议报告
   */
  formatReport(positionResult) {
    let report = '\n## 💰 智能仓位管理\n\n';
    const combined = Array.isArray(positionResult.adjustments)
      ? positionResult.adjustments.reduce((p, a) => p * (typeof a?.multiplier === 'number' ? a.multiplier : 1), 1)
      : 1;
    report += `**基础仓位**: ${positionResult.baseSize}%${positionResult.limitedApplied ? '（已应用最小/最大限制）' : ''}\n`;
    report += `**建议仓位**: ${positionResult.recommendedSize}%\n`;
    report += `**最大仓位**: ${positionResult.maxSize}%\n`;
    report += `**合成乘数**: ×${Number.isFinite(combined) ? combined.toFixed(2) : '-'}\n\n`;

    if (positionResult.reasoning.length > 0) {
      report += '**决策过程**:\n';
      positionResult.reasoning.forEach((reason, index) => {
        report += `${index + 1}. ${reason}\n`;
      });
      report += '\n';
    }

    if (positionResult.warnings.length > 0) {
      report += '**风险警告**:\n';
      positionResult.warnings.forEach(warning => {
        report += `- ${warning}\n`;
      });
    }

    return report;
  }
}

module.exports = new PositionManager();

