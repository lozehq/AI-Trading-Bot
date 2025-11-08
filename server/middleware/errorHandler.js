/**
 * 统一错误处理中间件
 */

// 自定义错误类
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 异步错误捕获包装器
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 全局错误处理中间件
const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message } = err;

  // 记录错误日志
  console.error(`[ERROR] ${new Date().toISOString()} - ${err.stack || err.message}`);

  // ✅ 修复：更安全的环境检查，生产环境绝不泄露敏感信息
  const isProduction = process.env.NODE_ENV === 'production';

  // 处理特定错误类型
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = '输入数据验证失败';
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    message = '无效的参数格式';
  }

  if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = '外部服务暂时不可用';
  }

  if (err.code === 'ETIMEDOUT') {
    statusCode = 504;
    message = '请求超时，请稍后重试';
  }

  // API限流错误
  if (err.code === 'RATE_LIMIT_EXCEEDED') {
    statusCode = 429;
    message = '请求过于频繁，请稍后重试';
  }

  // ✅ 修复：生产环境返回通用错误消息，不泄露详细信息
  const errorResponse = {
    success: false,
    error: {
      message: isProduction ? '服务器错误，请稍后重试' : message,
      statusCode
    },
    timestamp: new Date().toISOString()
  };

  // 只在非生产环境返回堆栈和详细信息
  if (!isProduction) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err;
  }

  res.status(statusCode).json(errorResponse);
};

// 404处理
const notFound = (req, res, next) => {
  const error = new AppError(`路由不存在: ${req.originalUrl}`, 404);
  next(error);
};

// 输入验证中间件
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return next(new AppError(error.details[0].message, 400));
    }
    next();
  };
};

module.exports = {
  AppError,
  catchAsync,
  errorHandler,
  notFound,
  validateInput
};