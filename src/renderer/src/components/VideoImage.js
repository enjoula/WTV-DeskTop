// components/VideoImage.js
import React, { useState, useEffect, useRef } from 'react';

const PLACEHOLDER_SVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPuaXoOazleWKoOi9veWbvueJhzwvdGV4dD48L3N2Zz4=';

/** 进程内记住已成功解码的封面，切 tab 回来不必再转圈/重拉 */
const decodedCoverUrls = new Set();
const decodedCoverHolders = new Map();

function isValidUrl(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || url.startsWith('/') || url.startsWith('data:');
}

function rememberDecodedCover(url) {
  if (!url || url === PLACEHOLDER_SVG) return;
  decodedCoverUrls.add(url);
  if (!decodedCoverHolders.has(url)) {
    const holder = new Image();
    holder.src = url;
    decodedCoverHolders.set(url, holder);
    if (decodedCoverHolders.size > 200) {
      const firstKey = decodedCoverHolders.keys().next().value;
      decodedCoverHolders.delete(firstKey);
      decodedCoverUrls.delete(firstKey);
    }
  }
}

function restoreGpuImage(img) {
  if (!img) return;
  const display = img.style.display;
  img.style.display = 'none';
  // 强制重排，让 Chromium 在切回 tab 后重新上传纹理
  void img.offsetHeight;
  img.style.display = display || '';
}

const VideoImage = ({ src, alt, className = '' }) => {
  const valid = isValidUrl(src);
  const alreadyDecoded = valid && decodedCoverUrls.has(src);
  const [imgSrc, setImgSrc] = useState(valid ? src : PLACEHOLDER_SVG);
  const [isLoading, setIsLoading] = useState(valid && !alreadyDecoded);
  const [hasError, setHasError] = useState(!valid);
  const [retryCount, setRetryCount] = useState(0);
  const timeoutRef = useRef(null);
  const imgRef = useRef(null);

  const handleError = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (imgSrc === PLACEHOLDER_SVG) {
      setIsLoading(false);
      setHasError(true);
      return;
    }
    if (retryCount < 1 && isValidUrl(src)) {
      setRetryCount((prev) => prev + 1);
      setTimeout(() => {
        setImgSrc(src);
        setIsLoading(!decodedCoverUrls.has(src));
        setHasError(false);
      }, 400);
      return;
    }
    setImgSrc(PLACEHOLDER_SVG);
    setHasError(true);
    setIsLoading(false);
  };

  const handleLoad = (event) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const loadedSrc = event?.currentTarget?.currentSrc || src;
    rememberDecodedCover(src);
    rememberDecodedCover(loadedSrc);
    setIsLoading(false);
    setHasError(false);
    setRetryCount(0);
  };

  useEffect(() => {
    if (src && isValidUrl(src)) {
      const cached = decodedCoverUrls.has(src);
      setImgSrc(src);
      setIsLoading(!cached);
      setHasError(false);
      setRetryCount(0);
    } else {
      setImgSrc(PLACEHOLDER_SVG);
      setIsLoading(false);
      setHasError(true);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [src]);

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      rememberDecodedCover(src);
      setIsLoading(false);
      setHasError(false);
    }
  }, [imgSrc, src]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      restoreGpuImage(imgRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);

  const finalSrc = isValidUrl(imgSrc) ? imgSrc : PLACEHOLDER_SVG;

  return (
    <div
      className={`video-image-wrapper ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: (isLoading || hasError) ? '#1c1c1c' : 'transparent',
      }}
    >
      {isLoading && !hasError && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#1c1c1c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888',
            fontSize: '12px',
            zIndex: 1,
          }}
        >
          加载中...
        </div>
      )}
      <img
        ref={imgRef}
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
          backgroundColor: 'transparent',
          position: 'relative',
          zIndex: 0,
        }}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default VideoImage;
