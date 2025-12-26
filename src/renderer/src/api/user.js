// api/user.js
import apiClient from './client';
import { getDevicePlatformAsync, getDevicePlatform } from '../utils/platform';

// 用户注册
// 根据API文档，需要包含 device 参数
export const register = async (userData) => {
  // 如果没有提供device，自动检测平台
  let device = userData.device;
  
  if (!device) {
    try {
      // 尝试异步获取平台信息
      device = await getDevicePlatformAsync();
      console.log('注册 - 获取到的平台信息:', device);
    } catch (error) {
      // 如果异步获取失败，使用同步方法或默认值
      console.error('注册 - 异步获取平台信息失败:', error);
      device = getDevicePlatform();
      console.log('注册 - 使用同步方法获取平台信息:', device);
    }
  }
  
  const data = {
    ...userData,
    device: device || 'DeskTop-Win' // 最后的默认值
  };
  
  console.log('注册 - 发送的数据:', { ...data, password: '***' });
  
  return apiClient.post('/user/register', data);
};

// 用户登录
// 根据API文档，需要包含 device 参数
export const login = async (credentials) => {
  // 如果没有提供device，自动检测平台
  let device = credentials.device;
  
  if (!device) {
    try {
      // 尝试异步获取平台信息
      device = await getDevicePlatformAsync();
      console.log('登录 - 获取到的平台信息:', device);
    } catch (error) {
      // 如果异步获取失败，使用同步方法或默认值
      console.error('登录 - 异步获取平台信息失败:', error);
      device = getDevicePlatform();
      console.log('登录 - 使用同步方法获取平台信息:', device);
    }
  }
  
  const data = {
    ...credentials,
    device: device || 'DeskTop-Win' // 最后的默认值
  };
  
  console.log('登录 - 发送的数据:', { ...data, password: '***' });
  
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