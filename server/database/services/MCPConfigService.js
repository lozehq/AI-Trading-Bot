const { getDatabase } = require('../database');

class MCPConfigService {
  /**
   * 安全的JSON解析
   * @private
   */
  static _safeJSONParse(str, defaultValue) {
    try {
      return JSON.parse(str);
    } catch (error) {
      console.warn('⚠️ JSON解析失败:', error.message);
      return defaultValue;
    }
  }

  static getDB() {
    return getDatabase();
  }

  static list() {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM mcp_configs ORDER BY created_at DESC').all();
    return rows.map(row => this.deserialize(row));
  }

  static getById(id) {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM mcp_configs WHERE id = ?').get(id);
    return row ? this.deserialize(row) : null;
  }

  static getByToolId(toolId) {
    const db = this.getDB();
    const row = db.prepare('SELECT * FROM mcp_configs WHERE tool_id = ?').get(toolId);
    return row ? this.deserialize(row) : null;
  }

  static getAll() {
    const db = this.getDB();
    const rows = db.prepare('SELECT * FROM mcp_configs').all();
    return rows.map(row => this.deserialize(row));
  }

  static create(payload) {
    const db = this.getDB();
    const stmt = db.prepare(`
      INSERT INTO mcp_configs (tool_id, command, args, env, description, created_at, updated_at)
      VALUES (@tool_id, @command, @args, @env, @description, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(this.serialize(payload));
    return this.getById(result.lastInsertRowid);
  }

  static update(id, payload) {
    const db = this.getDB();
    const stmt = db.prepare(`
      UPDATE mcp_configs
      SET command = @command,
          args = @args,
          env = @env,
          description = @description,
          updated_at = datetime('now')
      WHERE id = @id
    `);

    stmt.run({
      id,
      ...this.serialize(payload)
    });

    return this.getById(id);
  }

  static delete(id) {
    const db = this.getDB();
    const stmt = db.prepare('DELETE FROM mcp_configs WHERE id = ?');
    return stmt.run(id).changes > 0;
  }

  static serialize(payload) {
    return {
      tool_id: payload.toolId,
      command: payload.command,
      args: payload.args && payload.args.length > 0 ? JSON.stringify(payload.args) : null,
      env: payload.env && Object.keys(payload.env).length > 0 ? JSON.stringify(payload.env) : null,
      description: payload.description || null,
      working_directory: payload.workingDirectory || null
    };
  }

  static deserialize(row) {
    return {
      id: row.id,
      toolId: row.tool_id,
      command: row.command,
      args: row.args ? this._safeJSONParse(row.args, []) : [],
      env: row.env ? this._safeJSONParse(row.env, {}) : {},
      description: row.description,
      workingDirectory: row.working_directory || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = { MCPConfigService };


