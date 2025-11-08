/**
 * 高级风险控制服务
 * 提供VaR计算、最大回撤监控、仓位集中度分析、压力测试等高级风险管理功能
 */

class RiskControlService {
  constructor() {
    this.equityHistory = []; // 权益历史记录
    this.maxEquity = 0; // 历史最高权益
    this.maxHistoryLength = 1000; // 最多保存1000条记录（优化内存使用）
  }

  /**
   * 将 totalEquity 规范为数值（支持 number 或 { USDT, ... } 对象）
   */
  getTotalEquityValue(totalEquity) {
    if (typeof totalEquity === 'number') return totalEquity;
    if (totalEquity && typeof totalEquity === 'object') {
      if (Number.isFinite(Number(totalEquity.USDT))) return Number(totalEquity.USDT);
      const nums = Object.values(totalEquity)
        .map(v => Number(v))
        .filter(n => Number.isFinite(n));
      return nums.length ? nums.reduce((a, b) => a + b, 0) : 0;
    }
    return 0;
  }

  /**
   * 计算综合风险指标
   * @param {Object} balance - 账户余额
   * @param {Array} positions - 持仓列表
   * @param {Array} trades - 交易历史
   * @returns {Object} 综合风险指标
   */
  calculateRiskMetrics(balance, positions = [], trades = []) {
    const metrics = {
      var: null,
      drawdown: null,
      concentration: null,
      stressTest: null,
      riskScore: 0,
      overallRiskLevel: 'LOW'
    };

    // 1. 计算VaR（风险价值）
    metrics.var = this.calculateVaR(balance, positions);

    // 2. 计算最大回撤
    metrics.drawdown = this.calculateDrawdown(balance);

    // 3. 计算仓位集中度
    metrics.concentration = this.calculateConcentration(positions, balance);

    // 4. 执行压力测试
    metrics.stressTest = this.performStressTest(balance, positions);

    // 5. 计算综合风险评分
    metrics.riskScore = this.calculateRiskScore(metrics);

    // 6. 确定总体风险等级
    metrics.overallRiskLevel = this.determineOverallRiskLevel(metrics.riskScore);

    return metrics;
  }

  /**
   * 计算VaR（风险价值）
   * VaR表示在给定置信度下，账户在特定时间内可能损失的最大金额
   */
  calculateVaR(balance, positions) {
    const totalEquity = balance?.totalEquity || 0;

    if (totalEquity <= 0 || !positions || positions.length === 0) {
      return {
        var95: 0,
        var99: 0,
        varPercent95: 0,
        varPercent99: 0,
        method: 'parametric'
      };
    }

    // 使用参数法计算VaR
    // 假设日收益率服从正态分布

    // 计算总仓位价值
    const totalPositionValue = positions.reduce((sum, pos) => {
      const currentPrice = pos.currentPrice || pos.markPrice || 0;
      const size = pos.size || pos.contracts || pos.amount || 0;
      return sum + (currentPrice * size);
    }, 0);

    // 估算日波动率（简化版：基于杠杆和市场波动）
    const averageLeverage = positions.reduce((sum, pos) =>
      sum + (pos.leverage || 1), 0) / positions.length;

    // 假设市场日波动率为2%，实际波动率 = 市场波动率 * 平均杠杆
    const dailyVolatility = 0.02 * averageLeverage;

    // 计算VaR
    // VaR(95%) = 1.65 * σ * P (置信度95%)
    // VaR(99%) = 2.33 * σ * P (置信度99%)
    const var95 = 1.65 * dailyVolatility * totalPositionValue;
    const var99 = 2.33 * dailyVolatility * totalPositionValue;

    const varPercent95 = (var95 / totalEquity) * 100;
    const varPercent99 = (var99 / totalEquity) * 100;

    let riskLevel = 'LOW';
    if (varPercent95 >= 30) {
      riskLevel = 'CRITICAL';
    } else if (varPercent95 >= 20) {
      riskLevel = 'HIGH';
    } else if (varPercent95 >= 10) {
      riskLevel = 'MEDIUM';
    }

    return {
      var95,
      var99,
      varPercent95,
      varPercent99,
      dailyVolatility: dailyVolatility * 100, // 转换为百分比
      method: 'parametric',
      riskLevel,
      interpretation: `95%置信度下，账户日最大损失可能为${varPercent95.toFixed(2)}%`
    };
  }

  /**
   * 计算最大回撤
   */
  calculateDrawdown(balance) {
    const currentEquity = this.getTotalEquityValue(balance?.totalEquity);

    // 更新历史最高权益
    if (currentEquity > this.maxEquity) {
      this.maxEquity = currentEquity;
    }

    // 记录权益历史
    this.recordEquityHistory(currentEquity);

    // 计算当前回撤
    const currentDrawdown = this.maxEquity > 0
      ? ((this.maxEquity - currentEquity) / this.maxEquity) * 100
      : 0;

    // 计算历史最大回撤
    const maxDrawdown = this.calculateMaxDrawdownFromHistory();

    // 计算回撤持续时间
    const drawdownDuration = this.calculateDrawdownDuration();

    let severity = 'LOW';
    if (currentDrawdown >= 30) {
      severity = 'CRITICAL';
    } else if (currentDrawdown >= 20) {
      severity = 'HIGH';
    } else if (currentDrawdown >= 10) {
      severity = 'MEDIUM';
    }

    return {
      currentDrawdown,
      maxDrawdown,
      maxEquity: this.maxEquity,
      currentEquity,
      drawdownDuration,
      severity,
      warning: currentDrawdown >= 20 ? '当前回撤过大，建议降低风险' : null,
      recoveryNeeded: currentDrawdown > 0
        ? ((currentEquity / (currentEquity - (this.maxEquity - currentEquity))) - 1) * 100
        : 0 // 恢复到历史最高需要的收益率
    };
  }

  /**
   * 从历史记录计算最大回撤
   */
  calculateMaxDrawdownFromHistory() {
    if (this.equityHistory.length < 2) {
      return 0;
    }

    let maxDrawdown = 0;
    let peak = this.equityHistory[0].equity;

    for (const record of this.equityHistory) {
      if (record.equity > peak) {
        peak = record.equity;
      }

      const drawdown = peak > 0 ? ((peak - record.equity) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * 计算回撤持续时间（天数）
   */
  calculateDrawdownDuration() {
    if (this.equityHistory.length < 2) {
      return 0;
    }

    const now = Date.now();
    let drawdownStart = null;

    // 从后往前找，找到最后一次达到最高权益的时间
    for (let i = this.equityHistory.length - 1; i >= 0; i--) {
      if (this.equityHistory[i].equity >= this.maxEquity * 0.99) { // 允许0.1%误差
        drawdownStart = this.equityHistory[i].timestamp;
        break;
      }
    }

    if (!drawdownStart) {
      return 0;
    }

    const durationMs = now - drawdownStart;
    const durationDays = durationMs / (24 * 60 * 60 * 1000);

    return Math.round(durationDays);
  }

  /**
   * 计算仓位集中度
   */
  calculateConcentration(positions, balance) {
    if (!positions || positions.length === 0) {
      return {
        herfindahlIndex: 0,
        maxSingleExposure: 0,
        top3Exposure: 0,
        diversificationScore: 100,
        concentrationLevel: 'LOW'
      };
    }

    const totalEquity = balance?.totalEquity || 1;

    // 计算每个仓位的价值
    const positionValues = positions.map(pos => {
      const currentPrice = pos.currentPrice || pos.markPrice || 0;
      const size = pos.size || pos.contracts || pos.amount || 0;
      return {
        symbol: pos.symbol,
        value: currentPrice * size,
        percent: 0
      };
    });

    const totalValue = positionValues.reduce((sum, pos) => sum + pos.value, 0);

    // 计算每个仓位的占比
    positionValues.forEach(pos => {
      pos.percent = totalValue > 0 ? (pos.value / totalValue) * 100 : 0;
    });

    // 计算赫芬达尔指数（Herfindahl Index）
    // HHI = Σ(每个仓位占比)^2
    const herfindahlIndex = positionValues.reduce((sum, pos) =>
      sum + Math.pow(pos.percent / 100, 2), 0);

    // 最大单一仓位占比
    const maxSingleExposure = Math.max(...positionValues.map(pos => pos.percent));

    // 前3大仓位占比
    const sortedValues = [...positionValues].sort((a, b) => b.value - a.value);
    const top3Exposure = sortedValues.slice(0, 3).reduce((sum, pos) => sum + pos.percent, 0);

    // 多样化评分（0-100，越高越分散）
    const diversificationScore = Math.max(0, 100 - herfindahlIndex * 100);

    let concentrationLevel = 'LOW';
    if (herfindahlIndex >= 0.5 || maxSingleExposure >= 50) {
      concentrationLevel = 'CRITICAL';
    } else if (herfindahlIndex >= 0.3 || maxSingleExposure >= 30) {
      concentrationLevel = 'HIGH';
    } else if (herfindahlIndex >= 0.2 || maxSingleExposure >= 20) {
      concentrationLevel = 'MEDIUM';
    }

    return {
      herfindahlIndex,
      maxSingleExposure,
      top3Exposure,
      diversificationScore,
      positionCount: positions.length,
      concentrationLevel,
      warning: concentrationLevel === 'CRITICAL' || concentrationLevel === 'HIGH'
        ? '仓位过于集中，建议分散投资'
        : null,
      breakdown: positionValues.sort((a, b) => b.value - a.value)
    };
  }

  /**
   * 执行压力测试
   * 模拟极端市场条件下的损失
   */
  performStressTest(balance, positions) {
    if (!positions || positions.length === 0) {
      return {
        scenarios: [],
        worstCase: null,
        recommendation: '无持仓，无需压力测试'
      };
    }

    const totalEquity = balance?.totalEquity || 0;
    const scenarios = [];

    // 场景1：市场暴跌10%
    scenarios.push(this.simulateScenario('市场暴跌10%', positions, -0.10, totalEquity));

    // 场景2：市场暴跌20%
    scenarios.push(this.simulateScenario('市场暴跌20%', positions, -0.20, totalEquity));

    // 场景3：市场暴跌30%（黑天鹅事件）
    scenarios.push(this.simulateScenario('黑天鹅事件-30%', positions, -0.30, totalEquity));

    // 场景4：市场暴涨20%（逼空）
    scenarios.push(this.simulateScenario('市场暴涨20%', positions, 0.20, totalEquity));

    // 场景5：波动率翻倍
    scenarios.push(this.simulateVolatilityScenario('波动率翻倍', positions, 2.0, totalEquity));

    // 找出最坏情况
    const worstCase = scenarios.reduce((worst, scenario) =>
      scenario.lossPercent < worst.lossPercent ? scenario : worst
    );

    let recommendation = '压力测试结果正常';
    if (worstCase.lossPercent < -50) {
      recommendation = '极端风险：极端情况下可能损失超过50%，强烈建议降低仓位和杠杆';
    } else if (worstCase.lossPercent < -30) {
      recommendation = '高风险：极端情况下可能损失超过30%，建议降低风险暴露';
    } else if (worstCase.lossPercent < -20) {
      recommendation = '中等风险：极端情况下可能损失超过20%，建议设置止损';
    }

    return {
      scenarios,
      worstCase,
      recommendation
    };
  }

  /**
   * 模拟价格变动场景
   */
  simulateScenario(name, positions, priceChange, totalEquity) {
    let totalLoss = 0;

    positions.forEach(pos => {
      const currentPrice = pos.currentPrice || pos.markPrice || 0;
      const size = pos.size || pos.contracts || pos.amount || 0;
      const side = pos.side;
      const newPrice = currentPrice * (1 + priceChange);

      let positionLoss = 0;
      if (side === 'long' || side === 'LONG') {
        positionLoss = (newPrice - currentPrice) * size;
      } else if (side === 'short' || side === 'SHORT') {
        positionLoss = (currentPrice - newPrice) * size;
      }

      totalLoss += positionLoss;
    });

    const lossPercent = totalEquity > 0 ? (totalLoss / totalEquity) * 100 : 0;

    return {
      name,
      priceChange: priceChange * 100,
      totalLoss,
      lossPercent,
      remainingEquity: totalEquity + totalLoss,
      survivable: (totalEquity + totalLoss) > 0
    };
  }

  /**
   * 模拟波动率变化场景
   */
  simulateVolatilityScenario(name, positions, volatilityMultiplier, totalEquity) {
    // 简化版：假设波动率翻倍会导致平均5%的额外损失
    const estimatedLoss = totalEquity * 0.05 * volatilityMultiplier;

    return {
      name,
      volatilityMultiplier,
      totalLoss: -estimatedLoss,
      lossPercent: -5 * volatilityMultiplier,
      remainingEquity: totalEquity - estimatedLoss,
      survivable: (totalEquity - estimatedLoss) > 0
    };
  }

  /**
   * 计算综合风险评分 (0-100)
   */
  calculateRiskScore(metrics) {
    let score = 0;

    // VaR贡献（30分）
    const varPercent = metrics.var?.varPercent95 || 0;
    if (varPercent >= 30) {
      score += 30;
    } else if (varPercent >= 20) {
      score += 22;
    } else if (varPercent >= 10) {
      score += 15;
    } else if (varPercent >= 5) {
      score += 8;
    }

    // 回撤贡献（30分）
    const drawdown = metrics.drawdown?.currentDrawdown || 0;
    if (drawdown >= 30) {
      score += 30;
    } else if (drawdown >= 20) {
      score += 22;
    } else if (drawdown >= 10) {
      score += 15;
    } else if (drawdown >= 5) {
      score += 8;
    }

    // 集中度贡献（20分）
    const concentration = metrics.concentration?.herfindahlIndex || 0;
    if (concentration >= 0.5) {
      score += 20;
    } else if (concentration >= 0.3) {
      score += 15;
    } else if (concentration >= 0.2) {
      score += 10;
    } else if (concentration >= 0.1) {
      score += 5;
    }

    // 压力测试贡献（20分）
    const worstCaseLoss = metrics.stressTest?.worstCase?.lossPercent || 0;
    if (worstCaseLoss < -50) {
      score += 20;
    } else if (worstCaseLoss < -30) {
      score += 15;
    } else if (worstCaseLoss < -20) {
      score += 10;
    } else if (worstCaseLoss < -10) {
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * 确定总体风险等级
   */
  determineOverallRiskLevel(riskScore) {
    if (riskScore >= 70) {
      return 'CRITICAL';
    } else if (riskScore >= 50) {
      return 'HIGH';
    } else if (riskScore >= 30) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * 记录权益历史
   */
  recordEquityHistory(equity) {
    this.equityHistory.push({
      timestamp: Date.now(),
      equity
    });

    // 限制历史记录长度
    if (this.equityHistory.length > this.maxHistoryLength) {
      this.equityHistory.shift();
    }
  }

  /**
   * 重置历史数据
   */
  resetHistory() {
    this.equityHistory = [];
    this.maxEquity = 0;
  }
}

module.exports = new RiskControlService();
