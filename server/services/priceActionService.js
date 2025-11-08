const DEFAULT_LOOKBACK = Number(process.env.PRICE_ACTION_LOOKBACK || 80);
const TREND_THRESHOLD = Number(process.env.PRICE_ACTION_TREND_THRESHOLD || 0.008); // 0.8%
const SIDEWAYS_THRESHOLD = Number(process.env.PRICE_ACTION_SIDEWAYS_THRESHOLD || 0.002); // 0.2%

function normalizeOHLCV(ohlcv = []) {
  if (!Array.isArray(ohlcv)) return [];
  return ohlcv
    .filter(item => Array.isArray(item) && item.length >= 6)
    .map(item => ({
      timestamp: item[0],
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5])
    }))
    .filter(candle => [candle.open, candle.high, candle.low, candle.close, candle.volume]
      .every(value => Number.isFinite(value))
    );
}

function sliceRecent(candles, lookback = DEFAULT_LOOKBACK) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const lb = Math.min(candles.length, lookback);
  return candles.slice(-lb);
}

function calculateTrend(candles) {
  if (candles.length < 5) {
    return { direction: 'unknown', strength: 0, changePercent: 0 };
  }
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  if (!first || !last) {
    return { direction: 'unknown', strength: 0, changePercent: 0 };
  }
  const changePercent = (last - first) / first;
  let direction = 'sideways';
  if (changePercent > TREND_THRESHOLD) direction = 'up';
  else if (changePercent < -TREND_THRESHOLD) direction = 'down';
  else if (Math.abs(changePercent) < SIDEWAYS_THRESHOLD) direction = 'sideways';
  const strength = Math.min(1, Math.abs(changePercent) / TREND_THRESHOLD);
  return {
    direction,
    strength: Number(strength.toFixed(3)),
    changePercent: Number((changePercent * 100).toFixed(2))
  };
}

function detectSwingLevels(candles) {
  if (candles.length < 5) {
    return {
      swingHigh: null,
      swingLow: null,
      recentHigh: null,
      recentLow: null
    };
  }
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const recentHigh = Math.max(...highs.slice(-10));
  const recentLow = Math.min(...lows.slice(-10));

  let swingHigh = recentHigh;
  let swingLow = recentLow;
  for (let i = candles.length - 3; i >= 2; i--) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    if (curr.high > prev.high && curr.high > next.high) {
      swingHigh = curr.high;
      break;
    }
  }
  for (let i = candles.length - 3; i >= 2; i--) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    if (curr.low < prev.low && curr.low < next.low) {
      swingLow = curr.low;
      break;
    }
  }
  return {
    swingHigh,
    swingLow,
    recentHigh,
    recentLow
  };
}

function detectPatterns(candles) {
  if (candles.length < 3) return [];
  const patterns = [];
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low || 1;
  const upperWick = last.high - Math.max(last.close, last.open);
  const lowerWick = Math.min(last.close, last.open) - last.low;

  if (range > 0) {
    const upperRatio = upperWick / range;
    const lowerRatio = lowerWick / range;
    if (lowerRatio > 0.6 && body / range < 0.25) {
      patterns.push('bullish_pin_bar');
    }
    if (upperRatio > 0.6 && body / range < 0.25) {
      patterns.push('bearish_pin_bar');
    }
  }

  if (prev && last.high > prev.high && last.low < prev.low && last.close > prev.open && last.open < prev.close) {
    patterns.push(last.close > last.open ? 'bullish_engulfing' : 'bearish_engulfing');
  }

  if (prev && last.high < prev.high && last.low > prev.low) {
    patterns.push('inside_bar');
  }

  if (prev2) {
    const isThreeSoldiers = prev2.close < prev.close && prev.close < last.close &&
      last.close > last.open && prev.close > prev.open && prev2.close > prev2.open;
    if (isThreeSoldiers) patterns.push('three_white_soldiers');
    const isThreeCrows = prev2.close > prev.close && prev.close > last.close &&
      last.close < last.open && prev.close < prev.open && prev2.close < prev2.open;
    if (isThreeCrows) patterns.push('three_black_crows');
  }

  return patterns;
}

function analyzeVolume(candles) {
  if (candles.length < 10) {
    return { status: 'insufficient' };
  }
  const volumes = candles.map(c => c.volume);
  const lastVolume = volumes[volumes.length - 1];
  const avgVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / Math.min(20, volumes.length);
  const volumeChange = avgVolume ? lastVolume / avgVolume : 1;
  let bias = 'normal';
  if (volumeChange >= 2) bias = 'heavy_buying';
  else if (volumeChange <= 0.5) bias = 'drying';
  return {
    status: 'ok',
    lastVolume,
    avgVolume,
    volumeChange: Number(volumeChange.toFixed(2)),
    bias
  };
}

function analyzeVolatility(candles) {
  if (candles.length < 10) return { status: 'insufficient' };
  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const high = candles[i].high;
    const low = candles[i].low;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  const avgTR = trueRanges.reduce((sum, v) => sum + v, 0) / trueRanges.length;
  const lastClose = candles[candles.length - 1].close || 1;
  const atrPercent = Number(((avgTR / lastClose) * 100).toFixed(2));
  let regime = 'normal';
  if (atrPercent >= 4) regime = 'high';
  else if (atrPercent <= 1.5) regime = 'compressed';
  return {
    status: 'ok',
    atrPercent,
    regime
  };
}

function classifyPricePosition(lastClose, keyLevels) {
  if (!lastClose || !keyLevels) return 'unknown';
  const { swingHigh, swingLow, recentHigh, recentLow } = keyLevels;
  const resistance = swingHigh || recentHigh;
  const support = swingLow || recentLow;
  if (!support || !resistance) return 'unknown';
  const range = resistance - support;
  if (range <= 0) return 'unknown';
  const positionRatio = (lastClose - support) / range;
  if (positionRatio <= 0.15) return 'near_support';
  if (positionRatio >= 0.85) return 'near_resistance';
  if (positionRatio >= 0.4 && positionRatio <= 0.6) return 'mid_range';
  return positionRatio > 0.6 ? 'upper_half' : 'lower_half';
}

function analyzeTimeframe(ohlcv, timeframeLabel) {
  const candles = sliceRecent(normalizeOHLCV(ohlcv));
  if (candles.length < 5) {
    return {
      timeframe: timeframeLabel,
      status: 'insufficient',
      summary: '数据不足以分析'
    };
  }

  const trend = calculateTrend(candles);
  const keyLevels = detectSwingLevels(candles);
  const patterns = detectPatterns(candles);
  const volume = analyzeVolume(candles);
  const volatility = analyzeVolatility(candles);
  const lastClose = candles[candles.length - 1].close;
  const position = classifyPricePosition(lastClose, keyLevels);

  const summaryParts = [];
  summaryParts.push(`${timeframeLabel}趋势 ${trend.direction} (${trend.changePercent}%)`);
  if (position !== 'unknown') {
    summaryParts.push(`位置 ${position.replace('_', ' ')}`);
  }
  if (patterns.length > 0) {
    summaryParts.push(`形态 ${patterns.join(', ')}`);
  }
  if (volume.status === 'ok' && volume.bias !== 'normal') {
    summaryParts.push(`量能 ${volume.bias}`);
  }
  if (volatility.status === 'ok') {
    summaryParts.push(`波动 ${volatility.regime}`);
  }

  return {
    timeframe: timeframeLabel,
    status: 'ok',
    trend,
    keyLevels,
    pricePosition: position,
    patterns,
    volume,
    volatility,
    lastClose,
    summary: summaryParts.join(' | ')
  };
}

function analyze({ symbol, baseTimeframe = '1h', baseOhlcv = [], multiTimeframe = null }) {
  const primary = analyzeTimeframe(baseOhlcv, baseTimeframe);
  const higher = multiTimeframe?.['4h']?.ohlcv ? analyzeTimeframe(multiTimeframe['4h'].ohlcv, '4h') : null;
  const lower = multiTimeframe?.['15m']?.ohlcv ? analyzeTimeframe(multiTimeframe['15m'].ohlcv, '15m') : null;

  const summaryLines = [];
  if (primary?.summary) summaryLines.push(primary.summary);
  if (higher?.summary) summaryLines.push(higher.summary);
  if (lower?.summary) summaryLines.push(lower.summary);

  const activeSignals = [primary, higher, lower]
    .filter(item => item && item.status === 'ok')
    .map(item => ({ timeframe: item.timeframe, trend: item.trend.direction, patterns: item.patterns }));

  return {
    symbol,
    generatedAt: new Date().toISOString(),
    primary,
    higher,
    lower,
    summaryLines,
    activeSignals
  };
}

module.exports = {
  analyze
};

