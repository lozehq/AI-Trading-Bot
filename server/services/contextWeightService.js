// 简易上下文权重计算：兼顾新鲜度、置信度、问题惩罚

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function clamp01(v) {
  if (Number.isNaN(v) || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * 计算单条引用的权重
 * @param {Object} ref { timestamp, confidence, issues[] }
 * @param {Object} options { nowMs, maxAgeMin }
 */
function computeWeight(ref, options = {}) {
  const now = options.nowMs || Date.now();
  const maxAgeMin = options.maxAgeMin || 180; // 3小时线性衰减

  const ts = new Date(ref.timestamp).getTime();
  const ageMin = clamp01((now - ts) / 60000 / maxAgeMin);
  const recency = 1 - ageMin; // 越新越高

  const conf = clamp01((Number(ref.confidence) || 0) / 100);
  const sim = clamp01(Number(ref.similarity)); // 允许未提供时视为0

  const issues = Array.isArray(ref.issues) ? ref.issues : [];
  let penalty = 0;
  if (issues.includes('error')) penalty += 0.5;
  if (issues.includes('invalid_entry_price')) penalty += 0.3;
  if (issues.includes('stale')) penalty += 0.2;
  penalty = clamp01(penalty);

  // 动态权重：默认重心在新鲜度与置信度，语义相似度作为补强；
  // 当新鲜度或置信度较低时，提高语义相似度的权重。
  let wRecency = Number(options.wRecency ?? 0.4);
  let wConf = Number(options.wConfidence ?? 0.35);
  let wSim = Number(options.wSimilarity ?? 0.25);

  if (recency < 0.5 || conf < 0.5) {
    wSim += 0.1;
  }
  const wSum = Math.max(1e-6, wRecency + wConf + wSim);
  wRecency /= wSum; wConf /= wSum; wSim /= wSum;

  const linear = wRecency * recency + wConf * conf + wSim * sim - penalty;
  const score = clamp01(sigmoid(2.2 * linear));
  return score;
}

/**
 * 对引用进行分组筛选
 */
function rankAndSplit(references, { contextK = 5, minWeight = 0.5, nowMs } = {}) {
  const ranked = (references || []).map(r => ({ ...r, score: computeWeight(r, { nowMs }) }))
    .sort((a, b) => b.score - a.score);

  const evidence = ranked.filter(r => r.score >= minWeight).slice(0, contextK);
  const background = ranked.filter(r => !evidence.includes(r)).slice(0, Math.max(0, contextK - evidence.length));

  const coverage = ranked.length > 0 ? clamp01(evidence.length / ranked.length) : 0;
  const issueCount = ranked.reduce((acc, r) => acc + (Array.isArray(r.issues) ? r.issues.length : 0), 0);
  const issueRate = ranked.length > 0 ? clamp01(issueCount / (ranked.length * 2)) : 0; // 估算

  return { evidence, background, metrics: { coverage, issueRate } };
}

module.exports = {
  computeWeight,
  rankAndSplit,
};


