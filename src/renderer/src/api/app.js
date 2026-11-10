// api/app.js
import apiClient from './client';
import { getDevicePlatformAsync, getDevicePlatform } from '../utils/platform';

// 检查应用更新
// platform: 'DeskTop-Mac-Intel' | 'DeskTop-Mac-ARM' | 'DeskTop-Win'
// versionCode: 当前版本的 versionCode
// device: 登录/注册同款设备标识，已登录时服务端写入 user_tokens.device
export const checkUpdate = async (platform, versionCode) => {
  let device = getDevicePlatform();
  try {
    device = await getDevicePlatformAsync();
  } catch (_) {
    // 异步识别失败时回退同步结果
  }

  return apiClient.get('/app/check-update', {
    params: {
      platform: platform,
      version_code: versionCode,
      device: device
    }
  });
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
