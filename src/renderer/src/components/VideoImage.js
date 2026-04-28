// components/VideoImage.js
import React, { useState, useEffect, useRef } from 'react';
// 🔧 视频封面图片不缓存，移除 cacheImage 和 getCachedImage 导入

// 简单的SVG占位图（base64编码）
const PLACEHOLDER_SVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPuaXoOazleWKoOi9veWbvueJhzwvdGV4dD48L3N2Zz4=';

const VideoImage = ({ src, alt, className = '' }) => {
  // 验证URL是否有效
  const isValidUrl = (url) => {
    if (!url || url.trim() === '') return false;
    try {
      // 检查是否是有效的URL格式
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
        return true;
      }
      // 相对路径也认为是有效的
      if (url.startsWith('/')) {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  // 初始化状态
  const [imgSrc, setImgSrc] = useState(() => {
    if (src && isValidUrl(src)) {
      return src;
    }
    return PLACEHOLDER_SVG;
  });
  const [isLoading, setIsLoading] = useState(() => {
    return src && isValidUrl(src);
  });
  const [hasError, setHasError] = useState(() => {
    return !src || !isValidUrl(src);
  });
  const [retryCount, setRetryCount] = useState(0);
  
  const timeoutRef = useRef(null); // 超时定时器引用
  const lastSrcRef = useRef(null); // 记录上次的 src

  // 处理图片加载错误
  const handleError = async (e) => {
    // 清除超时定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    console.warn('❌ 图片加载失败:', imgSrc, '重试次数:', retryCount, '原始URL:', src);
    
    // 如果当前已经是占位图，不再处理
    if (imgSrc === PLACEHOLDER_SVG) {
      setIsLoading(false);
      setHasError(true);
      return;
    }
    
    // 🔧 视频封面图片不缓存，如果加载失败，直接重试原始 URL
    // 如果还没重试过，且原始URL有效，尝试重新加载原始 URL
    if (retryCount < 1 && isValidUrl(src)) {
      setRetryCount(prev => prev + 1);
      
      // 延迟后重试
      setTimeout(() => {
        console.log('重试加载图片:', src);
        setImgSrc(src);
        setIsLoading(true);
        setHasError(false);
        
        // 设置超时
        timeoutRef.current = setTimeout(() => {
          console.warn('图片重试加载超时:', src);
          // 🔧 视频封面图片不缓存，超时后使用占位图
          setImgSrc(PLACEHOLDER_SVG);
          setHasError(true);
          setIsLoading(false);
          timeoutRef.current = null;
        }, 30000); // 30秒超时
      }, 500);
      return;
    }
    
    // 如果重试失败或URL无效，使用占位图
    setImgSrc(PLACEHOLDER_SVG);
    setHasError(true);
    setIsLoading(false);
  };

  // 处理图片加载成功
  const handleLoad = async () => {
    // 清除超时定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    setIsLoading(false);
    setHasError(false);
    setRetryCount(0);
    
    // 🔧 视频封面图片不缓存，每次启动都重新下载
    // 不再调用 cacheImage，图片直接从原始 URL 加载
  };

  // 当 src 变化时，重置状态并尝试加载
  useEffect(() => {
    lastSrcRef.current = src;

    if (src && isValidUrl(src)) {
      // 🔧 视频封面图片不缓存，直接使用原始 URL
      setImgSrc(src);
      setIsLoading(true);
      setHasError(false);
      setRetryCount(0);
    } else {
      // URL 无效，使用占位图
      setImgSrc(PLACEHOLDER_SVG);
      setIsLoading(false);
      setHasError(true);
    }

    // 清理函数
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [src]);

  const finalSrc = isValidUrl(imgSrc) ? imgSrc : PLACEHOLDER_SVG;

  return (
    <div className={`video-image-wrapper ${className}`} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: (isLoading || hasError) ? '#f0f0f0' : 'transparent' }}>
      {isLoading && !hasError && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            fontSize: '12px',
            zIndex: 1
          }}
        >
          加载中...
        </div>
      )}
      <img
        key={imgSrc} // 添加 key 确保 src 变化时重新渲染
        src={finalSrc}
        alt={alt || '视频封面'}
        className={className}
        onError={handleError}
        onLoad={handleLoad}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          display: 'block',
          backgroundColor: (isLoading || hasError) ? '#f0f0f0' : 'transparent',
          position: 'relative',
          zIndex: 0,
          imageRendering: 'auto',
          WebkitImageRendering: '-webkit-optimize-contrast',
          msInterpolationMode: 'bicubic',
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          willChange: 'transform',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden'
        }}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default VideoImage;
