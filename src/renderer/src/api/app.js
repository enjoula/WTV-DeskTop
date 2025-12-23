// api/app.js
import apiClient from './client';

// 检查应用更新
export const checkUpdate = (platform, versionCode) => {
  return apiClient.get(`/app/check-update?platform=${platform}&version_code=${versionCode}`);
};

// 获取公告列表
export const getAnnouncements = () => {
  return apiClient.get('/app/announcements');
};

// 健康检查
export const ping = () => {
  return apiClient.get('/ping');
};

// IP信息查询
export const getIPInfo = () => {
  return apiClient.get('/ip-info');
};