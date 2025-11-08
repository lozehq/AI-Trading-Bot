/**
 * 资金管理监控服务
 * 提供实时余额监控、保证金计算、杠杆率监控、资金利用率分析等功能
 */

class FundManagementService {
  constructor() {
    this.balanceHistory = []; // 余额历史记录
    this.maxHistoryLength = 1000; // 最多保存1000条历史记录
  }

  /**
   * 获取总权益值（处理多币种情况）
   */
  getTotalEquityValue(totalEquity) {
    if (typeof totalEquity === 'number') {
      return totalEquity;
    }
    if (totalEquity && typeof totalEquity === 'object') {
      // 以USDT为基准，忽略其他小额币种
      return totalEquity.USDT || 0;
    }
    return 0;
  }

  /**
   * 增强账户余额信息
   * @param {Object} balance - 原始余额数据
   * @param {Array} positions - 持仓列表
   * @returns {Object} 增强后的余额信息
   */
  enhanceBalance(balance, positions = []) {
    if (!balance) {
      return null;
    }

    const enhanced = { ...balance };

    // 1. 计算资金利用率
    enhanced.fundUtilization = this.calculateFundUtilization(balance);

    // 2. 计算有效杠杆率
    enhanced.effectiveLeverage = this.calculateEffectiveLeverage(balance, positions);

    // 3. 计算风险暴露
    enhanced.riskExposure = this.calculateRiskExposure(balance, positions);

    // 4. 计算可开仓容量
    enhanced.availableCapacity = this.calculateAvailableCapacity(balance, positions);

    // 5. 资金健康度评分
    enhanced.fundHealthScore = this.calculateFundHealthScore(enhanced);

    // 6. 保证金充足度
    enhanced.marginAdequacy = this.assessMarginAdequacy(balance);

    // 7. 资金使用建议
    enhanced.recommendations = this.generateFundRecommendations(enhanced);

    return enhanced;
  }

  /**
   * 计算资金利用率
   */
  calculateFundUtilization(balance) {
    const totalEquity = this.getTotalEquityValue(balance.totalEquity);
    const usedMargin = balance.usedMargin || 0;
    const availableBalance = balance.availableBalance || 0;

    if (totalEquity <= 0) {
      return {
        utilizationRate: 0,
        usedAmount: 0,
        availableAmount: 0,
        status: 'UNKNOWN'
      };
    }

    const utilizationRate = totalEquity > 0 ? (usedMargin / totalEquity) * 100 : 0;

    let status = 'HEALTHY';
    if (utilizationRate >= 80) {
      status = 'CRITICAL';
    } else if (utilizationRate >= 60) {
      status = 'HIGH';
    } else if (utilizationRate >= 40) {
      status = 'MODERATE';
    }

    return {
      utilizationRate,
      usedAmount: usedMargin,
      availableAmount: availableBalance,
      totalAmount: totalEquity,
      status,
      warning: utilizationRate >= 70 ? '资金利用率过高，建议控制仓位' : null
    };
  }

  /**
   * 计算有效杠杆率
   */
  calculateEffectiveLeverage(balance, positions) {
    // 使用新的getTotalEquityValue方法处理多币种情况
    const totalEquity = this.getTotalEquityValue(balance.totalEquity);

    // 增强的验证：检查数组、空值、总权益
    if (totalEquity <= 0 || !Array.isArray(positions) || positions.length === 0) {
      return {
        effectiveLeverage: 0,
        totalExposure: 0,
        leverageByPosition: []
      };
    }

    // 计算总仓位价值（带安全检查）
    const totalExposure = positions.reduce((sum, pos) => {
      if (!pos) return sum;
      const currentPrice = pos.currentPrice || pos.markPrice || 0;
      const size = pos.size || pos.contracts || pos.amount || 0;
      return sum + (currentPrice * size);
    }, 0);

    // 安全的除法操作
    const effectiveLeverage = totalEquity > 0 ? totalExposure / totalEquity : 0;

    // 按仓位计算杠杆（带安全检查）
    const leverageByPosition = positions.map(pos => {
      if (!pos) {
        return {
          symbol: 'UNKNOWN',
          positionLeverage: 0,
          positionValue: 0,
          setLeverage: 1
        };
      }

      const currentPrice = pos.currentPrice || pos.markPrice || 0;
      const size = pos.size || pos.contracts || pos.amount || 0;
      const positionValue = currentPrice * size;
      const positionLeverage = totalEquity > 0 ? positionValue / totalEquity : 0;

      return {
        symbol: pos.symbol || 'UNKNOWN',
        positionLeverage,
        positionValue,
        setLeverage: pos.leverage || 1
      };
    });

    let riskLevel = 'LOW';
    if (effectiveLeverage >= 10) {
      riskLevel = 'CRITICAL';
    } else if (effectiveLeverage >= 5) {
      riskLevel = 'HIGH';
    } else if (effectiveLeverage >= 3) {
      riskLevel = 'MEDIUM';
    }

    return {
      effectiveLeverage,
      totalExposure,
      leverageByPosition,
      riskLevel,
      warning: effectiveLeverage >= 5 ? '有效杠杆过高，风险极大' : null
    };
  }

  /**
   * 计算风险暴露
   */
  calculateRiskExposure(balance, positions) {
    // 使用新的getTotalEquityValue方法处理多币种情况
    const totalEquity = this.getTotalEquityValue(balance.totalEquity);

    // 增强的验证：检查数组、空值、总权益
    if (totalEquity <= 0 || !Array.isArray(positions) || positions.length === 0) {
      return {
        totalRisk: 0,
        riskPercent: 0,
        positions: [],
        concentration: {}
      };
    }

    // 计算每个持仓的风险（带安全检查）
    const positionRisks = positions.map(pos => {
      if (!pos) {
        return {
          symbol: 'UNKNOWN',
          potentialLoss: 0,
          riskPercent: 0,
          hasStopLoss: false
        };
      }

      const currentPrice = pos.currentPrice || pos.markPrice || 0;
      const size = pos.size || pos.contracts || pos.amount || 0;
      const stopLoss = pos.stopLoss;
      const entryPrice = pos.entryPrice || pos.avgPrice || 0;
      const side = pos.side;

      let potentialLoss = 0;
      if (stopLoss && currentPrice > 0) {
        if (side === 'long' || side === 'LONG') {
          potentialLoss = Math.max(0, (entryPrice - stopLoss) * size);
        } else if (side === 'short' || side === 'SHORT') {
          potentialLoss = Math.max(0, (stopLoss - entryPrice) * size);
        }
      } else {
        // 如果没有止损，按20%风险估算
        potentialLoss = currentPrice * size * 0.2;
      }

      const riskPercent = totalEquity > 0 ? (potentialLoss / totalEquity) * 100 : 0;

      return {
        symbol: pos.symbol || 'UNKNOWN',
        potentialLoss,
        riskPercent,
        hasStopLoss: !!stopLoss
      };
    });

    const totalRisk = positionRisks.reduce((sum, risk) => sum + risk.potentialLoss, 0);
    const riskPercent = totalEquity > 0 ? (totalRisk / totalEquity) * 100 : 0;

    // 计算仓位集中度
    const symbolConcentration = {};
    positions.forEach(pos => {
      const symbol = pos.symbol || 'UNKNOWN';
      const currentPrice = pos.currentPrice || pos.markPrice || 0;
      const size = pos.size || pos.contracts || pos.amount || 0;
      const value = currentPrice * size;

      if (!symbolConcentration[symbol]) {
        symbolConcentration[symbol] = {
          totalValue: 0,
          count: 0,
          percentOfTotal: 0
        };
      }

      symbolConcentration[symbol].totalValue += value;
      symbolConcentration[symbol].count += 1;
    });

    // 计算每个币种的占比
    const totalValue = Object.values(symbolConcentration).reduce((sum, item) => sum + item.totalValue, 0);
    Object.keys(symbolConcentration).forEach(symbol => {
      symbolConcentration[symbol].percentOfTotal =
        totalValue > 0 ? (symbolConcentration[symbol].totalValue / totalValue) * 100 : 0;
    });

    let riskLevel = 'LOW';
    if (riskPercent >= 30) {
      riskLevel = 'CRITICAL';
    } else if (riskPercent >= 20) {
      riskLevel = 'HIGH';
    } else if (riskPercent >= 10) {
      riskLevel = 'MEDIUM';
    }

    return {
      totalRisk,
      riskPercent,
      positions: positionRisks,
      concentration: symbolConcentration,
      riskLevel,
      warning: riskPercent >= 20 ? '风险暴露过高，建议减少仓位' : null
    };
  }

  /**
   * 计算可开仓容量
   */
  calculateAvailableCapacity(balance, positions) {
    const availableBalance = balance.availableBalance || 0;
    const totalEquity = balance.totalEquity || 0;
    const usedMargin = balance.usedMargin || 0;

    // 保守估计：只使用可用余额的70%
    const safeCapacity = availableBalance * 0.7;

    // 激进估计：使用可用余额的95%
    const maxCapacity = availableBalance * 0.95;

    // 推荐容量：基于当前风险暴露
    const currentRiskExposure = positions.length > 0
      ? this.calculateRiskExposure(balance, positions).riskPercent
      : 0;

    let recommendedCapacity = safeCapacity;
    if (currentRiskExposure < 10) {
      recommendedCapacity = availableBalance * 0.8;
    } else if (currentRiskExposure >= 20) {
      recommendedCapacity = availableBalance * 0.5;
    }

    // 按不同杠杆计算可开仓量
    const capacityByLeverage = [1, 2, 3, 5, 10, 20].map(leverage => ({
      leverage,
      maxPositionValue: maxCapacity * leverage,
      recommendedPositionValue: recommendedCapacity * leverage
    }));

    return {
      safeCapacity,
      maxCapacity,
      recommendedCapacity,
      capacityByLeverage,
      utilizationRate: totalEquity > 0 ? (usedMargin / totalEquity) * 100 : 0
    };
  }

  /**
   * 计算资金健康度评分 (0-100)
   */
  calculateFundHealthScore(enhancedBalance) {
    let score = 100;

    // 扣分项1：资金利用率
    const utilizationRate = enhancedBalance.fundUtilization?.utilizationRate || 0;
    if (utilizationRate >= 80) {
      score -= 40;
    } else if (utilizationRate >= 60) {
      score -= 25;
    } else if (utilizationRate >= 40) {
      score -= 10;
    }

    // 扣分项2：有效杠杆率
    const effectiveLeverage = enhancedBalance.effectiveLeverage?.effectiveLeverage || 0;
    if (effectiveLeverage >= 10) {
      score -= 30;
    } else if (effectiveLeverage >= 5) {
      score -= 20;
    } else if (effectiveLeverage >= 3) {
      score -= 10;
    }

    // 扣分项3：风险暴露
    const riskPercent = enhancedBalance.riskExposure?.riskPercent || 0;
    if (riskPercent >= 30) {
      score -= 30;
    } else if (riskPercent >= 20) {
      score -= 20;
    } else if (riskPercent >= 10) {
      score -= 10;
    }

    // 扣分项4：保证金充足度
    const marginRatio = enhancedBalance.marginRatio || 100;
    if (marginRatio < 20) {
      score -= 40;
    } else if (marginRatio < 50) {
      score -= 20;
    }

    const totalEquityValue = this.getTotalEquityValue(enhancedBalance.totalEquity);
    if (totalEquityValue < 10) {
      score -= 60;
    } else if (totalEquityValue < 100) {
      score -= 30;
    }

    const adequacy = enhancedBalance.marginAdequacy?.adequacyLevel;
    if (adequacy === 'CRITICAL') {
      score = Math.min(score, 20);
    } else if (adequacy === 'INSUFFICIENT') {
      score = Math.min(score, 40);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 评估保证金充足度
   */
  assessMarginAdequacy(balance) {
    const marginRatio = balance.marginRatio || 0;
    const availableBalance = balance.availableBalance || 0;
    const totalEquity = typeof balance.totalEquity === 'number' ? balance.totalEquity : (balance.totalEquity?.USDT || 0);
    const usedMargin = balance.usedMargin || 0;

    let adequacyLevel = 'ADEQUATE';
    let recommendation = null;

    // ✅ 修复：无持仓时不应提示保证金不足
    if (usedMargin === 0) {
      // 没有持仓，检查可用余额
      if (availableBalance >= 1000 || totalEquity >= 1000) {
        adequacyLevel = 'ADEQUATE';
        recommendation = '无持仓，可用资金充足';
      } else if (availableBalance >= 100 || totalEquity >= 100) {
        adequacyLevel = 'MODERATE';
        recommendation = '无持仓，建议补充资金以便开仓';
      } else {
        adequacyLevel = 'INSUFFICIENT';
        recommendation = '可用资金较少，建议充值';
      }
    } else {
      // 有持仓，检查保证金比率
      if (marginRatio < 20) {
        adequacyLevel = 'CRITICAL';
        recommendation = '保证金严重不足，立即补充资金或减少仓位';
      } else if (marginRatio < 50) {
        adequacyLevel = 'INSUFFICIENT';
        recommendation = '保证金偏低，建议补充资金或减少仓位';
      } else if (marginRatio < 80) {
        adequacyLevel = 'MODERATE';
        recommendation = '保证金适中，建议谨慎开仓';
      } else {
        adequacyLevel = 'ADEQUATE';
        recommendation = '保证金充足，可以正常交易';
      }
    }

    return {
      marginRatio,
      availableBalance,
      totalEquity,
      adequacyLevel,
      recommendation
    };
  }

  /**
   * 生成资金使用建议
   */
  generateFundRecommendations(enhancedBalance) {
    const recommendations = [];

    // 建议1：资金利用率
    const utilization = enhancedBalance.fundUtilization;
    if (utilization?.status === 'CRITICAL') {
      recommendations.push({
        type: 'URGENT',
        category: 'UTILIZATION',
        message: '资金利用率过高（>80%），强烈建议减少仓位',
        action: '平仓部分持仓或补充资金'
      });
    } else if (utilization?.status === 'HIGH') {
      recommendations.push({
        type: 'WARNING',
        category: 'UTILIZATION',
        message: '资金利用率偏高（>60%），建议控制新开仓',
        action: '谨慎开新仓，预留安全边际'
      });
    }

    // 建议2：有效杠杆
    const leverage = enhancedBalance.effectiveLeverage;
    if (leverage?.riskLevel === 'CRITICAL') {
      recommendations.push({
        type: 'URGENT',
        category: 'LEVERAGE',
        message: `有效杠杆过高（${leverage.effectiveLeverage.toFixed(1)}x），风险极大`,
        action: '立即降低杠杆或减少仓位'
      });
    } else if (leverage?.riskLevel === 'HIGH') {
      recommendations.push({
        type: 'WARNING',
        category: 'LEVERAGE',
        message: `有效杠杆偏高（${leverage.effectiveLeverage.toFixed(1)}x），注意风险`,
        action: '建议降低杠杆倍数'
      });
    }

    // 建议3：风险暴露
    const riskExposure = enhancedBalance.riskExposure;
    if (riskExposure?.riskLevel === 'CRITICAL' || riskExposure?.riskLevel === 'HIGH') {
      recommendations.push({
        type: 'WARNING',
        category: 'RISK',
        message: `风险暴露${riskExposure.riskPercent.toFixed(1)}%，超过安全阈值`,
        action: '设置止损或减少仓位'
      });
    }

    // 建议4：保证金充足度
    const marginAdequacy = enhancedBalance.marginAdequacy;
    if (marginAdequacy?.adequacyLevel === 'CRITICAL' || marginAdequacy?.adequacyLevel === 'INSUFFICIENT') {
      recommendations.push({
        type: 'URGENT',
        category: 'MARGIN',
        message: marginAdequacy.recommendation,
        action: '补充保证金或平仓部分持仓'
      });
    }

    // 如果没有警告，给出积极建议
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'INFO',
        category: 'GENERAL',
        message: '资金状况良好，可以正常交易',
        action: '保持当前风险管理策略'
      });
    }

    return recommendations;
  }

  /**
   * 记录余额历史
   */
  recordBalanceHistory(balance) {
    if (!balance) return;

    this.balanceHistory.push({
      timestamp: Date.now(),
      totalEquity: balance.totalEquity,
      availableBalance: balance.availableBalance,
      usedMargin: balance.usedMargin,
      marginRatio: balance.marginRatio
    });

    // 限制历史记录长度
    if (this.balanceHistory.length > this.maxHistoryLength) {
      this.balanceHistory.shift();
    }
  }

  /**
   * 获取余额变化趋势
   */
  getBalanceTrend(period = '1h') {
    if (this.balanceHistory.length < 2) {
      return {
        trend: 'UNKNOWN',
        change: 0,
        changePercent: 0
      };
    }

    const now = Date.now();
    let timeWindow;

    switch (period) {
      case '5m':
        timeWindow = 5 * 60 * 1000;
        break;
      case '15m':
        timeWindow = 15 * 60 * 1000;
        break;
      case '1h':
        timeWindow = 60 * 60 * 1000;
        break;
      case '4h':
        timeWindow = 4 * 60 * 60 * 1000;
        break;
      case '1d':
        timeWindow = 24 * 60 * 60 * 1000;
        break;
      default:
        timeWindow = 60 * 60 * 1000;
    }

    const filteredHistory = this.balanceHistory.filter(record =>
      now - record.timestamp <= timeWindow
    );

    if (filteredHistory.length < 2) {
      return {
        trend: 'UNKNOWN',
        change: 0,
        changePercent: 0
      };
    }

    const oldest = filteredHistory[0];
    const latest = filteredHistory[filteredHistory.length - 1];

    const change = latest.totalEquity - oldest.totalEquity;
    const changePercent = oldest.totalEquity > 0
      ? (change / oldest.totalEquity) * 100
      : 0;

    let trend = 'STABLE';
    if (changePercent > 1) {
      trend = 'RISING';
    } else if (changePercent < -1) {
      trend = 'FALLING';
    }

    return {
      trend,
      change,
      changePercent,
      period,
      startEquity: oldest.totalEquity,
      endEquity: latest.totalEquity
    };
  }
}

module.exports = new FundManagementService();
