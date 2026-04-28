// utils/playerSettings.js
// 播放器设置本地存储工具

const STORAGE_KEY = 'wtv_player_settings';

// 默认设置
const DEFAULT_SETTINGS = {
  volume: 0.75, // 默认音量75%
  playbackRate: 1, // 默认播放速度1x
  muted: false, // 默认不静音
  videoFitMode: 'contain', // 默认显示模式（16:9）
  selectedQuality: '', // 默认画质（空表示自动）
  autoplay: true, // 默认自动播放
  autoNextEpisode: true, // 默认开启非电影自动连播下一集
  loop: false, // 默认不循环
  controls: true, // 默认显示控制条
  pip: false, // 默认不启用画中画
};

/**
 * 获取所有播放器设置
 */
export function getPlayerSettings() {
  try {
    const settingsStr = localStorage.getItem(STORAGE_KEY);
    if (!settingsStr) {
      // 如果没有保存的设置，返回默认设置并保存
      savePlayerSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    const settings = JSON.parse(settingsStr);
    // 合并默认设置，确保所有字段都存在
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error('获取播放器设置失败:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * 保存播放器设置
 */
export function savePlayerSettings(settings) {
  try {
    // 合并现有设置和新的设置
    const currentSettings = getPlayerSettings();
    const newSettings = { ...currentSettings, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    console.log('保存播放器设置:', newSettings);
    return true;
  } catch (error) {
    console.error('保存播放器设置失败:', error);
    return false;
  }
}

/**
 * 更新单个设置项
 */
export function updatePlayerSetting(key, value) {
  try {
    const settings = getPlayerSettings();
    settings[key] = value;
    return savePlayerSettings(settings);
  } catch (error) {
    console.error('更新播放器设置失败:', error);
    return false;
  }
}

/**
 * 获取单个设置项
 */
export function getPlayerSetting(key) {
  const settings = getPlayerSettings();
  return settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
}

/**
 * 重置所有设置为默认值
 */
export function resetPlayerSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    console.log('重置播放器设置为默认值');
    return true;
  } catch (error) {
    console.error('重置播放器设置失败:', error);
    return false;
  }
}

