// utils/platform.js
// 登录/注册 device：约定「平台-设备型号」
// 例：DeskTop-windows11、DeskTop-MacBook-Arm、DeskTop-MacMini-Arm、DeskTop-Ubuntu22

// 设备标识缓存（应用启动时异步获取）
let deviceCache = null;
let devicePromise = null;

const DEFAULT_DEVICE = 'DeskTop-windows10';

/**
 * 从 userAgent / platform 文本推断 Mac 机型家族
 */
function resolveMacModelFamily(text) {
  const value = String(text || '');
  if (/macbook/i.test(value)) return 'MacBook';
  if (/mac\s*mini|macmini/i.test(value)) return 'MacMini';
  if (/mac\s*studio|macstudio/i.test(value)) return 'MacStudio';
  if (/mac\s*pro|macpro/i.test(value)) return 'MacPro';
  if (/imac/i.test(value)) return 'iMac';
  return null;
}

/**
 * 浏览器环境下的后备 device 标识（不够精确）
 */
function detectDeviceFromNavigator() {
  if (typeof navigator === 'undefined') {
    return DEFAULT_DEVICE;
  }

  const userAgent = navigator.userAgent || '';
  const navPlatform = navigator.platform || '';
  const uaDataPlatform = navigator.userAgentData?.platform || '';
  const combined = `${userAgent} ${navPlatform} ${uaDataPlatform}`;

  // macOS
  if (/Mac|iPhone|iPod|iPad/i.test(combined) || navPlatform.includes('Mac')) {
    const family = resolveMacModelFamily(combined) || 'Mac';
    const isArm =
      /arm|aarch64|apple silicon/i.test(combined) ||
      (typeof navigator !== 'undefined' && navigator.userAgentData?.architecture === 'arm');
    return `DeskTop-${family}-${isArm ? 'Arm' : 'Intel'}`;
  }

  // Windows：NT 10.0 无法可靠区分 10/11，优先 11 关键字
  if (/Win/i.test(combined) || navPlatform.includes('Win')) {
    if (/Windows NT 6\.1|Windows 7/i.test(userAgent)) return 'DeskTop-windows7';
    if (/Windows NT 6\.[23]|Windows 8/i.test(userAgent)) return 'DeskTop-windows8';
    if (/Windows 11/i.test(userAgent)) return 'DeskTop-windows11';
    return 'DeskTop-windows10';
  }

  // Linux
  if (/Linux/i.test(combined) || navPlatform.includes('Linux')) {
    if (/Ubuntu/i.test(userAgent)) return 'DeskTop-Ubuntu';
    return 'DeskTop-Linux';
  }

  return DEFAULT_DEVICE;
}

/**
 * 异步获取登录/注册用的 device 标识
 * @returns {Promise<string>} 如 DeskTop-MacBook-Arm、DeskTop-windows11
 */
export async function getDevicePlatformAsync() {
  if (deviceCache) {
    return deviceCache;
  }

  if (devicePromise) {
    return devicePromise;
  }

  devicePromise = (async () => {
    try {
      // 优先主进程精确识别
      if (typeof window !== 'undefined' && window.electronAPI) {
        if (typeof window.electronAPI.getDevice === 'function') {
          try {
            const device = await window.electronAPI.getDevice();
            if (device && typeof device === 'string') {
              deviceCache = device;
              console.log('设备标识检测成功 (getDevice):', device);
              return device;
            }
          } catch (apiError) {
            console.error('调用 electronAPI.getDevice 失败:', apiError);
          }
        }

        // 兼容旧版：仅有 getPlatform 时做粗映射（更新检查用的 DeskTop-Mac-ARM 等）
        if (typeof window.electronAPI.getPlatform === 'function') {
          try {
            const raw = await window.electronAPI.getPlatform();
            if (raw && typeof raw === 'string') {
              const lower = raw.toLowerCase();
              let device = DEFAULT_DEVICE;
              if (lower.includes('mac')) {
                const arch = lower.includes('arm') || lower.includes('apple') ? 'Arm' : 'Intel';
                device = `DeskTop-Mac-${arch}`;
              } else if (lower.includes('win')) {
                device = 'DeskTop-windows10';
              } else if (lower.includes('linux')) {
                device = 'DeskTop-Linux';
              }
              deviceCache = device;
              console.log('设备标识兼容映射 (getPlatform):', { raw, device });
              return device;
            }
          } catch (apiError) {
            console.error('调用 electronAPI.getPlatform 失败:', apiError);
          }
        }
      }

      deviceCache = detectDeviceFromNavigator();
      console.log('设备标识后备检测 (navigator):', deviceCache);
      return deviceCache;
    } catch (error) {
      console.error('获取设备标识异常:', error);
    }

    deviceCache = DEFAULT_DEVICE;
    console.log('使用默认设备标识:', deviceCache);
    return deviceCache;
  })();

  return devicePromise;
}

/**
 * 同步获取 device 标识（优先缓存；首次可能走 navigator 粗略值）
 * @returns {string}
 */
export function getDevicePlatform() {
  if (deviceCache) {
    return deviceCache;
  }
  return detectDeviceFromNavigator();
}

/**
 * 检测是否为 Windows 7
 * 说明：Win7 的 userAgent 通常包含 "Windows NT 6.1"
 */
export function isWindows7() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const userAgent = navigator.userAgent || '';
  return /Windows NT 6\.1/i.test(userAgent) || /Windows 7/i.test(userAgent);
}
