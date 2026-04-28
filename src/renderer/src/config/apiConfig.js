// config/apiConfig.js
// API 配置文件 - 统一管理 API 基础地址

/**
 * API 服务器基础地址
 * 如需修改 API 服务器地址，只需修改此处的值
 */
const API_BASE_URL = 'http://124.222.196.128:6660';

/**
 * 获取 API 基础 URL
 * 根据运行环境自动选择正确的 API 地址
 * @returns {string} API 基础 URL
 */
const getApiBaseURL = () => {
  // 检查是否在 Electron 环境中
  const isElectron = typeof window !== 'undefined' && (
    window.electronAPI || 
    window.location.protocol === 'file:' ||
    navigator.userAgent.includes('Electron')
  );
  
  // 在 Electron 环境中，总是使用生产 API
  if (isElectron) {
    console.log('检测到 Electron 环境，使用生产 API');
    return API_BASE_URL;
  }
  
  // 开发环境（浏览器中运行且 NODE_ENV 为 development），使用相对路径（会被 proxy 代理）
  if (process.env.NODE_ENV === 'development') {
    console.log('开发环境，使用代理 API');
    return '/api';
  }
  
  // 其他情况（如浏览器直接打开生产构建），使用生产 API
  console.log('使用生产 API');
  return API_BASE_URL;
};

/**
 * 处理头像 URL，确保是完整 URL
 * @param {string} url - 头像 URL（可能是相对路径或完整 URL）
 * @returns {string|null} 处理后的完整 URL，如果输入为空则返回 null
 */
const processAvatarUrl = (url) => {
  if (!url) return null;
  
  // 如果已经是完整URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // 如果是相对路径，需要拼接API基础URL
  const baseURL = getApiBaseURL();
  
  // 如果URL以/开头，直接拼接
  if (url.startsWith('/')) {
    return `${baseURL}${url}`;
  }
  
  // 否则添加/后拼接
  return `${baseURL}/${url}`;
};

// 同时支持 ES6 模块和 CommonJS
// ES6 模块导出
export { API_BASE_URL, getApiBaseURL, processAvatarUrl };

// CommonJS 导出（用于 setupProxy.js）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_BASE_URL,
    getApiBaseURL,
    processAvatarUrl
  };
}
