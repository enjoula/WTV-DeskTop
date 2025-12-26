// components/VideoImage.js
import React, { useState, useEffect, useRef } from 'react';

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

  // 初始化状态：如果src有效则使用src，否则使用占位图
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

  const handleError = (e) => {
    // 清除超时定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    console.warn('图片加载失败:', imgSrc, '重试次数:', retryCount);
    
    // 如果当前已经是占位图，不再处理
    if (imgSrc === PLACEHOLDER_SVG) {
      setIsLoading(false);
      setHasError(true);
      return;
    }
    
    // 如果还没重试过，且原始URL有效，尝试重新加载
    if (retryCount < 1 && isValidUrl(src) && (imgSrc === src || imgSrc.startsWith(src))) {
      setRetryCount(prev => prev + 1);
      // 延迟后重试，可能是网络问题
      setTimeout(() => {
        // 清除之前的超时定时器
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        // 尝试移除 crossOrigin 属性重试
        const retrySrc = src + (src.includes('?') ? '&' : '?') + '_retry=' + Date.now();
        setImgSrc(retrySrc);
        setIsLoading(true);
        setHasError(false);
        
        // 重试时也设置30秒超时
        timeoutRef.current = setTimeout(() => {
          console.warn('图片重试加载超时（30秒）:', retrySrc);
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

  const handleLoad = () => {
    // 清除超时定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    setIsLoading(false);
    setHasError(false);
    setRetryCount(0);
  };

  // 如果src变化，重置状态
  useEffect(() => {
    // 清除之前的超时定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    if (src && isValidUrl(src)) {
      // 当src变化时，总是更新（即使当前是占位图）
      if (imgSrc !== src && !imgSrc.startsWith(src)) {
        setImgSrc(src);
        setIsLoading(true);
        setHasError(false);
        setRetryCount(0);
        
        // 设置30秒超时
        timeoutRef.current = setTimeout(() => {
          console.warn('图片加载超时（30秒）:', src);
          setImgSrc((currentSrc) => {
            // 只有在当前不是占位图且是原始src时才切换
            if (currentSrc !== PLACEHOLDER_SVG && (currentSrc === src || currentSrc.startsWith(src))) {
              return PLACEHOLDER_SVG;
            }
            return currentSrc;
          });
          setHasError(true);
          setIsLoading(false);
          timeoutRef.current = null;
        }, 30000); // 30秒超时
      }
    } else {
      // 如果src无效或为空，使用占位图
      if (imgSrc !== PLACEHOLDER_SVG) {
        setImgSrc(PLACEHOLDER_SVG);
        setIsLoading(false);
        setHasError(true);
        setRetryCount(0);
      }
    }
    
    // 组件卸载时清除定时器
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const finalSrc = isValidUrl(imgSrc) ? imgSrc : PLACEHOLDER_SVG;

  // 调试日志
  useEffect(() => {
    if (src) {
      console.log('VideoImage - src:', src, 'imgSrc:', imgSrc, 'finalSrc:', finalSrc, 'isValidUrl:', isValidUrl(src));
    }
  }, [src, imgSrc, finalSrc]);

  return (
    <div className={`video-image-wrapper ${className}`} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#f0f0f0' }}>
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
          backgroundColor: '#f0f0f0',
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
        loading={className.includes('video-poster-image') ? 'eager' : 'lazy'}
        decoding="async"
        crossOrigin={imgSrc === PLACEHOLDER_SVG || !isValidUrl(imgSrc) ? undefined : "anonymous"}
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default VideoImage;

