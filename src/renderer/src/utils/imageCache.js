// utils/imageCache.js
// 图片缓存工具 - 使用 Cache API 和内存缓存实现持久化缓存

const CACHE_NAME = 'wtv-image-cache-v1';
const CACHE_MAX_SIZE = 100 * 1024 * 1024; // 100MB 最大缓存大小
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7天缓存有效期

// 内存缓存（快速访问）
const memoryCache = new Map();

// 检查是否支持 Cache API
const supportsCacheAPI = typeof caches !== 'undefined';

/**
 * 从内存缓存获取图片
 */
function getFromMemoryCache(url) {
  if (!url) return null;
  return memoryCache.get(url);
}

/**
 * 保存到内存缓存
 */
function saveToMemoryCache(url, blob) {
  if (!url || !blob) return;
  // 限制内存缓存大小（最多保存50个）
  if (memoryCache.size >= 50) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(url, blob);
}

/**
 * 从 Cache API 获取图片
 * 🔧 修复：使用与保存时相同的 Request 对象创建方式
 */
async function getFromCacheAPI(url) {
  if (!supportsCacheAPI || !url) return null;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    
    // 🔧 方式1: 直接使用 URL 字符串匹配（在 Electron 中，保存时也使用 URL 字符串作为 key）
    let cachedResponse = await cache.match(url);
    
    // 🔧 方式2: 如果方式1失败，尝试使用 Request 对象匹配（兼容旧缓存）
    if (!cachedResponse) {
      try {
        const request = new Request(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit'
        });
        cachedResponse = await cache.match(request);
      } catch (e) {
        // 忽略错误
      }
    }
    
    // 🔧 方式3: 如果还是失败，遍历所有缓存项，手动匹配 URL（兼容性回退）
    if (!cachedResponse) {
      try {
        const keys = await cache.keys();
        
        // 🔧 标准化查找 URL（用于比较）
        const normalizedSearchUrl = url.replace(/\/$/, '').toLowerCase();
        
        for (const cachedRequest of keys) {
          const cachedUrl = cachedRequest.url;
          const normalizedCachedUrl = cachedUrl.replace(/\/$/, '').toLowerCase();
          
          // 🔧 精确匹配 URL（忽略大小写和尾部斜杠）
          if (normalizedCachedUrl === normalizedSearchUrl || cachedUrl === url) {
            // 直接使用这个 Request 对象获取响应
            cachedResponse = await cache.match(cachedRequest);
            if (cachedResponse) {
              console.log('✅ 通过遍历找到缓存:', url, '匹配的key:', cachedUrl);
              break;
            }
          }
        }
      } catch (e) {
        console.warn('遍历缓存项匹配失败:', e);
      }
    }
    
    if (cachedResponse) {
      let blob = await cachedResponse.blob();
      
      // 🔧 验证 blob 是否有效
      if (!blob || blob.size === 0) {
        console.warn('缓存中的图片数据无效:', url);
        // 删除无效缓存
        try {
          await cache.delete(url);
        } catch (e) {
          // 忽略删除失败
        }
        return null;
      }
      
      // 🔧 验证 blob 类型（确保是图片）
      const contentType = cachedResponse.headers.get('Content-Type') || blob.type;
      if (!contentType || !contentType.startsWith('image/')) {
        console.warn('缓存中的数据类型不是图片:', url, 'type:', contentType);
        // 尝试从 blob 数据推断类型（检查 magic number）
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer.slice(0, 4));
        
        // 检查常见的图片格式 magic number
        let detectedType = 'image/jpeg'; // 默认类型
        if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
          detectedType = 'image/png';
        } else if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
          detectedType = 'image/jpeg';
        } else if (uint8Array[0] === 0x47 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46) {
          detectedType = 'image/gif';
        } else if (uint8Array[0] === 0x52 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46 && uint8Array[3] === 0x46) {
          detectedType = 'image/webp';
        }
        
        // 重新创建 blob，使用检测到的类型
        blob = new Blob([arrayBuffer], { type: detectedType });
        console.log('✅ 检测到图片类型:', detectedType, 'URL:', url);
      } else if (blob.type !== contentType) {
        // 如果响应头有正确的类型，但 blob 类型不匹配，重新创建 blob
        const arrayBuffer = await blob.arrayBuffer();
        blob = new Blob([arrayBuffer], { type: contentType });
      }
      
      // 检查缓存是否过期（但不过于严格，避免误删）
      const cacheDate = cachedResponse.headers.get('cache-date');
      if (cacheDate) {
        const age = Date.now() - parseInt(cacheDate, 10);
        if (age > CACHE_MAX_AGE) {
          console.log('缓存已过期，删除:', url, 'age:', age);
          // 缓存过期，删除
          try {
            await cache.delete(url);
          } catch (e) {
            console.warn('删除过期缓存失败:', e);
          }
          memoryCache.delete(url);
          return null;
        }
      }
      
      // 同时保存到内存缓存（克隆 blob，避免引用问题）
      const blobClone = blob.slice(0, blob.size, blob.type);
      saveToMemoryCache(url, blobClone);
      console.log('✅ 从 Cache API 成功获取图片:', url, 'size:', blob.size, 'type:', blob.type);
      return blob;
    } else {
      console.log('❌ Cache API 中未找到图片:', url);
    }
  } catch (error) {
    console.error('❌ 从 Cache API 获取图片失败:', error, url);
  }
  
  return null;
}

/**
 * 创建标准化的 Request 对象（确保保存和查找时一致）
 */
function createCacheRequest(url) {
  try {
    // 🔧 统一创建 Request 对象的方式，确保保存和查找时完全一致
    return new Request(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'default'
    });
  } catch (e) {
    console.warn('创建 Request 对象失败，使用 URL 字符串:', e);
    return url;
  }
}

/**
 * 保存图片到 Cache API
 * 🔧 修复：在 Electron 中，直接使用 URL 字符串作为 key 更可靠
 */
async function saveToCacheAPI(url, blob) {
  if (!supportsCacheAPI || !url || !blob) return false;
  
  try {
    // 🔧 验证 blob 是否有效
    if (!blob || blob.size === 0) {
      console.warn('保存图片失败：Blob 无效:', url);
      return false;
    }
    
    const cache = await caches.open(CACHE_NAME);
    
    const response = new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
        'cache-date': Date.now().toString(),
        'Content-Length': blob.size.toString()
      }
    });
    
    // 🔧 使用 URL 字符串作为 key（在 Electron 中更可靠）
    await cache.put(url, response);
    
    // 同时保存到内存缓存
    saveToMemoryCache(url, blob);
    
    console.log('✅ 图片已保存到 Cache API:', url, 'size:', blob.size);
    return true;
  } catch (error) {
    console.error('❌ 保存图片到 Cache API 失败:', error, url);
    return false;
  }
}

/**
 * 清理过期缓存
 * 🔧 改进：延迟清理，避免在应用启动时删除有效缓存
 */
async function cleanupExpiredCache() {
  if (!supportsCacheAPI) return;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const now = Date.now();
    let deletedCount = 0;
    
    for (const request of keys) {
      try {
        const response = await cache.match(request);
        if (response) {
          const cacheDate = response.headers.get('cache-date');
          if (cacheDate) {
            const age = now - parseInt(cacheDate, 10);
            // 🔧 只有在明显过期时才删除（增加 1 天缓冲，避免误删）
            if (age > (CACHE_MAX_AGE + 24 * 60 * 60 * 1000)) {
              await cache.delete(request);
              memoryCache.delete(request.url);
              deletedCount++;
            }
          } else {
            // 🔧 如果没有缓存日期，不删除（可能是旧版本保存的缓存）
            console.log('缓存项没有日期信息，保留:', request.url);
          }
        }
      } catch (err) {
        // 单个缓存项处理失败，继续处理下一个
        console.warn('清理单个缓存项失败:', err);
      }
    }
    
    if (deletedCount > 0) {
      console.log('清理过期缓存完成，删除了', deletedCount, '个过期项');
    }
    
    // 检查缓存总大小
    await checkCacheSize();
  } catch (error) {
    console.error('清理过期缓存失败:', error);
  }
}

/**
 * 检查并限制缓存大小
 */
async function checkCacheSize() {
  if (!supportsCacheAPI) return;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let totalSize = 0;
    const items = [];
    
    // 计算每个缓存项的大小
    for (const request of keys) {
      try {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          const size = blob.size;
          totalSize += size;
          
          const cacheDate = response.headers.get('cache-date') || '0';
          items.push({
            url: request.url,
            size,
            date: parseInt(cacheDate, 10)
          });
        }
      } catch (err) {
        // 单个缓存项处理失败，继续处理下一个
        console.warn('检查单个缓存项大小失败:', err);
      }
    }
    
    // 如果超过最大大小，删除最旧的缓存
    if (totalSize > CACHE_MAX_SIZE) {
      // 按缓存日期排序，删除最旧的
      items.sort((a, b) => a.date - b.date);
      
      // 删除最旧的缓存，直到总大小小于限制
      for (const item of items) {
        if (totalSize <= CACHE_MAX_SIZE) break;
        try {
          await cache.delete(item.url);
          memoryCache.delete(item.url);
          totalSize -= item.size;
        } catch (err) {
          console.warn('删除缓存项失败:', err);
        }
      }
    }
  } catch (error) {
    console.error('检查缓存大小失败:', error);
  }
}

/**
 * 获取代理后的图片URL（开发环境使用代理，生产环境直接使用）
 */
function getProxiedImageUrl(url) {
  if (!url) return url;
  
  // 检查是否在开发环境（React Dev Server）
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isElectron = typeof window !== 'undefined' && (
    window.electronAPI || 
    window.location.protocol === 'file:' ||
    navigator.userAgent.includes('Electron')
  );
  
  // 如果是开发环境且不是 Electron，使用代理
  if (isDevelopment && !isElectron) {
    // 检查是否是 vip.dytt-img.com 的图片
    if (url.includes('vip.dytt-img.com')) {
      try {
        const urlObj = new URL(url);
        return `/proxy-image${urlObj.pathname}${urlObj.search}`;
      } catch (e) {
        console.warn('无法解析图片URL:', url);
        return url;
      }
    }
    // 检查是否是 img.ffzy888.com 的图片
    if (url.includes('img.ffzy888.com')) {
      try {
        const urlObj = new URL(url);
        return `/proxy-image-ffzy${urlObj.pathname}${urlObj.search}`;
      } catch (e) {
        console.warn('无法解析图片URL:', url);
        return url;
      }
    }
  }
  
  return url;
}

/**
 * 获取处理后的图片URL（开发环境使用代理，生产环境直接使用）
 */
export function getProcessedImageUrl(url) {
  return getProxiedImageUrl(url);
}

/**
 * 获取缓存的图片（优先从内存缓存，然后从 Cache API）
 * 🔧 改进：添加更详细的日志和错误处理
 */
export async function getCachedImage(url) {
  if (!url) {
    console.warn('getCachedImage: URL 为空');
    return null;
  }
  
  try {
    // 1. 先检查内存缓存（最快）
    const memoryCached = getFromMemoryCache(url);
    if (memoryCached) {
      // 🔧 验证 Blob 是否有效
      if (memoryCached instanceof Blob && memoryCached.size > 0) {
        console.log('✅ 从内存缓存获取图片:', url, 'size:', memoryCached.size, 'type:', memoryCached.type);
        try {
          // 🔧 克隆 Blob，确保类型正确
          const blobClone = memoryCached.type 
            ? memoryCached.slice(0, memoryCached.size, memoryCached.type)
            : memoryCached.slice(0, memoryCached.size, 'image/jpeg');
          const blobUrl = URL.createObjectURL(blobClone);
          console.log('✅ 创建 Blob URL 成功:', blobUrl);
          return blobUrl;
        } catch (e) {
          console.error('❌ 创建 Blob URL 失败:', e, url);
          // 清除无效的内存缓存
          memoryCache.delete(url);
        }
      } else {
        console.warn('内存缓存中的 Blob 无效:', url);
        // 清除无效的内存缓存
        memoryCache.delete(url);
      }
    }
    
    // 2. 检查 Cache API（应用重启后，内存缓存为空，主要依赖这里）
    console.log('🔍 从 Cache API 查找图片:', url);
    const cachedBlob = await getFromCacheAPI(url);
    if (cachedBlob) {
      // 🔧 验证 Blob 是否有效
      if (cachedBlob instanceof Blob && cachedBlob.size > 0) {
        console.log('✅ 从 Cache API 获取图片成功:', url, 'size:', cachedBlob.size, 'type:', cachedBlob.type);
        try {
          // 🔧 克隆 Blob，确保类型正确且不会被释放
          const blobClone = cachedBlob.type 
            ? cachedBlob.slice(0, cachedBlob.size, cachedBlob.type)
            : cachedBlob.slice(0, cachedBlob.size, 'image/jpeg');
          const blobUrl = URL.createObjectURL(blobClone);
          console.log('✅ 创建 Blob URL 成功:', blobUrl);
          return blobUrl;
        } catch (e) {
          console.error('❌ 创建 Blob URL 失败:', e, url);
          return null;
        }
      } else {
        console.warn('Cache API 返回的 Blob 无效:', url, 'blob:', cachedBlob);
        return null;
      }
    }
    
    console.log('❌ 缓存中未找到图片:', url);
    return null;
  } catch (error) {
    console.error('❌ 获取缓存图片失败:', error, url);
    return null;
  }
}

/**
 * 缓存图片
 * 🔧 重构：简化逻辑，统一使用原始 URL 作为缓存键
 */
export async function cacheImage(url) {
  if (!url) {
    console.warn('cacheImage: URL 为空');
    return false;
  }
  
  try {
    console.log('🔄 开始缓存图片:', url);
    
    // 🔧 先检查内存缓存（快速检查）
    const memoryCached = getFromMemoryCache(url);
    if (memoryCached && memoryCached instanceof Blob && memoryCached.size > 0) {
      console.log('✅ 图片已在内存缓存中，跳过下载:', url);
      // 确保也在 Cache API 中（持久化）
      const cacheExists = await getFromCacheAPI(url);
      if (!cacheExists) {
        console.log('📦 内存缓存存在但 Cache API 不存在，保存到 Cache API:', url);
        await saveToCacheAPI(url, memoryCached);
      }
      return true;
    }
    
    // 🔧 检查 Cache API（持久化缓存）
    const cached = await getCachedImage(url);
    if (cached) {
      console.log('✅ 图片已在 Cache API 中，跳过下载:', url);
      URL.revokeObjectURL(cached);
      return true; // 已经缓存
    }
    
    console.log('📥 图片未缓存，开始下载:', url);
    
    // 获取代理后的URL（如果需要）
    const proxiedUrl = getProxiedImageUrl(url);
    console.log('📡 使用代理 URL:', proxiedUrl);
    
    // 下载图片（添加超时机制）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    let response;
    try {
      // 🔧 确保 fetch 的 options 与保存时的 Request 对象属性一致
      response = await fetch(proxiedUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('❌ 下载图片超时:', url);
      } else {
        console.error('❌ 下载图片失败:', fetchError, url);
      }
      return false;
    }
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('❌ 下载图片失败，HTTP 状态码:', response.status, url);
      return false;
    }
    
    let blob = await response.blob();
    
    // 验证 blob 是否有效
    if (!blob || blob.size === 0) {
      console.error('❌ 下载的图片数据无效:', url);
      return false;
    }
    
    console.log('📦 下载完成，Blob 大小:', blob.size, '类型:', blob.type, 'URL:', url);
    
    // 🔧 确保 Blob 类型正确（从响应头获取）
    const contentType = response.headers.get('Content-Type') || blob.type;
    if (contentType && contentType.startsWith('image/') && blob.type !== contentType) {
      // 如果响应头有正确的类型，但 blob 类型不匹配，重新创建 blob
      const arrayBuffer = await blob.arrayBuffer();
      blob = new Blob([arrayBuffer], { type: contentType });
      console.log('✅ 修正 Blob 类型:', contentType, 'URL:', url);
    } else if (!blob.type || !blob.type.startsWith('image/')) {
      // 如果 blob 没有类型或类型不正确，尝试从数据推断
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer.slice(0, 4));
      
      // 检查常见的图片格式 magic number
      let detectedType = 'image/jpeg'; // 默认类型
      if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
        detectedType = 'image/png';
      } else if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
        detectedType = 'image/jpeg';
      } else if (uint8Array[0] === 0x47 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46) {
        detectedType = 'image/gif';
      } else if (uint8Array[0] === 0x52 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46 && uint8Array[3] === 0x46) {
        detectedType = 'image/webp';
      }
      
      blob = new Blob([arrayBuffer], { type: detectedType });
      console.log('✅ 检测到图片类型:', detectedType, 'URL:', url);
    }
    
    // 保存到缓存（使用原始 URL 作为 key）
    const saved = await saveToCacheAPI(url, blob);
    if (saved) {
      console.log('✅ 图片已成功缓存:', url, 'size:', blob.size);
      return true;
    } else {
      console.error('❌ 保存图片到缓存失败:', url);
      return false;
    }
  } catch (error) {
    console.error('❌ 缓存图片异常:', error, url);
    return false;
  }
}

/**
 * 预加载图片（在后台缓存）
 */
export function preloadImage(url) {
  if (!url) return;
  
  // 异步预加载，不阻塞主线程
  cacheImage(url).catch(error => {
    console.warn('预加载图片失败:', error, url);
  });
}

/**
 * 清除所有缓存
 */
export async function clearImageCache() {
  try {
    // 清除内存缓存
    memoryCache.clear();
    
    // 清除 Cache API 缓存
    if (supportsCacheAPI) {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      await Promise.all(keys.map(key => cache.delete(key)));
    }
    
    console.log('图片缓存已清除');
    return true;
  } catch (error) {
    console.error('清除图片缓存失败:', error);
    return false;
  }
}

/**
 * 获取缓存统计信息
 */
export async function getCacheStats() {
  try {
    const stats = {
      memoryCacheSize: memoryCache.size,
      cacheAPISize: 0,
      totalSize: 0
    };
    
    if (supportsCacheAPI) {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      stats.cacheAPISize = keys.length;
      
      for (const request of keys) {
        try {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            stats.totalSize += blob.size;
          }
        } catch (err) {
          // 单个缓存项处理失败，继续处理下一个
          console.warn('获取单个缓存项统计失败:', err);
        }
      }
    }
    
    return stats;
  } catch (error) {
    console.error('获取缓存统计失败:', error);
    return { memoryCacheSize: 0, cacheAPISize: 0, totalSize: 0 };
  }
}

// 初始化时清理过期缓存
if (supportsCacheAPI && typeof window !== 'undefined') {
  // 延迟执行，避免阻塞页面加载
  setTimeout(() => {
    cleanupExpiredCache().catch(err => {
      console.warn('初始化清理缓存失败:', err);
    });
  }, 2000);
}
