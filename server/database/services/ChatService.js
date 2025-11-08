const { getDatabase } = require('../database');

class ChatService {
  static listConversations({ limit = 50, offset = 0 } = {}) {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT id, name, created_at, updated_at, last_message_at
      FROM chat_conversations
      ORDER BY COALESCE(last_message_at, updated_at) DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  }

  static createConversation(name = null) {
    const db = getDatabase();
    const convName = name || `会话 ${new Date().toLocaleString('zh-CN')}`;
    const info = db.prepare(`
      INSERT INTO chat_conversations (name, created_at, updated_at)
      VALUES (?, datetime('now'), datetime('now'))
    `).run(convName);
    return info.lastInsertRowid;
  }

  static renameConversation(id, name) {
    const db = getDatabase();
    const info = db.prepare(`
      UPDATE chat_conversations
      SET name = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, id);
    return info.changes > 0;
  }

  static deleteConversation(id) {
    const db = getDatabase();
    // 级联删除依赖外键ON DELETE CASCADE；此处直接删会话
    const info = db.prepare(`DELETE FROM chat_conversations WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  static clearAll() {
    const db = getDatabase();
    db.prepare(`DELETE FROM chat_messages`).run();
    db.prepare(`DELETE FROM chat_conversations`).run();
  }

  static appendMessage({ conversationId, role, content, metadata }) {
    const db = getDatabase();
    const info = db.prepare(`
      INSERT INTO chat_messages (conversation_id, role, content, metadata, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(conversationId, role, content, metadata ? JSON.stringify(metadata) : null);
    // 更新会话时间
    db.prepare(`
      UPDATE chat_conversations
      SET updated_at = datetime('now'), last_message_at = datetime('now')
      WHERE id = ?
    `).run(conversationId);
    return info.lastInsertRowid;
  }

  static getMessages({ conversationId, limit = 200, offset = 0 }) {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT id, role, content, metadata, created_at
      FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(conversationId, limit, offset);
    return rows.map(r => ({
      id: r.id,
      role: r.role,
      content: r.content,
      metadata: (() => { try { return r.metadata ? JSON.parse(r.metadata) : null; } catch(_) { return null; } })(),
      timestamp: r.created_at
    }));
  }

  static clearConversation(id) {
    const db = getDatabase();
    const info = db.prepare(`DELETE FROM chat_messages WHERE conversation_id = ?`).run(id);
    db.prepare(`UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?`).run(id);
    return info.changes;
  }
}

module.exports = ChatService;


