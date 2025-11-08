/**
 * 轻量级因果SCM引擎（线性结构方程版）
 * - 节点值 = Σ(parent.value * weight) + bias（无父则保持base或给默认）
 * - 支持 do(X=x) 干预：覆盖变量并向后传播
 */

class SCMEngine {
  constructor(model = null) {
    this.model = model || { variables: {} };
  }

  setModel(model) {
    this.model = model || { variables: {} };
  }

  // 拓扑排序（Kahn）。若有环则按输入顺序回退
  topologicalOrder() {
    const vars = Object.keys(this.model.variables || {});
    const indeg = new Map(vars.map(v => [v, 0]));
    const adj = new Map(vars.map(v => [v, []]));
    for (const [v, cfg] of Object.entries(this.model.variables || {})) {
      const parents = (cfg?.equation?.parents || []).map(p => p.name);
      for (const p of parents) {
        if (indeg.has(v)) indeg.set(v, indeg.get(v) + 1);
        if (adj.has(p)) adj.get(p).push(v);
      }
    }
    const q = [];
    indeg.forEach((d, v) => { if (d === 0) q.push(v); });
    const order = [];
    while (q.length) {
      const u = q.shift();
      order.push(u);
      for (const w of (adj.get(u) || [])) {
        indeg.set(w, indeg.get(w) - 1);
        if (indeg.get(w) === 0) q.push(w);
      }
    }
    if (order.length === vars.length) return order;
    return vars; // 退化处理
  }

  // 计算单次前向
  forward(baseVars = {}, intervention = {}) {
    const values = { ...baseVars };
    const used = new Set(Object.keys(baseVars));
    // 应用干预
    for (const [k, v] of Object.entries(intervention || {})) {
      values[k] = v;
      used.add(k);
    }
    const order = this.topologicalOrder();
    for (const v of order) {
      if (intervention && Object.prototype.hasOwnProperty.call(intervention, v)) continue; // do 覆盖
      const cfg = this.model.variables?.[v];
      if (!cfg || !cfg.equation) continue;
      const parents = cfg.equation.parents || [];
      const bias = Number(cfg.equation.bias || 0);
      let sum = bias;
      let hasAny = false;
      for (const p of parents) {
        const w = Number(p.weight || 0);
        const pv = Number(values[p.name]);
        if (Number.isFinite(pv)) {
          sum += pv * w;
          hasAny = true;
        }
      }
      if (hasAny) {
        values[v] = sum;
        used.add(v);
      }
    }
    return { values, used: Array.from(used) };
  }
}

module.exports = SCMEngine;


