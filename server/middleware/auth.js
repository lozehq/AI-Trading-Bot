/**
 * API认证中间件
 * 提供API密钥和JWT两种认证方式
 */

const jwt = require('jsonwebtoken');

/**
 * API密钥认证（简单但有效）
 * 使用方法：在请求头中添加 X-API-Key
 */
function apiKeyAuth(req, res, next) {
  // 跳过健康检查端点
  if (req.path === '/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: '缺少API密钥',
      hint: '请在请求头中添加 X-API-Key',
      timestamp: new Date().toISOString()
    });
  }
  
  // 检查API密钥是否有效
  const validApiKey = process.env.API_KEY;
  
  if (!validApiKey) {
    console.error('SECURITY ERROR: API_KEY not set in environment variables');
    return res.status(500).json({
      success: false,
      error: '服务器配置错误',
      timestamp: new Date().toISOString()
    });
  }
  
  if (apiKey !== validApiKey) {
    return res.status(401).json({
      success: false,
      error: 'API密钥无效',
      timestamp: new Date().toISOString()
    });
  }
  
  // 认证成功，继续处理请求
  next();
}

/**
 * JWT认证（更安全，支持过期时间）
 * 使用方法：在请求头中添加 Authorization: Bearer <token>
 */
function jwtAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: '缺少认证token',
      hint: '请在请求头中添加 Authorization: Bearer <token>',
      timestamp: new Date().toISOString()
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret || jwtSecret.length < 32) {
      console.error('SECURITY ERROR: JWT_SECRET not set or too short (minimum 32 characters)');
      return res.status(500).json({
        success: false,
        error: '服务器配置错误',
        timestamp: new Date().toISOString()
      });
    }
    
    const decoded = jwt.verify(token, jwtSecret);
    
    // 将用户信息附加到请求对象
    req.user = decoded;
    next();
  } catch (error) {
    let errorMessage = 'Token无效或已过期';
    
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token已过期，请重新登录';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Token格式无效';
    }
    
    return res.status(401).json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * 登录端点（生成JWT）
 */
function login(req, res) {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: '缺少用户名或密码'
    });
  }
  
  // 验证用户名密码（这里简化处理，实际应该查询数据库）
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;
  
  if (!adminUser || !adminPass) {
    console.error('SECURITY ERROR: ADMIN_USER or ADMIN_PASS not set in environment variables');
    return res.status(500).json({
      success: false,
      error: '服务器配置错误'
    });
  }
  
  // 警告：检查是否使用了不安全的默认密码
  if (adminPass === 'admin123' || adminPass === 'password' || adminPass === '123456') {
    console.error('SECURITY WARNING: Weak admin password detected!');
  }
  
  if (username === adminUser && password === adminPass) {
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret || jwtSecret.length < 32) {
      console.error('SECURITY ERROR: JWT_SECRET not set or too short');
      return res.status(500).json({
        success: false,
        error: '服务器配置错误'
      });
    }
    
    const expiresIn = '24h';
    
    const token = jwt.sign(
      { 
        username, 
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      },
      jwtSecret,
      { expiresIn }
    );
    
    res.json({
      success: true,
      token,
      expiresIn,
      user: {
        username,
        role: 'admin'
      },
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(401).json({
      success: false,
      error: '用户名或密码错误',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * 可选的认证中间件（允许未认证的请求通过，但会标记）
 */
function optionalAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;
  
  if (validApiKey && apiKey === validApiKey) {
    req.authenticated = true;
  } else {
    req.authenticated = false;
  }
  
  next();
}

module.exports = {
  apiKeyAuth,
  jwtAuth,
  login,
  optionalAuth
};

