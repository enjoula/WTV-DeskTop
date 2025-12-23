// api/client.js
import axios from 'axios';

// Determine base URL based on environment
const getBaseURL = () => {
  // 检查是否在 Electron 环境中（通过检查 window.electronAPI 或 window.location.protocol）
  const isElectron = typeof window !== 'undefined' && (
    window.electronAPI || 
    window.location.protocol === 'file:' ||
    navigator.userAgent.includes('Electron')
  );
  
  // 在 Electron 环境中，总是使用生产 API
  if (isElectron) {
    console.log('检测到 Electron 环境，使用生产 API');
    return 'http://124.222.196.128:6660';
  }
  
  // 开发环境（浏览器中运行且 NODE_ENV 为 development），使用相对路径（会被 proxy 代理）
  if (process.env.NODE_ENV === 'development') {
    console.log('开发环境，使用代理 API');
    return '/api';
  }
  
  // 其他情况（如浏览器直接打开生产构建），使用生产 API
  console.log('使用生产 API');
  return 'http://124.222.196.128:6660';
};

// 创建axios实例
const baseURL = getBaseURL();
console.log('API Base URL:', baseURL);

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 10000,
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 从localStorage获取token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // 调试信息：记录请求详情
    console.log('API 请求:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`,
      hasToken: !!token
    });
    
    return config;
  },
  (error) => {
    console.error('API 请求错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    // 调试信息：记录响应详情
    console.log('API 响应:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  (error) => {
    // 调试信息：记录错误详情
    console.error('API 响应错误:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      data: error.response?.data
    });
    
    if (error.response?.status === 401) {
      // token 过期或无效，清除本地存储的 token
      localStorage.removeItem('token');

      // 提示用户登录状态失效，确认后跳转登录页面
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname || '';
        // 避免在登录页重复弹窗和跳转
        if (!currentPath.startsWith('/login')) {
          const shouldRedirect = window.confirm('未登录或者身份验证已过期，请重新登录。');
          if (shouldRedirect) {
            window.location.href = '/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;