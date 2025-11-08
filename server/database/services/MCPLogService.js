/**
 * MCP日志服务
 */

const { getDatabase } = require('../database');

class MCPLogService {
  /**
   * 计算时间范围的截止日期
   * @private
   */
  static _calculateCutoffDate(timeRange) {
    const cutoffDate = new Date();

    if (timeRange.endsWith('h')) {
      const hours = parseInt(timeRange);
      if (isNaN(hours) || hours < 0) {
        throw new Error(`无效的小时数: ${timeRange}`);
      }
      cutoffDate.setHours(cutoffDate.getHours() - hours);
    } else if (timeRange.endsWith('d')) {
      const days = parseInt(timeRange);
      if (isNaN(days) || days < 0) {
        throw new Error(`无效的天数: ${timeRange}`);
      }
      cutoffDate.setDate(cutoffDate.getDate() - days);
    } else {
      throw new Error(`无效的时间范围格式: ${timeRange}，应为 "1h", "24h", "7d" 等`);
    }

    return cutoffDate.toISOString();
  }

  /**
   * 创建MCP日志
   */
  static create(log) {
    const db = getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO mcp_logs (
        tool_name, method, params, result, status, error_message, duration_ms
      ) VALUES (
        @tool_name, @method, @params, @result, @status, @error_message, @duration_ms
      )
    `);

    const result = stmt.run({
      tool_name: log.tool_name,
      method: log.method,
      params: typeof log.params === 'object' ? JSON.stringify(log.params) : log.params,
      result: typeof log.result === 'object' ? JSON.stringify(log.result) : log.result,
      status: log.status || 'SUCCESS',
      error_message: log.error_message || null,
      duration_ms: log.duration_ms || null
    });

    return result.lastInsertRowid ;
  }

  /**
   * 查询MCP日志
   */
  static query(query) {
    const db = getDatabase();

    let sql = 'SELECT * FROM mcp_logs WHERE 1=1';
    const params = [];

    if (query.tool_name) {
      sql += ' AND tool_name = ?';
      params.push(query.tool_name);
    }

    if (query.method) {
      sql += ' AND method = ?';
      params.push(query.method);
    }

    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    if (query.start_date) {
      sql += ' AND created_at >= ?';
      params.push(query.start_date);
    }

    if (query.end_date) {
      sql += ' AND created_at <= ?';
      params.push(query.end_date);
    }

    // 排序 - 添加白名单验证防止SQL注入
    const allowedOrderBy = ['created_at', 'tool_name', 'method', 'status', 'duration_ms', 'id'];
    const allowedDirection = ['ASC', 'DESC'];

    const orderBy = allowedOrderBy.includes(query.orderBy) ? query.orderBy : 'created_at';
    const orderDirection = allowedDirection.includes(query.orderDirection) ? query.orderDirection : 'DESC';
    sql += ` ORDER BY ${orderBy} ${orderDirection}`;

    // 分页
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);

      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }
    }

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 获取最近的日志
   */
  static getRecent(limit = 50) {
    return this.query({ limit, orderBy: 'created_at', orderDirection: 'DESC' });
  }

  /**
   * 获取失败的日志
   */
  static getFailures(limit = 50) {
    return this.query({ 
      status: 'FAILED', 
      limit, 
      orderBy: 'created_at', 
      orderDirection: 'DESC' 
    });
  }

  /**
   * 获取MCP工具统计
   */
  static getStatistics(toolName) {
    const db = getDatabase();

    let sql = 'SELECT * FROM v_mcp_statistics WHERE 1=1';
    const params = [];

    if (toolName) {
      sql += ' AND tool_name = ?';
      params.push(toolName);
    }

    sql += ' ORDER BY total_calls DESC';

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * 获取工具成功率
   */
  static getSuccessRate(toolName) {
    const db = getDatabase();
    
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success
      FROM mcp_logs
      WHERE tool_name = ?
    `);

    const result = stmt.get(toolName);

    if (!result || result.total === 0) return 0;
    return (result.success / result.total) * 100;
  }

  /**
   * 获取平均执行时间
   */
  static getAverageDuration(toolName, method) {
    const db = getDatabase();

    let sql = 'SELECT AVG(duration_ms) as avg FROM mcp_logs WHERE tool_name = ?';
    const params = [toolName];

    if (method) {
      sql += ' AND method = ?';
      params.push(method);
    }

    const stmt = db.prepare(sql);
    const result = stmt.get(...params);

    return (result && result.avg) || 0;
  }

  /**
   * 删除旧日志
   */
  static deleteOld(days = 7) {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const stmt = db.prepare('DELETE FROM mcp_logs WHERE created_at < ?');
    const result = stmt.run(cutoffDate.toISOString());
    
    console.log(`✅ 删除${days}天前的MCP日志: ${result.changes} 条`);
    return result.changes;
  }

  /**
   * 记录MCP调用（便捷方法）
   */
  static async logCall(
    toolName,
    method,
    params,
    fn
  ) {
    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.create({
        tool_name: toolName,
        method,
        params,
        result,
        status: 'SUCCESS',
        duration_ms: duration
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.create({
        tool_name: toolName,
        method,
        params,
        status: 'FAILED',
        error_message: error.message || String(error),
        duration_ms: duration
      });

      throw error;
    }
  }

  /**
   * 获取工具调用次数
   */
  static getCallCount(toolName, hours = 24) {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);
    
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM mcp_logs
      WHERE tool_name = ? AND created_at >= ?
    `);

    const result = stmt.get(toolName, cutoffDate.toISOString());
    return (result && result.count) || 0;
  }

  /**
   * 清空所有日志
   */
  static truncate() {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM mcp_logs');
    const result = stmt.run();
    console.log(`⚠️ 已清空所有MCP日志: ${result.changes} 条`);
    return result.changes > 0;
  }

  /**
   * 获取工具成功率（按时间范围）
   */
  static getSuccessRateByTimeRange(toolName, timeRange = '24h') {
    const db = getDatabase();

    // 计算时间范围
    const cutoffDate = this._calculateCutoffDate(timeRange);

    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        AVG(duration_ms) as avg_duration,
        MIN(duration_ms) as min_duration,
        MAX(duration_ms) as max_duration
      FROM mcp_logs
      WHERE tool_name = ? AND created_at >= ?
    `);

    const result = stmt.get(toolName, cutoffDate);

    if (!result || result.total === 0) {
      return {
        toolName,
        timeRange,
        total: 0,
        success: 0,
        failed: 0,
        successRate: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0
      };
    }

    return {
      toolName,
      timeRange,
      total: result.total,
      success: result.success,
      failed: result.failed,
      successRate: ((result.success / result.total) * 100).toFixed(2),
      avgDuration: Math.round(result.avg_duration || 0),
      minDuration: result.min_duration || 0,
      maxDuration: result.max_duration || 0
    };
  }

  /**
   * 获取所有工具的成功率汇总
   */
  static getAllToolsSuccessRate(timeRange = '24h') {
    const db = getDatabase();

    // 计算时间范围
    const cutoffDate = this._calculateCutoffDate(timeRange);

    const stmt = db.prepare(`
      SELECT
        tool_name,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        AVG(duration_ms) as avg_duration,
        MIN(created_at) as first_call,
        MAX(created_at) as last_call
      FROM mcp_logs
      WHERE created_at >= ?
      GROUP BY tool_name
      ORDER BY total DESC
    `);

    const results = stmt.all(cutoffDate);

    return results.map(r => ({
      toolName: r.tool_name,
      total: r.total,
      success: r.success,
      failed: r.failed,
      successRate: ((r.success / r.total) * 100).toFixed(2),
      avgDuration: Math.round(r.avg_duration || 0),
      firstCall: r.first_call,
      lastCall: r.last_call
    }));
  }

  /**
   * 获取错误分类统计
   */
  static getErrorCategoryStats(timeRange = '24h') {
    const db = getDatabase();

    const cutoffDate = this._calculateCutoffDate(timeRange);

    const stmt = db.prepare(`
      SELECT
        error_message,
        COUNT(*) as count,
        tool_name,
        method
      FROM mcp_logs
      WHERE status = 'FAILED' AND created_at >= ?
      GROUP BY error_message, tool_name, method
      ORDER BY count DESC
      LIMIT 20
    `);

    return stmt.all(cutoffDate);
  }

  /**
   * 获取性能指标（P50, P95, P99延迟）
   */
  static getPerformanceMetrics(toolName, timeRange = '24h') {
    const db = getDatabase();

    const cutoffDate = this._calculateCutoffDate(timeRange);

    // 获取所有成功的调用延迟
    const stmt = db.prepare(`
      SELECT duration_ms
      FROM mcp_logs
      WHERE tool_name = ? AND status = 'SUCCESS' AND created_at >= ?
      ORDER BY duration_ms ASC
    `);

    const durations = stmt.all(toolName, cutoffDate).map(r => r.duration_ms);

    if (durations.length === 0) {
      return {
        toolName,
        timeRange,
        count: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        avg: 0,
        min: 0,
        max: 0
      };
    }

    const percentile = (arr, p) => {
      const index = Math.ceil(arr.length * p) - 1;
      return arr[index];
    };

    return {
      toolName,
      timeRange,
      count: durations.length,
      p50: percentile(durations, 0.50),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      min: durations[0],
      max: durations[durations.length - 1]
    };
  }
}

module.exports = { MCPLogService };

