// 统一数据格式化服务：集中空值处理与数值解析，减少重复代码

/**
 * 安全的JSON序列化函数，防止循环引用和无效值
 */
function safeStringify(obj, fallback = '{}') {
  try {
    return JSON.stringify(obj, (key, value) => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'number' && !isFinite(value)) return null;
      if (typeof value === 'function') return undefined;
      if (value instanceof Error) return value.message;
      return value;
    });
  } catch (err) {
    return fallback;
  }
}

class DataFormatterService {
  formatIndicators(indicators) {
    if (!indicators) return '暂无指标数据';

    let formatted = '';

    // ==================== 当前价格和市场状态 ====================
    if (indicators.currentPrice !== undefined && indicators.currentPrice !== null) {
      const currentPrice = typeof indicators.currentPrice === 'number' ? indicators.currentPrice : parseFloat(indicators.currentPrice);
      const previousClose = indicators.previousClose ? (typeof indicators.previousClose === 'number' ? indicators.previousClose : parseFloat(indicators.previousClose)) : null;
      if (!isNaN(currentPrice)) {
        formatted += `\n\n### 当前价格和市场状态：`;
        formatted += `\n- 当前价格: ${currentPrice.toFixed(2)}`;
        formatted += `\n- 上一收盘: ${previousClose && !isNaN(previousClose) ? previousClose.toFixed(2) : 'N/A'}`;
        if (previousClose && !isNaN(previousClose) && previousClose > 0) {
          formatted += `\n- 价格变化: ${((currentPrice - previousClose) / previousClose * 100).toFixed(2)}%`;
        }
        if (indicators.marketState) {
          formatted += `\n- 市场状态: ${indicators.marketState.trend || 'N/A'}`;
          formatted += `\n- 波动程度: ${indicators.marketState.volatility || 'N/A'}`;
          formatted += `\n- 市场力量: ${indicators.marketState.strength || 'N/A'}`;
        }
      }
    }

    // ==================== 趋势指标 (18个) ====================
    formatted += '\n\n### 趋势指标（18个完整指标）：';
    const trend = indicators.trend || {};

    // SMA系列 (7个)
    formatted += `\n**简单移动平均线 (SMA)**:`;
    if (trend.sma5) formatted += `\n- SMA(5): ${trend.sma5.toFixed(2)}`;
    if (trend.sma10) formatted += `\n- SMA(10): ${trend.sma10.toFixed(2)}`;
    if (trend.sma20) formatted += `\n- SMA(20): ${trend.sma20.toFixed(2)}`;
    if (trend.sma30) formatted += `\n- SMA(30): ${trend.sma30.toFixed(2)}`;
    if (trend.sma50) formatted += `\n- SMA(50): ${trend.sma50.toFixed(2)}`;
    if (trend.sma100) formatted += `\n- SMA(100): ${trend.sma100.toFixed(2)}`;
    if (trend.sma200) formatted += `\n- SMA(200): ${trend.sma200.toFixed(2)}`;

    // EMA系列 (8个)
    formatted += `\n**指数移动平均线 (EMA)**:`;
    if (trend.ema5) formatted += `\n- EMA(5): ${trend.ema5.toFixed(2)}`;
    if (trend.ema9) formatted += `\n- EMA(9): ${trend.ema9.toFixed(2)}`;
    if (trend.ema12) formatted += `\n- EMA(12): ${trend.ema12.toFixed(2)}`;
    if (trend.ema21) formatted += `\n- EMA(21): ${trend.ema21.toFixed(2)}`;
    if (trend.ema26) formatted += `\n- EMA(26): ${trend.ema26.toFixed(2)}`;
    if (trend.ema50) formatted += `\n- EMA(50): ${trend.ema50.toFixed(2)}`;
    if (trend.ema100) formatted += `\n- EMA(100): ${trend.ema100.toFixed(2)}`;
    if (trend.ema200) formatted += `\n- EMA(200): ${trend.ema200.toFixed(2)}`;

    // WMA系列 (3个)
    formatted += `\n**加权移动平均线 (WMA)**:`;
    if (trend.wma10) formatted += `\n- WMA(10): ${trend.wma10.toFixed(2)}`;
    if (trend.wma20) formatted += `\n- WMA(20): ${trend.wma20.toFixed(2)}`;
    if (trend.wma50) formatted += `\n- WMA(50): ${trend.wma50.toFixed(2)}`;

    // 趋势强度指标
    formatted += `\n**趋势强度**:`;
    if (trend.adx !== undefined) {
      const adxValue = typeof trend.adx === 'number' ? trend.adx : trend.adx?.adx || trend.adx?.value;
      if (adxValue) formatted += `\n- ADX(14): ${adxValue.toFixed(2)} (${adxValue > 50 ? '极强趋势' : adxValue > 25 ? '强趋势' : '弱趋势/震荡'})`;
    }
    if (trend.sar !== undefined) {
      const sarValue = typeof trend.sar === 'number' ? trend.sar : trend.sar?.value || trend.sar?.sar;
      if (sarValue) formatted += `\n- SAR: ${sarValue.toFixed(2)}`;
    }

    // ==================== 动量指标 (23个) ====================
    formatted += '\n\n### 动量指标（23个完整指标）：';
    const momentum = indicators.momentum || {};

    // RSI系列 (5个)
    formatted += `\n**相对强弱指标 (RSI)**:`;
    if (momentum.rsi6) formatted += `\n- RSI(6): ${momentum.rsi6.toFixed(2)}`;
    if (momentum.rsi7) formatted += `\n- RSI(7): ${momentum.rsi7.toFixed(2)}`;
    if (momentum.rsi14) {
      const rsi = momentum.rsi14;
      formatted += `\n- RSI(14): ${rsi.toFixed(2)} (${rsi > 70 ? '超买' : rsi < 30 ? '超卖' : '中性'})`;
    }
    if (momentum.rsi21) formatted += `\n- RSI(21): ${momentum.rsi21.toFixed(2)}`;
    if (momentum.rsi28) formatted += `\n- RSI(28): ${momentum.rsi28.toFixed(2)}`;

    // MACD系列 (3个)
    formatted += `\n**MACD指标**:`;
    if (momentum.macd) {
      const macd = momentum.macd;
      const macdLine = macd.MACD || macd.macd || macd.line;
      const signal = macd.signal;
      const histogram = macd.histogram;
      if (macdLine !== undefined) formatted += `\n- MACD(12,26,9)线: ${macdLine.toFixed(4)}`;
      if (signal !== undefined) formatted += `\n- MACD信号线: ${signal.toFixed(4)}`;
      if (histogram !== undefined) formatted += `\n- MACD柱状图: ${histogram.toFixed(4)} (${histogram > 0 ? '多头' : '空头'})`;
    }
    if (momentum.macdFast) {
      const macdFast = momentum.macdFast;
      formatted += `\n- MACD快速(5,13,5): ${(macdFast.histogram || 0).toFixed(4)}`;
    }
    if (momentum.macdSlow) {
      const macdSlow = momentum.macdSlow;
      formatted += `\n- MACD慢速(19,39,9): ${(macdSlow.histogram || 0).toFixed(4)}`;
    }

    // Stochastic系列 (3个)
    formatted += `\n**随机指标 (Stochastic)**:`;
    if (momentum.stochastic) {
      const stoch = momentum.stochastic;
      formatted += `\n- Stochastic(14) K: ${stoch.k?.toFixed(2) || 'N/A'}, D: ${stoch.d?.toFixed(2) || 'N/A'}`;
    }
    if (momentum.stochasticFast) {
      const stochFast = momentum.stochasticFast;
      formatted += `\n- Stochastic快速(5) K: ${stochFast.k?.toFixed(2) || 'N/A'}, D: ${stochFast.d?.toFixed(2) || 'N/A'}`;
    }
    if (momentum.stochasticSlow) {
      const stochSlow = momentum.stochasticSlow;
      formatted += `\n- Stochastic慢速(21) K: ${stochSlow.k?.toFixed(2) || 'N/A'}, D: ${stochSlow.d?.toFixed(2) || 'N/A'}`;
    }

    // Williams %R系列 (3个)
    formatted += `\n**威廉指标 (Williams %R)**:`;
    if (momentum.williamsR7) formatted += `\n- Williams %R(7): ${momentum.williamsR7.toFixed(2)}`;
    if (momentum.williamsR) formatted += `\n- Williams %R(14): ${momentum.williamsR.toFixed(2)}`;
    if (momentum.williamsR21) formatted += `\n- Williams %R(21): ${momentum.williamsR21.toFixed(2)}`;

    // ROC系列 (3个)
    formatted += `\n**变动率 (ROC)**:`;
    if (momentum.roc9) formatted += `\n- ROC(9): ${momentum.roc9.toFixed(2)}%`;
    if (momentum.roc) formatted += `\n- ROC(12): ${momentum.roc.toFixed(2)}%`;
    if (momentum.roc25) formatted += `\n- ROC(25): ${momentum.roc25.toFixed(2)}%`;

    // Momentum系列 (2个)
    formatted += `\n**动量指标 (Momentum)**:`;
    if (momentum.momentum) formatted += `\n- Momentum(10): ${momentum.momentum.toFixed(2)}`;
    if (momentum.momentum14) formatted += `\n- Momentum(14): ${momentum.momentum14.toFixed(2)}`;

    // CCI系列 (2个)
    formatted += `\n**商品通道指数 (CCI)**:`;
    if (momentum.cci14) formatted += `\n- CCI(14): ${momentum.cci14.toFixed(2)}`;
    if (momentum.cci) formatted += `\n- CCI(20): ${momentum.cci.toFixed(2)}`;

    // ==================== 波动率指标 (12个) ====================
    formatted += '\n\n### 波动率指标（12个完整指标）：';
    const volatility = indicators.volatility || {};

    // 布林带系列 (3个)
    formatted += `\n**布林带 (Bollinger Bands)**:`;
    if (volatility.bollingerBands10) {
      const bb10 = volatility.bollingerBands10;
      formatted += `\n- 布林带(10,1.5) 上${bb10.upper?.toFixed(2)}/中${bb10.middle?.toFixed(2)}/下${bb10.lower?.toFixed(2)}`;
    }
    if (volatility.bollingerBands) {
      const bb = volatility.bollingerBands;
      formatted += `\n- 布林带(20,2.0) 上${bb.upper?.toFixed(2)}/中${bb.middle?.toFixed(2)}/下${bb.lower?.toFixed(2)}`;
      if (bb.bandwidth) formatted += `\n- 布林带宽度: ${(bb.bandwidth * 100).toFixed(2)}%`;
    }
    if (volatility.bollingerBands50) {
      const bb50 = volatility.bollingerBands50;
      formatted += `\n- 布林带(50,2.5) 上${bb50.upper?.toFixed(2)}/中${bb50.middle?.toFixed(2)}/下${bb50.lower?.toFixed(2)}`;
    }

    // ATR系列 (3个)
    formatted += `\n**真实波动幅度 (ATR)**:`;
    if (volatility.atr7) formatted += `\n- ATR(7): ${volatility.atr7.toFixed(2)}`;
    if (volatility.atr !== undefined) {
      const atrValue = typeof volatility.atr === 'number' ? volatility.atr : volatility.atr?.value || volatility.atr?.atr;
      if (atrValue) formatted += `\n- ATR(14): ${atrValue.toFixed(2)}`;
    }
    if (volatility.atr21) formatted += `\n- ATR(21): ${volatility.atr21.toFixed(2)}`;

    // Keltner通道系列 (2个)
    formatted += `\n**Keltner通道**:`;
    if (volatility.keltnerChannels10) {
      const kc10 = volatility.keltnerChannels10;
      formatted += `\n- Keltner(10,1.5) 上${kc10.upper?.toFixed(2)}/下${kc10.lower?.toFixed(2)}`;
    }
    if (volatility.keltnerChannels) {
      const kc = volatility.keltnerChannels;
      formatted += `\n- Keltner(20,2.0) 上${kc.upper?.toFixed(2)}/下${kc.lower?.toFixed(2)}`;
    }

    // Donchian通道系列 (3个)
    formatted += `\n**Donchian通道**:`;
    if (volatility.donchianChannels10) {
      const dc10 = volatility.donchianChannels10;
      formatted += `\n- Donchian(10) 上${dc10.upper?.toFixed(2)}/下${dc10.lower?.toFixed(2)}`;
    }
    if (volatility.donchianChannels) {
      const dc = volatility.donchianChannels;
      formatted += `\n- Donchian(20) 上${dc.upper?.toFixed(2)}/下${dc.lower?.toFixed(2)}`;
    }
    if (volatility.donchianChannels50) {
      const dc50 = volatility.donchianChannels50;
      formatted += `\n- Donchian(50) 上${dc50.upper?.toFixed(2)}/下${dc50.lower?.toFixed(2)}`;
    }

    // 历史波动率系列 (3个)
    formatted += `\n**历史波动率**:`;
    if (volatility.historicalVolatility10) formatted += `\n- HV(10): ${(volatility.historicalVolatility10 * 100).toFixed(2)}%`;
    if (volatility.historicalVolatility) formatted += `\n- HV(20): ${(volatility.historicalVolatility * 100).toFixed(2)}%`;
    if (volatility.historicalVolatility30) formatted += `\n- HV(30): ${(volatility.historicalVolatility30 * 100).toFixed(2)}%`;

    // ==================== 成交量指标 (13个) ====================
    formatted += '\n\n### 成交量指标（13个完整指标）：';
    const volume = indicators.volume || {};

    formatted += `\n**核心成交量指标**:`;
    if (volume.obv) formatted += `\n- OBV能量潮: ${volume.obv.toFixed(0)}`;
    if (volume.vwap) formatted += `\n- VWAP成交量加权均价: ${volume.vwap.toFixed(2)}`;
    if (volume.adLine) formatted += `\n- A/D累积派发线: ${volume.adLine.toFixed(0)}`;
    if (volume.pvt) formatted += `\n- PVT价量趋势: ${volume.pvt.toFixed(0)}`;

    // 成交量移动平均系列 (4个)
    formatted += `\n**成交量移动平均**:`;
    if (volume.volumeSMA5) formatted += `\n- Volume SMA(5): ${volume.volumeSMA5.toFixed(2)}`;
    if (volume.volumeSMA10) formatted += `\n- Volume SMA(10): ${volume.volumeSMA10.toFixed(2)}`;
    if (volume.volumeSMA20) formatted += `\n- Volume SMA(20): ${volume.volumeSMA20.toFixed(2)}`;
    if (volume.volumeSMA50) formatted += `\n- Volume SMA(50): ${volume.volumeSMA50.toFixed(2)}`;

    formatted += `\n**资金流量指标**:`;
    if (volume.volumeRatio) formatted += `\n- 成交量比率(20): ${volume.volumeRatio.toFixed(2)}`;

    // MFI系列 (3个)
    if (volume.mfi7) formatted += `\n- MFI(7): ${volume.mfi7.toFixed(2)}`;
    if (volume.mfi) formatted += `\n- MFI(14): ${volume.mfi.toFixed(2)}`;
    if (volume.mfi21) formatted += `\n- MFI(21): ${volume.mfi21.toFixed(2)}`;

    // ==================== 支撑阻力位 (4组) ====================
    formatted += '\n\n### 支撑阻力位（4组完整指标）：';
    const sr = indicators.supportResistance || {};

    if (sr.pivotPoints) {
      formatted += `\n**枢轴点 (Pivot Points)**:`;
      formatted += `\n- PP枢轴点: ${sr.pivotPoints.pp?.toFixed(2) || 'N/A'}`;
      formatted += `\n- R2阻力位2: ${sr.pivotPoints.r2?.toFixed(2) || 'N/A'}`;
      formatted += `\n- R1阻力位1: ${sr.pivotPoints.r1?.toFixed(2) || 'N/A'}`;
      formatted += `\n- S1支撑位1: ${sr.pivotPoints.s1?.toFixed(2) || 'N/A'}`;
      formatted += `\n- S2支撑位2: ${sr.pivotPoints.s2?.toFixed(2) || 'N/A'}`;
    }

    if (sr.fibonacciLevels) {
      formatted += `\n**斐波那契回调位**:`;
      const fib = sr.fibonacciLevels;
      Object.keys(fib).forEach(level => {
        formatted += `\n- Fib ${level}: ${fib[level].toFixed(2)}`;
      });
    }

    formatted += `\n**周期高低点**:`;
    if (sr.highLow20) {
      formatted += `\n- 20周期 高${sr.highLow20.high?.toFixed(2)}/低${sr.highLow20.low?.toFixed(2)}`;
    }
    if (sr.highLow50) {
      formatted += `\n- 50周期 高${sr.highLow50.high?.toFixed(2)}/低${sr.highLow50.low?.toFixed(2)}`;
    }

    // ==================== 价格形态识别 (3个) ====================
    formatted += '\n\n### 价格形态识别（3组完整指标）：';
    const patterns = indicators.patterns || {};

    if (patterns.candlePatterns) {
      if (Array.isArray(patterns.candlePatterns)) {
        formatted += `\n- 蜡烛图形态: ${patterns.candlePatterns.length > 0 ? patterns.candlePatterns.join(', ') : '无明显形态'}`;
      } else {
        formatted += `\n- 蜡烛图形态: ${patterns.candlePatterns || '无明显形态'}`;
      }
    }
    if (patterns.trendPattern) {
      formatted += `\n- 趋势形态: ${patterns.trendPattern || '震荡'}`;
    }
    if (patterns.divergence) {
      const divType = patterns.divergence.type || patterns.divergence || '无背离';
      formatted += `\n- 背离检测: ${divType}`;
      if (divType !== '无背离' && patterns.divergence.strength) {
        formatted += ` (${patterns.divergence.strength}强度)`;
      }
    }

    // ==================== 市场情绪（技术面）(3个) ====================
    formatted += '\n\n### 市场情绪（技术面，3个完整指标）：';
    const sentiment = indicators.sentiment || {};

    if (sentiment.fearGreedIndex !== undefined && sentiment.fearGreedIndex !== null) {
      const fgi = typeof sentiment.fearGreedIndex === 'number' ? sentiment.fearGreedIndex : parseFloat(sentiment.fearGreedIndex);
      if (!isNaN(fgi)) {
        formatted += `\n- 技术面恐惧贪婪指数: ${fgi.toFixed(0)}/100`;
        formatted += ` (${fgi > 75 ? '极度贪婪⚠️' : fgi > 55 ? '贪婪' : fgi < 25 ? '极度恐惧⚠️' : fgi < 45 ? '恐惧' : '中性'})`;
      }
    }
    if (sentiment.bullBearRatio !== undefined && sentiment.bullBearRatio !== null) {
      const bbr = typeof sentiment.bullBearRatio === 'number' ? sentiment.bullBearRatio : parseFloat(sentiment.bullBearRatio);
      if (!isNaN(bbr)) {
        formatted += `\n- 技术面多空比: ${bbr.toFixed(2)}`;
        formatted += ` (${bbr > 1.2 ? '多头主导' : bbr < 0.8 ? '空头主导' : '均衡'})`;
      }
    }
    if (sentiment.marketStrength !== undefined && sentiment.marketStrength !== null) {
      const ms = typeof sentiment.marketStrength === 'number' ? sentiment.marketStrength : parseFloat(sentiment.marketStrength);
      if (!isNaN(ms)) {
        formatted += `\n- 市场力量强度: ${ms.toFixed(2)}/100`;
        formatted += ` (${ms > 70 ? '强势' : ms < 30 ? '弱势' : '正常'})`;
      }
    }

    formatted += `\n\n📊 **指标总计**: 76个技术指标已全部提供，请全面分析！`;

    return formatted || '暂无指标数据';
  }

  formatDerivativesData(marketData) {
    let formatted = '';
    let hasAnyData = false;

    // Debug logging
    console.log('🔍 formatDerivativesData called with marketData keys:', Object.keys(marketData));
    console.log('   fundingRate:', marketData.fundingRate ? Object.keys(marketData.fundingRate) : 'NULL');
    console.log('   openInterest:', marketData.openInterest ? Object.keys(marketData.openInterest) : 'NULL');
    console.log('   liquidations:', marketData.liquidations ? `Array[${marketData.liquidations.length}]` : 'NULL');

    // Funding Rate - 详细展示所有可用数值
    if (marketData.fundingRate) {
      hasAnyData = true;
      const fr = marketData.fundingRate;
      formatted += `\n\n### 资金费率分析（Funding Rate）`;

      const currentRate = parseFloat(fr.fundingRate || fr.rate || fr.fundingRateCurrent || 0);
      formatted += `\n- 当前资金费率: ${(currentRate * 100).toFixed(4)}%`;
      formatted += `\n  > 解读: ${currentRate > 0.01 ? '正值较大（>0.01%），多头支付空头，多头过热风险' : currentRate < -0.01 ? '负值较大（<-0.01%），空头支付多头，空头过热风险' : currentRate > 0 ? '正值偏小，多头略占优，市场偏多' : currentRate < 0 ? '负值偏小，空头略占优，市场偏空' : '接近0，多空平衡'}`;

      if (fr.fundingTime || fr.nextFundingTime) {
        formatted += `\n- 下次结算时间: ${fr.fundingTime || fr.nextFundingTime || 'N/A'}`;
      }
      if (fr.fundingInterval || fr.interval) {
        formatted += `\n- 结算周期: ${fr.fundingInterval || fr.interval || 'N/A'}`;
      }
      if (fr.estimatedRate !== undefined) {
        formatted += `\n- 预测费率: ${(parseFloat(fr.estimatedRate) * 100).toFixed(4)}%`;
      }

      // 历史数据（如果有）
      if (marketData.fundingRateHistory && Array.isArray(marketData.fundingRateHistory) && marketData.fundingRateHistory.length > 0) {
        const history = marketData.fundingRateHistory;
        const avgRate = history.reduce((sum, h) => sum + parseFloat(h.fundingRate || 0), 0) / history.length;
        const maxRate = Math.max(...history.map(h => parseFloat(h.fundingRate || 0)));
        const minRate = Math.min(...history.map(h => parseFloat(h.fundingRate || 0)));

        formatted += `\n- 历史资金费率（最近${history.length}条）:`;
        formatted += `\n  > 平均: ${(avgRate * 100).toFixed(4)}% | 最高: ${(maxRate * 100).toFixed(4)}% | 最低: ${(minRate * 100).toFixed(4)}%`;
        formatted += `\n  > 趋势: ${currentRate > avgRate ? '当前高于平均，资金费率上升' : currentRate < avgRate ? '当前低于平均，资金费率下降' : '接近平均水平'}`;
      }
    }

    // Open Interest - 详细展示所有可用数值
    if (marketData.openInterest || marketData.currentOpenInterest) {
      hasAnyData = true;
      const oi = marketData.openInterest || marketData.currentOpenInterest || {};
      formatted += `\n\n### 未平仓合约分析（Open Interest）`;

      const currentOI = parseFloat(oi.openInterest || oi.openInterestAmount || oi.value || 0);
      formatted += `\n- 当前持仓量: ${currentOI.toLocaleString()} ${oi.unit || 'contracts'}`;

      if (oi.openInterestUsd || oi.openInterestValue) {
        const oiUsd = parseFloat(oi.openInterestUsd || oi.openInterestValue);
        formatted += `\n- 持仓价值: $${(oiUsd / 1e6).toFixed(2)}M`;
        formatted += `\n  > 解读: ${oiUsd > 500e6 ? '超高市场参与度（>$500M），主力高度关注' : oiUsd > 100e6 ? '高市场参与度（>$100M），活跃交易' : oiUsd > 50e6 ? '中等参与度（>$50M），正常交易' : '较低参与度（<$50M），市场冷清'}`;
      } else {
        formatted += `\n  > 解读: ${currentOI > 1e6 ? '超高持仓量（>1M contracts），主力高度参与' : currentOI > 500e3 ? '高持仓量（>500K），活跃市场' : currentOI > 100e3 ? '中等持仓量（>100K），正常交易' : '较低持仓量（<100K），市场冷清'}`;
      }

      // OI变化
      if (oi.change24h !== undefined || oi.openInterestChange !== undefined) {
        const change = parseFloat(oi.change24h || oi.openInterestChange || 0);
        formatted += `\n- 24小时变化: ${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
        formatted += `\n  > 解读: ${Math.abs(change) > 10 ? `显著${change > 0 ? '增加' : '减少'}（${Math.abs(change).toFixed(1)}%），市场情绪${change > 0 ? '升温' : '降温'}` : Math.abs(change) > 5 ? `明显${change > 0 ? '增加' : '减少'}（${Math.abs(change).toFixed(1)}%）` : `小幅${change > 0 ? '增加' : '减少'}（${Math.abs(change).toFixed(1)}%），平稳`}`;
      }

      // OI + Price 配合分析
      if (marketData.price && oi.change24h !== undefined) {
        const priceChange = parseFloat(marketData.change24h || 0);
        const oiChange = parseFloat(oi.change24h || 0);
        formatted += `\n- OI与价格配合:`;
        if (priceChange > 0 && oiChange > 0) {
          formatted += `\n  > OI上升+价格上涨 = 强势多头趋势，新资金进场做多`;
        } else if (priceChange < 0 && oiChange > 0) {
          formatted += `\n  > OI上升+价格下跌 = 强势空头趋势，新资金进场做空`;
        } else if (priceChange > 0 && oiChange < 0) {
          formatted += `\n  > OI下降+价格上涨 = 空头平仓推动，上涨力度可能减弱`;
        } else if (priceChange < 0 && oiChange < 0) {
          formatted += `\n  > OI下降+价格下跌 = 多头平仓推动，下跌力度可能减弱`;
        } else {
          formatted += `\n  > OI与价格变化较小，市场观望`;
        }
      }

      // 历史OI数据（如果有）
      if (marketData.openInterestHistory && Array.isArray(marketData.openInterestHistory) && marketData.openInterestHistory.length > 0) {
        const history = marketData.openInterestHistory;
        const avgOI = history.reduce((sum, h) => sum + parseFloat(h.openInterest || h.value || 0), 0) / history.length;
        formatted += `\n- 历史持仓量（最近${history.length}条）: 平均 ${avgOI.toLocaleString()} ${oi.unit || 'contracts'}`;
        formatted += `\n  > 趋势: ${currentOI > avgOI * 1.1 ? '当前明显高于平均，持仓量显著增加' : currentOI < avgOI * 0.9 ? '当前明显低于平均，持仓量显著减少' : '接近平均水平'}`;
      }

      // Open Interest Volume
      if (marketData.openInterestVolume) {
        const oiv = marketData.openInterestVolume;
        formatted += `\n- 持仓量成交额: $${(parseFloat(oiv.volume || oiv.value || 0) / 1e6).toFixed(2)}M`;
      }
    }

    // Liquidations - 详细展示所有清算数据
    if (marketData.liquidations && marketData.liquidations.length > 0) {
      hasAnyData = true;
      const liqData = marketData.liquidations;
      formatted += `\n\n### 清算数据分析（Liquidations）`;

      const liqCount = liqData.length;
      const totalValue = liqData.reduce((sum, liq) => sum + parseFloat(liq.value || liq.size || liq.amount || 0), 0);

      // 区分多空清算
      const longLiqs = liqData.filter(l => (l.side || l.type || '').toLowerCase().includes('long') || (l.side || l.type || '').toLowerCase().includes('buy'));
      const shortLiqs = liqData.filter(l => (l.side || l.type || '').toLowerCase().includes('short') || (l.side || l.type || '').toLowerCase().includes('sell'));
      const unknownLiqs = liqData.filter(l => !longLiqs.includes(l) && !shortLiqs.includes(l));

      const longLiqValue = longLiqs.reduce((sum, liq) => sum + parseFloat(liq.value || liq.size || liq.amount || 0), 0);
      const shortLiqValue = shortLiqs.reduce((sum, liq) => sum + parseFloat(liq.value || liq.size || liq.amount || 0), 0);

      formatted += `\n- 24h清算总览:`;
      formatted += `\n  > 总清算笔数: ${liqCount}笔`;
      formatted += `\n  > 总清算金额: $${(totalValue / 1e6).toFixed(2)}M`;
      formatted += `\n  > 多头清算: ${longLiqs.length}笔，$${(longLiqValue / 1e6).toFixed(2)}M`;
      formatted += `\n  > 空头清算: ${shortLiqs.length}笔，$${(shortLiqValue / 1e6).toFixed(2)}M`;
      if (unknownLiqs.length > 0) {
        formatted += `\n  > 未知方向: ${unknownLiqs.length}笔`;
      }

      formatted += `\n- 清算方向解读:`;
      if (longLiqValue > shortLiqValue * 2) {
        formatted += `\n  > 多头清算占主导（${((longLiqValue / totalValue) * 100).toFixed(1)}%），价格下跌导致多头爆仓，看跌信号`;
      } else if (shortLiqValue > longLiqValue * 2) {
        formatted += `\n  > 空头清算占主导（${((shortLiqValue / totalValue) * 100).toFixed(1)}%），价格上涨导致空头爆仓，看涨信号`;
      } else {
        formatted += `\n  > 多空清算相对均衡（多${((longLiqValue / totalValue) * 100).toFixed(1)}% vs 空${((shortLiqValue / totalValue) * 100).toFixed(1)}%），市场震荡`;
      }

      formatted += `\n- 清算强度:`;
      formatted += `\n  > ${liqCount > 500 ? '极度剧烈（>500笔），市场极端波动' : liqCount > 200 ? '剧烈波动（>200笔），强烈市场反应' : liqCount > 100 ? '明显波动（>100笔），活跃清算' : liqCount > 50 ? '中等波动（>50笔），正常清算' : '平稳市场（<50笔），低清算'}`;

      // 大额清算
      const sortedByValue = [...liqData].sort((a, b) => parseFloat(b.value || b.size || b.amount || 0) - parseFloat(a.value || a.size || a.amount || 0));
      if (sortedByValue.length > 0 && sortedByValue[0].value) {
        const largest = sortedByValue[0];
        formatted += `\n- 最大单笔清算: $${(parseFloat(largest.value || largest.size || largest.amount) / 1e3).toFixed(1)}K @ ${largest.price || 'N/A'} (${largest.side || 'N/A'})`;
      }
    }

    // Additional liquidation data
    if (marketData.liquidationOrdersData) {
      hasAnyData = true;
      const lod = marketData.liquidationOrdersData;
      formatted += `\n- 实时清算订单数据:`;
      if (lod.totalLiquidations !== undefined) {
        formatted += `\n  > 总清算订单: ${lod.totalLiquidations}笔`;
      }
      if (lod.liquidationVolume !== undefined) {
        formatted += `\n  > 清算成交量: $${(parseFloat(lod.liquidationVolume) / 1e6).toFixed(2)}M`;
      }
    }

    // Long/Short Ratio - 详细分析
    if (marketData.longShortRatio || (marketData.aktools && marketData.aktools.longShortRatio)) {
      hasAnyData = true;
      const lsr = marketData.longShortRatio || marketData.aktools.longShortRatio || {};
      formatted += `\n\n### 多空比数据（Long/Short Ratio）`;

      const ratio = parseFloat(lsr.ratio || lsr.longShortRatio || lsr.value || 0);
      const longAccount = parseFloat(lsr.longAccount || lsr.longPercentage || 0);
      const shortAccount = parseFloat(lsr.shortAccount || lsr.shortPercentage || 0);

      if (ratio > 0) {
        formatted += `\n- 当前多空比: ${ratio.toFixed(2)} (多头:空头 = ${ratio.toFixed(2)}:1)`;
        formatted += `\n  > 解读: ${ratio > 2.5 ? `极度多头情绪（>${ratio.toFixed(1)}），市场过度乐观，反转风险极高` : ratio > 2.0 ? `强烈多头情绪（>${ratio.toFixed(1)}），市场乐观过度，注意顶部` : ratio > 1.5 ? `明显多头占优（>${ratio.toFixed(1)}），偏多情绪` : ratio > 1.0 ? `多头略占优（${ratio.toFixed(1)}），偏多` : ratio > 0.5 ? `空头占优（${ratio.toFixed(1)}），偏空` : ratio > 0.4 ? `明显空头占优（<${ratio.toFixed(1)}），偏空情绪` : `极度空头情绪（<${ratio.toFixed(1)}），市场过度悲观，反弹风险高`}`;
      }

      if (longAccount > 0 || shortAccount > 0) {
        formatted += `\n- 账户分布: 多头 ${longAccount.toFixed(1)}% | 空头 ${shortAccount.toFixed(1)}%`;
      }

      // Historical long/short ratio
      if (marketData.longShortRatioHistory && Array.isArray(marketData.longShortRatioHistory) && marketData.longShortRatioHistory.length > 0) {
        const history = marketData.longShortRatioHistory;
        const avgRatio = history.reduce((sum, h) => sum + parseFloat(h.ratio || h.longShortRatio || 0), 0) / history.length;
        formatted += `\n- 历史多空比（最近${history.length}条）: 平均 ${avgRatio.toFixed(2)}`;
        formatted += `\n  > 趋势: ${ratio > avgRatio * 1.2 ? '当前多头情绪显著升温' : ratio < avgRatio * 0.8 ? '当前空头情绪显著升温' : '情绪接近平均水平'}`;
      }

      // Long/Short Position Ratio
      if (marketData.longShortPositionRatio) {
        const lspr = marketData.longShortPositionRatio;
        formatted += `\n- 持仓量多空比: ${parseFloat(lspr.ratio || lspr.value || 0).toFixed(2)}`;
      }
    }

    // Taker Buy/Sell Volume
    if (marketData.takerVolume || (marketData.aktools && marketData.aktools.takerVolume)) {
      hasAnyData = true;
      const tv = marketData.takerVolume || marketData.aktools.takerVolume || {};
      formatted += `\n\n### 主动买卖量分析（Taker Volume）`;

      const buyVol = parseFloat(tv.buyVolume || tv.buy || 0);
      const sellVol = parseFloat(tv.sellVolume || tv.sell || 0);
      const totalVol = buyVol + sellVol;

      if (totalVol > 0) {
        const buyRatio = (buyVol / totalVol) * 100;
        const sellRatio = (sellVol / totalVol) * 100;

        formatted += `\n- 主动买入量: ${buyVol.toLocaleString()} (${buyRatio.toFixed(1)}%)`;
        formatted += `\n- 主动卖出量: ${sellVol.toLocaleString()} (${sellRatio.toFixed(1)}%)`;
        formatted += `\n  > 解读: ${buyRatio > 65 ? '主动买入占绝对优势（>65%），强烈看涨信号' : buyRatio > 55 ? '主动买入占优（>55%），看涨倾向' : buyRatio > 45 ? '买卖相对均衡（45-55%），观望' : buyRatio > 35 ? '主动卖出占优（<45%），看跌倾向' : '主动卖出占绝对优势（<35%），强烈看跌信号'}`;
      }
    }

    // Mark Price
    if (marketData.markPrice) {
      hasAnyData = true;
      const mp = marketData.markPrice;
      formatted += `\n\n### 标记价格（Mark Price）`;
      formatted += `\n- 标记价格: $${parseFloat(mp.markPrice || mp.price || mp.value || 0).toFixed(2)}`;

      if (mp.indexPrice) {
        formatted += `\n- 指数价格: $${parseFloat(mp.indexPrice).toFixed(2)}`;
        const priceDiff = ((parseFloat(mp.markPrice || mp.price) - parseFloat(mp.indexPrice)) / parseFloat(mp.indexPrice)) * 100;
        formatted += `\n- 价格偏离: ${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(3)}%`;
        formatted += `\n  > 解读: ${Math.abs(priceDiff) > 0.5 ? '偏离较大（>0.5%），交易所价格与市场价差异明显' : Math.abs(priceDiff) > 0.1 ? '轻微偏离（>0.1%）' : '基本一致（<0.1%），价格健康'}`;
      }
    }

    // Premium Index
    if (marketData.premiumIndex !== undefined) {
      hasAnyData = true;
      const pi = typeof marketData.premiumIndex === 'object' ? marketData.premiumIndex : { value: marketData.premiumIndex };
      formatted += `\n\n### 溢价指数（Premium Index）`;
      formatted += `\n- 溢价指数: ${(parseFloat(pi.value || pi.premiumIndex || 0) * 100).toFixed(4)}%`;
      formatted += `\n  > 解读: ${parseFloat(pi.value || 0) > 0.001 ? '正溢价（>0.1%），合约价格高于现货，多头强势' : parseFloat(pi.value || 0) < -0.001 ? '负溢价（<-0.1%），合约价格低于现货，空头强势' : '溢价接近0，现货合约价格平衡'}`;
    }

    // === NEW HIGH-VALUE DATA SOURCES ===

    // Options Put/Call Ratio - CRITICAL SENTIMENT INDICATOR
    if (marketData.optionsPutCallRatio) {
      hasAnyData = true;
      const pcr = marketData.optionsPutCallRatio;
      formatted += `\n\n### 🎯 期权Put/Call比率（Options Put/Call Ratio）- 极高价值`;

      if (pcr.current) {
        const ratio = pcr.current.putCallRatio;
        formatted += `\n- Put/Call比率: ${ratio.toFixed(3)}`;
        formatted += `\n- Put持仓量: ${(pcr.current.openInterestPut / 1000000).toFixed(2)}M`;
        formatted += `\n- Call持仓量: ${(pcr.current.openInterestCall / 1000000).toFixed(2)}M`;
        formatted += `\n- 市场情绪: ${pcr.current.sentiment}`;
        formatted += `\n- 交易信号: **${pcr.current.signal}**`;

        // 详细解读
        if (ratio > 1.2) {
          formatted += `\n  > ⚠️ 极度恐慌（Put/Call > 1.2）：市场过度悲观，可能接近底部，强烈买入信号`;
        } else if (ratio > 1.0) {
          formatted += `\n  > 恐慌情绪（Put/Call > 1.0）：看跌期权占优，轻度买入信号`;
        } else if (ratio < 0.7) {
          formatted += `\n  > ⚠️ 极度贪婪（Put/Call < 0.7）：市场过度乐观，可能接近顶部，强烈卖出信号`;
        } else if (ratio < 0.9) {
          formatted += `\n  > 贪婪情绪（Put/Call < 0.9）：看涨期权占优，轻度卖出信号`;
        } else {
          formatted += `\n  > 中性情绪（Put/Call 0.9-1.0）：市场情绪平衡，建议观望`;
        }

        // 趋势分析
        if (pcr.trend) {
          formatted += `\n- 趋势方向: ${pcr.trend === 'RISING' ? '上升（恐慌增加）' : pcr.trend === 'FALLING' ? '下降（贪婪增加）' : '稳定'}`;
        }

        // 历史对比
        if (pcr.summary) {
          formatted += `\n- 平均比率: ${pcr.summary.avgRatio.toFixed(3)}`;
          formatted += `\n- 最高比率: ${pcr.summary.maxRatio.toFixed(3)}`;
          formatted += `\n- 最低比率: ${pcr.summary.minRatio.toFixed(3)}`;
        }
      }
    }

    // Exchange Net Flow - CRITICAL FOR PRICE PREDICTION
    if (marketData.exchangeNetFlow) {
      hasAnyData = true;
      const enf = marketData.exchangeNetFlow;
      formatted += `\n\n### 💰 交易所资金流向（Exchange Net Flow）- 抛压预警`;

      const netFlow = enf.netFlow || 0;
      formatted += `\n- 净流量: ${netFlow > 0 ? '+' : ''}${netFlow.toFixed(2)} ${enf.asset || 'BTC'}`;
      formatted += `\n- 流入量: ${(enf.inflowVolume || 0).toFixed(2)} ${enf.asset || 'BTC'}`;
      formatted += `\n- 流出量: ${(enf.outflowVolume || 0).toFixed(2)} ${enf.asset || 'BTC'}`;
      formatted += `\n- 信号强度: ${(enf.strength * 100).toFixed(1)}%`;
      formatted += `\n- 市场信号: **${enf.signal}**`;

      // 详细解读
      if (netFlow < -1000) {
        formatted += `\n  > ⚠️ 巨量流入交易所（${Math.abs(netFlow).toFixed(0)} BTC）：极强抛压，强烈建议减仓或观望`;
      } else if (netFlow < -500) {
        formatted += `\n  > 大量流入交易所：抛压增加，建议谨慎`;
      } else if (netFlow > 1000) {
        formatted += `\n  > ✅ 巨量流出交易所（${netFlow.toFixed(0)} BTC）：买盘信号强烈，可以考虑买入`;
      } else if (netFlow > 500) {
        formatted += `\n  > 大量流出交易所：买盘增加，偏多信号`;
      } else {
        formatted += `\n  > 资金流动正常：无明显抛压或买盘`;
      }

      formatted += `\n- 建议: ${enf.recommendation || '保持现有策略'}`;
    }

    // Historical Fear & Greed - EXTREME SENTIMENT DETECTION
    if (marketData.fearGreedHistory) {
      hasAnyData = true;
      const fgh = marketData.fearGreedHistory;
      formatted += `\n\n### 📊 历史恐惧贪婪指数（Historical Fear & Greed）- 极值捕捉`;

      if (fgh.current) {
        formatted += `\n- 当前指数: ${fgh.current.value}/100 (${fgh.current.classification})`;
        formatted += `\n- 交易信号: **${fgh.current.signal}**`;
      }

      // 历史趋势
      if (fgh.trend) {
        formatted += `\n- 趋势方向: ${fgh.trend === 'RISING' ? '上升（转向贪婪）' : fgh.trend === 'FALLING' ? '下降（转向恐慌）' : '稳定'}`;
      }

      // 极值点检测
      if (fgh.extremes && fgh.extremes.length > 0) {
        formatted += `\n- 极值点数量: ${fgh.extremes.length}个`;
        const lastExtreme = fgh.extremes[0];
        if (lastExtreme) {
          formatted += `\n- 最近极值: ${lastExtreme.type} (值:${lastExtreme.value}) 于 ${new Date(lastExtreme.date).toLocaleDateString()}`;
          formatted += `\n  > ${lastExtreme.type === 'FEAR_BOTTOM' ? '⚠️ 恐慌极值出现，强烈买入信号' : '⚠️ 贪婪极值出现，强烈卖出信号'}`;
        }
      }

      // 统计信息
      if (fgh.summary) {
        formatted += `\n- 30天平均: ${fgh.summary.avgValue.toFixed(1)}/100`;
        formatted += `\n- 30天最高: ${fgh.summary.maxValue}/100`;
        formatted += `\n- 30天最低: ${fgh.summary.minValue}/100`;

        // 极端情绪判断
        if (fgh.summary.minValue < 20) {
          formatted += `\n  > ⚠️ 30天内出现极度恐慌（<20），市场可能接近底部`;
        }
        if (fgh.summary.maxValue > 80) {
          formatted += `\n  > ⚠️ 30天内出现极度贪婪（>80），市场可能接近顶部`;
        }
      }
    }

    return hasAnyData ? formatted : '\n暂无衍生品数据（fundingRate, openInterest, liquidations等字段均为空）';
  }

  formatOnChainData(marketData) {
    let formatted = '';
    let hasAnyData = false;

    // Market Sentiment - 详细展示所有可用数值
    if (marketData.sentiment) {
      hasAnyData = true;
      const s = marketData.sentiment;
      formatted += `\n\n### 市场情绪分析（Market Sentiment）`;

      const value = parseFloat(s.value || s.score || s.index || 0);
      formatted += `\n- 恐惧贪婪指数: ${value}/100`;
      formatted += `\n- 情绪分类: ${s.classification || s.category || s.label || 'N/A'}`;
      formatted += `\n  > 解读: ${value > 90 ? '极度贪婪（>90），市场过热，高风险区域，建议谨慎' : value > 75 ? '贪婪（>75），情绪乐观，注意回调风险' : value > 55 ? '偏乐观（>55），市场情绪偏多' : value > 45 ? '中性（45-55），情绪平衡' : value > 25 ? '恐惧（<45），市场情绪偏空' : value > 10 ? '极度恐惧（<25），市场过度悲观，可能是机会' : '恐慌（<10），抄底机会但需谨慎'}`;

      if (s.lastUpdate || s.timestamp) {
        formatted += `\n- 更新时间: ${s.lastUpdate || s.timestamp}`;
      }
      if (s.change24h !== undefined) {
        formatted += `\n- 24h变化: ${s.change24h > 0 ? '+' : ''}${s.change24h}`;
      }
    }

    // Coin Detail - 详细展示所有可用数值
    if (marketData.coinDetail) {
      hasAnyData = true;
      const c = marketData.coinDetail;
      formatted += `\n\n### 币种基本面分析（Coin Details）`;

      if (c.rank) {
        formatted += `\n- 市值排名: #${c.rank}`;
        formatted += `\n  > 解读: ${c.rank <= 10 ? '顶级加密货币（Top 10），蓝筹资产' : c.rank <= 50 ? '主流加密货币（Top 50），较成熟项目' : c.rank <= 100 ? '中等市值（Top 100），中型项目' : '小市值项目（>100），高风险高收益'}`;
      }

      if (c.marketCap) {
        const mcap = parseFloat(c.marketCap);
        formatted += `\n- 流通市值: $${(mcap / 1e9).toFixed(2)}B`;
        formatted += `\n  > 解读: ${mcap > 100e9 ? '超大市值（>$100B），稳定蓝筹' : mcap > 10e9 ? '大市值（>$10B），主流资产' : mcap > 1e9 ? '中市值（>$1B），中型项目' : '小市值（<$1B），高波动性'}`;
      }

      if (c.totalSupply) {
        formatted += `\n- 总供应量: ${parseFloat(c.totalSupply).toLocaleString()}`;
      }
      if (c.circulatingSupply) {
        formatted += `\n- 流通供应量: ${parseFloat(c.circulatingSupply).toLocaleString()}`;
        if (c.totalSupply) {
          const circulationRate = (parseFloat(c.circulatingSupply) / parseFloat(c.totalSupply)) * 100;
          formatted += `\n- 流通率: ${circulationRate.toFixed(1)}% ${circulationRate < 50 ? '（低流通率，未来解锁压力）' : circulationRate < 80 ? '（中等流通率）' : '（高流通率，供应稳定）'}`;
        }
      }

      if (c.volume24h) {
        const vol24h = parseFloat(c.volume24h);
        formatted += `\n- 24h成交额: $${(vol24h / 1e9).toFixed(2)}B`;
        if (c.marketCap) {
          const volumeRatio = (vol24h / parseFloat(c.marketCap)) * 100;
          formatted += `\n- 成交额/市值: ${volumeRatio.toFixed(1)}% ${volumeRatio > 50 ? '（极高换手率，高度活跃）' : volumeRatio > 20 ? '（高换手率，活跃交易）' : volumeRatio > 10 ? '（正常换手率）' : '（低换手率，流动性一般）'}`;
        }
      }

      if (c.change24h !== undefined) {
        formatted += `\n- 24h涨跌: ${c.change24h > 0 ? '+' : ''}${c.change24h}%`;
      }
      if (c.high24h) {
        formatted += `\n- 24h最高: $${parseFloat(c.high24h).toFixed(2)}`;
      }
      if (c.low24h) {
        formatted += `\n- 24h最低: $${parseFloat(c.low24h).toFixed(2)}`;
      }
      if (c.ath !== undefined) {
        formatted += `\n- 历史最高(ATH): $${parseFloat(c.ath).toFixed(2)}`;
        if (marketData.price && c.ath) {
          const athDistance = ((parseFloat(c.ath) - marketData.price) / marketData.price) * 100;
          formatted += ` (距离ATH ${athDistance > 0 ? '+' : ''}${athDistance.toFixed(1)}%)`;
        }
      }
      if (c.atl !== undefined) {
        formatted += `\n- 历史最低(ATL): $${parseFloat(c.atl).toFixed(2)}`;
        if (marketData.price && c.atl) {
          const atlDistance = ((marketData.price - parseFloat(c.atl)) / parseFloat(c.atl)) * 100;
          formatted += ` (距离ATL +${atlDistance.toFixed(1)}%)`;
        }
      }
    }

    // Gainers/Losers Context
    if (marketData.gainersLosers) {
      hasAnyData = true;
      const gl = marketData.gainersLosers;
      formatted += `\n\n### 市场涨跌榜（Gainers/Losers）`;

      if (gl.topGainers && gl.topGainers.length > 0) {
        formatted += `\n- 最大涨幅币种: ${gl.topGainers[0].symbol} (+${gl.topGainers[0].change}%)`;
        formatted += `\n- 平均涨幅（前10）: +${gl.topGainers.slice(0, Math.min(10, gl.topGainers.length)).reduce((sum, g) => sum + parseFloat(g.change || 0), 0) / Math.min(10, gl.topGainers.length).toFixed(2)}%`;
      }
      if (gl.topLosers && gl.topLosers.length > 0) {
        formatted += `\n- 最大跌幅币种: ${gl.topLosers[0].symbol} (${gl.topLosers[0].change}%)`;
        formatted += `\n- 平均跌幅（前10）: ${gl.topLosers.slice(0, Math.min(10, gl.topLosers.length)).reduce((sum, l) => sum + parseFloat(l.change || 0), 0) / Math.min(10, gl.topLosers.length).toFixed(2)}%`;
      }
      formatted += `\n  > 市场整体情绪: ${gl.topGainers && gl.topLosers && gl.topGainers.length > gl.topLosers.length * 1.5 ? '普涨行情，市场乐观' : gl.topLosers && gl.topGainers && gl.topLosers.length > gl.topGainers.length * 1.5 ? '普跌行情，市场悲观' : '涨跌互现，分化行情'}`;
    }

    // AkTools Data - 详细展示所有可用数值
    if (marketData.aktools) {
      hasAnyData = true;
      const ak = marketData.aktools;
      formatted += `\n\n### AkTools链上数据分析`;

      // Binance AI Analysis
      if (ak.binanceAI) {
        formatted += `\n- Binance AI分析:`;
        if (ak.binanceAI.sentiment) {
          formatted += `\n  > 情绪: ${ak.binanceAI.sentiment}`;
        }
        if (ak.binanceAI.trend) {
          formatted += `\n  > 趋势预测: ${ak.binanceAI.trend}`;
        }
        if (ak.binanceAI.confidence) {
          formatted += `\n  > 置信度: ${ak.binanceAI.confidence}%`;
        }
        if (ak.binanceAI.summary) {
          formatted += `\n  > 摘要: ${ak.binanceAI.summary}`;
        }
      }

      // Exchange Flows
      if (ak.exchangeInflow !== undefined || ak.exchangeOutflow !== undefined) {
        formatted += `\n- 交易所流入流出:`;
        if (ak.exchangeInflow !== undefined) {
          const inflow = parseFloat(ak.exchangeInflow);
          formatted += `\n  > 24h流入: ${inflow.toLocaleString()} ${ak.unit || 'tokens'}`;
        }
        if (ak.exchangeOutflow !== undefined) {
          const outflow = parseFloat(ak.exchangeOutflow);
          formatted += `\n  > 24h流出: ${outflow.toLocaleString()} ${ak.unit || 'tokens'}`;
        }
        if (ak.exchangeInflow !== undefined && ak.exchangeOutflow !== undefined) {
          const netFlow = parseFloat(ak.exchangeInflow) - parseFloat(ak.exchangeOutflow);
          formatted += `\n  > 净流向: ${netFlow > 0 ? '流入' : '流出'} ${Math.abs(netFlow).toLocaleString()} ${ak.unit || 'tokens'}`;
          formatted += `\n  > 解读: ${netFlow > 0 ? '资金流入交易所，可能卖压增加，看跌信号' : netFlow < 0 ? '资金流出交易所，可能进入长期持有，看涨信号' : '流入流出平衡'}`;
        }
      }

      // Whale Transactions
      if (ak.whaleTransactions || ak.largeTransactions) {
        const wt = ak.whaleTransactions || ak.largeTransactions;
        formatted += `\n- 大额转账监控:`;
        if (Array.isArray(wt)) {
          formatted += `\n  > 24h大额转账: ${wt.length}笔`;
          const totalValue = wt.reduce((sum, tx) => sum + parseFloat(tx.value || tx.amount || 0), 0);
          formatted += `\n  > 总转账额: ${totalValue.toLocaleString()} ${ak.unit || 'tokens'}`;
        } else if (wt.count !== undefined) {
          formatted += `\n  > 24h大额转账: ${wt.count}笔`;
          if (wt.totalValue) {
            formatted += `\n  > 总转账额: ${parseFloat(wt.totalValue).toLocaleString()} ${ak.unit || 'tokens'}`;
          }
        }
      }

      // Active Addresses
      if (ak.activeAddresses !== undefined) {
        formatted += `\n- 活跃地址数: ${parseFloat(ak.activeAddresses).toLocaleString()}`;
        if (ak.activeAddressesChange !== undefined) {
          formatted += `\n  > 24h变化: ${ak.activeAddressesChange > 0 ? '+' : ''}${ak.activeAddressesChange}%`;
          formatted += `\n  > 解读: ${ak.activeAddressesChange > 20 ? '活跃度暴增（>20%），市场关注度大幅提升' : ak.activeAddressesChange > 10 ? '活跃度增加（>10%），参与度提升' : ak.activeAddressesChange < -10 ? '活跃度下降（<-10%），参与度降低' : '活跃度稳定'}`;
        }
      }

      // SOPR (Spent Output Profit Ratio)
      if (ak.sopr !== undefined) {
        const sopr = parseFloat(ak.sopr);
        formatted += `\n- SOPR指标: ${sopr.toFixed(3)}`;
        formatted += `\n  > 解读: ${sopr > 1.05 ? 'SOPR >1.05，链上获利了结增加，可能面临卖压' : sopr < 0.95 ? 'SOPR <0.95，链上止损增加，可能接近底部' : 'SOPR接近1，链上盈亏平衡'}`;
      }

      // MVRV (Market Value to Realized Value)
      if (ak.mvrv !== undefined) {
        const mvrv = parseFloat(ak.mvrv);
        formatted += `\n- MVRV比率: ${mvrv.toFixed(2)}`;
        formatted += `\n  > 解读: ${mvrv > 3.5 ? 'MVRV >3.5，市场严重高估，顶部区域' : mvrv > 2.0 ? 'MVRV >2.0，市场偏高估，注意风险' : mvrv < 0.8 ? 'MVRV <0.8，市场低估，底部区域' : mvrv < 1.2 ? 'MVRV <1.2，市场偏低估，机会区域' : 'MVRV正常范围'}`;
      }

      // NVT (Network Value to Transactions)
      if (ak.nvt !== undefined) {
        const nvt = parseFloat(ak.nvt);
        formatted += `\n- NVT比率: ${nvt.toFixed(2)}`;
        formatted += `\n  > 解读: ${nvt > 150 ? 'NVT >150，网络价值远超交易量，可能高估' : nvt < 50 ? 'NVT <50，网络价值低于交易量，可能低估' : 'NVT正常范围'}`;
      }
    }

    // Free APIs Data - 详细展示所有可用数值
    if (marketData.freeAPIs) {
      hasAnyData = true;
      const fa = marketData.freeAPIs;
      formatted += `\n\n### 免费API数据汇总（Free APIs）`;

      // Blockchain Info (BTC specific)
      if (fa.blockchainInfo) {
        const bi = fa.blockchainInfo;
        formatted += `\n- BTC区块链数据:`;
        if (bi.hashRate) {
          formatted += `\n  > 算力: ${(parseFloat(bi.hashRate) / 1e18).toFixed(2)} EH/s`;
        }
        if (bi.difficulty) {
          formatted += `\n  > 挖矿难度: ${(parseFloat(bi.difficulty) / 1e12).toFixed(2)}T`;
        }
        if (bi.blockHeight) {
          formatted += `\n  > 区块高度: ${parseFloat(bi.blockHeight).toLocaleString()}`;
        }
        if (bi.transactionsPerDay) {
          formatted += `\n  > 日交易量: ${parseFloat(bi.transactionsPerDay).toLocaleString()}笔`;
        }
      }

      // Blockchair Data
      if (fa.blockchairData) {
        const bc = fa.blockchairData;
        formatted += `\n- Blockchair数据:`;
        if (bc.transactionsPerDay) {
          formatted += `\n  > 24h交易笔数: ${parseFloat(bc.transactionsPerDay).toLocaleString()}笔`;
        }
        if (bc.blockchainSize) {
          formatted += `\n  > 区块链大小: ${(parseFloat(bc.blockchainSize) / 1e9).toFixed(2)}GB`;
        }
        if (bc.averageFee) {
          formatted += `\n  > 平均交易费: $${parseFloat(bc.averageFee).toFixed(2)}`;
        }
      }

      // Market Stats (social data)
      if (fa.marketStats) {
        const ms = fa.marketStats;
        formatted += `\n- 社交媒体数据:`;
        if (ms.twitterFollowers) {
          formatted += `\n  > Twitter关注: ${parseFloat(ms.twitterFollowers).toLocaleString()}`;
        }
        if (ms.redditSubscribers) {
          formatted += `\n  > Reddit订阅: ${parseFloat(ms.redditSubscribers).toLocaleString()}`;
        }
        if (ms.redditActiveUsers) {
          formatted += `\n  > Reddit活跃用户: ${parseFloat(ms.redditActiveUsers).toLocaleString()}`;
        }
        formatted += `\n  > 解读: ${ms.twitterFollowers > 1e6 || ms.redditSubscribers > 500e3 ? '高社交影响力，大型社区支持' : ms.twitterFollowers > 100e3 || ms.redditSubscribers > 50e3 ? '中等社交影响力，活跃社区' : '较小社交影响力'}`;
      }

      // Crypto Details
      if (fa.cryptoDetails) {
        const cd = fa.cryptoDetails;
        formatted += `\n- 项目技术信息:`;
        if (cd.openSource !== undefined) {
          formatted += `\n  > 开源项目: ${cd.openSource ? '是' : '否'}`;
        }
        if (cd.teamSize) {
          formatted += `\n  > 团队规模: ${cd.teamSize}人`;
        }
        if (cd.developmentStatus) {
          formatted += `\n  > 开发状态: ${cd.developmentStatus}`;
        }
        if (cd.githubCommits) {
          formatted += `\n  > GitHub提交数: ${parseFloat(cd.githubCommits).toLocaleString()}`;
        }
      }
    }

    // Market Cap Ranking
    if (marketData.marketCapRanking) {
      hasAnyData = true;
      const mcr = marketData.marketCapRanking;
      formatted += `\n\n### 市值排名详情`;
      if (mcr.rank) {
        formatted += `\n- 全球排名: #${mcr.rank}`;
      }
      if (mcr.category) {
        formatted += `\n- 类别: ${mcr.category}`;
      }
      if (mcr.categoryRank) {
        formatted += `\n- 类别内排名: #${mcr.categoryRank}`;
      }
    }

    // Trading Fee
    if (marketData.tradingFee) {
      hasAnyData = true;
      const tf = marketData.tradingFee;
      formatted += `\n\n### 交易费率信息`;
      if (tf.maker !== undefined) {
        formatted += `\n- Maker费率: ${(parseFloat(tf.maker) * 100).toFixed(3)}%`;
      }
      if (tf.taker !== undefined) {
        formatted += `\n- Taker费率: ${(parseFloat(tf.taker) * 100).toFixed(3)}%`;
      }
    }

    // Insurance Fund
    if (marketData.insuranceFund) {
      hasAnyData = true;
      const ins = marketData.insuranceFund;
      formatted += `\n\n### 保险基金`;
      if (ins.balance !== undefined) {
        formatted += `\n- 基金余额: $${(parseFloat(ins.balance) / 1e6).toFixed(2)}M`;
      }
      if (ins.change24h !== undefined) {
        formatted += `\n- 24h变化: ${ins.change24h > 0 ? '+' : ''}${ins.change24h}%`;
      }
    }

    // Index Tickers
    if (marketData.indexTickers && Array.isArray(marketData.indexTickers) && marketData.indexTickers.length > 0) {
      hasAnyData = true;
      formatted += `\n\n### 指数价格数据`;
      marketData.indexTickers.slice(0, 3).forEach(idx => {
        formatted += `\n- ${idx.symbol}: $${parseFloat(idx.price || idx.last || 0).toFixed(2)}`;
      });
    }

    // Price Limit
    if (marketData.priceLimit) {
      hasAnyData = true;
      const pl = marketData.priceLimit;
      formatted += `\n\n### 涨跌停限制`;
      if (pl.upper) {
        formatted += `\n- 涨停价: $${parseFloat(pl.upper).toFixed(2)}`;
      }
      if (pl.lower) {
        formatted += `\n- 跌停价: $${parseFloat(pl.lower).toFixed(2)}`;
      }
    }

    // Risk Reserve
    if (marketData.riskReserve) {
      hasAnyData = true;
      const rr = marketData.riskReserve;
      formatted += `\n\n### 风险准备金`;
      if (rr.balance !== undefined) {
        formatted += `\n- 准备金余额: $${(parseFloat(rr.balance) / 1e6).toFixed(2)}M`;
      }
    }

    return hasAnyData ? formatted : '\n暂无链上和情绪数据';
  }

  formatAdvancedIndicators(advancedIndicators) {
    if (!advancedIndicators) return '暂无高级指标';
    let formatted = '';
    if (advancedIndicators.kdj) {
      const kdj = advancedIndicators.kdj;
      formatted += `\n- KDJ: K=${kdj.k?.toFixed(2)}, D=${kdj.d?.toFixed(2)}, J=${kdj.j?.toFixed(2)}`;
      formatted += `\n- KDJ解读: ${kdj.k > 80 ? '超买' : kdj.k < 20 ? '超卖' : '中性'}`;
    }
    if (advancedIndicators.ichimoku) {
      formatted += `\n- Ichimoku: 云图显示${advancedIndicators.ichimoku.trend || '中性'}趋势`;
    }
    if (advancedIndicators.aroon) {
      const aroon = advancedIndicators.aroon;
      formatted += `\n- Aroon: Up=${aroon.up?.toFixed(2)}, Down=${aroon.down?.toFixed(2)}`;
      formatted += `\n- Aroon解读: ${aroon.up > 70 ? '上升趋势强' : aroon.down > 70 ? '下降趋势强' : '无明显趋势'}`;
    }
    if (advancedIndicators.psar) {
      formatted += `\n- PSAR: ${advancedIndicators.psar.value?.toFixed(2)}`;
    }
    return formatted || '暂无高级指标';
  }

  formatDivergence(divergence) {
    if (!divergence || !divergence.hasDivergence) {
      return '## 🔄 背离信号检测\n暂无背离信号';
    }
    let formatted = '## 🔄 背离信号检测（重要反转信号）\n\n';
    formatted += `**总结**: ${divergence.summary}\n`;
    formatted += `**信号方向**: ${divergence.signal === 'BULLISH' ? '看涨' : divergence.signal === 'BEARISH' ? '看跌' : '混合'}\n`;
    formatted += `**置信度**: ${divergence.confidence}%\n\n`;
    formatted += `**详细信息**:\n`;
    divergence.divergences.forEach((div, index) => {
      formatted += `${index + 1}. **${div.type}背离** (${div.divergenceType === 'bullish' ? '看涨' : '看跌'})\n`;
      formatted += `   - 强度: ${div.strength.toFixed(1)}%\n`;
      formatted += `   - 描述: ${div.description}\n`;
    });
    formatted += `\n⚠️ **重要提示**: 背离信号通常预示趋势反转，需要高度重视！\n`;
    return formatted;
  }

  formatPriceAction(priceAction) {
    if (!priceAction) return '暂无价格行为分析';

    const lines = [];
    if (Array.isArray(priceAction.summaryLines) && priceAction.summaryLines.length > 0) {
      lines.push('### 综合摘要');
      priceAction.summaryLines.slice(0, 4).forEach((line, idx) => {
        lines.push(`${idx + 1}. ${line}`);
      });
    }

    const describePosition = (position) => {
      switch (position) {
        case 'near_support':
          return '接近近期支撑，关注是否企稳反弹';
        case 'near_resistance':
          return '逼近压力位，防范冲高回落或突破';
        case 'mid_range':
          return '位于区间中轴，等待方向选择';
        case 'upper_half':
          return '运行在区间上半部，多头略占优';
        case 'lower_half':
          return '运行在区间下半部，空头略占优';
        default:
          return '位置未定义';
      }
    };

    const formatTimeframe = (label, data) => {
      if (!data) return `- ${label}: 暂无数据`;
      if (data.status !== 'ok') return `- ${label}: 数据不足无法判断`;

      const segments = [];
      segments.push(`趋势 ${data.trend.direction} (${data.trend.changePercent}%)`);
      if (data.pricePosition && data.pricePosition !== 'unknown') {
        segments.push(describePosition(data.pricePosition));
      }
      if (Array.isArray(data.patterns) && data.patterns.length > 0) {
        segments.push(`形态: ${data.patterns.join(', ')}`);
      }
      if (data.volume?.status === 'ok') {
        const biasMap = {
          heavy_buying: '放量上攻',
          drying: '量能萎缩',
          normal: '量能正常'
        };
        segments.push(`量能: ${biasMap[data.volume.bias] || data.volume.bias}`);
      }
      if (data.volatility?.status === 'ok') {
        const regimeMap = {
          high: '波动扩大',
          normal: '波动中性',
          compressed: '波动收敛'
        };
        segments.push(`波动: ${regimeMap[data.volatility.regime] || data.volatility.regime} (ATR% ${data.volatility.atrPercent})`);
      }
      return `- ${label}: ${segments.join(' | ')}`;
    };

    lines.push('');
    lines.push('### 多时间框架价格行为');
    lines.push(formatTimeframe('1h 主时间框架', priceAction.primary));
    lines.push(formatTimeframe('4h 上位趋势', priceAction.higher));
    lines.push(formatTimeframe('15m 触发节奏', priceAction.lower));

    if (Array.isArray(priceAction.activeSignals) && priceAction.activeSignals.length > 0) {
      lines.push('');
      lines.push('### 当前可用裸K信号');
      priceAction.activeSignals.forEach(signal => {
        const patterns = signal.patterns && signal.patterns.length > 0 ? signal.patterns.join(', ') : '无明显形态';
        lines.push(`- ${signal.timeframe}: 趋势 ${signal.trend} | 形态 ${patterns}`);
      });
    }

    return lines.join('\n');
  }

  formatFreeAPIsData(freeAPIs) {
    if (!freeAPIs) return '暂无社交数据';
    let formatted = '';
    if (freeAPIs.marketStats) {
      formatted += `\n- Twitter关注: ${freeAPIs.marketStats.twitterFollowers || 'N/A'}`;
      formatted += `\n- Reddit订阅: ${freeAPIs.marketStats.redditSubscribers || 'N/A'}`;
      formatted += `\n- Reddit活跃用户: ${freeAPIs.marketStats.redditActiveUsers || 'N/A'}`;
    }
    if (freeAPIs.cryptoDetails) {
      formatted += `\n- 开源项目: ${freeAPIs.cryptoDetails.openSource ? '是' : '否'}`;
      formatted += `\n- 团队规模: ${freeAPIs.cryptoDetails.teamSize || 'N/A'}人`;
      formatted += `\n- 开发状态: ${freeAPIs.cryptoDetails.developmentStatus || 'N/A'}`;
    }
    return formatted || '暂无社交数据';
  }

  formatOrderBookData(orderBook) {
    if (!orderBook || !orderBook.bids || !orderBook.asks) return '暂无订单簿数据';
    let formatted = '';
    if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
      formatted += `\n- 最优买价: ${orderBook.bids[0][0]}`;
      formatted += `\n- 最优卖价: ${orderBook.asks[0][0]}`;
      const spread = ((orderBook.asks[0][0] - orderBook.bids[0][0]) / orderBook.bids[0][0] * 100).toFixed(4);
      formatted += `\n- 买卖价差: ${spread}% (${parseFloat(spread) < 0.1 ? '流动性好' : '流动性一般'})`;
      const bidVolume = orderBook.bids.slice(0, 10).reduce((sum, bid) => sum + bid[1], 0);
      const askVolume = orderBook.asks.slice(0, 10).reduce((sum, ask) => sum + ask[1], 0);
      const ratio = (bidVolume / (bidVolume + askVolume) * 100).toFixed(1);
      formatted += `\n- 买卖盘比例: 买${ratio}% / 卖${(100-ratio).toFixed(1)}%`;
      formatted += `\n- 盘口解读: ${ratio > 55 ? '买盘强势' : ratio < 45 ? '卖盘强势' : '买卖均衡'}`;
      const bid5Volume = orderBook.bids.slice(0, 5).reduce((sum, bid) => sum + bid[1], 0);
      const ask5Volume = orderBook.asks.slice(0, 5).reduce((sum, ask) => sum + ask[1], 0);
      formatted += `\n- Top5档位量: 买${bid5Volume.toFixed(4)} / 卖${ask5Volume.toFixed(4)}`;
    }
    return formatted;
  }

  formatTradesData(trades) {
    if (!trades || trades.length === 0) return '暂无成交记录';
    let formatted = '';
    const buyTrades = trades.filter(t => t.side === 'buy').length;
    const sellTrades = trades.filter(t => t.side === 'sell').length;
    const buyRatio = (buyTrades / trades.length * 100).toFixed(1);
    formatted += `\n- 最近${trades.length}笔成交`;
    formatted += `\n- 买入成交: ${buyTrades}笔 (${buyRatio}%)`;
    formatted += `\n- 卖出成交: ${sellTrades}笔 (${(100-buyRatio).toFixed(1)}%)`;
    formatted += `\n- 成交方向: ${buyRatio > 60 ? '主动买入为主（看涨）' : buyRatio < 40 ? '主动卖出为主（看跌）' : '买卖均衡'}`;
    const sortedByAmount = [...trades].sort((a, b) => b.amount - a.amount);
    const bigTrades = sortedByAmount.slice(0, Math.ceil(trades.length * 0.1));
    const bigBuyCount = bigTrades.filter(t => t.side === 'buy').length;
    const bigSellCount = bigTrades.filter(t => t.side === 'sell').length;
    formatted += `\n- 大单分布: 买${bigBuyCount}笔 / 卖${bigSellCount}笔`;
    formatted += `\n- 大单解读: ${bigBuyCount > bigSellCount ? '大资金买入' : bigBuyCount < bigSellCount ? '大资金卖出' : '大资金观望'}`;
    const latestTrade = trades[trades.length - 1];
    formatted += `\n- 最新成交: ${latestTrade.side === 'buy' ? '买入' : '卖出'} @ ${latestTrade.price} (量: ${latestTrade.amount.toFixed(4)})`;
    return formatted;
  }

  formatOHLCVData(ohlcv) {
    if (!ohlcv || ohlcv.length < 10) return '暂无K线数据';
    const recent = ohlcv.slice(-10);
    let formatted = '\n最近10根K线形态：';
    const greenCandles = recent.filter(c => c.close > c.open).length;
    const redCandles = recent.filter(c => c.close < c.open).length;
    formatted += `\n- 阳线/阴线: ${greenCandles}/${redCandles}`;
    formatted += `\n- K线形态: ${greenCandles > 7 ? '连续上涨' : redCandles > 7 ? '连续下跌' : '震荡'}`;
    const lastCandle = recent[recent.length - 1];
    const bodySize = Math.abs(lastCandle.close - lastCandle.open);
    const fullSize = lastCandle.high - lastCandle.low;
    const bodyRatio = (bodySize / fullSize * 100).toFixed(1);
    formatted += `\n- 最新K线实体比例: ${bodyRatio}% (${bodyRatio > 70 ? '强势' : bodyRatio < 30 ? '犹豫' : '正常'})`;
    return formatted;
  }

  /**
   * 格式化 DeFi TVL 数据
   */
  formatDeFiTVL(tvlData) {
    if (!tvlData) return '';

    let formatted = '\n\n### DeFi TVL 分析（Total Value Locked）';

    if (tvlData.totalTVL) {
      const tvlBillion = (tvlData.totalTVL / 1000000000).toFixed(2);
      formatted += `\n- 总锁定价值: $${tvlBillion}B（${tvlBillion}亿美元）`;
      formatted += `\n- 健康度评分: ${tvlData.healthScore || 'N/A'}/100`;

      if (tvlData.topChains && tvlData.topChains.length > 0) {
        formatted += `\n- Top 5 链分布:`;
        tvlData.topChains.slice(0, 5).forEach(chain => {
          formatted += `\n  • ${chain.name}: $${(chain.tvl / 1000000000).toFixed(2)}B (${chain.dominance}, 24h: ${chain.change24h}%)`;
        });
      }

      formatted += `\n- 解读: ${tvlData.interpretation || this.interpretTVLHealth(tvlData.healthScore)}`;
    } else if (tvlData.currentTVL) {
      // 特定链数据
      formatted += `\n- ${tvlData.chain} TVL: $${(tvlData.currentTVL / 1000000000).toFixed(2)}B`;
      formatted += `\n- 24h变化: ${tvlData.change24h}%`;
      formatted += `\n- 7d变化: ${tvlData.change7d}%`;
      formatted += `\n- 30d变化: ${tvlData.change30d}%`;
      formatted += `\n- 距ATH: ${tvlData.percentFromATH}%`;
    } else if (tvlData.protocol) {
      // 协议数据
      formatted += `\n- 协议: ${tvlData.protocol}`;
      formatted += `\n- TVL: $${(tvlData.totalTVL / 1000000000).toFixed(2)}B`;
      formatted += `\n- 24h变化: ${tvlData.change24h}%`;
      formatted += `\n- MCap/TVL: ${tvlData.mcapToTVL || 'N/A'}`;
      formatted += `\n- 类别: ${tvlData.category || 'N/A'}`;
    }

    return formatted;
  }

  interpretTVLHealth(score) {
    if (score >= 85) return 'DeFi生态极其健康，资金流入强劲，生态繁荣';
    if (score >= 70) return 'DeFi生态健康，资金稳定，多链发展良好';
    if (score >= 50) return 'DeFi生态正常，资金平稳，需关注新趋势';
    if (score >= 30) return 'DeFi生态偏弱，资金流出，谨慎投资';
    return 'DeFi生态萎缩，资金大幅流出，风险较高';
  }

  /**
   * 格式化 UTXO 年龄分布数据
   */
  formatUTXODistribution(utxoData) {
    if (!utxoData) return '';

    let formatted = '\n\n### UTXO 年龄分布分析（Market Maturity）';

    formatted += `\n- 币种: ${utxoData.crypto || 'BTC'}`;
    formatted += `\n- 市场成熟度: ${this.translateMaturity(utxoData.marketMaturity)}`;
    formatted += `\n- 长期持有者: ${utxoData.longTermHolders} (>1年)`;
    formatted += `\n- 短期持有者: ${utxoData.shortTermHolders} (<1月)`;
    formatted += `\n- HODL比率: ${utxoData.hodlRatio} (长/短期比)`;

    if (utxoData.distribution) {
      formatted += `\n- 详细分布:`;
      Object.entries(utxoData.distribution).forEach(([age, percent]) => {
        formatted += `\n  • ${age}: ${percent}%`;
      });
    }

    formatted += `\n- 市场解读: ${utxoData.interpretation}`;

    // 添加交易建议
    const ratio = parseFloat(utxoData.hodlRatio || 0);
    if (ratio > 1.5) {
      formatted += `\n  > 📈 强烈买入信号：长期持有者占优，供应紧缩`;
    } else if (ratio < 0.5) {
      formatted += `\n  > 📉 风险警告：短期投机者主导，波动风险高`;
    }

    return formatted;
  }

  translateMaturity(maturity) {
    const translations = {
      'VERY_MATURE': '非常成熟（长期持有者主导）',
      'MATURE': '成熟（平衡偏长期）',
      'BALANCED': '平衡（长短期均衡）',
      'SPECULATIVE': '投机（短期交易活跃）',
      'HIGHLY_SPECULATIVE': '高度投机（短期主导）'
    };
    return translations[maturity] || maturity;
  }

  /**
   * 格式化历史持仓记录
   */
  formatHistoricalPositions(posData) {
    if (!posData) return '';

    let formatted = '\n\n### 历史持仓分析（Risk Tracking）';

    if (posData.statistics) {
      const stats = posData.statistics;
      formatted += `\n- 总交易次数: ${stats.totalTrades}`;
      formatted += `\n- 胜率: ${stats.winRate}%`;
      formatted += `\n- 平均盈利: $${stats.avgProfit}`;
      formatted += `\n- 平均亏损: $${stats.avgLoss}`;
      formatted += `\n- 盈亏比: ${stats.profitFactor}`;
      formatted += `\n- 总盈亏: $${stats.totalPnl}`;
    }

    if (posData.riskMetrics) {
      const risk = posData.riskMetrics;
      formatted += `\n\n风险指标:`;
      formatted += `\n- 最大连亏: ${risk.maxConsecutiveLosses}次`;
      formatted += `\n- 平均杠杆: ${risk.avgLeverage || 'N/A'}x`;
      formatted += `\n- 爆仓次数: ${risk.liquidationCount || 0}次`;
    }

    if (posData.patterns) {
      const patterns = posData.patterns;
      formatted += `\n\n交易模式:`;
      formatted += `\n- 最佳交易对: ${patterns.bestPerformingPair}`;
      formatted += `\n- 最差交易对: ${patterns.worstPerformingPair}`;
      formatted += `\n- 最常交易: ${patterns.mostTradedPair}`;
    }

    if (posData.recommendations && posData.recommendations.length > 0) {
      formatted += `\n\n交易建议:`;
      posData.recommendations.forEach(rec => {
        formatted += `\n  • ${rec}`;
      });
    }

    // 添加最近持仓详情（如果有）
    if (posData.positions && posData.positions.length > 0) {
      formatted += `\n\n最近3笔交易:`;
      posData.positions.slice(0, 3).forEach(pos => {
        const pnlSign = pos.pnl >= 0 ? '+' : '';
        formatted += `\n  • ${pos.symbol} ${pos.side}: ${pnlSign}$${pos.pnl} (${pnlSign}${pos.pnlPercent}%)`;
      });
    }

    return formatted;
  }

  /**
   * 🆕 格式化所有24个额外数据源
   * 全面展示所有未直接暴露的数据给AI
   */
  formatAdditionalDataSources(additionalData) {
    if (!additionalData) return '暂无额外数据';

    let formatted = '\n## 📊 完整数据源（24个额外数据）\n';

    // 数据完整性统计
    if (additionalData.dataCompleteness) {
      formatted += `\n**数据完整性**: ${additionalData.dataCompleteness.success}/${additionalData.dataCompleteness.total} (${additionalData.dataCompleteness.percentage}%)\n`;
    }

    // 1️⃣ 账户数据部分
    formatted += '\n### 💰 账户完整数据\n';

    // 账户余额
    if (additionalData.accountBalance) {
      const balance = additionalData.accountBalance;
      formatted += '\n**账户余额**:';
      formatted += `\n- 总权益: $${(balance.totalEquity || balance.total || 0).toFixed(2)}`;
      formatted += `\n- 可用余额: $${(balance.availableBalance || balance.free?.USDT || 0).toFixed(2)}`;
      formatted += `\n- 已用保证金: $${(balance.usedMargin || balance.used?.USDT || 0).toFixed(2)}`;
      formatted += `\n- 保证金率: ${(balance.marginRatio || 0).toFixed(2)}%`;
      formatted += `\n- 杠杆倍数: ${balance.leverage || 1}x`;
    }

    // 当前持仓
    if (additionalData.accountPositions && additionalData.accountPositions.length > 0) {
      formatted += '\n\n**当前持仓**:';
      additionalData.accountPositions.forEach((pos, idx) => {
        formatted += `\n${idx + 1}. ${pos.symbol}:`;
        formatted += `\n   - 方向: ${pos.side === 'long' ? '📈 多' : '📉 空'}`;
        formatted += `\n   - 数量: ${pos.contracts || pos.amount}`;
        formatted += `\n   - 入场价: $${pos.entryPrice || pos.avgPrice}`;
        formatted += `\n   - 标记价: $${pos.markPrice || pos.currentPrice}`;
        formatted += `\n   - 未实现盈亏: ${pos.unrealizedPnl > 0 ? '+' : ''}$${pos.unrealizedPnl}`;
        formatted += `\n   - 盈亏率: ${pos.pnlPercentage > 0 ? '+' : ''}${pos.pnlPercentage}%`;
      });
    } else {
      formatted += '\n\n**当前持仓**: 空仓（无持仓）';
    }

    // 未平仓订单
    if (additionalData.openOrders && additionalData.openOrders.length > 0) {
      formatted += '\n\n**未平仓订单**:';
      additionalData.openOrders.slice(0, 5).forEach((order, idx) => {
        formatted += `\n${idx + 1}. ${order.symbol} - ${order.side} ${order.type}`;
        formatted += ` @ $${order.price} (数量: ${order.amount})`;
      });
    }

    // 我的成交记录统计
    if (additionalData.myTrades && additionalData.myTrades.length > 0) {
      const trades = additionalData.myTrades;
      const totalTrades = trades.length;
      const totalVolume = trades.reduce((sum, t) => sum + (t.amount * t.price), 0);
      formatted += `\n\n**交易记录统计**: ${totalTrades}笔, 总成交额: $${totalVolume.toFixed(2)}`;
    }

    // 充值/提现记录
    if ((additionalData.deposits && additionalData.deposits.length > 0) ||
        (additionalData.withdrawals && additionalData.withdrawals.length > 0)) {
      formatted += '\n\n**资金流动**:';
      if (additionalData.deposits && additionalData.deposits.length > 0) {
        formatted += `\n- 最近充值: ${additionalData.deposits.length}笔`;
      }
      if (additionalData.withdrawals && additionalData.withdrawals.length > 0) {
        formatted += `\n- 最近提现: ${additionalData.withdrawals.length}笔`;
      }
    }

    // 2️⃣ 市场扩展数据
    formatted += '\n\n### 📈 市场扩展数据\n';

    // 历史K线趋势分析（200日）
    if (additionalData.historyCandles && additionalData.historyCandles.length > 0) {
      const candles = additionalData.historyCandles;
      const latest = candles[candles.length - 1];
      const oldest = candles[0];
      const priceChange = ((latest[4] - oldest[4]) / oldest[4]) * 100;

      formatted += '\n**长期趋势（200日）**:';
      formatted += `\n- 200日前价格: $${oldest[4]}`;
      formatted += `\n- 当前价格: $${latest[4]}`;
      formatted += `\n- 200日涨幅: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
      formatted += `\n- 趋势判断: ${priceChange > 50 ? '强势上涨趋势' :
                                    priceChange > 20 ? '温和上涨趋势' :
                                    priceChange > 0 ? '轻微上涨' :
                                    priceChange > -20 ? '轻微下跌' :
                                    priceChange > -50 ? '温和下跌趋势' : '强势下跌趋势'}`;
    }

    // 批量行情对比
    if (additionalData.batchTickers && additionalData.batchTickers.length > 0) {
      formatted += '\n\n**市场对比（主流币种）**:';
      additionalData.batchTickers.forEach(ticker => {
        formatted += `\n- ${ticker.symbol}: $${ticker.last} (${ticker.percentage > 0 ? '+' : ''}${ticker.percentage}%)`;
      });
    }

    // 标记价格vs指数价格偏离
    if (additionalData.historyMarkCandles && additionalData.historyIndexCandles) {
      formatted += '\n\n**价格偏离分析**:';
      const markLatest = additionalData.historyMarkCandles[additionalData.historyMarkCandles.length - 1];
      const indexLatest = additionalData.historyIndexCandles[additionalData.historyIndexCandles.length - 1];
      if (markLatest && indexLatest) {
        const deviation = ((markLatest[4] - indexLatest[4]) / indexLatest[4]) * 100;
        formatted += `\n- 标记价格: $${markLatest[4]}`;
        formatted += `\n- 指数价格: $${indexLatest[4]}`;
        formatted += `\n- 偏离度: ${deviation > 0 ? '+' : ''}${deviation.toFixed(3)}%`;
        formatted += `\n- 状态: ${Math.abs(deviation) > 1 ? '⚠️ 显著偏离' : '正常'}`;
      }
    }

    // 3️⃣ 大宗交易数据
    if (additionalData.blockTrades && additionalData.blockTrades.length > 0) {
      formatted += '\n\n### 🏢 大宗交易监控\n';
      formatted += `\n发现 ${additionalData.blockTrades.length} 笔大宗交易:`;

      additionalData.blockTrades.slice(0, 5).forEach((trade, idx) => {
        formatted += `\n${idx + 1}. ${trade.symbol}: ${trade.side} $${(trade.price * trade.amount).toFixed(0)}`;
        formatted += ` @ $${trade.price}`;
      });

      // 大宗交易统计
      const totalBlockVolume = additionalData.blockTrades.reduce((sum, t) => sum + (t.price * t.amount), 0);
      const buyBlocks = additionalData.blockTrades.filter(t => t.side === 'buy');
      const sellBlocks = additionalData.blockTrades.filter(t => t.side === 'sell');

      formatted += `\n\n**大宗交易统计**:`;
      formatted += `\n- 总成交额: $${totalBlockVolume.toFixed(0)}`;
      formatted += `\n- 买单: ${buyBlocks.length}笔, 卖单: ${sellBlocks.length}笔`;
      formatted += `\n- 市场信号: ${buyBlocks.length > sellBlocks.length * 1.5 ? '🟢 机构买入占优' :
                                     sellBlocks.length > buyBlocks.length * 1.5 ? '🔴 机构卖出占优' : '⚪ 机构观望'}`;
    }

    // 4️⃣ 系统状态
    formatted += '\n\n### ⚙️ 系统状态\n';

    // 交易所状态
    if (additionalData.exchangeStatus) {
      const status = additionalData.exchangeStatus;
      formatted += `\n**交易所状态**: ${status.status === 'operational' ? '✅ 正常运行' :
                                        status.status === 'maintenance' ? '🔧 维护中' :
                                        status.status || '未知'}`;
    }

    // 24小时总成交量
    if (additionalData.totalVolume24h) {
      formatted += `\n**24h全市场成交量**: $${(additionalData.totalVolume24h / 1000000000).toFixed(2)}B`;
    }

    // 服务器时间同步
    if (additionalData.serverTime) {
      const serverTime = new Date(additionalData.serverTime);
      const localTime = new Date();
      const timeDiff = Math.abs(serverTime - localTime) / 1000;
      formatted += `\n**时间同步**: ${timeDiff < 1 ? '✅ 同步良好' : timeDiff < 5 ? '⚠️ 轻微延迟' : '🔴 严重延迟'} (${timeDiff.toFixed(1)}秒差异)`;
    }

    // 币种信息统计
    if (additionalData.currencies && additionalData.currencies.length > 0) {
      formatted += `\n**支持币种**: ${additionalData.currencies.length}个`;
    }

    // 交割历史
    if (additionalData.deliveryHistory && additionalData.deliveryHistory.length > 0) {
      formatted += `\n**近期交割**: ${additionalData.deliveryHistory.length}次`;
    }

    // 总结分析
    formatted += '\n\n### 🎯 综合数据洞察\n';

    // 账户风险评估
    if (additionalData.accountBalance && additionalData.accountPositions) {
      const marginRatio = additionalData.accountBalance.marginRatio || 0;
      const positionCount = additionalData.accountPositions.length;

      formatted += '\n**账户风险状态**:';
      if (marginRatio > 80) {
        formatted += '\n- ⚠️ 高风险：保证金使用率过高，建议减仓或增加保证金';
      } else if (marginRatio > 50) {
        formatted += '\n- 🟡 中等风险：保证金使用适中，注意控制风险';
      } else {
        formatted += '\n- 🟢 低风险：保证金充足，可以考虑适当增加仓位';
      }
    }

    // 市场机会识别
    if (additionalData.blockTrades && additionalData.blockTrades.length > 0) {
      formatted += '\n\n**机构动向信号**:';
      const buyBlocks = additionalData.blockTrades.filter(t => t.side === 'buy').length;
      const sellBlocks = additionalData.blockTrades.filter(t => t.side === 'sell').length;

      if (buyBlocks > sellBlocks * 2) {
        formatted += '\n- 📈 强烈买入信号：机构大量买入，跟随机构建仓';
      } else if (sellBlocks > buyBlocks * 2) {
        formatted += '\n- 📉 强烈卖出信号：机构大量卖出，考虑减仓避险';
      } else {
        formatted += '\n- ↔️ 观望信号：机构买卖平衡，等待方向明确';
      }
    }

    return formatted;
  }
}

module.exports = new DataFormatterService();


