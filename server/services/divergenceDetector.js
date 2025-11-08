/**
 * 背离检测器
 * 识别价格与技术指标之间的背离信号
 */

class DivergenceDetector {
  constructor() {
    // 背离检测参数
    this.params = {
      minPeriods: 5,        // 最少需要5个周期来确认背离
      priceChangeThreshold: 0.02,  // 价格变化阈值2%
      indicatorChangeThreshold: 0.05, // 指标变化阈值5%
      lookbackPeriods: 20   // 回看20个周期
    };
  }

  /**
   * 检测所有背离信号
   * @param {Array} ohlcv - OHLCV数据
   * @param {Object} indicators - 技术指标
   * @returns {Object} 背离检测结果
   */
  detectAll(ohlcv, indicators) {
    if (!ohlcv || ohlcv.length < this.params.minPeriods) {
      return {
        hasDivergence: false,
        message: '数据不足，无法检测背离'
      };
    }

    const results = {
      hasDivergence: false,
      divergences: [],
      summary: '',
      signal: 'NONE',  // BULLISH, BEARISH, NONE
      confidence: 0
    };

    // 1. RSI背离
    const rsiDivergence = this.detectRSIDivergence(ohlcv, indicators);
    if (rsiDivergence.detected) {
      results.divergences.push(rsiDivergence);
      results.hasDivergence = true;
    }

    // 2. MACD背离
    const macdDivergence = this.detectMACDDivergence(ohlcv, indicators);
    if (macdDivergence.detected) {
      results.divergences.push(macdDivergence);
      results.hasDivergence = true;
    }

    // 3. 成交量背离
    const volumeDivergence = this.detectVolumeDivergence(ohlcv);
    if (volumeDivergence.detected) {
      results.divergences.push(volumeDivergence);
      results.hasDivergence = true;
    }

    // 生成总结
    if (results.hasDivergence) {
      results.summary = this.generateSummary(results.divergences);
      results.signal = this.determineSignal(results.divergences);
      results.confidence = this.calculateConfidence(results.divergences);
    } else {
      results.summary = '未检测到背离信号';
    }

    return results;
  }

  /**
   * 检测RSI背离
   */
  detectRSIDivergence(ohlcv, indicators) {
    const result = {
      detected: false,
      type: 'RSI',
      divergenceType: null,  // 'bullish' or 'bearish'
      strength: 0,
      description: ''
    };

    // 检查RSI数据
    if (!indicators.rsi || typeof indicators.rsi !== 'number') {
      return result;
    }

    // 获取最近的价格和RSI值
    const recentData = ohlcv.slice(-this.params.lookbackPeriods);
    if (recentData.length < this.params.minPeriods) {
      return result;
    }

    // 找到价格的高点和低点
    const prices = recentData.map(candle => candle[4]); // close price
    const priceHigh = Math.max(...prices);
    const priceLow = Math.min(...prices);
    const currentPrice = prices[prices.length - 1];

    // 简化版：检测当前RSI与价格的关系
    // 看涨背离：价格创新低，但RSI未创新低
    if (currentPrice <= priceLow * 1.01 && indicators.rsi > 30) {
      result.detected = true;
      result.divergenceType = 'bullish';
      result.strength = Math.min(100, (indicators.rsi - 30) * 2);
      result.description = `看涨背离：价格接近低点($${currentPrice.toFixed(2)})，但RSI(${indicators.rsi.toFixed(1)})显示超卖减弱`;
    }

    // 看跌背离：价格创新高，但RSI未创新高
    if (currentPrice >= priceHigh * 0.99 && indicators.rsi < 70) {
      result.detected = true;
      result.divergenceType = 'bearish';
      result.strength = Math.min(100, (70 - indicators.rsi) * 2);
      result.description = `看跌背离：价格接近高点($${currentPrice.toFixed(2)})，但RSI(${indicators.rsi.toFixed(1)})显示超买减弱`;
    }

    return result;
  }

  /**
   * 检测MACD背离
   */
  detectMACDDivergence(ohlcv, indicators) {
    const result = {
      detected: false,
      type: 'MACD',
      divergenceType: null,
      strength: 0,
      description: ''
    };

    // 检查MACD数据
    if (!indicators.macd || !indicators.macdSignal || !indicators.macdHistogram) {
      return result;
    }

    const histogram = indicators.macdHistogram;
    const recentData = ohlcv.slice(-this.params.lookbackPeriods);
    
    if (recentData.length < this.params.minPeriods) {
      return result;
    }

    const prices = recentData.map(candle => candle[4]);
    const currentPrice = prices[prices.length - 1];
    const priceHigh = Math.max(...prices);
    const priceLow = Math.min(...prices);

    // 看涨背离：价格创新低，但MACD柱状图开始变小（负值减小）
    if (currentPrice <= priceLow * 1.01 && histogram < 0 && histogram > -Math.abs(indicators.macd) * 0.5) {
      result.detected = true;
      result.divergenceType = 'bullish';
      result.strength = Math.min(100, Math.abs(histogram / indicators.macd) * 100);
      result.description = `看涨背离：价格接近低点，但MACD柱状图(${histogram.toFixed(4)})显示下跌动能减弱`;
    }

    // 看跌背离：价格创新高，但MACD柱状图开始变小（正值减小）
    if (currentPrice >= priceHigh * 0.99 && histogram > 0 && histogram < Math.abs(indicators.macd) * 0.5) {
      result.detected = true;
      result.divergenceType = 'bearish';
      result.strength = Math.min(100, Math.abs(histogram / indicators.macd) * 100);
      result.description = `看跌背离：价格接近高点，但MACD柱状图(${histogram.toFixed(4)})显示上涨动能减弱`;
    }

    return result;
  }

  /**
   * 检测成交量背离
   */
  detectVolumeDivergence(ohlcv) {
    const result = {
      detected: false,
      type: 'Volume',
      divergenceType: null,
      strength: 0,
      description: ''
    };

    const recentData = ohlcv.slice(-this.params.lookbackPeriods);
    if (recentData.length < this.params.minPeriods) {
      return result;
    }

    // 提取价格和成交量
    const prices = recentData.map(candle => candle[4]);
    const volumes = recentData.map(candle => candle[5]);

    const currentPrice = prices[prices.length - 1];
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    const priceHigh = Math.max(...prices);
    const priceLow = Math.min(...prices);

    // 看涨背离：价格下跌但成交量萎缩（卖压减弱）
    if (currentPrice <= priceLow * 1.02 && currentVolume < avgVolume * 0.7) {
      result.detected = true;
      result.divergenceType = 'bullish';
      result.strength = Math.min(100, ((avgVolume - currentVolume) / avgVolume) * 100);
      result.description = `看涨背离：价格接近低点，但成交量萎缩${((1 - currentVolume / avgVolume) * 100).toFixed(1)}%，卖压减弱`;
    }

    // 看跌背离：价格上涨但成交量萎缩（买盘减弱）
    if (currentPrice >= priceHigh * 0.98 && currentVolume < avgVolume * 0.7) {
      result.detected = true;
      result.divergenceType = 'bearish';
      result.strength = Math.min(100, ((avgVolume - currentVolume) / avgVolume) * 100);
      result.description = `看跌背离：价格接近高点，但成交量萎缩${((1 - currentVolume / avgVolume) * 100).toFixed(1)}%，买盘减弱`;
    }

    return result;
  }

  /**
   * 生成背离总结
   */
  generateSummary(divergences) {
    const bullish = divergences.filter(d => d.divergenceType === 'bullish');
    const bearish = divergences.filter(d => d.divergenceType === 'bearish');

    if (bullish.length > bearish.length) {
      return `检测到${bullish.length}个看涨背离信号：${bullish.map(d => d.type).join(', ')}`;
    } else if (bearish.length > bullish.length) {
      return `检测到${bearish.length}个看跌背离信号：${bearish.map(d => d.type).join(', ')}`;
    } else {
      return `检测到混合背离信号：看涨${bullish.length}个，看跌${bearish.length}个`;
    }
  }

  /**
   * 确定背离信号方向
   */
  determineSignal(divergences) {
    const bullish = divergences.filter(d => d.divergenceType === 'bullish');
    const bearish = divergences.filter(d => d.divergenceType === 'bearish');

    if (bullish.length > bearish.length) {
      return 'BULLISH';
    } else if (bearish.length > bullish.length) {
      return 'BEARISH';
    } else {
      return 'MIXED';
    }
  }

  /**
   * 计算背离信号置信度
   */
  calculateConfidence(divergences) {
    if (divergences.length === 0) return 0;

    // 基础置信度：每个背离信号贡献20%
    let confidence = divergences.length * 20;

    // 根据强度调整
    const avgStrength = divergences.reduce((sum, d) => sum + d.strength, 0) / divergences.length;
    confidence += avgStrength * 0.3;

    // 如果多个指标同时背离，额外加分
    if (divergences.length >= 2) {
      confidence += 15;
    }

    return Math.min(100, Math.round(confidence));
  }

  /**
   * 格式化背离报告
   */
  formatReport(divergenceResult) {
    if (!divergenceResult.hasDivergence) {
      return '未检测到背离信号';
    }

    let report = `\n## 🔄 背离信号检测\n\n`;
    report += `**总结**: ${divergenceResult.summary}\n`;
    report += `**信号方向**: ${divergenceResult.signal}\n`;
    report += `**置信度**: ${divergenceResult.confidence}%\n\n`;
    report += `**详细信息**:\n`;

    divergenceResult.divergences.forEach((div, index) => {
      report += `${index + 1}. **${div.type}背离** (${div.divergenceType === 'bullish' ? '看涨' : '看跌'})\n`;
      report += `   - 强度: ${div.strength.toFixed(1)}%\n`;
      report += `   - 描述: ${div.description}\n\n`;
    });

    return report;
  }
}

module.exports = new DivergenceDetector();

