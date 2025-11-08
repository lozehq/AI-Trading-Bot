/**
 * Regime 检测服务（第一阶段轻量实现）
 * - 依据多时间框架趋势一致性 + ATR/价格的波动率百分比，给出 TREND / RANGE / HIGH_VOL / EVENT
 * - 返回 { name, direction, confidence, features }
 */

function calcAtrPercent(indicators, price) {
  const atr = indicators?.atr;
  const p = price || indicators?.lastPrice || indicators?.close;
  if (!atr || !p || p <= 0) return null;
  return (atr / p) * 100;
}

function countMtfSupports(mtf) {
  if (!mtf || !mtf.timeframes) return { buy: 0, sell: 0, total: 0 };
  const tfs = mtf.timeframes;
  let buy = 0, sell = 0, total = 0;
  for (const [tf, data] of Object.entries(tfs)) {
    if (!data || data.status === 'failed') continue;
    total += 1;
    const trend = String(data.trend || '').toUpperCase();
    if (trend.includes('BULL')) buy += 1;
    if (trend.includes('BEAR')) sell += 1;
  }
  return { buy, sell, total };
}

function detectEventLike(marketData) {
  // 预留：后续可接入新闻/清算/资金费率突变等
  // 当前轻量规则：若存在异常字段或显著警告标志，则认为 EVENT
  const flags = [
    marketData?.anomalies && Array.isArray(marketData.anomalies) && marketData.anomalies.length > 0,
    typeof marketData?.suddenMove === 'boolean' && marketData.suddenMove === true,
  ];
  return flags.some(Boolean);
}

function detectRegime({ indicators = {}, marketData = {}, analysis = {} } = {}) {
  const price = marketData?.price || marketData?.ticker?.last || indicators?.close || null;
  const atrPct = calcAtrPercent(indicators, price);
  const mtf = analysis?.multiTimeframeAnalysis;
  const { buy, sell, total } = countMtfSupports(mtf);

  // 1) 高波动优先判定
  if (atrPct !== null && atrPct > 8) {
    return {
      name: 'HIGH_VOL',
      direction: 'NEUTRAL',
      confidence: Math.min(100, Math.round((atrPct - 8) * 5 + 60)),
      features: { atrPercent: atrPct, mtfTotal: total, mtfBuy: buy, mtfSell: sell }
    };
  }

  // 2) 事件型（轻量占位）
  if (detectEventLike(marketData)) {
    return {
      name: 'EVENT',
      direction: 'NEUTRAL',
      confidence: 65,
      features: { atrPercent: atrPct, mtfTotal: total, mtfBuy: buy, mtfSell: sell }
    };
  }

  // 3) 趋势 or 震荡
  const majority = Math.floor(total * 0.6) || 2; // 60% 以上视为趋势占优
  if (buy >= majority && buy >= sell) {
    return {
      name: 'TREND',
      direction: 'BULL',
      confidence: Math.min(95, 60 + (buy - sell) * 8),
      features: { atrPercent: atrPct, mtfTotal: total, mtfBuy: buy, mtfSell: sell }
    };
  }
  if (sell >= majority && sell > buy) {
    return {
      name: 'TREND',
      direction: 'BEAR',
      confidence: Math.min(95, 60 + (sell - buy) * 8),
      features: { atrPercent: atrPct, mtfTotal: total, mtfBuy: buy, mtfSell: sell }
    };
  }

  // 默认：震荡
  return {
    name: 'RANGE',
    direction: 'NEUTRAL',
    confidence: Math.max(40, 70 - Math.abs(buy - sell) * 10),
    features: { atrPercent: atrPct, mtfTotal: total, mtfBuy: buy, mtfSell: sell }
  };
}

module.exports = {
  detectRegime,
};

