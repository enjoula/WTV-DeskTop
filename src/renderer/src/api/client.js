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

// 统一处理未授权逻辑（HTTP 401 或业务 code=401）
const handleUnauthorized = () => {
  if (typeof window === 'undefined') return;

  // 防抖处理，避免多次弹窗
  if (window.__handling401) return;
  window.__handling401 = true;

  const currentPath = window.location.pathname || '';
  const token = localStorage.getItem('token');
  const isLoggedIn = !!token;

  // 清除本地 token（无论是否登录，统一清理）
  localStorage.removeItem('token');

  // 登录页不重复跳转
  if (currentPath.startsWith('/login')) {
    window.__handling401 = false;
    return;
  }

  if (isLoggedIn) {
    // 已登录：提示账号在其他设备登录且超过3台，需要重新登录
    window.alert('您的账号已在其他设备登录且超过3台，请重新登录。');
    window.location.href = '/login';
  } else {
    // 未登录：提示登录并跳转
    const shouldRedirect = window.confirm('您还未登录，请先登录。');
    if (shouldRedirect) {
      window.location.href = '/login';
    } else {
      window.__handling401 = false;
    }
  }
};

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
    // 业务层返回 code=401 时也提示登录
    if (response?.data?.code === 401) {
      handleUnauthorized();
      return Promise.reject(response?.data || { code: 401, message: '未登录或已过期' });
    }

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
      handleUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default apiClient;