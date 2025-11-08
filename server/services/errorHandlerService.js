// 统一错误处理与重试/降级策略

class ErrorHandlerService {
  shouldRetry(error, attempt, maxRetries) {
    // 显式标记为不可重试
    if (error && error.retryable === false) return false;

    const statusCode = error?.response?.status;
    const transient = statusCode === 503 || statusCode === 429 || error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
    return attempt < maxRetries && !!transient;
  }

  logAttemptFailure(error, attempt) {
    const statusCode = error?.response?.status;
    const errorType = error?.response?.data?.error?.type;
    console.error(`❌ AI API调用失败 (第${attempt}次):`, error.message);

    if (statusCode) {
      console.error(`   状态码: ${statusCode}`);
      if (errorType) console.error(`   错误类型: ${errorType}`);
    }

    if (error?.code) console.error(`   错误码: ${error.code}`);
    if (typeof error?.status !== 'undefined') console.error(`   提供方状态: ${error.status}`);
    if (error?.provider) console.error(`   提供方: ${error.provider}`);
  }
}

module.exports = new ErrorHandlerService();


