/**
 * API Key 管理路由
 * 提供 API Key 的创建、查询、更新、删除功能
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDatabase } = require('../database/database');
const { validateBody, validateQuery, schemas } = require('../validators');
const { generateApiKey, generateApiSecret, hashApiSecret } = require('../middleware/apiKeyAuth');

/**
 * GET /api/api-keys
 * 获取所有 API Keys
 */
router.get('/', validateQuery(schemas.common.pagination), async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const offset = (page - 1) * pageSize;

    const db = getDatabase();
    
    // 查询总数
    const countResult = db.prepare('SELECT COUNT(*) as total FROM api_keys').get();
    const total = countResult.total;

    // 查询数据（不返回 secret）
    const keys = db.prepare(`
      SELECT id, key, name, permissions, ip_whitelist, is_active, 
             expires_at, last_used_at, created_at, updated_at
      FROM api_keys
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset);

    // 解析 JSON 字段
    const formattedKeys = keys.map(key => ({
      ...key,
      permissions: key.permissions ? JSON.parse(key.permissions) : [],
      ipWhitelist: key.ip_whitelist ? JSON.parse(key.ip_whitelist) : []
    }));

    res.json({
      success: true,
      data: {
        keys: formattedKeys,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    });
  } catch (error) {
    console.error('获取 API Keys 失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/api-keys
 * 创建新的 API Key
 */
router.post('/', validateBody(schemas.apiKey.create), async (req, res) => {
  try {
    const { name, permissions, ipWhitelist, expiresAt } = req.body;

    const db = getDatabase();
    
    // 1. 生成 API Key 和明文 Secret
    const apiKey = generateApiKey();
    const apiSecret = generateApiSecret();

    // 2. 生成盐值并哈希 Secret
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedSecret = `${salt}:${hashApiSecret(apiSecret, salt)}`;

    // 3. 插入数据库 (存储哈希值)
    const result = db.prepare(`
      INSERT INTO api_keys (key, secret, name, permissions, ip_whitelist, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      apiKey,
      hashedSecret, // <--- 关键修复：存储哈希值
      name,
      JSON.stringify(permissions || ['read']),
      ipWhitelist ? JSON.stringify(ipWhitelist) : null,
      expiresAt || null
    );

    // 4. 返回明文 Secret 给用户 (仅此一次)
    res.json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        key: apiKey,
        secret: apiSecret, // 返回明文供用户保存
        name,
        permissions,
        ipWhitelist,
        expiresAt,
        message: '请立即保存 API Secret，它不会再次显示！'
      }
    });
  } catch (error) {
    console.error('创建 API Key 失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/api-keys/:id
 * 更新 API Key
 */
router.put('/:id', validateBody(schemas.apiKey.update), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions, ipWhitelist, isActive } = req.body;

    const db = getDatabase();
    
    // 构建更新语句
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (permissions !== undefined) {
      updates.push('permissions = ?');
      values.push(JSON.stringify(permissions));
    }
    if (ipWhitelist !== undefined) {
      updates.push('ip_whitelist = ?');
      values.push(ipWhitelist ? JSON.stringify(ipWhitelist) : null);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有提供要更新的字段'
      });
    }

    updates.push('updated_at = datetime("now")');
    values.push(id);

    const result = db.prepare(`
      UPDATE api_keys
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      });
    }

    res.json({
      success: true,
      message: 'API Key 更新成功'
    });
  } catch (error) {
    console.error('更新 API Key 失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/api-keys/:id
 * 删除 API Key
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const db = getDatabase();

    const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      });
    }

    res.json({
      success: true,
      message: 'API Key 删除成功'
    });
  } catch (error) {
    console.error('删除 API Key 失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/api-keys/stats
 * 获取 API Key 使用统计
 */
router.get('/stats', async (req, res) => {
  try {
    const db = getDatabase();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN expires_at IS NOT NULL AND expires_at < datetime('now') THEN 1 ELSE 0 END) as expired
      FROM api_keys
    `).get();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;