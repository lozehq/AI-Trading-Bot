/**
 * 网络请求优化器
 * 处理socket disconnected错误、超时和重试机制
 */

const axios = require('axios');
const { RATE_LIMIT } = require('../config/constants');

class NetworkOptimizer {
  constructor() {
    this.axiosInstance = null;
    this.requestQueue = new Map(); // 请求队列，用于控制并发
    this.concurrencyLimit = 10; // 最大并发请求数
    this.activeRequests = 0;
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      retryMultiplier: 2,
      timeout: 10000 // 默认10秒超时
    };
    this.rateLimitState = new Map(); // host -> { history:[], nextAllowed:0, backoffUntil:0 }
    this.rateLimitConfig = RATE_LIMIT || {};
    this.hostRules = (this.rateLimitConfig && this.rateLimitConfig.HOST_RULES) || {};

    this.init();
  }

  /**
   * 初始化axios实例
   */
  init() {
    this.axiosInstance = axios.create({
      timeout: this.retryConfig.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-Trading-Bot/1.0)',
        'Connection': 'keep-alive'
      }
    });

    // 请求拦截器
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.activeRequests++;
        config.requestStartTime = Date.now();

        // 为不同域名设置不同的请求头
        if (config.url.includes('binance')) {
          config.headers['X-MBX-APIKEY'] = process.env.BINANCE_API_KEY || '';
        } else if (config.url.includes('okx')) {
          config.headers['OK-ACCESS-KEY'] = process.env.OKX_API_KEY || '';
          config.headers['OK-ACCESS-SIGN'] = '';
          config.headers['OK-ACCESS-TIMESTAMP'] = Date.now().toString();
          config.headers['OK-ACCESS-PASSPHRASE'] = process.env.OKX_API_PASSPHRASE || '';
        }

        return config;
      },
      (error) => {
        this.activeRequests--;
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.activeRequests--;
        const duration = Date.now() - response.config.requestStartTime;

        if (duration > 5000) {
          console.warn(`⚠️ [网络] 慢请求检测: ${response.config.url} (${duration}ms)`);
        }

        return response;
      },
      (error) => {
        this.activeRequests--;
        return this.handleRequestError(error);
      }
    );
  }

  /**
   * 处理请求错误
   */
  async handleRequestError(error) {
    const originalRequest = error.config;

    // 如果没有配置或已经重试过，直接返回错误
    if (!originalRequest || originalRequest._retryCount >= this.retryConfig.maxRetries) {
      return Promise.reject(error);
    }

    // 设置重试次数
    originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;

    // 处理不同类型的错误
    let retryDelay = this.retryConfig.retryDelay;

    if (error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.message?.includes('socket disconnected')) {

      // 网络连接错误，使用指数退避
      retryDelay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.retryMultiplier, originalRequest._retryCount - 1);
      console.log(`⚠️ [网络] 连接错误，${originalRequest._retryCount}/${this.retryConfig.maxRetries}次重试，等待${retryDelay}ms: ${error.message}`);

    } else if (error.response?.status === 429) {
      // 频率限制，增加等待时间
      retryDelay = 5000 * originalRequest._retryCount; // 5秒、10秒、15秒
      console.log(`⚠️ [网络] 频率限制(429)，${originalRequest._retryCount}/${this.retryConfig.maxRetries}次重试，等待${retryDelay}ms`);
      this.registerBackoffForUrl(originalRequest?.url, originalRequest?.baseURL, retryDelay);

    } else if (error.response?.status >= 500) {
      // 服务器错误，使用标准重试延迟
      retryDelay = this.retryConfig.retryDelay * originalRequest._retryCount;
      console.log(`⚠️ [网络] 服务器错误(${error.response.status})，${originalRequest._retryCount}/${this.retryConfig.maxRetries}次重试`);
    }

    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, retryDelay));

    // 清除可能的错误数据
    delete originalRequest.data;
    delete originalRequest.adapter;

    await this.applyRateLimitForUrl(originalRequest?.url, originalRequest?.baseURL);
    await this.waitForSlot();

    return this.axiosInstance(originalRequest);
  }

  /**
   * 带并发的get请求
   */
  async get(url, config = {}) {
    await this.applyRateLimitForUrl(url, config.baseURL);
    // 等待直到有可用的并发槽位
    await this.waitForSlot();

    return this.axiosInstance.get(url, {
      ...config,
      timeout: config.timeout || this.retryConfig.timeout
    });
  }

  /**
   * 带并发的post请求
   */
  async post(url, data = {}, config = {}) {
    await this.applyRateLimitForUrl(url, config.baseURL);
    await this.waitForSlot();

    return this.axiosInstance.post(url, data, {
      ...config,
      timeout: config.timeout || this.retryConfig.timeout
    });
  }

  /**
   * 等待可用的请求槽位
   */
  async waitForSlot() {
    while (this.activeRequests >= this.concurrencyLimit) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 批量请求处理（分片执行）
   */
  async batchRequests(requests, options = {}) {
    const { batchSize = 5, delay = 100 } = options;
    const results = [];

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);

      // 并行执行当前批次
      const batchPromises = batch.map(request => {
        if (request.method === 'GET') {
          return this.get(request.url, request.config);
        } else if (request.method === 'POST') {
          return this.post(request.url, request.data, request.config);
        }
        return Promise.reject(new Error('Unsupported method'));
      });

      // 等待当前批次完成
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // 批次间延迟
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  /**
   * 获取网络统计信息
   */
  getStats() {
    return {
      activeRequests: this.activeRequests,
      concurrencyLimit: this.concurrencyLimit,
      axiosInstance: !!this.axiosInstance
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config) {
    if (config.concurrencyLimit) {
      this.concurrencyLimit = config.concurrencyLimit;
    }
    if (config.timeout) {
      this.retryConfig.timeout = config.timeout;
    }
    if (config.maxRetries) {
      this.retryConfig.maxRetries = config.maxRetries;
    }
    if (config.rateLimit && typeof config.rateLimit === 'object') {
      const { minInterval, maxRequestsPerMinute, hostRules } = config.rateLimit;
      if (typeof minInterval === 'number') {
        this.rateLimitConfig.MIN_INTERVAL = minInterval;
      }
      if (typeof maxRequestsPerMinute === 'number') {
        this.rateLimitConfig.MAX_REQUESTS_PER_MINUTE = maxRequestsPerMinute;
      }
      if (hostRules && typeof hostRules === 'object') {
        this.hostRules = {
          ...this.hostRules,
          ...hostRules
        };
      }
    }
  }

  async applyRateLimitForUrl(url, baseURL) {
    const host = extractHost(url, baseURL);
    if (!host) return;

    const defaultMinInterval = this.rateLimitConfig.MIN_INTERVAL || 0;
    const defaultMaxPerMinute = this.rateLimitConfig.MAX_REQUESTS_PER_MINUTE || 0;
    const rule = this.hostRules[host] || {};
    const minInterval = rule.minInterval ?? defaultMinInterval;
    const maxPerMinute = rule.maxRequestsPerMinute ?? defaultMaxPerMinute;

    if (!minInterval && !maxPerMinute) {
      return;
    }

    const state = this.rateLimitState.get(host) || { history: [], nextAllowed: 0, backoffUntil: 0 };

    while (true) {
      const now = Date.now();

      if (state.history.length > 0) {
        state.history = state.history.filter(ts => now - ts < 60000);
      }

      if (state.backoffUntil && now < state.backoffUntil) {
        await sleep(state.backoffUntil - now);
        continue;
      }

      if (minInterval && state.nextAllowed && now < state.nextAllowed) {
        await sleep(state.nextAllowed - now);
        continue;
      }

      if (maxPerMinute && maxPerMinute > 0 && state.history.length >= maxPerMinute) {
        const waitMs = 60000 - (now - state.history[0]);
        if (waitMs > 0) {
          await sleep(waitMs);
          continue;
        }
      }

      state.history.push(now);
      state.nextAllowed = minInterval ? now + minInterval : 0;
      this.rateLimitState.set(host, state);
      break;
    }
  }

  registerBackoffForUrl(url, baseURL, delay) {
    if (!delay || delay <= 0) return;
    const host = extractHost(url, baseURL);
    if (!host) return;
    const state = this.rateLimitState.get(host) || { history: [], nextAllowed: 0, backoffUntil: 0 };
    const until = Date.now() + delay;
    state.backoffUntil = Math.max(state.backoffUntil || 0, until);
    this.rateLimitState.set(host, state);
  }

  /**
   * 验证网络连接
   */
  async testConnection(url = 'https://api.binance.com/api/v3/ping') {
    try {
      const response = await this.get(url, { timeout: 5000 });
      return { success: true, status: response.status };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }
}

module.exports = new NetworkOptimizer();

function extractHost(url, baseURL) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch (err) {
    if (baseURL) {
      try {
        return new URL(url, baseURL).host;
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

function sleep(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}