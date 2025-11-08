/**
 * 实时仓位盈亏监控服务
 * 提供持仓成本跟踪、��动盈亏计算、仓位价值监控等功能
 */

class PositionMonitorService {
  constructor() {
    this.positionCache = new Map(); // 缓存仓位数据
    this.priceUpdateInterval = 5000; // 价格更新间隔（毫秒）
    this.monitoringActive = false;
  }

  /**
   * 获取增强的仓位信息（包含实时盈亏监控）
   * @param {Array} positions - 原始持仓列表
   * @param {Object} currentPrices - 当前价格映射 {symbol: price}
   * @returns {Array} 增强后的持仓列表
   */
  enhancePositions(positions, currentPrices = {}) {
    if (!Array.isArray(positions) || positions.length === 0) {
      return [];
    }

    return positions.map(pos => {
      const enhanced = { ...pos };
      const currentPrice = currentPrices[pos.symbol] || pos.currentPrice || pos.markPrice;

      // 1. 计算持仓成本
      enhanced.positionCost = this.calculatePositionCost(pos);

      // 2. 计算实时浮动盈亏
      enhanced.realtimePnl = this.calculateRealtimePnl(pos, currentPrice);

      // 3. 计算仓位价值
      enhanced.positionValue = this.calculatePositionValue(pos, currentPrice);

      // 4. 计算收益率
      enhanced.returnRate = this.calculateReturnRate(pos, currentPrice);

      // 5. 计算距离强平的安全边际
      enhanced.safetyMargin = this.calculateSafetyMargin(pos, currentPrice);

      // 6. 风险等级评估
      enhanced.riskLevel = this.assessPositionRisk(enhanced);

      // 7. 持仓健康度评分 (0-100)
      enhanced.healthScore = this.calculateHealthScore(enhanced);

      // 8. 计算盈亏波动率
      enhanced.pnlVolatility = this.calculatePnlVolatility(pos);

      return enhanced;
    });
  }

  /**
   * 计算持仓成本（包括手续费）
   */
  calculatePositionCost(position) {
    const entryPrice = position.entryPrice || position.avgPrice || 0;
    const size = position.size || position.contracts || position.amount || 0;
    const leverage = Math.max(position.leverage || 1, 0.01); // 防止除零，最小0.01倍杠杆

    // 持仓成本 = 入场价 * 数量 / 杠杆
    const baseCost = entryPrice * size / leverage;

    // 估算手续费（假设开仓手续费率0.05%）
    const estimatedFee = baseCost * 0.0005;

    return {
      baseCost,
      estimatedFee,
      totalCost: baseCost + estimatedFee,
      costPerUnit: entryPrice
    };
  }

  /**
   * 计算实时浮动盈亏
   */
  calculateRealtimePnl(position, currentPrice) {
    if (!currentPrice || currentPrice <= 0) {
      return {
        unrealizedPnl: position.unrealizedPnl || 0,
        unrealizedPnlPercent: position.unrealizedPnlPercent || 0,
        isProfit: false,
        lastUpdate: Date.now()
      };
    }

    const entryPrice = position.entryPrice || position.avgPrice || 0;
    const size = position.size || position.contracts || position.amount || 0;
    const side = position.side; // 'long' or 'short'
    const leverage = position.leverage || 1;

    // 防止除零：如果入场价为0，无法计算盈亏百分比
    if (entryPrice <= 0) {
      return {
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        isProfit: false,
        profitTarget: this.calculateProfitTarget(position),
        stopLossDistance: this.calculateStopLossDistance(position, currentPrice),
        lastUpdate: Date.now()
      };
    }

    let pnl = 0;
    let pnlPercent = 0;

    if (side === 'long' || side === 'LONG') {
      // 做多：盈亏 = (当前价 - 入场价) * 数量
      pnl = (currentPrice - entryPrice) * size;
      pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100 * leverage;
    } else if (side === 'short' || side === 'SHORT') {
      // 做空：盈亏 = (入场价 - 当前价) * 数量
      pnl = (entryPrice - currentPrice) * size;
      pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100 * leverage;
    }

    return {
      unrealizedPnl: pnl,
      unrealizedPnlPercent: pnlPercent,
      isProfit: pnl > 0,
      profitTarget: this.calculateProfitTarget(position),
      stopLossDistance: this.calculateStopLossDistance(position, currentPrice),
      lastUpdate: Date.now()
    };
  }

  /**
   * 计算盈利目标达成度
   */
  calculateProfitTarget(position) {
    const takeProfit = position.takeProfit;
    const currentPrice = position.currentPrice || position.markPrice;
    const entryPrice = position.entryPrice;

    if (!takeProfit || !currentPrice || !entryPrice) {
      return null;
    }

    const targetDistance = Math.abs(takeProfit - entryPrice);
    const currentDistance = Math.abs(currentPrice - entryPrice);
    const progress = (currentDistance / targetDistance) * 100;

    return {
      targetPrice: takeProfit,
      progress: Math.min(progress, 100),
      remaining: Math.max(0, 100 - progress),
      distance: Math.abs(takeProfit - currentPrice)
    };
  }

  /**
   * 计算止损距离
   */
  calculateStopLossDistance(position, currentPrice) {
    const stopLoss = position.stopLoss;
    if (!stopLoss || !currentPrice || currentPrice <= 0) {
      return null;
    }

    const distance = Math.abs(currentPrice - stopLoss);
    const distancePercent = (distance / currentPrice) * 100;

    return {
      stopLossPrice: stopLoss,
      distance,
      distancePercent,
      isClose: distancePercent < 5 // 距离止损小于5%算危险
    };
  }

  /**
   * 计算仓位价值
   */
  calculatePositionValue(position, currentPrice) {
    if (!currentPrice || currentPrice <= 0) {
      return {
        currentValue: 0,
        entryValue: 0,
        valueChange: 0,
        valueChangePercent: 0
      };
    }

    const entryPrice = position.entryPrice || position.avgPrice || 0;
    const size = position.size || position.contracts || position.amount || 0;

    const currentValue = currentPrice * size;
    const entryValue = entryPrice * size;
    const valueChange = currentValue - entryValue;
    const valueChangePercent = entryValue > 0 ? (valueChange / entryValue) * 100 : 0;

    return {
      currentValue,
      entryValue,
      valueChange,
      valueChangePercent
    };
  }

  /**
   * 计算收益率（考虑杠杆）
   */
  calculateReturnRate(position, currentPrice) {
    const entryPrice = position.entryPrice || position.avgPrice || 0;
    const leverage = position.leverage || 1;

    if (!currentPrice || !entryPrice || entryPrice <= 0 || currentPrice <= 0) {
      return 0;
    }

    const side = position.side;
    let returnRate = 0;

    if (side === 'long' || side === 'LONG') {
      returnRate = ((currentPrice - entryPrice) / entryPrice) * 100 * leverage;
    } else if (side === 'short' || side === 'SHORT') {
      returnRate = ((entryPrice - currentPrice) / entryPrice) * 100 * leverage;
    }

    return returnRate;
  }

  /**
   * 计算安全边际（距离强平的距离）
   */
  calculateSafetyMargin(position, currentPrice) {
    const liquidationPrice = position.liquidationPrice;

    if (!liquidationPrice || !currentPrice || currentPrice <= 0) {
      return {
        hasLiquidation: false,
        distance: null,
        distancePercent: null,
        riskLevel: 'UNKNOWN'
      };
    }

    const distance = Math.abs(currentPrice - liquidationPrice);
    const distancePercent = (distance / currentPrice) * 100;

    let riskLevel = 'LOW';
    if (distancePercent < 5) {
      riskLevel = 'CRITICAL';
    } else if (distancePercent < 10) {
      riskLevel = 'HIGH';
    } else if (distancePercent < 20) {
      riskLevel = 'MEDIUM';
    }

    return {
      hasLiquidation: true,
      liquidationPrice,
      distance,
      distancePercent,
      riskLevel
    };
  }

  /**
   * 评估仓位风险等级
   */
  assessPositionRisk(enhancedPosition) {
    const factors = [];
    let riskScore = 0;

    // 因素1：安全边际
    if (enhancedPosition.safetyMargin?.riskLevel === 'CRITICAL') {
      riskScore += 50;
      factors.push('距离强平极近');
    } else if (enhancedPosition.safetyMargin?.riskLevel === 'HIGH') {
      riskScore += 30;
      factors.push('距离强平较近');
    } else if (enhancedPosition.safetyMargin?.riskLevel === 'MEDIUM') {
      riskScore += 15;
    }

    // 因素2：止损距离
    if (enhancedPosition.realtimePnl?.stopLossDistance?.isClose) {
      riskScore += 20;
      factors.push('接近止损');
    }

    // 因素3：亏损程度
    const pnlPercent = enhancedPosition.realtimePnl?.unrealizedPnlPercent || 0;
    if (pnlPercent < -10) {
      riskScore += 30;
      factors.push('深度亏损');
    } else if (pnlPercent < -5) {
      riskScore += 15;
      factors.push('亏损中');
    }

    // 因素4：杠杆倍数
    const leverage = enhancedPosition.leverage || 1;
    if (leverage >= 10) {
      riskScore += 20;
      factors.push('高杠杆');
    } else if (leverage >= 5) {
      riskScore += 10;
    }

    let level = 'LOW';
    if (riskScore >= 60) {
      level = 'CRITICAL';
    } else if (riskScore >= 40) {
      level = 'HIGH';
    } else if (riskScore >= 20) {
      level = 'MEDIUM';
    }

    return {
      level,
      score: riskScore,
      factors
    };
  }

  /**
   * 计算持仓健康度评分 (0-100)
   */
  calculateHealthScore(enhancedPosition) {
    let score = 100;

    // 扣分项1：风险等级
    const riskLevel = enhancedPosition.riskLevel?.level;
    if (riskLevel === 'CRITICAL') {
      score -= 50;
    } else if (riskLevel === 'HIGH') {
      score -= 30;
    } else if (riskLevel === 'MEDIUM') {
      score -= 15;
    }

    // 扣分项2：亏损
    const pnlPercent = enhancedPosition.realtimePnl?.unrealizedPnlPercent || 0;
    if (pnlPercent < -20) {
      score -= 30;
    } else if (pnlPercent < -10) {
      score -= 20;
    } else if (pnlPercent < -5) {
      score -= 10;
    }

    // 加分项：盈利
    if (pnlPercent > 10) {
      score += 10;
    } else if (pnlPercent > 5) {
      score += 5;
    }

    // 扣分项3：安全边际
    const safetyMargin = enhancedPosition.safetyMargin?.distancePercent || 100;
    if (safetyMargin < 5) {
      score -= 20;
    } else if (safetyMargin < 10) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算盈亏波动率（基于历史数据）
   */
  calculatePnlVolatility(position) {
    // 这里需要历史盈亏数据，暂时返回估算值
    // TODO: 接入历史盈亏数据库
    const leverage = position.leverage || 1;
    const estimatedVolatility = leverage * 2; // 简化估算：波动率约为杠杆的2倍

    return {
      dailyVolatility: estimatedVolatility,
      weeklyVolatility: estimatedVolatility * Math.sqrt(7),
      estimatedMaxDrawdown: estimatedVolatility * 2
    };
  }

  /**
   * 计算所有持仓的汇总统计
   */
  calculatePositionSummary(enhancedPositions) {
    if (!enhancedPositions || enhancedPositions.length === 0) {
      return {
        totalPositions: 0,
        totalValue: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        profitablePositions: 0,
        losingPositions: 0,
        averageHealthScore: 0,
        highRiskCount: 0
      };
    }

    const totalValue = enhancedPositions.reduce((sum, pos) =>
      sum + (pos.positionValue?.currentValue || 0), 0);

    const totalPnl = enhancedPositions.reduce((sum, pos) =>
      sum + (pos.realtimePnl?.unrealizedPnl || 0), 0);

    const profitablePositions = enhancedPositions.filter(pos =>
      (pos.realtimePnl?.unrealizedPnl || 0) > 0).length;

    const losingPositions = enhancedPositions.filter(pos =>
      (pos.realtimePnl?.unrealizedPnl || 0) < 0).length;

    const averageHealthScore = enhancedPositions.reduce((sum, pos) =>
      sum + (pos.healthScore || 0), 0) / enhancedPositions.length;

    const highRiskCount = enhancedPositions.filter(pos =>
      ['HIGH', 'CRITICAL'].includes(pos.riskLevel?.level)).length;

    const totalPnlPercent = totalValue > 0 ? (totalPnl / totalValue) * 100 : 0;

    return {
      totalPositions: enhancedPositions.length,
      totalValue,
      totalPnl,
      totalPnlPercent,
      profitablePositions,
      losingPositions,
      averageHealthScore: Math.round(averageHealthScore),
      highRiskCount,
      needsAttention: highRiskCount > 0 || averageHealthScore < 50
    };
  }
}

module.exports = new PositionMonitorService();
