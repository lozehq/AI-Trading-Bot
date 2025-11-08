/**
 * 统一API响应格式
 * 
 * 功能:
 * - 标准化成功响应
 * - 标准化错误响应
 * - 分页响应支持
 * - 时间戳自动添加
 */

class ApiResponse {
  /**
   * 成功响应
   * 
   * @param {*} data - 响应数据
   * @param {string} message - 成功消息
   * @param {object} meta - 额外的元数据
   * @returns {object} 标准化的成功响应
   */
  static success(data = null, message = 'Success', meta = {}) {
    return {
      success: true,
      message,
      data,
      ...meta,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 错误响应
   * 
   * @param {string} message - 错误消息
   * @param {number} statusCode - HTTP状态码
   * @param {*} details - 错误详情
   * @returns {object} 标准化的错误响应
   */
  static error(message, statusCode = 500, details = null) {
    const response = {
      success: false,
      error: {
        message,
        statusCode
      },
      timestamp: new Date().toISOString()
    };

    // 开发环境显示详细错误
    if (process.env.NODE_ENV !== 'production' && details) {
      response.error.details = details;
    }

    return response;
  }

  /**
   * 分页响应
   * 
   * @param {Array} data - 数据数组
   * @param {number} page - 当前页码
   * @param {number} pageSize - 每页条目数
   * @param {number} total - 总条目数
   * @param {object} meta - 额外的元数据
   * @returns {object} 标准化的分页响应
   */
  static paginated(data, page, pageSize, total, meta = {}) {
    return {
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: parseInt(total),
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
        hasPrev: page > 1
      },
      ...meta,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 创建响应（已弃用，使用success代替）
   * 
   * @deprecated 使用 ApiResponse.success() 代替
   */
  static created(data, message = 'Created successfully') {
    return this.success(data, message, { statusCode: 201 });
  }

  /**
   * 无内容响应
   * 
   * @param {string} message - 消息
   * @returns {object} 标准化的无内容响应
   */
  static noContent(message = 'No content') {
    return {
      success: true,
      message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 验证错误响应
   * 
   * @param {Array|object} errors - 验证错误列表
   * @returns {object} 标准化的验证错误响应
   */
  static validationError(errors) {
    return {
      success: false,
      error: {
        message: 'Validation failed',
        statusCode: 400,
        errors: Array.isArray(errors) ? errors : [errors]
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 未授权响应
   * 
   * @param {string} message - 错误消息
   * @returns {object} 标准化的未授权响应
   */
  static unauthorized(message = 'Unauthorized') {
    return this.error(message, 401);
  }

  /**
   * 禁止访问响应
   * 
   * @param {string} message - 错误消息
   * @returns {object} 标准化的禁止访问响应
   */
  static forbidden(message = 'Forbidden') {
    return this.error(message, 403);
  }

  /**
   * 未找到响应
   * 
   * @param {string} message - 错误消息
   * @returns {object} 标准化的未找到响应
   */
  static notFound(message = 'Resource not found') {
    return this.error(message, 404);
  }

  /**
   * 冲突响应
   * 
   * @param {string} message - 错误消息
   * @returns {object} 标准化的冲突响应
   */
  static conflict(message = 'Resource conflict') {
    return this.error(message, 409);
  }

  /**
   * 限流响应
   * 
   * @param {string} message - 错误消息
   * @param {number} retryAfter - 重试等待时间（秒）
   * @returns {object} 标准化的限流响应
   */
  static tooManyRequests(message = 'Too many requests', retryAfter = 60) {
    return {
      success: false,
      error: {
        message,
        statusCode: 429,
        retryAfter
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 服务器错误响应
   * 
   * @param {string} message - 错误消息
   * @param {Error} error - 错误对象
   * @returns {object} 标准化的服务器错误响应
   */
  static serverError(message = 'Internal server error', error = null) {
    const response = this.error(message, 500);

    // 开发环境显示错误堆栈
    if (process.env.NODE_ENV !== 'production' && error) {
      response.error.stack = error.stack;
    }

    return response;
  }

  /**
   * 服务不可用响应
   * 
   * @param {string} message - 错误消息
   * @returns {object} 标准化的服务不可用响应
   */
  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return this.error(message, 503);
  }

  /**
   * 网关超时响应
   * 
   * @param {string} message - 错误消息
   * @returns {object} 标准化的网关超时响应
   */
  static gatewayTimeout(message = 'Gateway timeout') {
    return this.error(message, 504);
  }
}

/**
 * Express中间件：包装响应方法
 * 
 * 使用方法:
 * app.use(responseWrapper);
 * 
 * 然后在路由中:
 * res.success({ data: 'hello' });
 * res.error('Something went wrong', 500);
 */
function responseWrapper(req, res, next) {
  // 成功响应
  res.success = function(data, message, meta) {
    return res.json(ApiResponse.success(data, message, meta));
  };

  // 错误响应
  res.error = function(message, statusCode, details) {
    return res.status(statusCode || 500).json(
      ApiResponse.error(message, statusCode, details)
    );
  };

  // 分页响应
  res.paginated = function(data, page, pageSize, total, meta) {
    return res.json(ApiResponse.paginated(data, page, pageSize, total, meta));
  };

  // 验证错误
  res.validationError = function(errors) {
    return res.status(400).json(ApiResponse.validationError(errors));
  };

  // 未授权
  res.unauthorized = function(message) {
    return res.status(401).json(ApiResponse.unauthorized(message));
  };

  // 未找到
  res.notFound = function(message) {
    return res.status(404).json(ApiResponse.notFound(message));
  };

  // 限流
  res.tooManyRequests = function(message, retryAfter) {
    return res.status(429).json(ApiResponse.tooManyRequests(message, retryAfter));
  };

  // 服务器错误
  res.serverError = function(message, error) {
    return res.status(500).json(ApiResponse.serverError(message, error));
  };

  next();
}

module.exports = {
  ApiResponse,
  responseWrapper
};

