/**
 * 并发控制器
 * 防止相同请求并发执行，减少资源浪费
 */

class ConcurrencyController {
  constructor() {
    this.pending = new Map(); // 正在执行的请求
  }

  /**
   * 执行带并发控制的异步函数
   * 如果相同的key正在执行，则等待其完成并返回相同结果
   */
  async execute(key, fn) {
    // 检查是否已有相同请求正在执行
    if (this.pending.has(key)) {
      console.log(`   [ConcurrencyController] 等待已有请求: ${key}`);
      return await this.pending.get(key);
    }

    // 创建新的执行Promise
    const promise = (async () => {
      try {
        const result = await fn();
        return result;
      } finally {
        // 执行完成后清理
        this.pending.delete(key);
      }
    })();

    // 保存到pending
    this.pending.set(key, promise);

    return await promise;
  }

  /**
   * 批量执行（带并发限制）
   */
  async executeBatch(tasks, concurrency = 3) {
    const results = [];
    const executing = [];

    for (const task of tasks) {
      const promise = task().then(result => {
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });

      results.push(promise);
      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }

    return await Promise.all(results);
  }

  /**
   * 获取当前pending数量
   */
  getPendingCount() {
    return this.pending.size;
  }

  /**
   * 清理所有pending
   */
  clear() {
    this.pending.clear();
  }
}

module.exports = new ConcurrencyController();

