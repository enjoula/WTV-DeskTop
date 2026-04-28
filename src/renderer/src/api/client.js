// api/client.js
import axios from 'axios';
import { getApiBaseURL } from '../config/apiConfig';

// 创建axios实例
const baseURL = getApiBaseURL();
console.log('API Base URL:', baseURL);

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 30000, // 增加超时时间到30秒，避免网络慢时过早失败
  headers: {
    'Content-Type': 'application/json',
  },
});

// 统一处理未授权逻辑（HTTP 401 或业务 code=401）
// message：来自接口响应的 message 字段
const handleUnauthorized = (message) => {
  if (typeof window === 'undefined') return;

  // 防抖：2秒内的重复触发忽略
  const now = Date.now();
  const HANDLE_COOLDOWN = 2000;
  if (window.__handling401 && (now - (window.__last401HandleTime || 0) < HANDLE_COOLDOWN)) {
    return;
  }
  window.__handling401 = true;
  window.__last401HandleTime = now;

  // 已在登录页则不重复处理
  const currentPath = window.location.pathname || window.location.hash || '';
  if (currentPath.includes('/login') || currentPath.includes('#/login')) {
    setTimeout(() => { window.__handling401 = false; }, HANDLE_COOLDOWN);
    return;
  }

  // 立即清除登录状态（Redux + localStorage），阻止后续鉴权请求
  window.dispatchEvent(new CustomEvent('auth:force-logout'));

  const isElectron = !!(window.electronAPI || window.location.protocol === 'file:' || navigator.userAgent.includes('Electron'));
  const promptMessage = message || '登录已过期，请重新登录。';

  const redirectToLogin = () => {
    // 记录当前路由，登录成功后可回跳
    try {
      const hash = window.location.hash || '';
      const hashRoute = hash.startsWith('#') ? hash.slice(1) : hash;
      if (hashRoute && !hashRoute.startsWith('/login')) {
        sessionStorage.setItem('postLoginRedirect', hashRoute);
      }
    } catch (err) {
      console.warn('保存登录回跳地址失败:', err);
    }

    if (isElectron) {
      window.location.hash = '#/login';
    } else {
      window.location.href = '/login';
    }
  };

  if (window.showLoginAlert) {
    window.showLoginAlert(promptMessage).then(redirectToLogin);
  } else {
    window.alert(promptMessage);
    redirectToLogin();
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
    const skipUnauthorizedHandling = !!response?.config?.skipUnauthorizedHandling;
    // 业务层返回 code=401 时提示登录（message 取自接口响应）
    if (response?.data?.code === 401) {
      if (!skipUnauthorizedHandling) {
        handleUnauthorized(response?.data?.message);
      }
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
      data: error.response?.data,
      code: error.code, // 网络错误代码（如 ECONNREFUSED, ENOTFOUND 等）
      errno: error.errno,
      syscall: error.syscall
    });
    
    // 处理网络错误（Windows 平台常见问题）
    if (!error.response) {
      // 没有响应，可能是网络连接问题
      const errorMessage = error.message || '网络错误';
      const isNetworkError = error.code === 'ECONNREFUSED' || 
                           error.code === 'ENOTFOUND' || 
                           error.code === 'ETIMEDOUT' ||
                           error.code === 'ERR_NETWORK' ||
                           error.message?.includes('Network Error') ||
                           error.message?.includes('网络错误');
      
      if (isNetworkError) {
        console.error('网络连接错误，可能的原因：');
        console.error('1. 服务器地址无法访问:', error.config?.baseURL);
        console.error('2. 防火墙或网络限制');
        console.error('3. 服务器未运行或端口被占用');
        console.error('错误详情:', {
          code: error.code,
          message: error.message,
          syscall: error.syscall,
          errno: error.errno
        });
        
        // 返回一个更友好的错误信息
        return Promise.reject({
          message: '网络连接失败，请检查网络设置或联系管理员',
          code: error.code || 'NETWORK_ERROR',
          originalError: error
        });
      }
    }
    
    const skipUnauthorizedHandling = !!error?.config?.skipUnauthorizedHandling;
    if (error.response?.status === 401 && !skipUnauthorizedHandling) {
      handleUnauthorized(error.response?.data?.message);
    }
    return Promise.reject(error);
  }
);

export default apiClient;