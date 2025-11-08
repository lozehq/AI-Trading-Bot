// 冲突聚合：对引用按 signal 分类统计，生成简易摘要

function aggregate(references = []) {
  const counts = { BUY: 0, SELL: 0, HOLD: 0 };
  references.forEach(r => {
    const s = (r.signal || '').toUpperCase();
    if (counts[s] !== undefined) counts[s] += 1; else counts.HOLD += 1;
  });

  let dominant = 'HOLD';
  if (counts.BUY >= counts.SELL && counts.BUY >= counts.HOLD) dominant = 'BUY';
  else if (counts.SELL >= counts.BUY && counts.SELL >= counts.HOLD) dominant = 'SELL';

  const total = references.length || 1;
  const consistency = Math.max(counts[dominant] / total, 0);

  const summary = `支持BUY:${counts.BUY} / 支持SELL:${counts.SELL} / 中性:${counts.HOLD}`;
  return { counts, dominant, consistency, summary };
}

module.exports = { aggregate };


