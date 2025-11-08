function buildHeader() {
  return '# 市场数据分析请求';
}

function buildDataQualitySection(dataQuality) {
  return ['## 📊 数据质量评估', dataQuality.report].join('\n');
}

function buildAnomaliesSection(anomalies) {
  return ['## 🚨 异常波动检测', anomalies.report].join('\n');
}

function buildCurrentPriceSection(marketData) {
  return [
    '## 当前价格信息',
    `- 交易对: ${marketData.symbol}`,
    `- 当前价格: $${marketData.price || 'N/A'}`,
    `- 24小时变化: ${marketData.change24h || 'N/A'}%`,
    `- 24小时成交量: $${marketData.volume24h || 'N/A'}`,
    `- 24小时最高: $${marketData.high24h || 'N/A'}`,
    `- 24小时最低: $${marketData.low24h || 'N/A'}`,
  ].join('\n');
}

function buildMultiTimeframeSection(formatters, multiTimeframe) {
  return formatters.formatMultiTimeframe(multiTimeframe);
}

function buildTechnicalIndicatorsSection(formatters, indicators) {
  return ['## 技术指标', formatters.formatIndicators(indicators)].join('\n');
}

function buildPriceActionSection(formatters, priceAction) {
  return ['## 价格行为（裸K）分析', formatters.formatPriceAction(priceAction)].join('\n');
}

function buildDivergenceSection(formatters, marketData) {
  return formatters.formatDivergence(marketData.divergence);
}

function buildNewsSection(formatters, newsData) {
  return ['## 市场情绪和新闻', newsData ? formatters.formatNews(newsData) : '暂无新闻数据'].join('\n');
}

function buildDerivativesSection(formatters, marketData) {
  return ['## 衍生品数据（重要）', formatters.formatDerivativesData(marketData)].join('\n');
}

function buildOnChainSection(formatters, marketData) {
  return ['## 链上数据和市场情绪（重要）', formatters.formatOnChainData(marketData)].join('\n');
}

function buildAdvancedIndicatorsSection(formatters, marketData) {
  return ['## 高级技术指标（重要）', formatters.formatAdvancedIndicators(marketData.advancedIndicators)].join('\n');
}

function buildSocialDevSection(formatters, marketData) {
  return ['## 社交和开发数据', formatters.formatFreeAPIsData(marketData.freeAPIs)].join('\n');
}

function buildOrderBookSection(formatters, marketData) {
  return ['## 订单簿深度分析', formatters.formatOrderBookData(marketData.orderBook)].join('\n');
}

function buildTradesSection(formatters, marketData) {
  return ['## 最近成交记录分析', formatters.formatTradesData(marketData.trades)].join('\n');
}

function buildOHLCVSection(formatters, marketData) {
  return ['## K线形态（最近10根）', formatters.formatOHLCVData(marketData.ohlcv)].join('\n');
}

function buildTailContexts(mcpContext, historyContext) {
  return [mcpContext || '', '', historyContext || ''].join('\n');
}

/**
 * 构建账户状态监控section
 * @param {Object} accountState - 账户状态信息
 */
function buildAccountStateSection(accountState) {
  if (!accountState) {
    return `## 账户状态监控

暂无账户信息（可能未连接交易所API或为只读模式）`;
  }

  const sections = [];
  // 动态读取激进度以调整阈值与建议仓位
  let __minConf = 70;
  let __posBand = '20-30%';
  try {
    const runtimeStrategy = require('../runtimeStrategy');
    const ap = runtimeStrategy.getAggressivenessParams ? runtimeStrategy.getAggressivenessParams() : null;
    if (ap) {
      __minConf = Number(ap.riskControlMinConfidence) || 70;
      __posBand = ap.tradingRiskPercentage >= 3.0 ? '25-35%' : (ap.tradingRiskPercentage >= 2.5 ? '20-30%' : '15-25%');
    }
  } catch (_) {}
  sections.push('## 账户状态监控（核心决策依据）');
  sections.push('');
  sections.push('**重要**: 这是真实交易账户的实时状态，所有交易决策必须基于此信息！');
  sections.push('');

  // 1. 账户基础信息
  sections.push('### 1. 账户基础信息');
  if (accountState.balance) {
    const { totalEquity, availableBalance, usedMargin, marginRatio, leverage } = accountState.balance;

    // Handle totalEquity - can be a number or an object with multiple currencies
    let totalEquityValue = 0;
    if (typeof totalEquity === 'number') {
      totalEquityValue = totalEquity;
      sections.push(`- 总权益: $${totalEquity.toFixed(2)}`);
    } else if (totalEquity && typeof totalEquity === 'object') {
      // Sum all currency values in USDT
      totalEquityValue = totalEquity.USDT || 0;
      const equityDisplay = Object.entries(totalEquity)
        .filter(([_, value]) => value > 0.0001)
        .map(([currency, value]) => `${currency}: ${typeof value === 'number' ? value.toFixed(4) : value}`)
        .join(', ');
      sections.push(`- 总权益: ${equityDisplay}`);
    } else {
      sections.push(`- 总权益: N/A`);
    }
    sections.push(`- 可用余额: $${availableBalance?.toFixed(2) || 'N/A'} (${availableBalance && totalEquityValue ? ((availableBalance/totalEquityValue)*100).toFixed(1) : 'N/A'}%可用)`);
    sections.push(`- 已用保证金: $${usedMargin?.toFixed(2) || 'N/A'} (${usedMargin && totalEquityValue ? ((usedMargin/totalEquityValue)*100).toFixed(1) : 'N/A'}%已用)`);
    sections.push(`- 保证金率: ${marginRatio?.toFixed(2) || 'N/A'}% ${marginRatio && marginRatio < 20 ? '🚨 风险极高' : marginRatio && marginRatio < 50 ? '⚠️ 风险偏高' : '✅ 安全'}`);
    sections.push(`- 杠杆倍数: ${leverage || 'N/A'}x`);
  } else {
    sections.push('- 暂无余额信息');
  }
  sections.push('');

  // 2. 当前持仓状态
  sections.push('### 2. 当前持仓状态');
  if (accountState.positions && accountState.positions.length > 0) {
    sections.push(`**持仓数量**: ${accountState.positions.length} 个`);
    sections.push('');

    accountState.positions.forEach((pos, idx) => {
      const { symbol, side, size, entryPrice, currentPrice, unrealizedPnl, unrealizedPnlPercent, leverage, liquidationPrice, holdTime } = pos;
      const pnlSign = unrealizedPnl >= 0 ? '+' : '';
      const pnlEmoji = unrealizedPnl >= 0 ? '📈' : '📉';

      sections.push(`**持仓 ${idx + 1}: ${symbol} ${side === 'long' ? '做多' : '做空'}**`);
      sections.push(`  - 方向: ${side === 'long' ? '多头 🟢' : '空头 🔴'}`);
      sections.push(`  - 数量: ${size} 张`);
      sections.push(`  - 入场价: $${entryPrice?.toFixed(2) || 'N/A'}`);
      sections.push(`  - 当前价: $${currentPrice?.toFixed(2) || 'N/A'}`);
      sections.push(`  - 价格变化: ${currentPrice && entryPrice ? ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2) : 'N/A'}%`);
      sections.push(`  - 未实现盈亏: ${pnlEmoji} ${pnlSign}$${unrealizedPnl?.toFixed(2) || 'N/A'} (${pnlSign}${unrealizedPnlPercent?.toFixed(2) || 'N/A'}%)`);
      sections.push(`  - 杠杆: ${leverage || 'N/A'}x`);
      sections.push(`  - 强平价: $${liquidationPrice?.toFixed(2) || 'N/A'} ${liquidationPrice && currentPrice ? `(距离${Math.abs((liquidationPrice - currentPrice) / currentPrice * 100).toFixed(1)}%)` : ''}`);
      sections.push(`  - 持仓时长: ${holdTime || '未知'}`);

      // 风险评估
      if (liquidationPrice && currentPrice) {
        const distanceToLiquidation = Math.abs((liquidationPrice - currentPrice) / currentPrice * 100);
        if (distanceToLiquidation < 10) {
          sections.push(`  - ⚠️ 警告: 距离强平仅${distanceToLiquidation.toFixed(1)}%，风险极高！`);
        } else if (distanceToLiquidation < 20) {
          sections.push(`  - ⚠️ 注意: 距离强平${distanceToLiquidation.toFixed(1)}%，需注意风险`);
        }
      }
      sections.push('');
    });

    // 持仓汇总
    const totalPnl = accountState.positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
    const totalPnlPercent = accountState.balance?.totalEquity
      ? (totalPnl / accountState.balance.totalEquity) * 100
      : 0;
    sections.push(`**持仓汇总**:`);
    sections.push(`- 总未实现盈亏: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${totalPnlPercent >= 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%)`);
    sections.push('');

  } else {
    sections.push('**当前状态: 空仓 ⭕**');
    sections.push('- 无持仓，可以自由开仓');
    sections.push('');
  }

  // 3. 最近交易绩效
  sections.push('### 3. 最近交易绩效（学习参考）');
  if (accountState.recentTrades && accountState.recentTrades.length > 0) {
    const trades = accountState.recentTrades;
    const winCount = trades.filter(t => t.pnl > 0).length;
    const loseCount = trades.filter(t => t.pnl < 0).length;
    const winRate = trades.length > 0 ? (winCount / trades.length * 100).toFixed(1) : 'N/A';
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

    sections.push(`- 最近${trades.length}笔交易: ${winCount}胜 ${loseCount}负`);
    sections.push(`- 胜率: ${winRate}%`);
    sections.push(`- 总盈亏: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);
    sections.push('');

    sections.push('**最近5笔交易详情**:');
    trades.slice(0, 5).forEach((trade, idx) => {
      const { symbol, side, entryPrice, exitPrice, pnl, pnlPercent, exitTime, exitReason } = trade;
      sections.push(`${idx + 1}. ${symbol} ${side} | 入场$${entryPrice?.toFixed(2)} → 出场$${exitPrice?.toFixed(2)} | ${pnl >= 0 ? '+' : ''}$${pnl?.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent?.toFixed(2)}%) | ${exitReason || '手动平仓'}`);
    });
  } else {
    sections.push('- 暂无最近交易记录');
  }
  sections.push('');

  // 4. 风险控制状态
  sections.push('### 4. 风险控制状态');
  if (accountState.riskControl) {
    const { maxDrawdown, currentDrawdown, consecutiveWins, consecutiveLosses, dailyPnl, dailyPnlPercent } = accountState.riskControl;
    sections.push(`- 最大回撤: ${maxDrawdown?.toFixed(2) || 'N/A'}%`);
    sections.push(`- 当前回撤: ${currentDrawdown?.toFixed(2) || 'N/A'}%`);
    sections.push(`- 连续盈利: ${consecutiveWins || 0}次`);
    sections.push(`- 连续亏损: ${consecutiveLosses || 0}次 ${consecutiveLosses >= 3 ? '🚨 需要冷静' : ''}`);
    sections.push(`- 今日盈亏: ${dailyPnl >= 0 ? '+' : ''}$${dailyPnl?.toFixed(2) || 'N/A'} (${dailyPnlPercent >= 0 ? '+' : ''}${dailyPnlPercent?.toFixed(2) || 'N/A'}%)`);
  } else {
    sections.push('- 暂无风险控制数据');
  }
  sections.push('');

  // 5. 重要提示
  sections.push('### 5. AI决策指导原则');
  sections.push('');
  sections.push('**基于账户状态的决策规则**:');
  sections.push('');

  if (accountState.positions && accountState.positions.length > 0) {
    sections.push('**当前有持仓的决策逻辑**:');
    sections.push('1. 止盈判断: 如果未实现盈亏>5%，考虑部分止盈或移动止损');
    sections.push('2. 止损判断: 如果未实现盈亏<-3%，评估是否应该止损');
    sections.push('3. 加仓判断: 如果盈利>3%且趋势延续，可考虑加仓（但需控制总仓位<50%）');
    sections.push('4. 反向开仓: 严禁在有持仓时开反向单（除非明确平仓原有仓位）');
    sections.push('5. 风险管理: 如果距离强平<20%，必须建议减仓或止损');
  } else {
    sections.push('**当前空仓的决策逻辑**:');
    sections.push(`1. 开仓判断: 只有在信号明确且置信度>=${__minConf}%时才建议开仓`);
    sections.push(`2. 仓位控制: 首次开仓建议使用${__posBand}资金，留有加仓空间`);
    sections.push('3. 风险收益比: 必须>1:2才考虑开仓');
    sections.push('4. 止损设置: 开仓时必须设置明确止损位');
  }
  sections.push('');

  if (accountState.riskControl?.consecutiveLosses >= 3) {
    sections.push('⚠️ 连续亏损警告: 当前已连续亏损3次或以上，建议暂停交易，分析问题');
  }

  if (accountState.balance?.marginRatio && accountState.balance.marginRatio < 30) {
    sections.push('🚨 保证金不足警告: 当前保证金率<30%，强烈建议减仓或补充保证金');
  }

  return sections.join('\n');
}

module.exports = {
  buildHeader,
  buildDataQualitySection,
  buildAnomaliesSection,
  buildCurrentPriceSection,
  buildPriceActionSection,
  buildMultiTimeframeSection,
  buildTechnicalIndicatorsSection,
  buildDivergenceSection,
  buildNewsSection,
  buildDerivativesSection,
  buildOnChainSection,
  buildAdvancedIndicatorsSection,
  buildSocialDevSection,
  buildOrderBookSection,
  buildTradesSection,
  buildOHLCVSection,
  buildTailContexts,
  buildAccountStateSection
};


