/**
 * 监听 OMS/WS 事件，记录执行SLO指标并触发告警
 */
const eventBus = require('./EventBus');
const executionQualityService = require('./executionQualityService');
const alertingService = require('./alertingService');
const ExecutionService = require('../database/services/ExecutionService');

const inflightByClientId = new Map(); // clientOrderId -> { startTs, expectedPrice, amount, symbol, side, mode }
const mapOrderToClient = new Map();    // orderId -> clientOrderId

const SLO = {
  LATENCY_WARN_MS: Number(process.env.SLO_LATENCY_WARN_MS || 2000),
  LATENCY_ERROR_MS: Number(process.env.SLO_LATENCY_ERROR_MS || 5000),
  SLIPPAGE_WARN_BPS: Number(process.env.SLO_SLIPPAGE_WARN_BPS || 50),  // 0.5%
  SLIPPAGE_ERROR_BPS: Number(process.env.SLO_SLIPPAGE_ERROR_BPS || 100) // 1%
};

function onOrderSubmitting(evt) {
  inflightByClientId.set(String(evt.clientOrderId), {
    startTs: evt.ts || Date.now(),
    expectedPrice: evt.expectedPrice,
    amount: evt.amount,
    symbol: evt.symbol,
    side: (evt.side || '').toUpperCase(),
    mode: evt.mode,
    analysisId: evt.analysisId
  });
}

function onOrderSubmitted(evt) {
  const cid = String(evt.clientOrderId || '');
  if (cid) mapOrderToClient.set(String(evt.orderId), cid);
}

function recordFillFromWS(evt) {
  const orderId = String(evt.orderId || '');
  const cid = mapOrderToClient.get(orderId);
  const base = (cid && inflightByClientId.get(cid)) || null;
  if (!base) return; // 无上下文，跳过

  const order = {
    id: orderId,
    symbol: base.symbol,
    side: base.side.toLowerCase(),
    type: 'MARKET',
    price: base.expectedPrice,
    amount: base.amount,
    timestamp: base.startTs
  };

  const execData = {
    price: evt.avgPrice || evt.price,
    filled: evt.fillSize || base.amount,
    timestamp: evt.ts || Date.now(),
    status: 'filled',
    marketPrice: undefined
  };

  const execution = executionQualityService.recordExecution(order, execData);

  // 落库：保存执行记录
  try {
    ExecutionService.insert({
      clientOrderId: cid,
      orderId,
      symbol: order.symbol,
      side: order.side.toUpperCase(),
      type: order.type,
      expectedPrice: execution.expectedPrice || order.price,
      actualPrice: execution.actualPrice || execData.price,
      requestedAmount: execution.requestedAmount || order.amount,
      filledAmount: execution.filledAmount || execData.filled,
      slippageBps: execution.slippage?.bps ?? null,
      slippagePercent: execution.slippage?.percent ?? null,
      latencyMs: execution.latency?.ms ?? null,
      fillRate: execution.fillRate?.percent ?? null,
      status: execution.status || 'filled',
      analysisId: base.analysisId || null
    });
  } catch (_) {}

  // SLO告警
  const latencyMs = execution?.latency?.ms || 0;
  const slippageBps = execution?.slippage?.bps;

  let level = null;
  let message = null;

  if (latencyMs >= SLO.LATENCY_ERROR_MS) {
    level = 'error';
    message = `下单延迟过高: ${latencyMs}ms ≥ ${SLO.LATENCY_ERROR_MS}ms`;
  } else if (latencyMs >= SLO.LATENCY_WARN_MS) {
    level = 'warning';
    message = `下单延迟偏高: ${latencyMs}ms ≥ ${SLO.LATENCY_WARN_MS}ms`;
  }

  if (typeof slippageBps === 'number') {
    const absBps = Math.abs(slippageBps);
    if (absBps >= SLO.SLIPPAGE_ERROR_BPS) {
      level = level === 'error' ? 'error' : 'warning';
      message = `${message ? message + ' | ' : ''}滑点过大: ${absBps.toFixed(1)}bps ≥ ${SLO.SLIPPAGE_ERROR_BPS}bps`;
    } else if (absBps >= SLO.SLIPPAGE_WARN_BPS) {
      level = level || 'warning';
      message = `${message ? message + ' | ' : ''}滑点偏大: ${absBps.toFixed(1)}bps ≥ ${SLO.SLIPPAGE_WARN_BPS}bps`;
    }
  }

  if (level && message) {
    alertingService.notify({
      level,
      title: 'SLO告警 - 执行质量',
      message,
      dedupeKey: `slo:${level}:${order.symbol}`,
      context: { orderId, clientOrderId: cid, symbol: order.symbol, latencyMs, slippageBps },
      cooldownMs: Number(process.env.ALERT_SLO_COOLDOWN_MS || 30000)
    }).catch(() => {});
  }

  // 清理内存映射
  inflightByClientId.delete(cid);
  mapOrderToClient.delete(orderId);
}

function recordCancelFromWS(evt) {
  const orderId = String(evt.orderId || '');
  const cid = mapOrderToClient.get(orderId);
  if (cid) {
    inflightByClientId.delete(cid);
    mapOrderToClient.delete(orderId);
  }
}

function onOrderError(evt) {
  // 若有提交但随即错误，按 rejected 记录
  const cid = String(evt.clientOrderId || '');
  const base = cid && inflightByClientId.get(cid);
  if (!base) return;
  const order = {
    id: String(evt.orderId || ''),
    symbol: base.symbol,
    side: base.side.toLowerCase(),
    type: 'MARKET',
    price: base.expectedPrice,
    amount: base.amount,
    timestamp: base.startTs
  };
  const execData = {
    price: base.expectedPrice,
    filled: 0,
    timestamp: Date.now(),
    status: 'rejected',
    marketPrice: undefined
  };
  const execution = executionQualityService.recordExecution(order, execData);
  try {
    ExecutionService.insert({
      clientOrderId: cid,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side.toUpperCase(),
      type: order.type,
      expectedPrice: execution.expectedPrice || order.price,
      actualPrice: execution.actualPrice || execData.price,
      requestedAmount: execution.requestedAmount || order.amount,
      filledAmount: 0,
      slippageBps: execution.slippage?.bps ?? null,
      slippagePercent: execution.slippage?.percent ?? null,
      latencyMs: execution.latency?.ms ?? null,
      fillRate: 0,
      status: 'rejected',
      analysisId: base.analysisId || null
    });
  } catch (_) {}
  inflightByClientId.delete(cid);
}

// 🆕 paper/demo 模式：使用 position.opened 作为“成交”补录执行质量
function onPositionOpened(evt) {
  try {
    // 可开关：仅在允许时补录
    let enableSimFill = true;
    try {
      const runtimeStrategy = require('./runtimeStrategy');
      const cfg = runtimeStrategy.getConfig && runtimeStrategy.getConfig();
      if (cfg && typeof cfg.simulatePaperFills === 'boolean') {
        enableSimFill = cfg.simulatePaperFills;
      }
    } catch (_) {}
    if (!enableSimFill) return;

    const cid = String(evt.clientOrderId || '');
    const base = cid && inflightByClientId.get(cid);
    // 仅在有上下文或确认为paper/demo时补录
    const mode = (base && base.mode) || (process.env.TRADING_MODE || 'paper');
    if ((mode || '').toLowerCase() !== 'paper' && (mode || '').toLowerCase() !== 'demo') {
      return;
    }

    const orderId = String(evt.orderId || `paper_${cid}_${Date.now()}`);
    const symbol = (evt.symbol || (base && base.symbol) || '').toString();
    if (!symbol) return;
    const amount = Number(evt.amount || evt.size || (base && base.amount) || 0) || 0;
    const expectedPrice = Number((base && base.expectedPrice) || evt.expectedPrice || evt.price || evt.entryPrice || 0) || undefined;
    const actualPrice = Number(evt.price || evt.entryPrice || expectedPrice || 0) || undefined;

    const startTs = (base && base.startTs) || Date.now();

    const order = {
      id: orderId,
      symbol,
      side: ((evt.side || '') || (base && base.side) || '').toString().toLowerCase(),
      type: 'MARKET',
      price: expectedPrice,
      amount,
      timestamp: startTs,
      analysisId: base && base.analysisId
    };

    const execData = {
      price: actualPrice,
      filled: amount,
      timestamp: Date.now(),
      status: 'filled',
      marketPrice: undefined
    };

    const execution = executionQualityService.recordExecution(order, execData);
    try {
      ExecutionService.insert({
        clientOrderId: cid || null,
        orderId: orderId,
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type,
        expectedPrice: execution.expectedPrice || expectedPrice,
        actualPrice: execution.actualPrice || actualPrice,
        requestedAmount: execution.requestedAmount || amount,
        filledAmount: execution.filledAmount || amount,
        slippageBps: execution.slippage?.bps ?? null,
        slippagePercent: execution.slippage?.percent ?? null,
        latencyMs: execution.latency?.ms ?? null,
        fillRate: execution.fillRate?.percent ?? null,
        status: 'filled',
        analysisId: (base && base.analysisId) || null
      });
    } catch (_) {}

    if (cid) inflightByClientId.delete(cid);
  } catch (_) {}
}

// 绑定事件
eventBus.on('order.submitting', onOrderSubmitting);
eventBus.on('order.submitted', onOrderSubmitted);
eventBus.on('order.ws_filled', recordFillFromWS);
eventBus.on('order.ws_canceled', recordCancelFromWS);
eventBus.on('order.error', onOrderError);
eventBus.on('position.opened', onPositionOpened);

module.exports = {};


