// utils/platform.js
// 平台检测工具函数

// 平台信息缓存（在应用启动时异步获取并缓存）
let platformCache = null;
let platformPromise = null;

/**
 * 异步获取当前平台的device标识
 * @returns {Promise<string>} 平台标识：PC-Mac-Intel、PC-Mac-ARM、PC-Windows、PC-Linux
 */
export async function getDevicePlatformAsync() {
  // 如果已缓存，直接返回
  if (platformCache) {
    return platformCache;
  }
  
  // 如果正在获取中，返回同一个 Promise
  if (platformPromise) {
    return platformPromise;
  }
  
  // 开始获取平台信息
  platformPromise = (async () => {
    try {
      // 优先使用 electronAPI（最准确）
      if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.getPlatform === 'function') {
        try {
          const raw = await window.electronAPI.getPlatform();
          if (raw && typeof raw === 'string') {
            // 统一规范为固定的四种格式（PC- 前缀）
            const lower = raw.toLowerCase();
            let platform = 'PC-Windows';
            if (lower.includes('mac')) {
              if (lower.includes('arm') || lower.includes('apple')) {
                platform = 'PC-Mac-ARM';
              } else {
                platform = 'PC-Mac-Intel';
              }
            } else if (lower.includes('win')) {
              platform = 'PC-Windows';
            } else if (lower.includes('linux')) {
              platform = 'PC-Linux';
            }

            platformCache = platform;
            console.log('平台检测成功 (electronAPI):', { raw, platform });
            return platform;
          } else {
            console.warn('electronAPI.getPlatform 返回了无效值:', raw);
          }
        } catch (apiError) {
          console.error('调用 electronAPI.getPlatform 失败:', apiError);
          // 继续使用后备方案
        }
      } else {
        console.log('electronAPI 不可用，使用后备方案');
      }
      
      // 后备方案：使用 navigator 检测（不够精确，无法区分 ARM/Intel）
      if (typeof navigator !== 'undefined') {
        const userAgent = navigator.userAgent || '';
        const navPlatform = navigator.platform || '';
        
        console.log('使用 navigator 检测平台:', { userAgent, navPlatform });
        
        // 检测 macOS
        if (/Mac|iPhone|iPod|iPad/i.test(userAgent) || navPlatform.includes('Mac')) {
          // 无法区分 ARM 和 Intel，默认返回 Intel
          platformCache = 'PC-Mac-Intel';
          console.log('检测到 macOS (navigator):', platformCache);
          return platformCache;
        }
        
        // 检测 Windows
        if (/Win/i.test(userAgent) || navPlatform.includes('Win')) {
          platformCache = 'PC-Windows';
          console.log('检测到 Windows (navigator):', platformCache);
          return platformCache;
        }

        // 检测 Linux
        if (/Linux/i.test(userAgent) || navPlatform.includes('Linux')) {
          platformCache = 'PC-Linux';
          console.log('检测到 Linux (navigator):', platformCache);
          return platformCache;
        }
      }
    } catch (error) {
      console.error('获取平台信息时发生异常:', error);
    }
    
    // 默认值
    platformCache = 'PC-Windows';
    console.log('使用默认平台值:', platformCache);
    return platformCache;
  })();
  
  return platformPromise;
}

/**
 * 同步获取当前平台的device标识（使用缓存或默认值）
 * 注意：首次调用时可能返回默认值，建议使用异步版本
 * @returns {string} 平台标识：PC-Mac-Intel、PC-Mac-ARM、PC-Windows、PC-Linux
 */
export function getDevicePlatform() {
  // 如果已缓存，直接返回
  if (platformCache) {
    return platformCache;
  }
  
  // 尝试使用 navigator 进行同步检测（作为后备）
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent || '';
    const navPlatform = navigator.platform || '';
    
    // 检测 macOS
    if (/Mac|iPhone|iPod|iPad/i.test(userAgent) || navPlatform.includes('Mac')) {
      return 'PC-Mac-Intel';
    }
    
    // 检测 Windows
    if (/Win/i.test(userAgent) || navPlatform.includes('Win')) {
      return 'PC-Windows';
    }

    // 检测 Linux
    if (/Linux/i.test(userAgent) || navPlatform.includes('Linux')) {
      return 'PC-Linux';
    }
  }
  
  // 默认值
  return 'PC-Windows';
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

