/**
 * API客户端统一配置
 * 根据环境自动切换baseURL
 */
import axios from 'axios';

// 获取API基础地址
const getApiBaseUrl = () => {
  // 1. 优先使用环境变量配置
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // 2. 生产环境：使用当前域名（Nginx反向代理）
  if (import.meta.env.PROD) {
    return `${window.location.protocol}//${window.location.host}`;
  }

  // 3. 开发环境：通过Vite proxy
  return '';
};

// 创建axios实例
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 可以在这里添加token等
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('[API] Response error:', error.message);

    // 统一错误处理
    if (error.response) {
      // 服务器返回错误状态码
      console.error(`[API] Status: ${error.response.status}`);
    } else if (error.request) {
      // 请求发出但没有收到响应
      console.error('[API] No response received');
    } else {
      // 请求配置错误
      console.error('[API] Request setup error');
    }

    return Promise.reject(error);
  }
);

export default apiClient;

// 导出便捷方法
export const api = {
  get: (url, config) => apiClient.get(url, config),
  post: (url, data, config) => apiClient.post(url, data, config),
  put: (url, data, config) => apiClient.put(url, data, config),
  delete: (url, config) => apiClient.delete(url, config),
  patch: (url, data, config) => apiClient.patch(url, data, config)
};
