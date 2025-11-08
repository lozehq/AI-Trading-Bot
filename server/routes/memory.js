const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/database');
const { getConfig, setConfig } = require('../database/database');
const backtestMemoryService = require('../services/backtestMemoryService');

/**
 * GET /api/memory/stats
 * 获取AI记忆统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDatabase();
    
    const stats = {
      ai_analyses: db.prepare('SELECT COUNT(*) as count FROM ai_analyses').get().count,
      ai_embeddings: 0,
      recent_analyses: []
    };

    try {
      stats.ai_embeddings = db.prepare('SELECT COUNT(*) as count FROM ai_embeddings').get().count;
    } catch (e) {}

    // 获取最近10条分析记录
    try {
      stats.recent_analyses = db.prepare(`
        SELECT id, symbol, signal, confidence, created_at
        FROM ai_analyses
        ORDER BY created_at DESC
        LIMIT 10
      `).all();
    } catch (e) {}

    // 按交易对统计
    try {
      stats.by_symbol = db.prepare(`
        SELECT symbol, COUNT(*) as count
        FROM ai_analyses
        GROUP BY symbol
        ORDER BY count DESC
        LIMIT 10
      `).all();
    } catch (e) {}

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 记忆面板（上下文）管理
 */

// 获取所有上下文
router.get('/contexts', (req, res) => {
  try {
    const db = getDatabase();
    let contexts = db.prepare(`
      SELECT id, name, description, is_default, created_at, updated_at
      FROM ai_memory_contexts
      ORDER BY is_default DESC, updated_at DESC
    `).all();

    let activeId = (getConfig && getConfig('active_memory_context_id')) || null;

    if (!contexts || contexts.length === 0) {
      // 自动创建默认面板并设为激活
      const info = db.prepare(`
        INSERT INTO ai_memory_contexts (name, description, is_default, created_at, updated_at)
        VALUES ('默认记忆面板', '自动创建', 1, datetime('now'), datetime('now'))
      `).run();
      contexts = db.prepare(`
        SELECT id, name, description, is_default, created_at, updated_at
        FROM ai_memory_contexts
        ORDER BY is_default DESC, updated_at DESC
      `).all();
      activeId = info.lastInsertRowid;
      if (setConfig) setConfig('active_memory_context_id', activeId);
    } else if (!activeId) {
      // 若未设置激活面板，优先默认/第一条
      const def = contexts.find(c => c.is_default === 1) || contexts[0];
      activeId = def?.id || null;
      if (activeId && setConfig) setConfig('active_memory_context_id', activeId);
    }

    res.json({ success: true, data: { contexts, activeId } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建上下文
router.post('/contexts', (req, res) => {
  try {
    const { name, description = '', isDefault = false } = req.body || {};
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ success: false, error: '名称不能为空' });
    }
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO ai_memory_contexts (name, description, is_default, created_at, updated_at)
      VALUES (@name, @description, @is_default, datetime('now'), datetime('now'))
    `);
    const info = stmt.run({ name: String(name).trim(), description, is_default: isDefault ? 1 : 0 });
    if (isDefault) {
      db.prepare(`UPDATE ai_memory_contexts SET is_default = 0 WHERE id != ?`).run(info.lastInsertRowid);
    }
    res.json({ success: true, data: { id: info.lastInsertRowid } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重命名/更新上下文
router.patch('/contexts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isDefault } = req.body || {};
    const db = getDatabase();

    const fields = [];
    const params = {};
    if (name !== undefined) { fields.push('name = @name'); params.name = String(name).trim(); }
    if (description !== undefined) { fields.push('description = @description'); params.description = description; }
    if (isDefault !== undefined) { fields.push('is_default = @is_default'); params.is_default = isDefault ? 1 : 0; }
    if (fields.length === 0) return res.json({ success: true });

    const sql = `UPDATE ai_memory_contexts SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = @id`;
    db.prepare(sql).run({ ...params, id });
    if (isDefault) {
      db.prepare(`UPDATE ai_memory_contexts SET is_default = 0 WHERE id != ?`).run(id);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除上下文（可选一起删除其分析）
router.delete('/contexts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { cascade = false } = req.query;
    const db = getDatabase();

    const txn = db.transaction(() => {
      if (cascade === '1' || cascade === 'true') {
        db.prepare('DELETE FROM ai_analyses WHERE context_id = ?').run(id);
      }
      db.prepare('DELETE FROM ai_memory_contexts WHERE id = ?').run(id);
    });
    txn();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 选择为当前激活上下文
router.post('/contexts/:id/select', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const exist = db.prepare('SELECT id FROM ai_memory_contexts WHERE id = ?').get(id);
    if (!exist) return res.status(404).json({ success: false, error: '上下文不存在' });
    if (typeof setConfig === 'function') setConfig('active_memory_context_id', id);
    res.json({ success: true, data: { activeId: id } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前激活上下文
router.get('/contexts/active', (req, res) => {
  try {
    let activeId = (getConfig && getConfig('active_memory_context_id')) || null;
    if (!activeId) {
      const db = getDatabase();
      // 优先默认
      let row = db.prepare(`SELECT id FROM ai_memory_contexts WHERE is_default = 1 ORDER BY id DESC LIMIT 1`).get();
      if (!row) {
        // 其次任意一个已有面板
        row = db.prepare(`SELECT id FROM ai_memory_contexts ORDER BY updated_at DESC, created_at DESC LIMIT 1`).get();
        if (!row) {
          // 都没有则自动创建默认
          const info = db.prepare(`
            INSERT INTO ai_memory_contexts (name, description, is_default, created_at, updated_at)
            VALUES ('默认记忆面板', '自动创建', 1, datetime('now'), datetime('now'))
          `).run();
          row = { id: info.lastInsertRowid };
        } else {
          db.prepare(`UPDATE ai_memory_contexts SET is_default = 0 WHERE id != ?`).run(row.id);
          db.prepare(`UPDATE ai_memory_contexts SET is_default = 1 WHERE id = ?`).run(row.id);
        }
      }
      activeId = row.id;
      if (setConfig) setConfig('active_memory_context_id', activeId);
    }
    res.json({ success: true, data: { activeId } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 清空某个上下文的分析记录
router.delete('/contexts/:id/analyses', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const result = db.prepare('DELETE FROM ai_analyses WHERE context_id = ?').run(id);
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/memory/cleanup
 * 清理旧的AI分析记录
 */
router.post('/cleanup', (req, res) => {
  try {
    const { keepDays = 7, vacuum = true } = req.body;
    
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const cutoffDateStr = cutoffDate.toISOString();

    // 统计要删除的数据
    const toDelete = db.prepare(
      'SELECT COUNT(*) as count FROM ai_analyses WHERE created_at < ?'
    ).get(cutoffDateStr).count;

    if (toDelete === 0) {
      return res.json({
        success: true,
        message: '无需清理，数据都在保留期内',
        deleted: 0
      });
    }

    // 执行清理
    const result = db.transaction(() => {
      // 清理AI分析记录
      const analysesResult = db.prepare(
        'DELETE FROM ai_analyses WHERE created_at < ?'
      ).run(cutoffDateStr);

      // 清理向量嵌入
      let embeddingsDeleted = 0;
      try {
        const embeddingsResult = db.prepare(
          'DELETE FROM ai_embeddings WHERE created_at < ?'
        ).run(cutoffDateStr);
        embeddingsDeleted = embeddingsResult.changes;
      } catch (e) {}

      // 清理孤立数据
      let orphansDeleted = 0;
      try {
        const orphanResult = db.prepare(`
          DELETE FROM ai_embeddings 
          WHERE analysis_id NOT IN (SELECT id FROM ai_analyses)
        `).run();
        orphansDeleted = orphanResult.changes;
      } catch (e) {}

      return {
        analyses: analysesResult.changes,
        embeddings: embeddingsDeleted,
        orphans: orphansDeleted
      };
    })();

    // VACUUM优化
    if (vacuum) {
      db.pragma('vacuum');
    }

    res.json({
      success: true,
      message: '清理完成',
      deleted: result.analyses,
      details: result
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/memory/all
 * 清空所有AI分析记录（危险操作）
 */
router.delete('/all', (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'DELETE_ALL_MEMORY') {
      return res.status(400).json({
        success: false,
        error: '需要确认码: DELETE_ALL_MEMORY'
      });
    }

    const db = getDatabase();
    
    const result = db.transaction(() => {
      const analysesResult = db.prepare('DELETE FROM ai_analyses').run();
      
      let embeddingsDeleted = 0;
      try {
        const embeddingsResult = db.prepare('DELETE FROM ai_embeddings').run();
        embeddingsDeleted = embeddingsResult.changes;
      } catch (e) {}

      return {
        analyses: analysesResult.changes,
        embeddings: embeddingsDeleted
      };
    })();

    // VACUUM优化
    db.pragma('vacuum');

    res.json({
      success: true,
      message: '所有AI记忆已清空',
      deleted: result
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/analysis/:id
 * 获取特定分析记录的详细信息
 */
router.get('/analysis/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    
    const analysis = db.prepare(`
      SELECT * FROM ai_analyses WHERE id = ?
    `).get(id);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: '分析记录不存在'
      });
    }

    // 解析JSON字段
    try {
      analysis.market_data = JSON.parse(analysis.market_data || '{}');
      analysis.indicators = JSON.parse(analysis.indicators || '{}');
      analysis.tools_used = JSON.parse(analysis.tools_used || '[]');
    } catch (e) {}

    res.json({ success: true, data: analysis });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

/**
 * 追加：回测结果按记忆面板查询/清理
 */
// GET /api/memory/backtests?contextId=&symbol=&limit=
router.get('/backtests', (req, res) => {
  try {
    const { contextId = null, symbol = null, limit = 50 } = req.query || {};
    const data = backtestMemoryService.listResults({ contextId, symbol, limit });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/memory/contexts/:id/backtests 清空某面板的回测
router.delete('/contexts/:id/backtests', (req, res) => {
  try {
    const { id } = req.params;
    const result = backtestMemoryService.clearContext(id);
    if (!result.success) return res.status(500).json(result);
    res.json({ success: true, deleted: result.deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

