const getTradingEngine = require('./tradingEngineInstance');

const lastExecutions = new Map(); // symbol -> { signal, timestamp }

function getEnvNumber(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAnalysisPrice(analysis, marketData) {
  return (
    analysis?.decision?.entryPrice ||
    marketData?.price ||
    marketData?.ticker?.last ||
    marketData?.ticker?.price ||
    null
  );
}

function shouldSkipDueToCooldown(symbol, signal) {
  const cooldownSeconds = getEnvNumber('AUTO_TRADE_COOLDOWN_SECONDS', 300);
  if (cooldownSeconds <= 0) return false;
  const last = lastExecutions.get(symbol);
  if (!last) return false;
  const now = Date.now();
  if (last.signal === signal && (now - last.timestamp) < cooldownSeconds * 1000) {
    return true;
  }
  return false;
}

function rememberExecution(symbol, signal) {
  lastExecutions.set(symbol, {
    signal,
    timestamp: Date.now()
  });
}

async function handleAnalysis(analysis, marketData = {}) {
  // 统一自动交易开关：优先读取 runtimeStrategy，其次回退到环境变量
  const __rs = (() => { try { return require('./runtimeStrategy'); } catch { return null; } })();
  const __cfg = __rs && typeof __rs.getConfig === 'function' ? (__rs.getConfig() || {}) : {};
  const __autoEnabled = (__cfg.autoTradeEnabled !== undefined) ? !!__cfg.autoTradeEnabled : (process.env.AUTO_TRADE_ENABLED === 'true');
  if (!__autoEnabled) {
    return {
      status: 'disabled',
      reason: 'AUTO_TRADE_DISABLED'
    };
  }

  if (!analysis || analysis.safeMode) {
    return {
      status: 'skipped',
      reason: '分析处于安全模式或为空'
    };
  }

  const decision = analysis.decision || {};
  const signal = (decision.signal || '').toUpperCase();
  const symbol = marketData.symbol || decision.symbol;

  if (!symbol) {
    return {
      status: 'skipped',
      reason: '缺少交易对信息'
    };
  }

  if (signal !== 'BUY' && signal !== 'SELL') {
    return {
      status: 'skipped',
      symbol,
      reason: `信号 ${signal || 'HOLD'} 不执行交易`
    };
  }

  const __allowSell = (__cfg.autoTradeAllowSell !== undefined) ? !!__cfg.autoTradeAllowSell : (process.env.AUTO_TRADE_ALLOW_SELL === 'true');
  if (signal === 'SELL' && !__allowSell) {
    return {
      status: 'skipped',
      symbol,
      reason: 'SELL 自动执行未启用'
    };
  }

  // 读取激进度映射的最小置信度阈值
  const runtimeStrategy = require('./runtimeStrategy');
  const aggrParams = (() => {
    try {
      return runtimeStrategy.getAggressivenessParams();
    } catch { return null; }
  })();
  const minConfidence = aggrParams?.autoTradeMinConfidence ?? getEnvNumber('AUTO_TRADE_MIN_CONFIDENCE', 60);
  if (typeof decision.confidence === 'number' && decision.confidence < minConfidence) {
    return {
      status: 'skipped',
      symbol,
      reason: `置信度 ${decision.confidence}% 低于自动交易阈值 ${minConfidence}%`
    };
  }

  // 使用激进度映射的冷却时间
  const originalShouldSkip = shouldSkipDueToCooldown;
  function shouldSkipWithAggressiveness(symbolArg, signalArg) {
    const seconds = aggrParams?.autoTradeCooldownSeconds;
    if (Number.isFinite(seconds)) {
      const last = lastExecutions.get(symbolArg);
      if (!last) return false;
      if (last.signal === signalArg && (Date.now() - last.timestamp) < seconds * 1000) {
        return true;
      }
      return false;
    }
    return originalShouldSkip(symbolArg, signalArg);
  }

  if (shouldSkipWithAggressiveness(symbol, signal)) {
    return {
      status: 'skipped',
      symbol,
      reason: '处于冷却期，避免重复下单'
    };
  }

  const position = analysis.positionManagement || {};
  const recommendedSize = Number(position.recommendedSize || 0);

  if (!(recommendedSize > 0)) {
    return {
      status: 'skipped',
      symbol,
      reason: '建议仓位为0'
    };
  }

  const price = getAnalysisPrice(analysis, marketData);
  if (!price || price <= 0) {
    return {
      status: 'skipped',
      symbol,
      reason: '缺少有效入场价格'
    };
  }

  const capitalBase = getEnvNumber('AUTO_TRADE_CAPITAL', 1000);
  const notional = capitalBase * (recommendedSize / 100);
  const amountRaw = notional / price;

  const minAmount = getEnvNumber('AUTO_TRADE_MIN_AMOUNT', 0);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0 || amountRaw < minAmount) {
    return {
      status: 'skipped',
      symbol,
      reason: `下单数量过小 (${amountRaw || 0})`
    };
  }

  const amountDecimals = getEnvNumber('AUTO_TRADE_AMOUNT_DECIMALS', 4);
  const amount = Number(amountRaw.toFixed(amountDecimals));

  const tradingEngine = getTradingEngine();
  const requestedMode = process.env.AUTO_TRADE_MODE;
  if (requestedMode) {
    tradingEngine.tradingMode = requestedMode;
  }

  if (!tradingEngine.tradingMode) {
    tradingEngine.tradingMode = 'paper';
  }

  if (tradingEngine.tradingMode.toLowerCase() === 'live') {
    console.warn('[AutoTrade] 当前处于 LIVE 模式，请确认已配置风险控制');
  }

  const analysisId = analysis.analysisId || analysis.id || `srv_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  const signalPayload = {
    signal,
    confidence: decision.confidence,
    reasoning: analysis.summary || decision.reasoning,
    entryPrice: decision.entryPrice || price,
    stopLoss: decision.stopLoss,
    takeProfit: decision.takeProfit,
    currentPrice: price,
    riskLevel: decision.riskLevel || 'MEDIUM',
    analysisId
  };

  try {
    const result = await tradingEngine.executeTrade(signalPayload, symbol, amount);

    if (result.status === 'executed') {
      rememberExecution(symbol, signal);
    }

    return {
      status: result.status,
      symbol,
      mode: tradingEngine.tradingMode,
      amount,
      signal,
      confidence: decision.confidence,
      reason: result.reason,
      trade: result.trade,
      order: result.order,
      riskCheck: result.riskCheck,
      analysisId
    };
  } catch (error) {
    return {
      status: 'error',
      symbol,
      signal,
      reason: error.message
    };
  }
}

module.exports = {
  handleAnalysis
};

