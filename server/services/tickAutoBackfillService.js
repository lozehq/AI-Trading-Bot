const tickRecorder = require('./tickRecorder');

class TickAutoBackfillService {
  constructor() {
    this.started = false;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    const list = (process.env.TICK_AUTO_RECORD_SYMBOLS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!list.length) {
      console.log('🕒 未配置 TICK_AUTO_RECORD_SYMBOLS，跳过自动tick录制');
      return;
    }
    console.log(`📼 自动tick录制开启，目标: ${list.join(', ')}`);
    for (const symbol of list) {
      try {
        tickRecorder.start(symbol);
        const r = await tickRecorder.backfillRecent(symbol, 500);
        console.log(`  → ${symbol} 回填 ${r.fetched} 条，开始实时录制`);
      } catch (e) {
        console.warn(`  ⚠️ ${symbol} 自动回填失败: ${e.message}`);
      }
    }
  }
}

module.exports = new TickAutoBackfillService();


