import React from 'react';
import { Provider } from 'react-redux';
import { HashRouter as Router } from 'react-router-dom';
import store from './store';
import Routes from './Routes';
import { fetchAllFilters } from './store/videoSlice';
import { setToken, clearAuth, fetchCurrentUser } from './store/authSlice';
import { checkUpdate } from './api/app';
import UpdateDialog from './components/UpdateDialog';
import LoginDialog from './components/LoginDialog';
import { getDevicePlatformAsync } from './utils/platform';
import { syncFromPlayHistory } from './utils/playlist';
import { setPlaylist } from './store/videoSlice';
import './App.css';

function App() {
  const appLaunchTimestampRef = React.useRef(Date.now());
  const [version, setVersion] = React.useState(null);
  const [versionCode, setVersionCode] = React.useState(null);
  const [platform, setPlatform] = React.useState(null);
  const [updateInfo, setUpdateInfo] = React.useState(null);
  const [isForceUpdate, setIsForceUpdate] = React.useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = React.useState(false);
  // 后台下载状态管理
  const [downloadState, setDownloadState] = React.useState('idle'); // idle, downloading, completed, error
  const [downloadedFilePath, setDownloadedFilePath] = React.useState(null);
  const [downloadProgress, setDownloadProgress] = React.useState(0);
  const [downloadedBytes, setDownloadedBytes] = React.useState(0);
  const [totalBytes, setTotalBytes] = React.useState(0);
  const [downloadSpeed, setDownloadSpeed] = React.useState(0);
  const [downloadErrorMessage, setDownloadErrorMessage] = React.useState(null);
  
  // 登录弹窗状态
  const [showLoginDialog, setShowLoginDialog] = React.useState(false);
  const [loginDialogConfig, setLoginDialogConfig] = React.useState({
    message: '',
    type: 'info',
    showCancel: true,
    showExtra: false,
    confirmText: '去登录',
    cancelText: '取消',
    extraText: '去注册',
    onConfirm: null,
    onCancel: null,
    onExtra: null,
  });

  // 后台静默下载更新
  const handleBackgroundDownload = React.useCallback(async (downloadUrl, fileName) => {
    const maxRetryAttempts = 3;
    if (!window.electronAPI || !window.electronAPI.downloadUpdate) {
      console.error('下载 API 不可用');
      setDownloadState('error');
      setDownloadErrorMessage('下载功能不可用');
      // 🔧 下载失败时不显示弹窗，避免黑屏
      setShowUpdateDialog(false);
      return;
    }

    try {
      // 🔧 确保下载过程中不显示弹窗
      setShowUpdateDialog(false);
      setDownloadState('downloading');
      setDownloadProgress(0);
      setDownloadedBytes(0);
      setTotalBytes(0);
      setDownloadErrorMessage(null);

      let lastError = null;
      for (let attempt = 1; attempt <= maxRetryAttempts; attempt += 1) {
        try {
          console.log(`开始后台静默下载更新文件（第 ${attempt}/${maxRetryAttempts} 次）:`, downloadUrl);
          const result = await window.electronAPI.downloadUpdate(downloadUrl, fileName);

          if (result.success) {
            setDownloadState('completed');
            setDownloadedFilePath(result.filePath);
            setDownloadProgress(100);
            console.log('后台下载完成，文件路径:', result.filePath);
            // 🔧 下载完成后，由 useEffect 自动显示弹窗
            return;
          }
          throw new Error('下载失败');
        } catch (attemptError) {
          lastError = attemptError;
          console.error(`后台下载第 ${attempt} 次失败:`, attemptError);
          if (attempt < maxRetryAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
      throw lastError || new Error('下载失败');
    } catch (error) {
      console.error('后台下载失败:', error);
      setDownloadState('error');
      setDownloadErrorMessage(error.message || `下载失败，已重试 ${maxRetryAttempts} 次`);
      // 🔧 下载失败时，只有强制更新才显示弹窗
      // 非强制更新不显示，避免影响用户体验
    }
  }, []);

  // 监听下载进度
  React.useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.onDownloadProgress) {
      return;
    }

    const cleanup = window.electronAPI.onDownloadProgress((data) => {
      console.log('收到下载进度:', data);
      setDownloadProgress(data.progress || 0);
      setDownloadedBytes(data.downloaded || 0);
      setTotalBytes(data.total || 0);
      if (data.speed !== undefined && data.speed !== null && data.speed > 0) {
        setDownloadSpeed(data.speed);
      }
    });

    return cleanup;
  }, []);

  // 跨窗口同步登录态：其他窗口登录/登出后，当前窗口自动同步
  React.useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== 'token') {
        return;
      }

      const nextToken = event.newValue || null;
      const currentToken = store.getState().auth?.token || null;
      if (nextToken === currentToken) {
        return;
      }

      if (nextToken) {
        store.dispatch(setToken(nextToken));
        store.dispatch(fetchCurrentUser()).catch(() => {});
      } else {
        store.dispatch(clearAuth());
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // 检查应用更新
  const handleCheckUpdate = React.useCallback(async (currentVersionCode, currentPlatform) => {
    if (!currentVersionCode || !currentPlatform) {
      console.log('版本信息不完整，跳过更新检查');
      return;
    }

    try {
      console.log('开始检查更新，平台:', currentPlatform, '版本码:', currentVersionCode);
      const response = await checkUpdate(currentPlatform, currentVersionCode);
      
      console.log('更新检查完整响应:', response);
      console.log('更新检查响应 data:', response.data);
      
      // 处理不同的响应数据结构
      let updateData = null;
      
      // 情况1: response.data.data.has_update
      if (response.data?.data?.has_update !== undefined) {
        updateData = response.data.data;
        console.log('使用数据结构: response.data.data');
      }
      // 情况2: response.data.has_update
      else if (response.data?.has_update !== undefined) {
        updateData = response.data;
        console.log('使用数据结构: response.data');
      }
      // 情况3: response.has_update (直接返回)
      else if (response.has_update !== undefined) {
        updateData = response;
        console.log('使用数据结构: response');
      }
      
      console.log('提取的更新数据:', updateData);
      
      if (updateData && updateData.has_update) {
        console.log('检测到更新，开始后台静默下载');
        
        // 处理 is_force 字段，支持多种格式：布尔值、字符串 "true"/"1"、数字 1
        let isForce = false;
        if (updateData.is_force !== undefined && updateData.is_force !== null) {
          if (typeof updateData.is_force === 'boolean') {
            isForce = updateData.is_force;
          } else if (typeof updateData.is_force === 'string') {
            isForce = updateData.is_force.toLowerCase() === 'true' || updateData.is_force === '1';
          } else if (typeof updateData.is_force === 'number') {
            isForce = updateData.is_force === 1;
          }
        }
        
        // 验证必要字段
        if (!updateData.download_url) {
          console.error('更新数据缺少 download_url，无法进行更新');
          return;
        }
        
        console.log('更新数据详情:', {
          version_code: updateData.version_code,
          version_name: updateData.version_name,
          download_url: updateData.download_url,
          is_force: updateData.is_force,
          is_force_parsed: isForce,
          is_force_type: typeof updateData.is_force,
          platform: currentPlatform
        });
        
        const info = {
          version_code: updateData.version_code,
          version_name: updateData.version_name,
          download_url: updateData.download_url,
          update_content: updateData.update_content,
          file_size: updateData.file_size
        };
        
        // 设置更新信息（但不显示弹窗）
        setUpdateInfo(info);
        setIsForceUpdate(isForce);
        // 🔧 确保下载过程中不显示弹窗
        setShowUpdateDialog(false);
        setDownloadState('idle'); // 重置下载状态
        
        // 立即开始后台静默下载
        const url = new URL(updateData.download_url);
        const fileName = url.pathname.split('/').pop() || `update-${updateData.version_name || Date.now()}.exe`;
        console.log('开始后台下载，文件名:', fileName);
        handleBackgroundDownload(updateData.download_url, fileName);
      } else {
        console.log('当前已是最新版本，has_update:', updateData?.has_update);
        // 确保没有更新时，清除更新状态
        setUpdateInfo(null);
        setIsForceUpdate(false);
        setShowUpdateDialog(false);
        setDownloadState('idle');
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      console.error('错误详情:', error.response?.data || error.message);
    }
  }, [handleBackgroundDownload]);

  // 全局登录弹窗显示方法
  React.useEffect(() => {
    // 暴露全局方法供 client.js 调用
    window.showLoginDialog = (config) => {
      return new Promise((resolve) => {
        setLoginDialogConfig({
          message: config.message || '您还未登录，请先登录。',
          type: config.type || 'info',
          showCancel: config.showCancel !== false,
          showExtra: config.showExtra === true,
          confirmText: config.confirmText || '去登录',
          cancelText: config.cancelText || '取消',
          extraText: config.extraText || '去注册',
          onConfirm: () => {
            setShowLoginDialog(false);
            resolve(config.confirmValue !== undefined ? config.confirmValue : true);
            if (config.onConfirm) config.onConfirm();
          },
          onCancel: () => {
            setShowLoginDialog(false);
            resolve(config.cancelValue !== undefined ? config.cancelValue : false);
            if (config.onCancel) config.onCancel();
          },
          onExtra: () => {
            setShowLoginDialog(false);
            resolve(config.extraValue !== undefined ? config.extraValue : 'extra');
            if (config.onExtra) config.onExtra();
          },
        });
        setShowLoginDialog(true);
      });
    };

    // 暴露全局 alert 方法（用于警告提示）
    window.showLoginAlert = (message) => {
      return new Promise((resolve) => {
        setLoginDialogConfig({
          message: message || '您的账号已在其他设备登录且超过3台，请重新登录。',
          type: 'warning',
          showCancel: false,
          onConfirm: () => {
            setShowLoginDialog(false);
            resolve(true);
          },
          onCancel: null
        });
        setShowLoginDialog(true);
      });
    };

    return () => {
      // 清理全局方法
      delete window.showLoginDialog;
      delete window.showLoginAlert;
    };
  }, []);

  React.useEffect(() => {
    // 获取应用版本
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
      window.electronAPI.getAppVersion().then(version => {
        setVersion(version);
      }).catch(err => {
        console.log('获取应用版本失败:', err);
        setVersion('开发版本');
      });
    } else {
      setVersion('开发版本');
    }
    
    // 获取平台信息
    if (window.electronAPI && typeof window.electronAPI.getPlatform === 'function') {
      window.electronAPI.getPlatform().then(platform => {
        setPlatform(platform);
        console.log('应用平台:', platform);
      }).catch(err => {
        console.log('获取平台信息失败:', err);
      });
    }
    
    // 预初始化平台缓存（用于登录/注册时的device参数）
    getDevicePlatformAsync().then(platform => {
      console.log('平台缓存已初始化:', platform);
    }).catch(err => {
      console.error('初始化平台缓存失败:', err);
    });
    
    // 获取 VersionCode（用于版本检测和升级）
    if (window.electronAPI && typeof window.electronAPI.getVersionCode === 'function') {
      window.electronAPI.getVersionCode().then(code => {
        setVersionCode(code);
        console.log('应用 VersionCode:', code);
      }).catch(err => {
        console.log('获取 VersionCode 失败:', err);
      });
    }
    
    // 应用启动时获取所有筛选条件（只获取一次，防止 React.StrictMode 重复调用）
    const filtersState = store.getState().video.allFilters;
    if (!filtersState.loading && (!filtersState.data || Object.keys(filtersState.data).length === 0)) {
    console.log('App 初始化 - 开始获取所有筛选条件');
    store.dispatch(fetchAllFilters()).then(() => {
      console.log('App 初始化 - 筛选条件获取完成');
    }).catch(error => {
      console.error('App 初始化 - 获取筛选条件失败:', error);
    });
    } else {
      console.log('App 初始化 - 筛选条件已存在或正在加载，跳过重复调用');
    }
    
    // 📋 应用启动时，从播放记录同步到播放列表（确保历史播放记录也在播放列表中）
    try {
      const syncResult = syncFromPlayHistory();
      if (syncResult) {
        // 同步成功后，更新 Redux store 中的播放列表
        const { getPlaylist } = require('./utils/playlist');
        const playlist = getPlaylist();
        store.dispatch(setPlaylist(playlist));
        console.log('✅ 应用启动 - 播放记录已同步到播放列表，共', playlist.length, '个视频');
      }
    } catch (error) {
      console.warn('应用启动 - 从播放记录同步到播放列表失败（不影响应用使用）:', error);
    }
    
    // 调试信息：检查环境
    console.log('App 初始化');
    console.log('PUBLIC_URL:', process.env.PUBLIC_URL);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('当前路径:', window.location.href);
  }, []);

  // 当 versionCode 和 platform 都获取到后，检查更新（应用启动后0.5-1.5分钟内）
  React.useEffect(() => {
    if (versionCode && platform) {
        // 以“应用启动时刻”为基准，在 30~90 秒窗口内随机选择一次检测时间
        const minSinceLaunchMs = 30 * 1000; // 0.5 分钟
        const maxSinceLaunchMs = 90 * 1000; // 1.5 分钟
        const targetSinceLaunchMs =
          Math.floor(Math.random() * (maxSinceLaunchMs - minSinceLaunchMs + 1)) + minSinceLaunchMs;
        const elapsedSinceLaunchMs = Date.now() - appLaunchTimestampRef.current;
        const remainingDelayMs = Math.max(targetSinceLaunchMs - elapsedSinceLaunchMs, 0);
        const delaySeconds = Math.round(remainingDelayMs / 1000);

        const timer = setTimeout(() => {
        console.log(`应用启动后 ${Math.round((Date.now() - appLaunchTimestampRef.current) / 1000)} 秒，开始检查更新`);
          handleCheckUpdate(versionCode, platform);
      }, remainingDelayMs);

        console.log('更新检测已计划：', {
          targetSinceLaunchSeconds: Math.round(targetSinceLaunchMs / 1000),
          elapsedSinceLaunchSeconds: Math.round(elapsedSinceLaunchMs / 1000),
          remainingDelaySeconds: delaySeconds
        });
        
        return () => clearTimeout(timer);
    }
  }, [versionCode, platform, handleCheckUpdate]);

  // 下载完成后，根据强制/非强制更新显示不同的弹窗
  React.useEffect(() => {
    if (downloadState === 'completed' && updateInfo) {
      console.log('下载完成，准备显示更新提示', { isForce: isForceUpdate });
      // 🔧 下载完成后才显示弹窗（无论强制还是非强制更新）
      setShowUpdateDialog(true);
    } else if (downloadState === 'error' && updateInfo) {
      // 🔧 下载失败时，只有强制更新才显示弹窗让用户重试
      // 非强制更新下载失败时不显示，避免影响用户体验
      if (isForceUpdate) {
        console.log('强制更新下载失败，显示错误提示');
        setShowUpdateDialog(true);
      } else {
        console.log('非强制更新下载失败，不显示提示');
        setShowUpdateDialog(false);
      }
    } else if (downloadState === 'downloading') {
      // 🔧 下载过程中确保不显示弹窗
      setShowUpdateDialog(false);
    }
  }, [downloadState, updateInfo, isForceUpdate]);

  // 处理下载更新（现在由 UpdateDialog 组件内部处理）
  const handleDownload = React.useCallback(() => {
    // 下载逻辑已移至 UpdateDialog 组件内部
    // 这个函数保留用于向后兼容，但实际下载由组件内部处理
    console.log('handleDownload 被调用，但下载逻辑已移至 UpdateDialog 组件');
  }, []);

  // 处理关闭更新对话框
  const handleCloseUpdateDialog = React.useCallback(() => {
    if (isForceUpdate) {
      // 强制更新不允许关闭
      console.log('强制更新，不允许关闭对话框');
      return;
    }
    console.log('关闭更新对话框');
    setShowUpdateDialog(false);
    // 非强制更新关闭后，可以选择清除更新信息（可选）
    // setUpdateInfo(null);
  }, [isForceUpdate]);

  // 调试：打印当前状态
  React.useEffect(() => {
    console.log('App 状态更新:', {
      showUpdateDialog,
      hasUpdateInfo: !!updateInfo,
      updateInfo: updateInfo ? {
        version_name: updateInfo.version_name,
        download_url: updateInfo.download_url ? '有' : '无'
      } : null,
      isForceUpdate,
      shouldShowDialog: updateInfo && ((isForceUpdate && updateInfo) || (showUpdateDialog && !isForceUpdate && updateInfo))
    });
  }, [showUpdateDialog, updateInfo, isForceUpdate]);

  return (
    <Provider store={store}>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <div className="App">
          {/* 🔧 只有在强制更新且对话框显示时，才隐藏应用内容（下载过程中不隐藏） */}
          {!(isForceUpdate && showUpdateDialog) && <Routes />}
          {/* 更新对话框显示逻辑：
              1. 强制更新：下载完成后显示（isForceUpdate 为 true 且 updateInfo 存在且 showUpdateDialog 为 true）
              2. 非强制更新：下载完成后显示（showUpdateDialog 为 true 且 updateInfo 存在） */}
          {updateInfo && showUpdateDialog && (
            <UpdateDialog
              updateInfo={updateInfo}
              isForce={isForceUpdate}
              appPlatform={platform}
              onClose={handleCloseUpdateDialog}
              onDownload={handleDownload}
              downloadState={downloadState}
              downloadedFilePath={downloadedFilePath}
              downloadProgress={downloadProgress}
              downloadedBytes={downloadedBytes}
              totalBytes={totalBytes}
              downloadSpeed={downloadSpeed}
              downloadErrorMessage={downloadErrorMessage}
              onRetryDownload={() => {
                if (updateInfo?.download_url) {
                  const url = new URL(updateInfo.download_url);
                  const fileName = url.pathname.split('/').pop() || `update-${updateInfo.version_name || Date.now()}.exe`;
                  handleBackgroundDownload(updateInfo.download_url, fileName);
                }
              }}
            />
          )}
          {/* 登录提示弹窗 */}
          {showLoginDialog && (
            <LoginDialog
              message={loginDialogConfig.message}
              type={loginDialogConfig.type}
              showCancel={loginDialogConfig.showCancel}
              showExtra={loginDialogConfig.showExtra}
              confirmText={loginDialogConfig.confirmText}
              cancelText={loginDialogConfig.cancelText}
              extraText={loginDialogConfig.extraText}
              onConfirm={loginDialogConfig.onConfirm}
              onCancel={loginDialogConfig.onCancel}
              onExtra={loginDialogConfig.onExtra}
            />
          )}
          {/* 调试：显示状态信息 */}
          {process.env.NODE_ENV === 'development' && (
            <div style={{
              position: 'fixed',
              bottom: '10px',
              right: '10px',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '10px',
              fontSize: '12px',
              zIndex: 99999,
              borderRadius: '4px'
            }}>
              <div>showUpdateDialog: {showUpdateDialog ? 'true' : 'false'}</div>
              <div>hasUpdateInfo: {updateInfo ? 'true' : 'false'}</div>
              <div>isForceUpdate: {isForceUpdate ? 'true' : 'false'}</div>
              {updateInfo && (
                <>
                  <div>version_name: {updateInfo.version_name || 'N/A'}</div>
                  <div>download_url: {updateInfo.download_url ? '有' : '无'}</div>
                </>
              )}
            </div>
          )}
          {/* 全局版本号展示（右下角） */}
          {version && (
            <div className="app-version-badge">
              V{version}
            </div>
          )}
        </div>
      </Router>
    </Provider>
  );
}

export default App;