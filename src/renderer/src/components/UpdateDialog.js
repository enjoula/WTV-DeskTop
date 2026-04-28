// components/UpdateDialog.js
import React from 'react';
import './UpdateDialog.css';

const UpdateDialog = ({ 
  updateInfo, 
  onClose, 
  onDownload, 
  isForce,
  downloadState: externalDownloadState = 'idle',
  downloadedFilePath: externalDownloadedFilePath = null,
  downloadProgress: externalDownloadProgress = 0,
  downloadedBytes: externalDownloadedBytes = 0,
  totalBytes: externalTotalBytes = 0,
  downloadSpeed: externalDownloadSpeed = 0,
  downloadErrorMessage: externalDownloadErrorMessage = null,
  onRetryDownload = null
}) => {
  // 用于控制滚动提示的显示
  const [showScrollHint, setShowScrollHint] = React.useState(true);
  const contentRef = React.useRef(null);
  const forceContentRef = React.useRef(null);
  // 如果外部传入了下载状态，使用外部的；否则使用内部的（向后兼容）
  const [internalDownloadState, setInternalDownloadState] = React.useState('idle');
  const [internalDownloadProgress, setInternalDownloadProgress] = React.useState(0);
  const [internalDownloadedBytes, setInternalDownloadedBytes] = React.useState(0);
  const [internalTotalBytes, setInternalTotalBytes] = React.useState(0);
  const [internalDownloadSpeed, setInternalDownloadSpeed] = React.useState(0);
  const [internalDownloadedFilePath, setInternalDownloadedFilePath] = React.useState(null);
  const [internalErrorMessage, setInternalErrorMessage] = React.useState(null);
  const downloadSpeedRef = React.useRef(0);
  
  // 使用外部状态或内部状态
  const downloadState = externalDownloadState !== 'idle' ? externalDownloadState : internalDownloadState;
  const downloadProgress = externalDownloadState !== 'idle' ? externalDownloadProgress : internalDownloadProgress;
  const downloadedBytes = externalDownloadState !== 'idle' ? externalDownloadedBytes : internalDownloadedBytes;
  const totalBytes = externalDownloadState !== 'idle' ? externalTotalBytes : internalTotalBytes;
  const downloadSpeed = externalDownloadState !== 'idle' ? externalDownloadSpeed : internalDownloadSpeed;
  const downloadedFilePath = externalDownloadedFilePath || internalDownloadedFilePath;
  const errorMessage = externalDownloadErrorMessage || internalErrorMessage;
  
  // 调试日志
  React.useEffect(() => {
    console.log('UpdateDialog 组件渲染:', {
      hasUpdateInfo: !!updateInfo,
      updateInfo: updateInfo ? {
        version_name: updateInfo.version_name,
        download_url: updateInfo.download_url ? '有' : '无'
      } : null,
      isForce,
      willRender: !!(updateInfo && updateInfo.download_url)
    });
  }, [updateInfo, isForce]);

  // 监听下载进度（仅当使用内部状态时）
  React.useEffect(() => {
    if (externalDownloadState !== 'idle') {
      // 使用外部状态，不需要监听
      return;
    }
    
    if (!window.electronAPI || !window.electronAPI.onDownloadProgress) {
      return;
    }

    const cleanup = window.electronAPI.onDownloadProgress((data) => {
      console.log('收到下载进度:', data);
      setInternalDownloadProgress(data.progress || 0);
      setInternalDownloadedBytes(data.downloaded || 0);
      setInternalTotalBytes(data.total || 0);
      // 更新速度：只在速度大于0时更新状态，避免闪烁
      if (data.speed !== undefined && data.speed !== null) {
        if (data.speed > 0) {
          downloadSpeedRef.current = data.speed;
          setInternalDownloadSpeed(data.speed);
        } else if (downloadSpeedRef.current > 0) {
          // 如果速度变为0但之前有速度，保持显示之前的速度（避免闪烁）
        }
      }
    });

    return cleanup;
  }, [externalDownloadState]);

  // 检查内容是否可以滚动，控制滚动提示的显示
  React.useEffect(() => {
    if (!updateInfo || !updateInfo.update_content) {
      return;
    }

    const checkScrollable = () => {
      try {
        const contentElement = contentRef.current || forceContentRef.current;
        if (!contentElement) {
          return;
        }

        const isScrollable = contentElement.scrollHeight > contentElement.clientHeight;
        const isAtTop = contentElement.scrollTop === 0;
        // 只有在可滚动且位于顶部时才显示提示
        setShowScrollHint(isScrollable && isAtTop);
        
        // 更新遮罩显示状态
        let wrapper = null;
        try {
          if (contentElement.parentElement) {
            // 尝试找到父容器
            const parent = contentElement.parentElement;
            if (parent && parent.classList) {
              if (parent.classList.contains('update-dialog-content-wrapper') || 
                  parent.classList.contains('update-force-content-wrapper')) {
                wrapper = parent;
              } else if (parent.closest) {
                // 如果直接父元素不是，尝试向上查找
                wrapper = parent.closest('.update-dialog-content-wrapper, .update-force-content-wrapper');
              }
            }
          }
          
          if (wrapper) {
            const topIndicator = wrapper.querySelector('.update-content-scroll-indicator-top');
            const bottomIndicator = wrapper.querySelector('.update-content-scroll-indicator-bottom');
            
            if (topIndicator && bottomIndicator) {
              // 顶部遮罩：不在顶部时显示
              const showTopIndicator = contentElement.scrollTop > 10;
              topIndicator.style.opacity = showTopIndicator ? '1' : '0';
              // 底部遮罩：未滚动到底部时显示
              const isAtBottom = contentElement.scrollHeight - contentElement.scrollTop <= contentElement.clientHeight + 10;
              bottomIndicator.style.opacity = isAtBottom ? '0' : '1';
            }
          }
        } catch (domError) {
          console.warn('更新滚动遮罩时出错:', domError);
        }
      } catch (error) {
        console.error('检查滚动状态时出错:', error);
      }
    };

    // 初始检查（延迟一点，确保DOM已渲染）
    const timeoutId = setTimeout(() => {
      checkScrollable();
      // 再次检查，确保DOM完全渲染
      setTimeout(checkScrollable, 100);
    }, 200);

    // 监听窗口大小变化
    const handleResize = () => {
      checkScrollable();
    };
    window.addEventListener('resize', handleResize);
    
    // 监听滚动事件
    const contentElement = contentRef.current || forceContentRef.current;
    let scrollHandler = null;
    if (contentElement) {
      scrollHandler = () => {
        checkScrollable();
      };
      contentElement.addEventListener('scroll', scrollHandler, { passive: true });
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      if (contentElement && scrollHandler) {
        contentElement.removeEventListener('scroll', scrollHandler);
      }
    };
  }, [updateInfo, downloadState]);

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // 格式化下载速度
  const formatSpeed = (bytesPerSecond) => {
    return formatFileSize(bytesPerSecond) + '/s';
  };

  // 处理下载（仅当使用内部状态时）
  const handleDownload = async () => {
    if (externalDownloadState !== 'idle') {
      // 使用外部状态，下载由外部控制
      if (onDownload) {
        onDownload();
      }
      return;
    }
    
    if (!updateInfo || !updateInfo.download_url) {
      console.error('更新信息或下载链接不存在');
      return;
    }

    if (!window.electronAPI || !window.electronAPI.downloadUpdate) {
      console.error('下载 API 不可用');
      setInternalErrorMessage('下载功能不可用，请使用浏览器下载');
      return;
    }

    try {
      setInternalDownloadState('downloading');
      setInternalDownloadProgress(0);
      setInternalDownloadedBytes(0);
      setInternalTotalBytes(0);
      setInternalErrorMessage(null);

      // 从 URL 中提取文件名，或使用默认名称
      const url = new URL(updateInfo.download_url);
      const fileName = url.pathname.split('/').pop() || `update-${updateInfo.version_name || Date.now()}.exe`;

      console.log('开始下载更新文件:', updateInfo.download_url);
      const result = await window.electronAPI.downloadUpdate(updateInfo.download_url, fileName);

      if (result.success) {
        setInternalDownloadState('completed');
        setInternalDownloadedFilePath(result.filePath);
        setInternalDownloadProgress(100);
        console.log('下载完成，文件路径:', result.filePath);
      } else {
        throw new Error('下载失败');
      }
    } catch (error) {
      console.error('下载失败:', error);
      setInternalDownloadState('error');
      setInternalErrorMessage(error.message || '下载失败，请重试');
    }
  };

  // 处理安装
  const handleInstall = async () => {
    if (!downloadedFilePath || !window.electronAPI || !window.electronAPI.installUpdate) {
      console.error('安装文件路径或安装 API 不可用');
      return;
    }

    try {
      console.log('开始安装更新文件:', downloadedFilePath);
      await window.electronAPI.installUpdate(downloadedFilePath);
      // 安装后应用会自动退出，这里不需要额外处理
    } catch (error) {
      console.error('安装失败:', error);
      setInternalErrorMessage(error.message || '安装失败，请重试');
    }
  };

  if (!updateInfo) {
    console.log('UpdateDialog: updateInfo 为空，不渲染');
    return null;
  }
  
  // 验证必要字段
  if (!updateInfo.download_url) {
    console.error('UpdateDialog: download_url 不存在，无法显示更新对话框');
    return null;
  }
  
  console.log('UpdateDialog: 准备渲染对话框', {
    isForce,
    hasDownloadUrl: !!updateInfo.download_url,
    versionName: updateInfo.version_name
  });

  const handleOverlayClick = (e) => {
    // 强制更新时不允许通过点击遮罩层关闭
    if (isForce) {
      return;
    }
    // 只有点击遮罩层本身时才关闭（不是点击对话框内容）
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCloseClick = (e) => {
    e.stopPropagation();
    if (!isForce) {
      onClose();
    }
  };

  // 解析更新内容，支持emoji和列表格式
  const parseUpdateContent = (content) => {
    if (!content) return [];
    return content.split('\n').filter(line => line.trim());
  };

  // 非强制更新使用新UI
  if (!isForce) {
    return (
      <div 
        className="update-dialog-overlay" 
        onClick={handleOverlayClick}
      >
        <div className="update-dialog update-dialog-new" onClick={(e) => e.stopPropagation()}>
          {/* (A) 关闭按钮 */}
          <button 
            className="update-dialog-close" 
            onClick={handleCloseClick}
            aria-label="关闭"
          >
            ×
          </button>

          {/* (B) 顶部插画区域 */}
          <div className="update-dialog-illustration">
            <div className="update-illustration-content">
              <div className="update-illustration-astronaut">👨‍🚀</div>
              <div className="update-illustration-gift">🎁</div>
            </div>
          </div>

          {/* (C) 标题 */}
          <div className="update-dialog-title-new">
            <h2>
              {downloadState === 'completed' ? '更新已准备就绪' : '发现新版本'} {updateInfo.version_name || ''}
            </h2>
          </div>

          {/* (D) 更新内容区域 - 使用接口返回的 update_content */}
          {updateInfo.update_content && (
            <div className="update-dialog-content-wrapper">
              <div className="update-dialog-content-new" ref={contentRef}>
                {parseUpdateContent(updateInfo.update_content).map((line, index) => (
                  <div key={index} className="update-content-item">
                    {line}
                  </div>
                ))}
              </div>
              {/* 滚动提示遮罩 */}
              <div className="update-content-scroll-indicator-top"></div>
              <div className="update-content-scroll-indicator-bottom"></div>
              {/* 滚动提示文字 */}
              {showScrollHint && (
                <div className="update-content-scroll-hint">
                  <span className="scroll-hint-icon">↓</span>
                  <span className="scroll-hint-text">滚动查看更多</span>
                </div>
              )}
            </div>
          )}

          {/* (E & F) 按钮区域 - 只在下载完成后显示 */}
          {downloadState === 'completed' && (
          <div className="update-dialog-actions-new">
            <button className="update-button-secondary" onClick={onClose}>
              稍后安装
            </button>
              <button className="update-button-primary" onClick={handleInstall}>
              立即安装
            </button>
          </div>
          )}
          
          {/* 下载进度区域 */}
          {downloadState === 'downloading' && (
            <div className="update-download-progress">
              <div className="update-progress-info">
                <span>正在下载更新...</span>
                <span>{Math.round(downloadProgress)}%</span>
              </div>
              <div className="update-progress-bar-container">
                <div 
                  className="update-progress-bar" 
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
              <div className="update-progress-details">
                <span>{formatFileSize(downloadedBytes)} / {formatFileSize(totalBytes)}</span>
                {downloadSpeed > 0 && (
                  <span>{formatSpeed(downloadSpeed)}</span>
                )}
              </div>
            </div>
          )}
          
          {/* 下载完成区域 */}
          {downloadState === 'completed' && (
            <div className="update-download-completed">
              <div className="update-completed-icon">✓</div>
              <div className="update-completed-message">下载完成</div>
              <div className="update-dialog-actions-new">
                <button className="update-button-primary" onClick={handleInstall}>
                  立即安装
                </button>
              </div>
            </div>
          )}
          
          {/* 下载错误区域 */}
          {downloadState === 'error' && (
            <div className="update-download-error">
              <div className="update-error-message">{errorMessage || '下载失败'}</div>
              <div className="update-dialog-actions-new">
                <button className="update-button-secondary" onClick={onClose}>
                  关闭
                </button>
                <button className="update-button-primary" onClick={onRetryDownload || handleDownload}>
                  重试下载
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 强制更新使用警告样式UI
  // 构建更新说明文本 - 优先使用接口返回的 update_content
  const buildForceUpdateText = () => {
    // 优先使用接口返回的更新内容
    if (updateInfo.update_content) {
      return updateInfo.update_content;
    }
    // 如果没有返回更新内容，使用默认文本
    const versionName = updateInfo.version_name || '';
    return `由于当前版本存在严重的安全隐患，为了保障您的账户安全，请更新至最新版本 ${versionName ? `(${versionName})` : ''} 后继续使用。\n感谢您的理解与支持。`;
  };

  return (
    <div 
      className="update-dialog-overlay force-update" 
      onClick={handleOverlayClick}
    >
      <div className="update-dialog update-dialog-force" onClick={(e) => e.stopPropagation()}>
        {/* (A) 红色警告图标 */}
        <div className="update-force-icon">
          <div className="update-force-icon-circle">
            ⚠️
          </div>
        </div>

        {/* (B) 标题 */}
        <div className="update-force-title">
          <h2>需要进行重要更新</h2>
        </div>

        {/* (C) 内容文本 */}
        <div className="update-force-content-wrapper">
          <div className="update-force-content" ref={forceContentRef}>
            {buildForceUpdateText().split('\n').map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </div>

        {/* (D) 按钮区域 - 只在下载完成后显示 */}
        {downloadState === 'completed' && (
        <div className="update-force-actions">
            <button className="update-button-force-primary" onClick={handleInstall}>
            立即安装
          </button>
        </div>
        )}
        
        {/* 下载进度区域 */}
        {downloadState === 'downloading' && (
          <div className="update-download-progress">
            <div className="update-progress-info">
              <span>正在下载更新...</span>
              <span>{Math.round(downloadProgress)}%</span>
            </div>
            <div className="update-progress-bar-container">
              <div 
                className="update-progress-bar" 
                style={{ width: `${downloadProgress}%` }}
              ></div>
            </div>
            <div className="update-progress-details">
              <span>{formatFileSize(downloadedBytes)} / {formatFileSize(totalBytes)}</span>
              {downloadSpeed > 0 && (
                <span>{formatSpeed(downloadSpeed)}</span>
              )}
            </div>
          </div>
        )}
        
        {/* 下载错误区域 */}
        {downloadState === 'error' && (
          <div className="update-download-error">
            <div className="update-error-message">{errorMessage || '下载失败'}</div>
            <div className="update-force-actions">
              <button className="update-button-force-primary" onClick={onRetryDownload || handleDownload}>
                重试下载
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateDialog;

