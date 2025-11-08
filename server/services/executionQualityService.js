/**
 * 交易执行质量监控服务
 * 提供滑点分析、成交率统计、执行延迟监控等功能
 */

class ExecutionQualityService {
  constructor() {
    this.executionHistory = []; // 执行历史记录
    this.maxHistoryLength = 1000; // 最多保存1000条记录
  }

  // 计算分位数（百分位）。values需为数字数组
  static percentile(values, p) {
    if (!values || values.length === 0) return null;
    const arr = values.slice().sort((a, b) => a - b);
    const rank = (p / 100) * (arr.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) return arr[low];
    const weight = rank - low;
    return arr[low] * (1 - weight) + arr[high] * weight;
  }

  /**
   * 记录订单执行
   * @param {Object} order - 订单信息
   * @param {Object} executionData - 执行数据
   */
  recordExecution(order, executionData) {
    const execution = {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,

      // 价格信息
      expectedPrice: (order.expectedPrice || order.price || executionData.marketPrice),
      actualPrice: executionData.price,

      // 数量信息
      requestedAmount: order.amount,
      filledAmount: executionData.filled,

      // 时间信息
      orderTime: order.timestamp,
      executionTime: executionData.timestamp,

      // 状态
      status: executionData.status, // 'filled', 'partial', 'rejected'

      timestamp: Date.now()
    };

    // 计算执行指标
    execution.slippage = this.calculateSlippage(execution);
    execution.latency = this.calculateLatency(execution);
    execution.fillRate = this.calculateFillRate(execution);

    this.executionHistory.push(execution);

    // 限制历史记录长度
    if (this.executionHistory.length > this.maxHistoryLength) {
      this.executionHistory.shift();
    }

    return execution;
  }

  /**
   * 计算滑点
   * 滑点 = (实际成交价 - 预期价格) / 预期价格
   */
  calculateSlippage(execution) {
    const expectedPrice = execution.expectedPrice;
    const actualPrice = execution.actualPrice;

    if (!expectedPrice || !actualPrice || expectedPrice <= 0 || actualPrice <= 0) {
      return null;
    }

    let slippageBps = 0;
    if (execution.side === 'buy' || execution.side === 'LONG') {
      // 买入：实际价高于预期为负滑点
      slippageBps = ((actualPrice - expectedPrice) / expectedPrice) * 10000;
    } else if (execution.side === 'sell' || execution.side === 'SHORT') {
      // 卖出：实际价低于预期为负滑点
      slippageBps = ((expectedPrice - actualPrice) / expectedPrice) * 10000;
    }

    let severity = 'GOOD';
    if (Math.abs(slippageBps) >= 100) {
      severity = 'CRITICAL'; // 滑点超过1%
    } else if (Math.abs(slippageBps) >= 50) {
      severity = 'HIGH'; // 滑点超过0.5%
    } else if (Math.abs(slippageBps) >= 20) {
      severity = 'MEDIUM'; // 滑点超过0.2%
    }

    return {
      bps: slippageBps, // 基点(1bp = 0.01%)
      percent: slippageBps / 100,
      severity,
      isFavorable: slippageBps < 0 // 负滑点是有利的
    };
  }

  /**
   * 计算成交率
   */
  calculateFillRate(execution) {
    const requested = execution.requestedAmount;
    const filled = execution.filledAmount;

    if (!requested || requested <= 0) {
      return null;
    }

    const fillRate = (filled / requested) * 100;

    let status = 'FULL';
    if (fillRate < 50) {
      status = 'POOR';
    } else if (fillRate < 90) {
      status = 'PARTIAL';
    } else if (fillRate < 100) {
      status = 'NEAR_FULL';
    }

    return {
      percent: fillRate,
      filled,
      requested,
      unfilled: requested - filled,
      status
    };
  }

  /**
   * 计算执行延迟（毫秒）
   */
  calculateLatency(execution) {
    const orderTime = execution.orderTime;
    const executionTime = execution.executionTime;

    if (!orderTime || !executionTime) {
      return null;
    }

    const latencyMs = executionTime - orderTime;

    let rating = 'EXCELLENT';
    if (latencyMs > 5000) {
      rating = 'POOR'; // 超过5秒
    } else if (latencyMs > 2000) {
      rating = 'SLOW'; // 超过2秒
    } else if (latencyMs > 1000) {
      rating = 'ACCEPTABLE'; // 超过1秒
    } else if (latencyMs > 500) {
      rating = 'GOOD'; // 超过0.5秒
    }

    return {
      ms: latencyMs,
      seconds: latencyMs / 1000,
      rating
    };
  }

  /**
   * 获取执行统计（指定时间段）
   * @param {string} period - 时间段 '1h', '24h', '7d', 'all'
   */
  getExecutionStatistics(period = '24h') {
    const now = Date.now();
    let timeWindow;

    switch (period) {
      case '1h':
        timeWindow = 60 * 60 * 1000;
        break;
      case '24h':
        timeWindow = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        timeWindow = 7 * 24 * 60 * 60 * 1000;
        break;
      case 'all':
        timeWindow = Infinity;
        break;
      default:
        timeWindow = 24 * 60 * 60 * 1000;
    }

    const relevantExecutions = this.executionHistory.filter(exec =>
      now - exec.timestamp <= timeWindow
    );

    if (relevantExecutions.length === 0) {
      return {
        period,
        totalExecutions: 0,
        slippage: null,
        fillRate: null,
        latency: null,
        quality: 'UNKNOWN'
      };
    }

    // 1. 滑点统计
    const slippageStats = this.calculateSlippageStats(relevantExecutions);

    // 2. 成交率统计
    const fillRateStats = this.calculateFillRateStats(relevantExecutions);

    // 3. 延迟统计
    const latencyStats = this.calculateLatencyStats(relevantExecutions);

    // 4. 综合质量评分
    const qualityScore = this.calculateQualityScore(slippageStats, fillRateStats, latencyStats);

    return {
      period,
      totalExecutions: relevantExecutions.length,
      slippage: slippageStats,
      fillRate: fillRateStats,
      latency: latencyStats,
      qualityScore,
      quality: this.determineQuality(qualityScore),
      timeRange: {
        start: new Date(Math.min(...relevantExecutions.map(e => e.timestamp))),
        end: new Date(Math.max(...relevantExecutions.map(e => e.timestamp)))
      }
    };
  }

  /**
   * 计算滑点统计
   */
  calculateSlippageStats(executions) {
    const slippages = executions
      .map(e => e.slippage)
      .filter(s => s && s.bps !== null);

    if (slippages.length === 0) {
      return null;
    }

    const bpsValues = slippages.map(s => s.bps);
    const avgSlippageBps = bpsValues.reduce((sum, bps) => sum + bps, 0) / bpsValues.length;

    const favorableCount = slippages.filter(s => s.isFavorable).length;
    const unfavorableCount = slippages.length - favorableCount;

    const absValues = bpsValues.map(v => Math.abs(v));
    const maxSlippage = Math.max(...absValues);
    const minSlippage = Math.min(...absValues);

    // 分位数（使用绝对值衡量规模）
    const p50 = ExecutionQualityService.percentile(absValues, 50);
    const p95 = ExecutionQualityService.percentile(absValues, 95);

    // 直方图（abs bps）
    const bins = [0, 10, 20, 50, 100];
    const histogram = { '<10': 0, '10-20': 0, '20-50': 0, '50-100': 0, '>=100': 0 };
    absValues.forEach(v => {
      if (v < 10) histogram['<10']++;
      else if (v < 20) histogram['10-20']++;
      else if (v < 50) histogram['20-50']++;
      else if (v < 100) histogram['50-100']++;
      else histogram['>=100']++;
    });

    return {
      average: avgSlippageBps,
      averagePercent: avgSlippageBps / 100,
      max: maxSlippage,
      min: minSlippage,
      p50,
      p95,
      histogram,
      favorableCount,
      unfavorableCount,
      favorableRate: (favorableCount / slippages.length) * 100
    };
  }

  /**
   * 计算成交率统计
   */
  calculateFillRateStats(executions) {
    const fillRates = executions
      .map(e => e.fillRate)
      .filter(f => f && f.percent !== null);

    if (fillRates.length === 0) {
      return null;
    }

    const percentValues = fillRates.map(f => f.percent);
    const avgFillRate = percentValues.reduce((sum, rate) => sum + rate, 0) / percentValues.length;

    const fullFills = fillRates.filter(f => f.status === 'FULL').length;
    const partialFills = fillRates.filter(f => f.status === 'PARTIAL' || f.status === 'NEAR_FULL').length;
    const poorFills = fillRates.filter(f => f.status === 'POOR').length;

    return {
      average: avgFillRate,
      fullFillCount: fullFills,
      partialFillCount: partialFills,
      poorFillCount: poorFills,
      fullFillRate: (fullFills / fillRates.length) * 100
    };
  }

  /**
   * 计算延迟统计
   */
  calculateLatencyStats(executions) {
    const latencies = executions
      .map(e => e.latency)
      .filter(l => l && l.ms !== null);

    if (latencies.length === 0) {
      return null;
    }

    const msValues = latencies.map(l => l.ms);
    const avgLatency = msValues.reduce((sum, ms) => sum + ms, 0) / msValues.length;
    const maxLatency = Math.max(...msValues);
    const minLatency = Math.min(...msValues);

    const p50 = ExecutionQualityService.percentile(msValues, 50);
    const p95 = ExecutionQualityService.percentile(msValues, 95);

    const excellentCount = latencies.filter(l => l.rating === 'EXCELLENT').length;
    const goodCount = latencies.filter(l => l.rating === 'GOOD').length;
    const acceptableCount = latencies.filter(l => l.rating === 'ACCEPTABLE').length;
    const slowCount = latencies.filter(l => l.rating === 'SLOW').length;
    const poorCount = latencies.filter(l => l.rating === 'POOR').length;

    return {
      average: avgLatency,
      averageSeconds: avgLatency / 1000,
      max: maxLatency,
      min: minLatency,
      p50,
      p95,
      distribution: {
        excellent: excellentCount,
        good: goodCount,
        acceptable: acceptableCount,
        slow: slowCount,
        poor: poorCount
      }
    };
  }

  /**
   * 计算综合质量评分 (0-100)
   */
  calculateQualityScore(slippageStats, fillRateStats, latencyStats) {
    let score = 100;

    // 滑点影响（权重40%）
    if (slippageStats) {
      const avgSlippage = Math.abs(slippageStats.average);
      if (avgSlippage >= 100) {
        score -= 40; // 平均滑点超过1%
      } else if (avgSlippage >= 50) {
        score -= 25; // 平均滑点超过0.5%
      } else if (avgSlippage >= 20) {
        score -= 15; // 平均滑点超过0.2%
      } else if (avgSlippage >= 10) {
        score -= 8; // 平均滑点超过0.1%
      }
    }

    // 成交率影响（权重30%）
    if (fillRateStats) {
      const avgFillRate = fillRateStats.average;
      if (avgFillRate < 50) {
        score -= 30; // 平均成交率低于50%
      } else if (avgFillRate < 80) {
        score -= 20; // 平均成交率低于80%
      } else if (avgFillRate < 95) {
        score -= 10; // 平均成交率低于95%
      }
    }

    // 延迟影响（权重30%）
    if (latencyStats) {
      const avgLatency = latencyStats.average;
      if (avgLatency > 5000) {
        score -= 30; // 平均延迟超过5秒
      } else if (avgLatency > 2000) {
        score -= 20; // 平均延迟超过2秒
      } else if (avgLatency > 1000) {
        score -= 12; // 平均延迟超过1秒
      } else if (avgLatency > 500) {
        score -= 6; // 平均延迟超过0.5秒
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 确定执行质量等级
   */
  determineQuality(score) {
    if (score >= 90) {
      return 'EXCELLENT';
    } else if (score >= 75) {
      return 'GOOD';
    } else if (score >= 60) {
      return 'ACCEPTABLE';
    } else if (score >= 40) {
      return 'POOR';
    } else {
      return 'CRITICAL';
    }
  }

  /**
   * 获取最近N次执行
   */
  getRecentExecutions(count = 10) {
    return this.executionHistory.slice(-count);
  }

  /**
   * 按交易对统计
   */
  getStatsBySymbol(symbol, period = '24h') {
    const now = Date.now();
    let timeWindow;

    switch (period) {
      case '1h':
        timeWindow = 60 * 60 * 1000;
        break;
      case '24h':
        timeWindow = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        timeWindow = 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        timeWindow = 24 * 60 * 60 * 1000;
    }

    const symbolExecutions = this.executionHistory.filter(exec =>
      exec.symbol === symbol && now - exec.timestamp <= timeWindow
    );

    return this.getExecutionStatistics.call(
      { executionHistory: symbolExecutions },
      period
    );
  }

  /**
   * 重置历史记录
   */
  resetHistory() {
    this.executionHistory = [];
  }
}

module.exports = new ExecutionQualityService();
