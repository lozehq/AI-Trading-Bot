/**
 * 实时监控服务
 * 整合风控、订单、持仓、AI分析等所有状态，提供统一的监控接口
 */

const EventEmitter = require('events');
const riskControl = require('./RiskControl');
const orderMonitor = require('./OrderMonitor');
const positionSyncer = require('./PositionSyncer');
const positionMonitorService = require('./positionMonitorService');
const fundManagementService = require('./fundManagementService');
const executionQualityService = require('./executionQualityService');
const accountStateService = require('./accountStateService');
const alertingService = require('./alertingService');

class MonitoringService extends EventEmitter {
  constructor() {
    super();

    this.state = {
      autoTradingStatus: {
        enabled: false,
        symbol: null,
        mode: 'paper',
        lastSignalTime: null,
        lastTradeTime: null,
        interval: 60000
      },

      riskStatus: {
        tradingPaused: false,
        pauseReason: null,
        currentBalance: 10000,
        dailyProfitLoss: 0,
        dailyLossPercent: 0,
        drawdownPercent: 0,
        consecutiveLosses: 0,
        dailyTrades: 0
      },

      orderStatus: {
        monitoredCount: 0,
        pendingOrders: [],
        recentlyFilled: [],
        recentlyCanceled: [],
        failedOrders: []
      },

      positionStatus: {
        syncEnabled: false,
        lastSyncTime: null,
        positionCount: 0,
        totalValue: 0,
        totalUnrealizedPnl: 0,
        positions: []
      },

      // 新增：增强的仓位监控状态
      enhancedPositionStatus: {
        lastUpdateTime: null,
        enhancedPositions: [],
        positionSummary: null,
        averageHealthScore: 0,
        highRiskCount: 0
      },

      // 新增：资金管理监控状态
      fundManagementStatus: {
        lastUpdateTime: null,
        fundUtilization: null,
        effectiveLeverage: null,
        riskExposure: null,
        availableCapacity: null,
        fundHealthScore: 0
      },

      // 新增：执行质量监控状态
      executionQualityStatus: {
        lastUpdateTime: null,
        slippageStats: null,
        fillRateStats: null,
        latencyStats: null,
        qualityScore: 0
      },

      // 新增：账户状态聚合
      accountStateStatus: {
        lastUpdateTime: null,
        balance: null,
        positions: [],
        recentTrades: [],
        riskControl: null,
        executionQuality: null
      },

      aiAnalysis: {
        lastAnalysisTime: null,
        currentSignal: null,
        confidence: 0,
        reasoning: null,
        analysisCount: 0
      },

      systemHealth: {
        uptime: 0,
        startTime: Date.now(),
        errors: [],
        warnings: []
      },

      // 🆕 模型叙述状态（nof1.ai 风格）
      narrative: {
        history: [], // 叙述历史（最多保留50条）
        lastNarrativeTime: 0,
        currentIntent: null,
        nextAction: null,
        recentHashes: []
      }
    };

    this.setupEventListeners();
    this.startHealthMonitoring();
    this.startNarrativeHeartbeat(); // 🆕 启动叙述心跳
    // 🆕 启动持仓同步（根据交易引擎模式）
    try {
      const getTradingEngine = require('./tradingEngineInstance');
      const engine = getTradingEngine();
      const mode = (engine && engine.tradingMode) || (process.env.TRADING_MODE || 'paper');
      positionSyncer.start(mode);
    } catch (e) {
      console.warn('[Monitoring] 启动持仓同步失败:', e.message);
    }
    
    // 🆕 生成初始化叙述
    setTimeout(() => {
      this.generateInitialNarrative();
    }, 1000);
  }

  /**
   * 设置事件监听
   */
  setupEventListeners() {
    // 监听风控事件
    riskControl.on('tradingPaused', ({ reason, message }) => {
      this.state.riskStatus.tradingPaused = true;
      this.state.riskStatus.pauseReason = reason;
      this.addWarning(`交易已暂停: ${message || reason}`);
      this.emit('statusUpdate', { type: 'risk', data: this.state.riskStatus });
      // 🆕 生成风险叙述
      this.generateRiskNarrative('trading_paused', { reason: message || reason });
    });

    riskControl.on('tradingResumed', () => {
      this.state.riskStatus.tradingPaused = false;
      this.state.riskStatus.pauseReason = null;
      this.emit('statusUpdate', { type: 'risk', data: this.state.riskStatus });
    });

    riskControl.on('tradeLoss', ({ consecutiveLosses, profitLoss }) => {
      this.state.riskStatus.consecutiveLosses = consecutiveLosses;
      this.addWarning(`连续亏损 ${consecutiveLosses} 次，本次: $${profitLoss.toFixed(2)}`);
      this.emit('statusUpdate', { type: 'risk', data: this.state.riskStatus });
    });

    // 监听订单事件
    orderMonitor.on('orderUpdate', ({ orderId, order }) => {
      this.emit('orderUpdate', { orderId, order });
    });

    orderMonitor.on('orderFilled', ({ orderId, order }) => {
      this.state.orderStatus.recentlyFilled.unshift({
        orderId,
        symbol: order.symbol,
        price: order.price,
        amount: order.filled,
        timestamp: Date.now()
      });

      // 只保留最近10条
      if (this.state.orderStatus.recentlyFilled.length > 10) {
        this.state.orderStatus.recentlyFilled.pop();
      }

      this.emit('statusUpdate', { type: 'order', data: this.state.orderStatus });
      this.emit('orderFilled', { orderId, order });
    });

    orderMonitor.on('orderCanceled', ({ orderId, order }) => {
      this.state.orderStatus.recentlyCanceled.unshift({
        orderId,
        symbol: order?.symbol,
        timestamp: Date.now()
      });

      if (this.state.orderStatus.recentlyCanceled.length > 10) {
        this.state.orderStatus.recentlyCanceled.pop();
      }

      this.emit('statusUpdate', { type: 'order', data: this.state.orderStatus });
    });

    orderMonitor.on('orderFailed', ({ orderId, order }) => {
      this.state.orderStatus.failedOrders.unshift({
        orderId,
        symbol: order?.symbol,
        status: order?.status,
        timestamp: Date.now()
      });

      this.addError(`订单失败: ${orderId} - ${order?.status}`);
      this.emit('statusUpdate', { type: 'order', data: this.state.orderStatus });
    });

    // 监听持仓事件
    positionSyncer.on('syncCompleted', ({ count, timestamp }) => {
      this.state.positionStatus.lastSyncTime = timestamp;
      this.state.positionStatus.positionCount = count;
      this.emit('statusUpdate', { type: 'position', data: this.state.positionStatus });
    });

    positionSyncer.on('positionOpened', (position) => {
      this.emit('positionOpened', position);
    });

    positionSyncer.on('positionClosed', (position) => {
      this.emit('positionClosed', position);
    });

    positionSyncer.on('syncError', ({ error }) => {
      this.addError(`持仓同步失败: ${error}`);
    });
  }

  /**
   * 启动健康监控
   */
  startHealthMonitoring() {
    setInterval(() => {
      this.updateSystemHealth();
    }, 5000); // 每5秒更新一次

    // 启动实时监控更新
    this.startRealTimeMonitoring();
  }

  /**
   * 启动实时监控更新
   */
  startRealTimeMonitoring() {
    // 每30秒更新增强监控数据
    setInterval(async () => {
      try {
        await this.updateEnhancedMonitoring();
      } catch (error) {
        console.error('更新增强监控数据失败:', error.message);
        this.addError(`增强监控更新失败: ${error.message}`);
      }
    }, 30000); // 每30秒更新一次

    // 立即执行一次更新
    setTimeout(() => {
      this.updateEnhancedMonitoring().catch(error => {
        console.error('初始增强监控更新失败:', error.message);
      });
    }, 1000);
  }

  /**
   * 更新增强监控数据
   */
  async updateEnhancedMonitoring() {
    try {
      // 1. 更新增强仓位监控（用于资金管理的持仓明细）
      await this.updateEnhancedPositionStatus();
      
      // 2. 先更新账户状态（提供最新 balance/positions 给资金管理）
      await this.updateAccountStateStatus();
      
      // 3. 再更新资金管理监控（依赖上一步的账户状态与增强持仓）
      await this.updateFundManagementStatus();
      
      // 4. 最后更新执行质量监控
      await this.updateExecutionQualityStatus();

      this.emit('enhancedMonitoringUpdated', this.state);
      
    } catch (error) {
      console.error('更新增强监控数据失败:', error);
      throw error;
    }
  }

  /**
   * 更新系统健康状态
   */
  updateSystemHealth() {
    this.state.systemHealth.uptime = Date.now() - this.state.systemHealth.startTime;

    // 清理旧的错误和警告（保留最近50条）
    if (this.state.systemHealth.errors.length > 50) {
      this.state.systemHealth.errors = this.state.systemHealth.errors.slice(0, 50);
    }
    if (this.state.systemHealth.warnings.length > 50) {
      this.state.systemHealth.warnings = this.state.systemHealth.warnings.slice(0, 50);
    }
  }

  /**
   * 更新自动交易状态
   */
  updateAutoTradingStatus(status) {
    this.state.autoTradingStatus = {
      ...this.state.autoTradingStatus,
      ...status
    };
    this.emit('statusUpdate', { type: 'autoTrading', data: this.state.autoTradingStatus });
  }

  /**
   * 更新AI分析状态
   */
  updateAIAnalysis(analysis) {
    this.state.aiAnalysis = {
      lastAnalysisTime: Date.now(),
      currentSignal: analysis.signal,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      analysisCount: this.state.aiAnalysis.analysisCount + 1
    };
    this.emit('statusUpdate', { type: 'ai', data: this.state.aiAnalysis });
    this.emit('aiAnalysis', analysis);
    
    // 🆕 生成AI分析叙述（nof1.ai 风格）
    this.generateAIAnalysisNarrative(analysis);
  }

  /**
   * 刷新所有状态（手动触发）
   */
  async refreshAllStatus() {
    // 更新风控状态
    this.state.riskStatus = riskControl.getStatus();

    // 更新订单监控状态
    this.state.orderStatus.monitoredCount = orderMonitor.getMonitoredOrders().length;
    this.state.orderStatus.pendingOrders = orderMonitor.getMonitoredOrders();

    // 更新持仓同步状态
    const positionStatus = positionSyncer.getStatus();
    this.state.positionStatus = {
      ...this.state.positionStatus,
      ...positionStatus,
      positions: positionSyncer.getPositions()
    };

    this.emit('fullRefresh', this.state);

    return this.state;
  }

  /**
   * 获取完整状态
   */
  getFullStatus() {
    return {
      ...this.state,
      timestamp: Date.now()
    };
  }

  /**
   * 获取摘要状态（用于仪表盘）
   */
  getSummary() {
    return {
      trading: {
        enabled: this.state.autoTradingStatus.enabled,
        paused: this.state.riskStatus.tradingPaused,
        symbol: this.state.autoTradingStatus.symbol,
        mode: this.state.autoTradingStatus.mode
      },
      risk: {
        balance: this.state.riskStatus.currentBalance,
        dailyPnL: this.state.riskStatus.dailyProfitLoss,
        drawdown: this.state.riskStatus.drawdownPercent,
        consecutiveLosses: this.state.riskStatus.consecutiveLosses
      },
      orders: {
        monitoring: this.state.orderStatus.monitoredCount,
        recentFills: this.state.orderStatus.recentlyFilled.length,
        failures: this.state.orderStatus.failedOrders.length
      },
      positions: {
        count: this.state.positionStatus.positionCount,
        totalValue: this.state.positionStatus.totalValue,
        unrealizedPnl: this.state.positionStatus.totalUnrealizedPnl
      },
      ai: {
        lastSignal: this.state.aiAnalysis.currentSignal,
        confidence: this.state.aiAnalysis.confidence,
        totalAnalyses: this.state.aiAnalysis.analysisCount
      },
      system: {
        uptime: this.state.systemHealth.uptime,
        errorCount: this.state.systemHealth.errors.length,
        warningCount: this.state.systemHealth.warnings.length
      },
      timestamp: Date.now()
    };
  }

  /**
   * 添加错误记录
   */
  addError(message) {
    this.state.systemHealth.errors.unshift({
      message,
      timestamp: Date.now(),
      type: 'error'
    });
    this.emit('error', { message, timestamp: Date.now() });
    console.error(`[监控] ${message}`);

    alertingService.notify({
      level: 'error',
      title: 'System Error',
      message,
      dedupeKey: `monitoring:error:${message}`,
      context: { source: 'MonitoringService' },
      cooldownMs: Number(process.env.ALERT_MONITORING_COOLDOWN_MS) || 60000
    }).catch(err => {
        console.error('[Alerting] error notify failed:', err.message);
        // 记录错误日志，避免通知系统失败影响主监控
        this.logError('notification_error', {
          originalMessage: message,
          notificationError: err.message
        });
      });
  }

  /**
   * 添加警告记录
   */
  addWarning(message) {
    this.state.systemHealth.warnings.unshift({
      message,
      timestamp: Date.now(),
      type: 'warning'
    });
    this.emit('warning', { message, timestamp: Date.now() });
    console.warn(`[监控] ${message}`);

    alertingService.notify({
      level: 'warning',
      title: 'System Warning',
      message,
      dedupeKey: `monitoring:warning:${message}`,
      context: { source: 'MonitoringService' },
      cooldownMs: Number(process.env.ALERT_MONITORING_COOLDOWN_MS) || 60000
    }).catch(err => {
        console.error('[Alerting] warning notify failed:', err.message);
        // 记录错误，但不中断监控服务
        this.logError('warning_notification_error', {
          originalMessage: message,
          notificationError: err.message
        });
      });
  }

  /**
   * 获取最近的事件日志
   */
  getRecentLogs(limit = 20) {
    const allLogs = [
      ...this.state.systemHealth.errors.map(e => ({ ...e, level: 'error' })),
      ...this.state.systemHealth.warnings.map(w => ({ ...w, level: 'warning' }))
    ];

    // 按时间排序
    allLogs.sort((a, b) => b.timestamp - a.timestamp);

    return allLogs.slice(0, limit);
  }

  /**
   * 清除日志
   */
  clearLogs() {
    this.state.systemHealth.errors = [];
    this.state.systemHealth.warnings = [];
    this.emit('logsClear');
  }

  /**
   * 更新增强仓位监控状态
   */
  async updateEnhancedPositionStatus() {
    try {
      // 获取当前持仓和价格数据
      const positions = this.state.positionStatus.positions;
      const currentPrices = await this.fetchCurrentPrices(positions);

      // 使用positionMonitorService增强持仓数据
      const enhancedPositions = positionMonitorService.enhancePositions(positions, currentPrices);

      this.state.enhancedPositionStatus = {
        lastUpdateTime: Date.now(),
        enhancedPositions,
        positionSummary: positionMonitorService.calculatePositionSummary(enhancedPositions)
      };

      this.emit('statusUpdate', { type: 'enhancedPosition', data: this.state.enhancedPositionStatus });
    } catch (error) {
      console.error('更新增强仓位监控状态失败:', error.message);
      this.addError(`增强仓位监控更新失败: ${error.message}`);
    }
  }

  /**
   * 更新资金管理监控状态
   */
  async updateFundManagementStatus() {
    try {
      const balance = this.state.accountStateStatus?.balance;
      const positions = this.state.enhancedPositionStatus?.enhancedPositions || [];

      console.log('更新资金管理监控状态 - 余额:', balance, '持仓数量:', positions.length);

      // 使用fundManagementService增强余额数据
      const enhancedBalance = fundManagementService.enhanceBalance(balance, positions);
      
      console.log('增强后的余额数据:', enhancedBalance);

      this.state.fundManagementStatus = {
        lastUpdateTime: Date.now(),
        fundUtilization: enhancedBalance?.fundUtilization || { utilizationRate: 0, availableMargin: 0 },
        effectiveLeverage: enhancedBalance?.effectiveLeverage || { effectiveLeverage: 1, maxLeverage: 10 },
        riskExposure: enhancedBalance?.riskExposure || { riskPercent: 0, riskLevel: 'LOW' },
        availableCapacity: enhancedBalance?.availableCapacity || { available: 0, capacity: 0 },
        fundHealthScore: enhancedBalance?.fundHealthScore || 0
      };

      console.log('资金管理监控状态更新完成:', this.state.fundManagementStatus);
      this.emit('statusUpdate', { type: 'fundManagement', data: this.state.fundManagementStatus });
    } catch (error) {
      console.error('更新资金管理监控状态失败:', error.message);
      this.addError(`资金管理监控更新失败: ${error.message}`);
    }
  }

  /**
   * 更新执行质量监控状态
   */
  async updateExecutionQualityStatus() {
    try {
      console.log('开始更新执行质量监控状态');
      const executionStats = executionQualityService.getExecutionStatistics('24h');
      console.log('执行质量统计数据:', executionStats);

      const recentFromMem = executionQualityService.getRecentExecutions(10).map((e) => ({
        time: e.executionTime || e.timestamp,
        symbol: e.symbol,
        side: e.side,
        expectedPrice: e.expectedPrice,
        actualPrice: e.actualPrice,
        slippageBps: e.slippage?.bps ?? null,
        slippagePercent: e.slippage?.percent ?? null,
        latencyMs: e.latency?.ms ?? null,
        fillRate: e.fillRate?.percent ?? null,
        status: e.status
      }));

      let recentExecutions = recentFromMem;
      if (recentExecutions.length === 0) {
        try {
          const ExecutionService = require('../database/services/ExecutionService');
          recentExecutions = ExecutionService.getRecent(10).map((r) => ({
            time: r.created_at,
            symbol: r.symbol,
            side: r.side,
            expectedPrice: r.expected_price,
            actualPrice: r.actual_price,
            slippageBps: r.slippage_bps,
            slippagePercent: r.slippage_percent,
            latencyMs: r.latency_ms,
            fillRate: r.fill_rate,
            status: r.status
          }));
        } catch (e) {
          // 忽略
        }
      }

      // 维护简易历史序列（最多60点）
      if (!Array.isArray(this.state.executionQualityHistory)) {
        this.state.executionQualityHistory = [];
      }
      const histPoint = {
        ts: Date.now(),
        avgLatency: executionStats?.latency?.average || 0,
        p95Latency: executionStats?.latency?.p95 || 0,
        avgSlippagePercent: (executionStats?.slippage?.average || 0) / 100, // bps->%
        p95SlippagePercent: (executionStats?.slippage?.p95 || 0) / 100,
        avgFillRate: executionStats?.fillRate?.average || 0
      };
      this.state.executionQualityHistory.push(histPoint);
      if (this.state.executionQualityHistory.length > 60) {
        this.state.executionQualityHistory.shift();
      }

      this.state.executionQualityStatus = {
        lastUpdateTime: Date.now(),
        slippageStats: executionStats?.slippage || { average: 0, max: 0, min: 0 },
        fillRateStats: executionStats?.fillRate || { rate: 0, total: 0, filled: 0 },
        latencyStats: executionStats?.latency || { average: 0, max: 0, min: 0 },
        qualityScore: executionStats?.qualityScore || 0,
        // 🆕 最近执行（最多10条），供前端展示明细
        recentExecutions,
        // 🆕 最近历史序列（最多60点下发，前端可选10/30/60窗口）
        history: this.state.executionQualityHistory.slice(-60)
      };

      console.log('执行质量监控状态更新完成:', this.state.executionQualityStatus);
      this.emit('statusUpdate', { type: 'executionQuality', data: this.state.executionQualityStatus });

      // 🆕 SLO 聚合告警：基于 p95 阈值
      try {
        const alertingService = require('./alertingService');
        const p95Latency = this.state.executionQualityStatus?.latencyStats?.p95 || 0;
        const p95Slippage = this.state.executionQualityStatus?.slippageStats?.p95 || 0; // bps abs
        const latencyWarn = Number(process.env.SLO_LATENCY_WARN_MS || 2000);
        const latencyErr = Number(process.env.SLO_LATENCY_ERROR_MS || 5000);
        const slipWarn = Number(process.env.SLO_SLIPPAGE_WARN_BPS || 50);
        const slipErr = Number(process.env.SLO_SLIPPAGE_ERROR_BPS || 100);
        const cooldown = Number(process.env.ALERT_SLO_COOLDOWN_MS || 30000);

        if (p95Latency > latencyErr) {
          alertingService.notify({ level: 'error', title: 'SLO p95 延迟过高', message: `24h p95 延迟 ${Math.round(p95Latency)}ms`, dedupeKey: 'slo:p95:latency:error', cooldownMs: cooldown });
        } else if (p95Latency > latencyWarn) {
          alertingService.notify({ level: 'warning', title: 'SLO p95 延迟偏高', message: `24h p95 延迟 ${Math.round(p95Latency)}ms`, dedupeKey: 'slo:p95:latency:warn', cooldownMs: cooldown });
        }

        if (p95Slippage > slipErr) {
          alertingService.notify({ level: 'error', title: 'SLO p95 滑点过高', message: `24h p95 滑点 ${(p95Slippage/100).toFixed(2)}%`, dedupeKey: 'slo:p95:slippage:error', cooldownMs: cooldown });
        } else if (p95Slippage > slipWarn) {
          alertingService.notify({ level: 'warning', title: 'SLO p95 滑点偏高', message: `24h p95 滑点 ${(p95Slippage/100).toFixed(2)}%`, dedupeKey: 'slo:p95:slippage:warn', cooldownMs: cooldown });
        }
      } catch (e) {
        // 忽略告警错误
      }
    } catch (error) {
      console.error('更新执行质量监控状态失败:', error.message);
      this.addError(`执行质量监控更新失败: ${error.message}`);
    }
  }

  /**
   * 更新账户状态聚合
   */
  async updateAccountStateStatus() {
    try {
      console.log('开始更新账户状态聚合');
      const accountState = await accountStateService.getAccountState();
      console.log('获取到的账户状态:', accountState);

      this.state.accountStateStatus = {
        lastUpdateTime: Date.now(),
        balance: accountState?.balance || null,
        positions: accountState?.positions || [],
        recentTrades: accountState?.recentTrades || [],
        riskControl: accountState?.riskControl || null,
        executionQuality: accountState?.executionQuality || null
      };

      console.log('账户状态聚合更新完成:', this.state.accountStateStatus);
      this.emit('statusUpdate', { type: 'accountState', data: this.state.accountStateStatus });
    } catch (error) {
      console.error('更新账户状态聚合失败:', error.message);
      this.addError(`账户状态聚合更新失败: ${error.message}`);
    }
  }

  /**
   * 获取当前价格数据
   */
  async fetchCurrentPrices(positions) {
    const currentPrices = {};
    
    try {
      // 从持仓数据中提取当前价格（使用标记价格或最新价格）
      for (const position of positions) {
        currentPrices[position.symbol] = position.currentPrice || position.markPrice || 0;
      }
    } catch (error) {
      console.error('获取当前价格失败:', error.message);
    }

    return currentPrices;
  }

  /**
   * 获取增强的监控摘要（包含新监控数据）
   */
  getEnhancedSummary() {
    return {
      ...this.getSummary(),
      enhancedPositions: {
        totalPositions: this.state.enhancedPositionStatus.positionSummary?.totalPositions || 0,
        totalValue: this.state.enhancedPositionStatus.positionSummary?.totalValue || 0,
        totalPnl: this.state.enhancedPositionStatus.positionSummary?.totalPnl || 0,
        averageHealthScore: this.state.enhancedPositionStatus.positionSummary?.averageHealthScore || 0,
        highRiskCount: this.state.enhancedPositionStatus.positionSummary?.highRiskCount || 0
      },
      fundManagement: {
        fundHealthScore: this.state.fundManagementStatus.fundHealthScore || 0,
        utilizationRate: this.state.fundManagementStatus.fundUtilization?.utilizationRate || 0,
        effectiveLeverage: this.state.fundManagementStatus.effectiveLeverage?.effectiveLeverage || 0,
        riskExposure: this.state.fundManagementStatus.riskExposure?.riskPercent || 0
      },
      executionQuality: {
        qualityScore: this.state.executionQualityStatus.qualityScore || 0,
        averageSlippage: this.state.executionQualityStatus.slippageStats?.average || 0,
        averageFillRate: this.state.executionQualityStatus.fillRateStats?.average || 0,
        averageLatency: this.state.executionQualityStatus.latencyStats?.average || 0
      },
      narrative: this.state.narrative
    };
  }

  /**
   * 🆕 启动叙述心跳（无事件时产出观测性叙述）
   */
  startNarrativeHeartbeat() {
    setInterval(() => {
      const timeSinceLastNarrative = Date.now() - this.state.narrative.lastNarrativeTime;
      if (timeSinceLastNarrative > 30000) {
        this.generateHeartbeatNarrative();
      }
    }, 30000);
  }

  /**
   * 🆕 生成心跳叙述（观测-等待）
   */
  generateHeartbeatNarrative() {
    const content = `我正在持续监控市场。当前系统状态正常，${this.state.autoTradingStatus.enabled ? '自动交易运行中' : '待命状态'}。暂无明显信号变化，保持观望。`;
    
    this.addNarrative({
      type: 'observation',
      content,
      intent: 'monitor',
      nextAction: 'continue_monitoring'
    });
  }

  /**
   * 添加叙述到历史并广播
   */
  addNarrative(data) {
    const type = data.type || 'observation';
    const stageMap = {
      system: 'system',
      observation: 'observe',
      ai_analysis: 'decide',
      trade_action: 'act',
      risk_alert: 'review',
      heartbeat: 'observe'
    };

    let content = (data.content || '').trim();
    if (!content) {
      return;
    }

    if (content.length > 480) {
      content = `${content.slice(0, 460)}…`;
    }

    const stage = data.stage || stageMap[type] || 'observe';
    const contentDigest = `${stage}|${content.slice(0, 200)}`;

    if (this.state.narrative.recentHashes.includes(contentDigest)) {
      return;
    }

    this.state.narrative.recentHashes.unshift(contentDigest);
    if (this.state.narrative.recentHashes.length > 8) {
      this.state.narrative.recentHashes.pop();
    }

    let evidence = data.evidence || null;
    if (Array.isArray(evidence)) {
      evidence = evidence
        .slice(0, 5)
        .map(item => {
          if (!item) return null;
          if (typeof item === 'string') return item;
          if (typeof item === 'number') return item.toString();
          if (typeof item === 'object') {
            const parts = [];
            if (item.type) parts.push(item.type);
            if (item.tf || item.timeframe) parts.push(item.tf || item.timeframe);
            if (item.name) parts.push(item.name);
            if (item.value !== undefined) parts.push(String(item.value));
            if (item.detail) parts.push(item.detail);
            return parts.filter(Boolean).join(' ');
          }
          return String(item);
        })
        .filter(Boolean);
    }

    const narrative = {
      id: `narrative_${Date.now()}`,
      timestamp: Date.now(),
      type,
      stage,
      symbol: data.symbol || null,
      content,
      evidence,
      intent: data.intent || null,
      nextAction: data.nextAction || null,
      metrics: data.metrics || null,
      sparkline: Array.isArray(data.sparkline) ? data.sparkline.slice(0, 60) : null
    };

    // 添加到历史（保留最近50条）
    this.state.narrative.history.unshift(narrative);
    if (this.state.narrative.history.length > 50) {
      this.state.narrative.history.pop();
    }

    // 更新当前状态
    this.state.narrative.lastNarrativeTime = Date.now();
    this.state.narrative.currentIntent = data.intent || null;
    this.state.narrative.nextAction = data.nextAction || null;

    // 调试日志
    console.log(` [Narrative] 生成叙述: type=${narrative.type}, stage=${narrative.stage}, id=${narrative.id}`);
    console.log(` [Narrative] 内容: ${narrative.content.substring(0, 120)}...`);

    // 通过 EventEmitter 发送叙述事件（WebSocket 会监听）
    this.emit('narrative', narrative);
    console.log(` [Narrative] 已触发 emit('narrative') 事件`);
  }

  /**
   * 生成AI分析叙述
   */
  generateAIAnalysisNarrative(analysis) {
    const { signal, confidence, reasoning, summary, signalChangeReason, riskLevel, symbol } = analysis;

    const reasoningLines = typeof reasoning === 'string'
      ? reasoning.split(/\n+/).map(line => line.trim()).filter(Boolean)
      : [];
    const highlight = reasoningLines.slice(0, 2).join('\n');

    const parts = [];
    if (summary) parts.push(summary);
    if (signalChangeReason) parts.push(`信号变化原因：${signalChangeReason}`);
    if (highlight) parts.push(highlight);

    if (parts.length === 0) {
      parts.push('我完成了最新的市场分析，当前以风险控制为优先。');
    }

    const normalizedConfidence = Number.isFinite(confidence)
      ? (confidence > 1 ? confidence : confidence * 100)
      : null;

    const evidence = [
      signal ? `信号：${signal}` : null,
      Number.isFinite(normalizedConfidence) ? `置信度：${Math.round(normalizedConfidence)}%` : null,
      riskLevel ? `风险级别：${riskLevel}` : null
    ].filter(Boolean);

    this.addNarrative({
      type: 'ai_analysis',
      stage: 'decide',
      symbol: symbol || analysis?.symbol || null,
      content: parts.join('\n'),
      evidence,
      metrics: Number.isFinite(normalizedConfidence) ? { confidence: Math.round(normalizedConfidence) } : null,
      intent: 'assess_market',
      nextAction: signal === 'HOLD' ? 'continue_monitoring' : 'evaluate_entry'
    });
  }

  ingestNarrativeFromAnalysis(analysis, options = {}) {
    if (!analysis) return;

    const { symbol } = options;
    const attachedSymbol = symbol || analysis.symbol || null;

    const behaviorNarrative = Array.isArray(analysis.behaviorNarrative)
      ? analysis.behaviorNarrative.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : [];

    const decision = analysis.decision || {};
    const rawConfidence = Number.isFinite(decision.confidence)
      ? (decision.confidence > 1 ? decision.confidence : decision.confidence * 100)
      : null;

    const summaryLine = analysis.summary || behaviorNarrative[0] || null;
    const prevSignal = this.state.aiAnalysis?.currentSignal || null;
    const currSignal = analysis?.decision?.signal || analysis?.signal || null;
    const signalChanged = prevSignal && currSignal && prevSignal !== currSignal;
    if (summaryLine) {
      const summaryEvidence = [
        decision.signal ? `信号：${decision.signal}` : null,
        Number.isFinite(rawConfidence) ? `置信度：${Math.round(rawConfidence)}%` : null
      ].filter(Boolean);

      this.addNarrative({
        type: 'ai_analysis',
        stage: 'decide',
        symbol: attachedSymbol,
        content: signalChanged ? `信号变更：${prevSignal} → ${currSignal}\n${summaryLine}` : summaryLine,
        evidence: [
          ...summaryEvidence,
          analysis?.signalChangeReason ? `变更因子：${analysis.signalChangeReason}` : null,
          analysis?.dataCoverage?.coverage !== undefined ? `数据覆盖：${Math.round((analysis.dataCoverage.coverage || 0) * 100)}%` : null,
          analysis?.timeframeStats?.available ? `多周期成功：${analysis.timeframeStats.success}/${analysis.timeframeStats.total}` : null
        ].filter(Boolean),
        metrics: analysis?.performanceMetrics ? {
          totalMs: analysis.performanceMetrics.total,
          collectMs: analysis.performanceMetrics.dataCollection,
          aiMs: analysis.performanceMetrics.aiAnalysis,
          confidence: Number.isFinite(rawConfidence) ? Math.round(rawConfidence) : undefined
        } : (Number.isFinite(rawConfidence) ? { confidence: Math.round(rawConfidence) } : null),
        sparkline: Array.isArray(analysis?.sparkline) ? analysis.sparkline : null,
        intent: analysis.currentIntent || 'assess_market',
        nextAction: Array.isArray(analysis.nextActions) && analysis.nextActions.length
          ? analysis.nextActions[0]
          : null
      });
    }

    const timeline = Array.isArray(analysis.timeline) ? analysis.timeline : [];
    if (timeline.length > 0) {
      const eventStageMap = {
        observe: 'observe',
        observation: 'observe',
        monitor: 'observe',
        decide: 'decide',
        decision: 'decide',
        plan: 'decide',
        evaluate: 'review',
        assess: 'review',
        act: 'act',
        execute: 'act',
        trade: 'act',
        review: 'review',
        adjust: 'review'
      };

      const stageToType = {
        observe: 'observation',
        decide: 'ai_analysis',
        act: 'trade_action',
        review: 'risk_alert'
      };

      timeline.slice(0, 5).forEach(entry => {
        if (!entry) return;
        const eventRaw = (entry.event || entry.stage || '').toString().toLowerCase();
        const stage = eventStageMap[eventRaw] || eventStageMap[entry.type] || 'observe';
        const type = stageToType[stage] || 'observation';

        const lines = [];
        if (entry.intent) {
          lines.push(`意图：${entry.intent}`);
        }
        if (entry.action) {
          lines.push(`计划：${entry.action}`);
        }
        if (entry.summary) {
          lines.push(entry.summary);
        }
        if (entry.risk?.quality) {
          lines.push(`风险：${entry.risk.quality}`);
        }
        if (Array.isArray(entry.risk?.missing) && entry.risk.missing.length > 0) {
          lines.push(`缺失数据：${entry.risk.missing.slice(0, 3).join(', ')}`);
        }

        const evidence = Array.isArray(entry.evidence)
          ? entry.evidence.slice(0, 4).map(ev => {
              if (!ev) return null;
              if (typeof ev === 'string') return ev;
              if (typeof ev === 'object') {
                const parts = [];
                if (ev.type) parts.push(ev.type);
                if (ev.tf || ev.timeframe) parts.push(ev.tf || ev.timeframe);
                if (ev.name) parts.push(ev.name);
                if (ev.value !== undefined) parts.push(String(ev.value));
                return parts.filter(Boolean).join(' ');
              }
              return String(ev);
            }).filter(Boolean)
          : null;

        const content = lines.length > 0
          ? lines.join('\n')
          : `阶段：${eventRaw || stage}`;

        this.addNarrative({
          type,
          stage,
          symbol: attachedSymbol,
          content,
          evidence,
          intent: entry.intent || analysis.currentIntent || null,
          nextAction: entry.action || (Array.isArray(analysis.nextActions) ? analysis.nextActions[0] : null)
        });
      });
    }

    if (Array.isArray(analysis.nextActions) && analysis.nextActions.length > 0) {
      const nextActionSummary = analysis.nextActions
        .slice(0, 3)
        .map(item => `• ${item}`)
        .join('\n');

      this.addNarrative({
        type: 'ai_analysis',
        stage: 'act',
        symbol: attachedSymbol,
        content: `下一步计划：\n${nextActionSummary}`,
        intent: analysis.currentIntent || 'plan_next',
        nextAction: analysis.nextActions[0]
      });
    }
  }

  /**
   * 🆕 生成交易叙述
   */
  generateTradeNarrative(tradeType, tradeData) {
    const { symbol, side, amount, price, reasoning } = tradeData;
    
    let content = '';
    if (tradeType === 'open') {
      content = `我决定${side === 'buy' ? '做多' : '做空'} ${symbol}。\n\n`;
      content += `基于分析：${reasoning || '技术指标显示潜在机会'}，`;
      content += `我以 ${price} USDT 开仓 ${amount} 单位。\n\n`;
      content += `接下来将密切监控持仓表现。`;
    } else {
      const pnl = tradeData.pnl || 0;
      const pnlText = pnl >= 0 ? `盈利 ${pnl.toFixed(2)} USDT` : `亏损 ${Math.abs(pnl).toFixed(2)} USDT`;
      content = `我决定平仓 ${symbol}，平仓价格 ${price} USDT，本次交易${pnlText}。`;
    }

    this.addNarrative({
      type: 'trade_action',
      content,
      evidence: {
        symbol,
        side,
        amount,
        price,
        tradeType
      },
      intent: tradeType === 'open' ? 'enter_position' : 'exit_position',
      nextAction: tradeType === 'open' ? 'monitor_position' : 'evaluate_result'
    });
  }

  /**
   * 🆕 生成风险叙述
   */
  generateRiskNarrative(riskType, riskData) {
    let content = '';
    
    switch (riskType) {
      case 'drawdown':
        content = `⚠️ 风险提示：回撤达到 ${riskData.drawdown?.toFixed(2)}%，已触发风险阈值。我将评估所有持仓。`;
        break;
      case 'trading_paused':
        content = `⚠️ 系统暂停交易：${riskData.reason}。我会等待条件恢复后继续。`;
        break;
      default:
        content = `⚠️ 风险提示：检测到 ${riskType} 风险事件。`;
    }

    this.addNarrative({
      type: 'risk_alert',
      content,
      evidence: {
        riskType,
        data: riskData
      },
      intent: 'risk_management',
      nextAction: 'adjust_strategy'
    });
  }

  /**
   * 🆕 获取叙述历史
   */
  getNarrativeHistory(limit = 20) {
    return this.state.narrative.history.slice(0, limit);
  }

  /**
   * 🆕 生成初始化叙述
   */
  generateInitialNarrative() {
    this.addNarrative({
      type: 'system',
      content: `👋 大家好，我是 AI 交易模型。\n\n我会在这里以第一人称持续叙述我的观察、分析、决策和执行过程。\n\n每一个决策都会附带具体的数据证据和推理逻辑，确保完全透明和可追溯。\n\n让我们开始吧！`,
      intent: 'initialize',
      nextAction: 'start_monitoring'
    });
  }
}

module.exports = new MonitoringService();
