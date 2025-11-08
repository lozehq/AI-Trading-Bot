// 运行时全局策略（进程内）

class RuntimeStrategy {
  constructor() {
    // 默认配置
    this.state = {
      globalRealtime: true,  // 默认开启全链路实时
      tickerTTL: 1000,       // 更激进：Ticker 1s
      indicatorsTTL: 10000,  // 更激进：指标 10s
      aggressiveness: 'balanced', // 新增：保守/均衡/激进
      simulatePaperFills: true,    // 🆕 仅 paper/demo 模式：是否补录模拟成交
      analysisFallbackEnabled: true, // 🆕 是否允许AI分析降级(fast/minimal)
      // 🆕 自动交易统一开关（与 /api/trading/auto/start/stop 对齐）
      autoTradeEnabled: false,
      // 🆕 是否允许自动 SELL（可在设置或接口中配置）
      autoTradeAllowSell: false
    };

    // 尝试从数据库恢复持久化配置
    try {
      const { getConfig } = require('../database/database');
      const persisted = getConfig && getConfig('runtime_strategy');
      if (persisted && typeof persisted === 'object') {
        this.state = { ...this.state, ...persisted };
      }
    } catch (e) {
      // 忽略持久化读取失败
    }
  }

  // 读取
  getConfig() {
    return { ...this.state };
  }
  isGlobalRealtime() {
    return !!this.state.globalRealtime;
  }
  getTickerTTL() {
    return Number(this.state.tickerTTL) || 0;
  }
  getIndicatorsTTL() {
    return Number(this.state.indicatorsTTL) || 0;
  }
  isAnalysisFallbackEnabled() {
    return this.state.analysisFallbackEnabled !== false;
  }

  // 新增：读取当前激进度
  getAggressiveness() {
    return this.state.aggressiveness || 'balanced';
  }

  // 新增：激进度参数映射
  getAggressivenessParams() {
    const level = this.getAggressiveness();
    const map = {
      conservative: {
        autoTradeMinConfidence: 70,
        riskControlMinConfidence: 70,
        autoTradeCooldownSeconds: 600,
        tradingRiskPercentage: 2.0,
      },
      balanced: {
        autoTradeMinConfidence: 65,
        riskControlMinConfidence: 65,
        autoTradeCooldownSeconds: 300,
        tradingRiskPercentage: 2.5,
      },
      aggressive: {
        autoTradeMinConfidence: 60,
        riskControlMinConfidence: 60,
        autoTradeCooldownSeconds: 120,
        tradingRiskPercentage: 3.0,
      }
    };
    return map[level] || map.balanced;
  }

  // 新增：应用激进度到风控与交易引擎
  applyAggressivenessSideEffects() {
    try {
      const params = this.getAggressivenessParams();
      // 更新风控最小置信度
      const riskControl = require('./RiskControl');
      riskControl.updateConfig({ MIN_CONFIDENCE: params.riskControlMinConfidence });

      // 更新交易引擎风险比例
      const getTradingEngine = require('./tradingEngineInstance');
      const engine = getTradingEngine();
      if (engine && typeof engine.setRiskPercentage === 'function') {
        engine.setRiskPercentage(params.tradingRiskPercentage);
      } else if (engine) {
        engine.riskPercentage = params.tradingRiskPercentage;
      }
    } catch (e) {
      console.warn('[RuntimeStrategy] 应用激进度失败:', e.message);
    }
  }

  // 更新
  updateConfig(partial) {
    if (!partial || typeof partial !== 'object') return this.getConfig();
    if (typeof partial.globalRealtime === 'boolean') {
      this.state.globalRealtime = partial.globalRealtime;
    }
    if (partial.tickerTTL !== undefined) {
      const v = Number(partial.tickerTTL);
      if (Number.isFinite(v) && v >= 0) this.state.tickerTTL = v;
    }
    if (partial.indicatorsTTL !== undefined) {
      const v = Number(partial.indicatorsTTL);
      if (Number.isFinite(v) && v >= 0) this.state.indicatorsTTL = v;
    }
    if (partial.aggressiveness) {
      const v = String(partial.aggressiveness).toLowerCase();
      if (['conservative','balanced','aggressive'].includes(v)) {
        this.state.aggressiveness = v;
        // 立即应用副作用
        this.applyAggressivenessSideEffects();
      }
    }
    if (typeof partial.simulatePaperFills === 'boolean') {
      this.state.simulatePaperFills = partial.simulatePaperFills;
    }
    if (typeof partial.analysisFallbackEnabled === 'boolean') {
      this.state.analysisFallbackEnabled = partial.analysisFallbackEnabled;
    }
    if (typeof partial.autoTradeEnabled === 'boolean') {
      this.state.autoTradeEnabled = partial.autoTradeEnabled;
    }
    if (typeof partial.autoTradeAllowSell === 'boolean') {
      this.state.autoTradeAllowSell = partial.autoTradeAllowSell;
    }
    // 持久化保存
    try {
      const { setConfig } = require('../database/database');
      setConfig && setConfig('runtime_strategy', this.state);
    } catch (e) {
      // 忽略写入错误
    }
    return this.getConfig();
  }
}

module.exports = new RuntimeStrategy();


