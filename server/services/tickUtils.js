// 将逐笔成交聚合为bar（秒/分钟）
function aggregateTicks(ticks, timeframe = '1s') {
  const tf = timeframe.endsWith('s') ? Number(timeframe.slice(0, -1)) : timeframe.endsWith('m') ? Number(timeframe.slice(0, -1)) * 60 : 1;
  const bucketMs = tf * 1000;
  const buckets = new Map();
  for (const t of ticks) {
    const ts = Number(t.ts);
    if (!Number.isFinite(ts)) continue;
    const key = Math.floor(ts / bucketMs) * bucketMs;
    const price = Number(t.price);
    const size = Number(t.size) || 0;
    let b = buckets.get(key);
    if (!b) {
      b = { ts: key, open: price, high: price, low: price, close: price, volume: size };
      buckets.set(key, b);
    } else {
      if (price > b.high) b.high = price;
      if (price < b.low) b.low = price;
      b.close = price;
      b.volume += size;
    }
  }
  return [...buckets.values()].sort((a, b) => a.ts - b.ts);
}

module.exports = { aggregateTicks };


