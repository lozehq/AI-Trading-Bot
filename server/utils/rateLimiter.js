/**
 * 简单的请求限流器
 * 防止429错误
 */

const { RATE_LIMIT } = require('../config/constants'); // ✅ 使用配置常量

class RateLimiter {
  constructor(minInterval = RATE_LIMIT.MIN_INTERVAL) { // ✅ 使用配置常量
    this.lastRequestTime = 0;
    this.minInterval = minInterval;
    this.queue = [];
    this.processing = false;
  }

  /**
   * 等待直到可以发送请求
   */
  async waitForSlot() {
    // 🎯 默认禁用限流：用户API无限制
    const ENABLE_RATE_LIMIT = process.env.ENABLE_RATE_LIMIT === 'true';
    
    if (!ENABLE_RATE_LIMIT) {
      return; // 默认禁用限流，AI完全无限制
    }
    
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      console.log(`⏱️  限流等待 ${(waitTime / 1000).toFixed(1)}秒...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * 执行带限流的请求
   */
  async execute(fn) {
    await this.waitForSlot();
    return await fn();
  }
}

// ✅ 为每个服务创建独立的限流器（使用配置常量）
const aiChatLimiter = new RateLimiter(RATE_LIMIT.AI_CHAT_INTERVAL);
const aiAnalysisLimiter = new RateLimiter(RATE_LIMIT.AI_ANALYSIS_INTERVAL);

module.exports = {
  aiChatLimiter,
  aiAnalysisLimiter
};

