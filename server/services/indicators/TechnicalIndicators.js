/**
 * 技术指标计算器
 * 包含所有技术指标的计算方法
 */

class TechnicalIndicators {
  /**
   * 简单移动平均线 (SMA)
   */
  static calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }

  /**
   * 指数移动平均线 (EMA)
   */
  static calculateEMA(data, period) {
    if (data.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = TechnicalIndicators.calculateSMA(data.slice(0, period), period);

    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  /**
   * 相对强弱指标 (RSI)
   */
  static calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference >= 0) {
        gains += difference;
      } else {
        losses -= difference;
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];

      if (difference >= 0) {
        avgGain = (avgGain * (period - 1) + difference) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - difference) / period;
      }
    }

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * MACD指标
   */
  static calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const emaFast = TechnicalIndicators.calculateEMA(prices, fastPeriod);
    const emaSlow = TechnicalIndicators.calculateEMA(prices, slowPeriod);
    const macdLine = emaFast - emaSlow;
    const signal = macdLine * 0.9; // 简化版
    const histogram = macdLine - signal;

    return { MACD: macdLine, signal, histogram };
  }

  /**
   * 布林带 (Bollinger Bands)
   */
  static calculateBollingerBands(prices, period = 20, stdDev = 2) {
    const sma = TechnicalIndicators.calculateSMA(prices, period);
    if (!sma) return null;

    const slice = prices.slice(-period);
    const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: sma + (std * stdDev),
      middle: sma,
      lower: sma - (std * stdDev),
      bandwidth: (std * stdDev * 2) / sma * 100
    };
  }

  /**
   * 随机指标 (Stochastic)
   */
  static calculateStochastic(highs, lows, closes, period = 14) {
    if (closes.length < period) return null;

    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];

    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);

    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    const d = k * 0.9; // 简化版

    return { k, d };
  }

  /**
   * 威廉指标 (Williams %R)
   */
  static calculateWilliamsR(highs, lows, closes, period = 14) {
    if (closes.length < period) return null;

    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];

    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);

    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }

  /**
   * 平均真实波幅 (ATR)
   */
  static calculateATR(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }

    return TechnicalIndicators.calculateSMA(trueRanges, period);
  }

  /**
   * 变化率 (ROC)
   */
  static calculateROC(prices, period = 12) {
    if (prices.length < period + 1) return null;
    const current = prices[prices.length - 1];
    const past = prices[prices.length - 1 - period];
    return ((current - past) / past) * 100;
  }

  /**
   * 能量潮 (OBV)
   */
  static calculateOBV(closes, volumes) {
    if (closes.length < 2) return null;

    let obv = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i];
      }
    }
    return obv;
  }

  /**
   * 成交量加权平均价 (VWAP)
   */
  static calculateVWAP(ohlcv) {
    if (ohlcv.length === 0) return null;

    let totalVolume = 0;
    let totalPriceVolume = 0;

    for (const candle of ohlcv) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      totalPriceVolume += typicalPrice * candle.volume;
      totalVolume += candle.volume;
    }

    return totalPriceVolume / totalVolume;
  }

  /**
   * Keltner通道
   */
  static calculateKeltnerChannels(highs, lows, closes, period = 20, multiplier = 2) {
    const ema = TechnicalIndicators.calculateEMA(closes, period);
    const atr = TechnicalIndicators.calculateATR(highs, lows, closes, period);

    if (!ema || !atr) return null;

    return {
      upper: ema + (atr * multiplier),
      middle: ema,
      lower: ema - (atr * multiplier)
    };
  }

  /**
   * 加权移动平均线 (WMA)
   */
  static calculateWMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    const weights = Array.from({ length: period }, (_, i) => i + 1);
    const weightSum = weights.reduce((sum, w) => sum + w, 0);
    const weightedSum = slice.reduce((sum, val, i) => sum + val * weights[i], 0);
    return weightedSum / weightSum;
  }

  /**
   * 平均趋向指数 (ADX)
   */
  static calculateADX(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return null;

    // 简化版ADX计算
    let plusDM = 0, minusDM = 0;
    for (let i = 1; i < period; i++) {
      const highDiff = highs[i] - highs[i - 1];
      const lowDiff = lows[i - 1] - lows[i];
      plusDM += highDiff > 0 && highDiff > lowDiff ? highDiff : 0;
      minusDM += lowDiff > 0 && lowDiff > highDiff ? lowDiff : 0;
    }

    const atr = TechnicalIndicators.calculateATR(highs, lows, closes, period);
    if (!atr) return null;

    const plusDI = (plusDM / period / atr) * 100;
    const minusDI = (minusDM / period / atr) * 100;
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

    return { adx: dx, plusDI, minusDI };
  }

  /**
   * 抛物线SAR
   */
  static calculateSAR(highs, lows, closes, acceleration = 0.02, maximum = 0.2) {
    if (closes.length < 5) return null;

    const recentHighs = highs.slice(-5);
    const recentLows = lows.slice(-5);
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const currentClose = closes[closes.length - 1];

    // 简化版SAR
    const isUptrend = currentClose > (highestHigh + lowestLow) / 2;
    const sar = isUptrend ? lowestLow : highestHigh;

    return { value: sar, isUptrend };
  }

  /**
   * 动量指标 (Momentum)
   */
  static calculateMomentum(prices, period = 10) {
    if (prices.length < period) return null;
    const current = prices[prices.length - 1];
    const past = prices[prices.length - period];
    return ((current - past) / past) * 100;
  }

  /**
   * 商品通道指数 (CCI)
   */
  static calculateCCI(highs, lows, closes, period = 20) {
    if (closes.length < period) return null;

    const typicalPrices = closes.map((close, i) => (highs[i] + lows[i] + close) / 3);
    const sma = TechnicalIndicators.calculateSMA(typicalPrices, period);
    if (!sma) return null;

    const slice = typicalPrices.slice(-period);
    const meanDeviation = slice.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;
    const currentTP = typicalPrices[typicalPrices.length - 1];

    return (currentTP - sma) / (0.015 * meanDeviation);
  }

  /**
   * 唐奇安通道 (Donchian Channels)
   */
  static calculateDonchianChannels(highs, lows, period = 20) {
    if (highs.length < period) return null;

    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const upper = Math.max(...recentHighs);
    const lower = Math.min(...recentLows);
    const middle = (upper + lower) / 2;

    return { upper, middle, lower, bandwidth: upper - lower };
  }

  /**
   * 历史波动率
   */
  static calculateHistoricalVolatility(prices, period = 20) {
    if (prices.length < period + 1) return null;

    const returns = [];
    for (let i = 1; i <= period; i++) {
      const idx = prices.length - period - 1 + i;
      returns.push(Math.log(prices[idx] / prices[idx - 1]));
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // 年化波动率

    return volatility;
  }

  /**
   * 成交量比率
   */
  static calculateVolumeRatio(volumes, period = 20) {
    if (volumes.length < period) return null;
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = TechnicalIndicators.calculateSMA(volumes, period);
    return avgVolume ? (currentVolume / avgVolume) : null;
  }

  /**
   * 资金流量指标 (MFI)
   */
  static calculateMFI(highs, lows, closes, volumes, period = 14) {
    if (closes.length < period + 1) return null;

    let positiveFlow = 0, negativeFlow = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
      const prevTypicalPrice = (highs[i-1] + lows[i-1] + closes[i-1]) / 3;
      const moneyFlow = typicalPrice * volumes[i];

      if (typicalPrice > prevTypicalPrice) {
        positiveFlow += moneyFlow;
      } else {
        negativeFlow += moneyFlow;
      }
    }

    if (negativeFlow === 0) return 100;
    const moneyRatio = positiveFlow / negativeFlow;
    return 100 - (100 / (1 + moneyRatio));
  }

  /**
   * 累积/派发线 (A/D Line)
   */
  static calculateADLine(highs, lows, closes, volumes) {
    if (closes.length < 2) return null;

    let adLine = 0;
    for (let i = 0; i < closes.length; i++) {
      const clv = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / (highs[i] - lows[i]);
      adLine += clv * volumes[i];
    }

    return adLine;
  }

  /**
   * 价量趋势 (PVT)
   */
  static calculatePVT(closes, volumes) {
    if (closes.length < 2) return null;

    let pvt = 0;
    for (let i = 1; i < closes.length; i++) {
      const priceChange = (closes[i] - closes[i-1]) / closes[i-1];
      pvt += priceChange * volumes[i];
    }

    return pvt;
  }

  /**
   * 枢轴点 (Pivot Points)
   */
  static calculatePivotPoints(highs, lows, closes) {
    if (closes.length < 1) return null;

    const high = Math.max(...highs.slice(-20));
    const low = Math.min(...lows.slice(-20));
    const close = closes[closes.length - 1];

    const pivot = (high + low + close) / 3;
    const r1 = 2 * pivot - low;
    const r2 = pivot + (high - low);
    const r3 = high + 2 * (pivot - low);
    const s1 = 2 * pivot - high;
    const s2 = pivot - (high - low);
    const s3 = low - 2 * (high - pivot);

    return { pivot, r1, r2, r3, s1, s2, s3 };
  }

  /**
   * 斐波那契回撤位 (Fibonacci Levels)
   */
  static calculateFibonacciLevels(highs, lows) {
    if (highs.length < 20) return null;

    const high = Math.max(...highs.slice(-50));
    const low = Math.min(...lows.slice(-50));
    const diff = high - low;

    return {
      level_0: high,
      level_236: high - diff * 0.236,
      level_382: high - diff * 0.382,
      level_500: high - diff * 0.500,
      level_618: high - diff * 0.618,
      level_786: high - diff * 0.786,
      level_100: low
    };
  }

  /**
   * 高低点 (High/Low)
   */
  static calculateHighLow(highs, lows, period = 20) {
    if (highs.length < period) return null;

    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);

    return {
      high: Math.max(...recentHighs),
      low: Math.min(...recentLows),
      range: Math.max(...recentHighs) - Math.min(...recentLows)
    };
  }

  /**
   * 蜡烛图形态检测
   */
  static detectCandlePatterns(opens, highs, lows, closes) {
    if (closes.length < 3) return [];

    const patterns = [];
    const idx = closes.length - 1;

    // 锤子线
    const body = Math.abs(closes[idx] - opens[idx]);
    const lowerShadow = Math.min(opens[idx], closes[idx]) - lows[idx];
    const upperShadow = highs[idx] - Math.max(opens[idx], closes[idx]);

    if (lowerShadow > body * 2 && upperShadow < body * 0.5) {
      patterns.push('hammer');
    }

    // 十字星
    if (body < (highs[idx] - lows[idx]) * 0.1) {
      patterns.push('doji');
    }

    // 吞没形态
    if (idx >= 1) {
      const prevBody = Math.abs(closes[idx-1] - opens[idx-1]);
      if (body > prevBody * 1.5) {
        if (closes[idx] > opens[idx] && closes[idx-1] < opens[idx-1]) {
          patterns.push('bullish_engulfing');
        } else if (closes[idx] < opens[idx] && closes[idx-1] > opens[idx-1]) {
          patterns.push('bearish_engulfing');
        }
      }
    }

    return patterns;
  }

  /**
   * 趋势形态检测
   */
  static detectTrendPattern(closes, period = 20) {
    if (closes.length < period) return 'unknown';

    const slice = closes.slice(-period);
    const firstHalf = slice.slice(0, period / 2);
    const secondHalf = slice.slice(period / 2);

    const firstAvg = firstHalf.reduce((sum, p) => sum + p, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, p) => sum + p, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 5) return 'strong_uptrend';
    if (change > 2) return 'uptrend';
    if (change < -5) return 'strong_downtrend';
    if (change < -2) return 'downtrend';
    return 'sideways';
  }

  /**
   * 背离检测
   */
  static detectDivergence(prices, indicator) {
    if (!prices || !indicator || prices.length < 20) return 'none';

    const priceSlope = (prices[prices.length - 1] - prices[prices.length - 10]) / 10;
    const indicatorSlope = (indicator - prices[prices.length - 10]) / 10;

    if (priceSlope > 0 && indicatorSlope < 0) return 'bearish_divergence';
    if (priceSlope < 0 && indicatorSlope > 0) return 'bullish_divergence';
    return 'none';
  }

  /**
   * 恐惧贪婪指数
   */
  static calculateFearGreedIndex(closes, volumes, rsi) {
    if (!closes || !volumes || !rsi) return null;

    // 简化版恐惧贪婪指数
    const priceChange = ((closes[closes.length - 1] - closes[closes.length - 7]) / closes[closes.length - 7]) * 100;
    const volumeRatio = TechnicalIndicators.calculateVolumeRatio(volumes, 20) || 1;

    let score = 50; // 中性
    score += priceChange * 2; // 价格变化影响
    score += (rsi - 50) * 0.5; // RSI影响
    score += (volumeRatio - 1) * 10; // 成交量影响

    score = Math.max(0, Math.min(100, score));

    let sentiment = 'neutral';
    if (score > 75) sentiment = 'extreme_greed';
    else if (score > 60) sentiment = 'greed';
    else if (score < 25) sentiment = 'extreme_fear';
    else if (score < 40) sentiment = 'fear';

    return { score, sentiment };
  }

  /**
   * 多空比
   */
  static calculateBullBearRatio(closes, volumes) {
    if (closes.length < 20) return null;

    let bullVolume = 0, bearVolume = 0;

    for (let i = 1; i < 20; i++) {
      const idx = closes.length - 20 + i;
      if (closes[idx] > closes[idx - 1]) {
        bullVolume += volumes[idx];
      } else {
        bearVolume += volumes[idx];
      }
    }

    const ratio = bearVolume > 0 ? bullVolume / bearVolume : 10;
    return { ratio, bullVolume, bearVolume };
  }

  /**
   * 市场强度
   */
  static calculateMarketStrength(closes, volumes) {
    if (closes.length < 20) return null;

    const priceChange = ((closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20]) * 100;
    const volumeRatio = TechnicalIndicators.calculateVolumeRatio(volumes, 20) || 1;

    const strength = Math.abs(priceChange) * volumeRatio;

    let level = 'weak';
    if (strength > 20) level = 'very_strong';
    else if (strength > 10) level = 'strong';
    else if (strength > 5) level = 'moderate';

    return { strength, level, direction: priceChange > 0 ? 'bullish' : 'bearish' };
  }

  /**
   * 分析市场状态
   */
  static analyzeMarketState(closes, volumes) {
    const currentPrice = closes[closes.length - 1];
    const sma20 = TechnicalIndicators.calculateSMA(closes, 20);
    const sma50 = TechnicalIndicators.calculateSMA(closes, 50);
    const rsi = TechnicalIndicators.calculateRSI(closes, 14);
    const volumeAvg = TechnicalIndicators.calculateSMA(volumes, 20);
    const currentVolume = volumes[volumes.length - 1];

    let state = 'neutral';
    let strength = 0;

    // 趋势判断
    if (currentPrice > sma20 && sma20 > sma50) {
      state = 'bullish';
      strength = Math.min(100, ((currentPrice - sma50) / sma50) * 100);
    } else if (currentPrice < sma20 && sma20 < sma50) {
      state = 'bearish';
      strength = Math.min(100, ((sma50 - currentPrice) / sma50) * 100);
    }

    return {
      trend: state,
      strength: strength.toFixed(2),
      rsiLevel: rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral',
      volumeStatus: currentVolume > volumeAvg ? 'high' : 'low'
    };
  }

  /**
   * 判断趋势
   */
  static determineTrend(indicators) {
    const { trend, momentum } = indicators;

    if (trend.ema9 > trend.ema21 && momentum.rsi14 > 50 && momentum.macd.histogram > 0) {
      return 'strong_bullish';
    } else if (trend.ema9 > trend.ema21 && momentum.rsi14 > 50) {
      return 'bullish';
    } else if (trend.ema9 < trend.ema21 && momentum.rsi14 < 50 && momentum.macd.histogram < 0) {
      return 'strong_bearish';
    } else if (trend.ema9 < trend.ema21 && momentum.rsi14 < 50) {
      return 'bearish';
    }
    return 'neutral';
  }
}

module.exports = TechnicalIndicators;
