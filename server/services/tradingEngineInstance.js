const TradingEngine = require('./tradingEngine');

let tradingEngineInstance = null;

function getTradingEngine() {
  if (!tradingEngineInstance) {
    tradingEngineInstance = new TradingEngine();
    console.log('[TradingEngine] 实例已创建 (singleton)');
  }
  return tradingEngineInstance;
}

module.exports = getTradingEngine;

