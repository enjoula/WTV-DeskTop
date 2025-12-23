// api/user.js
import apiClient from './client';

// 用户注册
// 根据API文档，需要包含 device 参数
export const register = (userData) => {
  // 如果没有提供device，自动生成（Electron应用）
  const data = {
    ...userData,
    device: userData.device || `Electron-${process.platform}`
  };
  return apiClient.post('/user/register', data);
};

// 用户登录
// 根据API文档，需要包含 device 参数
export const login = (credentials) => {
  // 如果没有提供device，自动生成（Electron应用）
  const data = {
    ...credentials,
    device: credentials.device || `Electron-${process.platform}`
  };
  return apiClient.post('/user/login', data);
};

// 用户登出
export const logout = () => {
  return apiClient.post('/user/logout');
};

// 获取当前用户信息
export const getCurrentUser = () => {
  return apiClient.get('/user/me');
};

// 更新用户信息
export const updateProfile = (profileData) => {
  return apiClient.put('/user/profile', profileData);
};

// 更新用户头像
export const updateAvatar = () => {
  return apiClient.put('/user/avatar');
};

// 获取用户收藏列表
export const getFavorites = (params) => {
  return apiClient.get('/user/favorites', { params });
};

// 添加/取消收藏
// 根据API文档，支持查询参数或请求体，使用 video_id
export const toggleFavorite = (videoId) => {
  // 使用查询参数方式（更符合RESTful风格）
  return apiClient.post(`/user/favorites?video_id=${videoId}`);
};