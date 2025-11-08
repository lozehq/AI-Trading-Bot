// 轻量向量检索服务（默认）：基于哈希嵌入+余弦相似度
// 同时提供可选的高质量嵌入（@xenova/transformers）异步接口，不影响现有同步调用。
const { getDatabase } = require('../database/database');
const embeddingProvider = require('./embeddingProvider');

const DIM = 64; // 向量维度

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
    console.warn(`⚠️ JSON序列化失败: ${err.message}, 使用fallback`);
    return fallback;
  }
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1024);
}

function hashToken(token) {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h) >>> 0;
}

function normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vec.map(v => v / norm);
}

function computeEmbedding(text) {
  const vec = new Array(DIM).fill(0);
  const tokens = tokenize(text);
  for (const t of tokens) {
    const idx = hashToken(t) % DIM;
    vec[idx] += 1;
  }
  return normalize(vec);
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

function ensureTable() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_embeddings (
      analysis_id INTEGER PRIMARY KEY,
      symbol TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (analysis_id) REFERENCES ai_analyses(id) ON DELETE CASCADE
    );
  `);
}

// v2：高质量嵌入存储表（仅在异步接口被调用时按需创建）
function ensureTableV2() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_embeddings_v2 (
      analysis_id INTEGER PRIMARY KEY,
      symbol TEXT NOT NULL,
      embedding TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (analysis_id) REFERENCES ai_analyses(id) ON DELETE CASCADE
    );
  `);
}

function upsertEmbedding(analysisRow) {
  ensureTable();
  const db = getDatabase();
  const text = [
    analysisRow.reasoning,
    safeStringify(analysisRow.marketData || {}, '{}'),
    safeStringify(analysisRow.indicators || {}, '{}')
  ].join('\n');
  const emb = computeEmbedding(text);
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO ai_embeddings (analysis_id, symbol, embedding, created_at, updated_at)
    VALUES (@id, @symbol, @embedding, @now, @now)
    ON CONFLICT(analysis_id) DO UPDATE SET embedding = @embedding, updated_at = @now
  `);
  stmt.run({ id: analysisRow.id, symbol: analysisRow.symbol, embedding: safeStringify(emb, '[]'), now });
}

async function upsertEmbeddingAsync(analysisRow) {
  ensureTableV2();
  const db = getDatabase();
  const text = [
    analysisRow.reasoning,
    safeStringify(analysisRow.marketData || {}, '{}'),
    safeStringify(analysisRow.indicators || {}, '{}')
  ].join('\n');
  const emb = await embeddingProvider.computeEmbedding(text);
  if (!emb) return; // 依赖不可用则跳过
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO ai_embeddings_v2 (analysis_id, symbol, embedding, model, created_at, updated_at)
    VALUES (@id, @symbol, @embedding, @model, @now, @now)
    ON CONFLICT(analysis_id) DO UPDATE SET embedding = @embedding, updated_at = @now
  `);
  stmt.run({ id: analysisRow.id, symbol: analysisRow.symbol, embedding: safeStringify(emb, '[]'), model: 'xenova', now });
}

function ensureRecentEmbeddings(symbol, limit = 50, contextId = null) {
  ensureTable();
  const db = getDatabase();
  const where = ['symbol = ?'];
  const params = [symbol];
  if (contextId !== null && contextId !== undefined) { where.push('context_id = ?'); params.push(Number(contextId)); }
  params.push(limit);
  const rows = db.prepare(`
    SELECT id, symbol, reasoning, market_data AS marketData, indicators
    FROM ai_analyses
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params).map(r => ({
    id: r.id,
    symbol: r.symbol,
    reasoning: r.reasoning,
    marketData: JSON.parse(r.marketData || '{}'),
    indicators: JSON.parse(r.indicators || '{}')
  }));

  rows.forEach(upsertEmbedding);
}

async function ensureRecentEmbeddingsAsync(symbol, limit = 50, contextId = null) {
  ensureTableV2();
  const db = getDatabase();
  const where = ['symbol = ?'];
  const params = [symbol];
  if (contextId !== null && contextId !== undefined) { where.push('context_id = ?'); params.push(Number(contextId)); }
  params.push(limit);
  const rows = db.prepare(`
    SELECT id, symbol, reasoning, market_data AS marketData, indicators
    FROM ai_analyses
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params).map(r => ({
    id: r.id,
    symbol: r.symbol,
    reasoning: r.reasoning,
    marketData: JSON.parse(r.marketData || '{}'),
    indicators: JSON.parse(r.indicators || '{}')
  }));

  for (const row of rows) {
    // 顺序处理以避免首次加载模型的高并发
    // eslint-disable-next-line no-await-in-loop
    await upsertEmbeddingAsync(row);
  }
}

function searchSimilar(symbol, queryText, topK = 8, contextId = null) {
  ensureTable();
  const db = getDatabase();
  const where = ['a.symbol = ?'];
  const params = [symbol];
  if (contextId !== null && contextId !== undefined) { where.push('a.context_id = ?'); params.push(Number(contextId)); }
  const all = db.prepare(`
    SELECT e.analysis_id as id, a.symbol, a.signal, a.confidence, a.entry_price as entryPrice,
           a.reasoning, a.created_at as createdAt, a.context_id as contextId, e.embedding
    FROM ai_embeddings e JOIN ai_analyses a ON a.id = e.analysis_id
    WHERE ${where.join(' AND ')}
  `).all(...params);
  if (all.length === 0) return [];
  const q = computeEmbedding(queryText);
  const scored = all.map(row => {
    let emb;
    try { emb = JSON.parse(row.embedding); } catch { emb = []; }
    const score = cosine(q, emb);
    return { ...row, score };
  }).sort((a, b) => b.score - a.score).slice(0, topK);

  return scored.map(r => ({
    id: r.id,
    timestamp: r.createdAt,
    signal: (r.signal || 'HOLD').toUpperCase(),
    confidence: r.confidence || 0,
    entryPrice: r.entryPrice || 0,
    summary: r.reasoning || '',
    issues: [],
    contextId: r.contextId,
    similarity: r.score
  }));
}

async function searchSimilarAsync(symbol, queryText, topK = 8, contextId = null) {
  // 如依赖不可用，回退到同步实现
  if (!(await embeddingProvider.isAvailable())) {
    return searchSimilar(symbol, queryText, topK, contextId);
  }

  ensureTableV2();
  const db = getDatabase();
  const where = ['a.symbol = ?'];
  const params = [symbol];
  if (contextId !== null && contextId !== undefined) { where.push('a.context_id = ?'); params.push(Number(contextId)); }
  const all = db.prepare(`
    SELECT e.analysis_id as id, a.symbol, a.signal, a.confidence, a.entry_price as entryPrice,
           a.reasoning, a.created_at as createdAt, a.context_id as contextId, e.embedding
    FROM ai_embeddings_v2 e JOIN ai_analyses a ON a.id = e.analysis_id
    WHERE ${where.join(' AND ')}
  `).all(...params);
  if (all.length === 0) return [];

  const q = (await embeddingProvider.computeEmbedding(queryText)) || computeEmbedding(queryText);
  const scored = all.map(row => {
    let emb;
    try { emb = JSON.parse(row.embedding); } catch { emb = []; }
    const score = cosine(q, emb);
    return { ...row, score };
  }).sort((a, b) => b.score - a.score).slice(0, topK);

  return scored.map(r => ({
    id: r.id,
    timestamp: r.createdAt,
    signal: (r.signal || 'HOLD').toUpperCase(),
    confidence: r.confidence || 0,
    entryPrice: r.entryPrice || 0,
    summary: r.reasoning || '',
    issues: [],
    contextId: r.contextId,
    similarity: r.score
  }));
}

module.exports = {
  computeEmbedding,
  upsertEmbedding,
  upsertEmbeddingAsync,
  ensureRecentEmbeddings,
  ensureRecentEmbeddingsAsync,
  searchSimilar,
  searchSimilarAsync,
};


