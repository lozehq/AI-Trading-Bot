// 高质量文本嵌入提供者（可选）：基于 @xenova/transformers
// 说明：该模块采用按需动态加载，不会在未安装依赖时报错。

let pipelineInstance = null;
let transformersModule = null;

async function ensurePipeline() {
  if (pipelineInstance) return pipelineInstance;
  try {
    // 动态导入，避免在未安装依赖时崩溃
    // eslint-disable-next-line no-new-func
    const mod = await (globalThis.__xenova_import__ || (s => import(s)))('@xenova/transformers');
    transformersModule = mod;
    const { pipeline } = transformersModule;

    const candidates = [
      // 多语言优先（中英皆可）
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      // 英文回退
      'Xenova/all-MiniLM-L6-v2'
    ];

    let lastErr = null;
    for (const model of candidates) {
      try {
        // feature-extraction + mean pooling + normalize
        pipelineInstance = await pipeline('feature-extraction', model);
        return pipelineInstance;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!pipelineInstance && lastErr) throw lastErr;
  } catch (err) {
    // 未安装或加载失败，保持 null 以指示不可用
    pipelineInstance = null;
  }
  return pipelineInstance;
}

function l2Normalize(values) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i] / norm;
  return out;
}

async function computeEmbedding(text) {
  const pl = await ensurePipeline();
  if (!pl) return null; // 表示不可用，由调用方决定回退策略
  const output = await pl(String(text || ''), { pooling: 'mean', normalize: true });
  // transformers.js 已经支持 normalize:true，这里仍做一次兜底
  const arr = Array.from(output.data || output);
  return l2Normalize(arr);
}

async function isAvailable() {
  const pl = await ensurePipeline();
  return !!pl;
}

module.exports = {
  isAvailable,
  computeEmbedding,
};


