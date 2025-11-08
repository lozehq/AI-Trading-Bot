/**
 * MCP工具管理器（重构版）
 * 统一管理所有MCP工具，提供给AI调用
 *
 * 重构说明:
 * - 拆分为 ToolRegistry（工具注册）和 ToolExecutor（工具执行）
 * - 保持与原文件相同的API接口
 */

const ToolRegistry = require('./ToolRegistry');
const ToolExecutor = require('./ToolExecutor');

class MCPToolsManager {
  constructor() {
    this.registry = new ToolRegistry();
    this.executor = new ToolExecutor();
  }

  /**
   * 调用工具
   */
  async callTool(toolId, methodName, params = {}) {
    // 验证工具和方法是否存在
    if (!this.registry.hasTool(toolId)) {
      throw new Error(`未知的工具ID: ${toolId}`);
    }

    if (!this.registry.hasMethod(toolId, methodName)) {
      throw new Error(`未知的工具方法: ${toolId}.${methodName}`);
    }

    try {
      // 验证参数
      this.executor.validateParams(toolId, methodName, params);

      // 执行工具调用
      const result = await this.executor.callTool(toolId, methodName, params);

      console.log(`✅ [MCP工具] ${toolId}.${methodName} 调用成功`);
      return result;
    } catch (error) {
      console.error(`❌ [MCP工具] ${toolId}.${methodName} 调用失败:`, error.message);
      throw error;
    }
  }

  /**
   * 获取所有工具列表
   */
  getToolsList() {
    return this.registry.getToolsList();
  }

  /**
   * 生成AI工具指南
   */
  getToolsGuideForAI() {
    return this.registry.getToolsGuideForAI();
  }

  /**
   * 获取工具使用统计
   */
  getToolStats() {
    return this.registry.getToolStats();
  }

  /**
   * 获取指定工具的信息
   */
  getTool(toolId) {
    return this.registry.getTool(toolId);
  }

  /**
   * 获取指定方法的信息
   */
  getMethod(toolId, methodName) {
    return this.registry.getMethod(toolId, methodName);
  }

  /**
   * 检查工具是否存在
   */
  hasTool(toolId) {
    return this.registry.hasTool(toolId);
  }

  /**
   * 检查方法是否存在
   */
  hasMethod(toolId, methodName) {
    return this.registry.hasMethod(toolId, methodName);
  }

  /**
   * 获取工具执行统计
   */
  getExecutionStats() {
    return {
      ...this.executor.getExecutionStats(),
      registryStats: this.registry.getToolStats()
    };
  }

  // ==================== 向后兼容方法 ====================

  /**
   * 初始化所有MCP工具
   * @deprecated 使用构造函数自动初始化
   */
  initializeTools() {
    console.log('ℹ️ 工具已自动初始化，无需手动调用');
  }

  /**
   * 获取工具列表
   * @deprecated 使用 getToolsList 代替
   */
  getToolsList() {
    return this.getToolsList();
  }

  /**
   * 获取工具指南
   * @deprecated 使用 getToolsGuideForAI 代替
   */
  getToolsGuideForAI() {
    return this.getToolsGuideForAI();
  }
}

module.exports = new MCPToolsManager();
