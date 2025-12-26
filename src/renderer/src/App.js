import React from 'react';
import { Provider } from 'react-redux';
import { HashRouter as Router } from 'react-router-dom';
import store from './store';
import Routes from './Routes';
import { fetchAllFilters } from './store/videoSlice';
import { checkUpdate } from './api/app';
import UpdateDialog from './components/UpdateDialog';
import LoginDialog from './components/LoginDialog';
import { getDevicePlatformAsync } from './utils/platform';
import './App.css';

function App() {
  const [version, setVersion] = React.useState('未知版本');
  const [versionCode, setVersionCode] = React.useState(null);
  const [platform, setPlatform] = React.useState(null);
  const [updateInfo, setUpdateInfo] = React.useState(null);
  const [isForceUpdate, setIsForceUpdate] = React.useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = React.useState(false);
  
  // 登录弹窗状态
  const [showLoginDialog, setShowLoginDialog] = React.useState(false);
  const [loginDialogConfig, setLoginDialogConfig] = React.useState({
    message: '',
    type: 'info',
    showCancel: true,
    onConfirm: null,
    onCancel: null
  });

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
        console.log('检测到更新，准备显示对话框');
        
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
        
        console.log('设置更新信息:', info);
        
        // 对于强制更新，直接设置状态，不需要等待 showUpdateDialog
        // 对于非强制更新，需要设置 showUpdateDialog
        if (isForce) {
          console.log('检测到强制更新，直接设置状态');
          // 强制更新：先设置 updateInfo 和 isForceUpdate，确保对话框能显示
          setUpdateInfo(info);
          setIsForceUpdate(true);
          // 强制更新时，showUpdateDialog 可以设置为 true 也可以不设置
          // 因为渲染条件会检查 isForceUpdate && updateInfo
          setShowUpdateDialog(true);
          console.log('强制更新状态已设置: updateInfo=', !!info, 'isForceUpdate=true');
        } else {
          // 非强制更新：正常设置所有状态
          setUpdateInfo(info);
          setIsForceUpdate(false);
          setShowUpdateDialog(true);
          console.log('非强制更新状态已设置: showUpdateDialog=true');
        }
      } else {
        console.log('当前已是最新版本，has_update:', updateData?.has_update);
        // 确保没有更新时，清除更新状态
        setUpdateInfo(null);
        setIsForceUpdate(false);
        setShowUpdateDialog(false);
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      console.error('错误详情:', error.response?.data || error.message);
    }
  }, []);

  // 全局登录弹窗显示方法
  React.useEffect(() => {
    // 暴露全局方法供 client.js 调用
    window.showLoginDialog = (config) => {
      return new Promise((resolve) => {
        setLoginDialogConfig({
          message: config.message || '您还未登录，请先登录。',
          type: config.type || 'info',
          showCancel: config.showCancel !== false,
          onConfirm: () => {
            setShowLoginDialog(false);
            resolve(true);
            if (config.onConfirm) config.onConfirm();
          },
          onCancel: () => {
            setShowLoginDialog(false);
            resolve(false);
            if (config.onCancel) config.onCancel();
          }
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
    
    // 应用启动时获取所有筛选条件
    console.log('App 初始化 - 开始获取所有筛选条件');
    store.dispatch(fetchAllFilters()).then(() => {
      console.log('App 初始化 - 筛选条件获取完成');
    }).catch(error => {
      console.error('App 初始化 - 获取筛选条件失败:', error);
    });
    
    // 调试信息：检查环境
    console.log('App 初始化');
    console.log('PUBLIC_URL:', process.env.PUBLIC_URL);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('当前路径:', window.location.href);
  }, []);

  // 检查今天是否已经检测过更新
  const shouldCheckUpdateToday = React.useCallback(() => {
    const today = new Date().toDateString(); // 获取今天的日期字符串，例如 "Mon Jan 01 2024"
    const lastCheckDate = localStorage.getItem('lastUpdateCheckDate');
    
    // 如果今天还没有检测过，返回 true
    if (lastCheckDate !== today) {
      // 更新最后检测日期
      localStorage.setItem('lastUpdateCheckDate', today);
      console.log('今天首次打开，需要检测更新');
      return true;
    }
    
    console.log('今天已经检测过更新，跳过检测');
    return false;
  }, []);

  // 当 versionCode 和 platform 都获取到后，检查更新（每天首次打开时）
  React.useEffect(() => {
    if (versionCode && platform) {
      // 检查今天是否已经检测过更新
      if (shouldCheckUpdateToday()) {
        // 延迟检查更新，避免影响应用启动速度
        const timer = setTimeout(() => {
          handleCheckUpdate(versionCode, platform);
        }, 2000); // 2秒后检查更新
        
        return () => clearTimeout(timer);
      } else {
        console.log('今天已检测过更新，跳过本次检测');
      }
    }
  }, [versionCode, platform, handleCheckUpdate, shouldCheckUpdateToday]);

  // 处理下载更新
  const handleDownload = React.useCallback(() => {
    if (!updateInfo || !updateInfo.download_url) {
      console.error('更新信息或下载链接不存在');
      return;
    }
    
    console.log('开始下载更新，URL:', updateInfo.download_url);
    
    // 在 Electron 中打开下载链接
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
      window.electronAPI.openExternal(updateInfo.download_url)
        .then(() => {
          console.log('成功打开下载链接');
          // 如果是强制更新，下载后可以提示用户安装
          if (isForceUpdate) {
            // 强制更新下载后，可以显示提示信息（可选）
            console.log('强制更新：已打开下载链接，请安装新版本');
          }
        })
        .catch(err => {
          console.error('打开下载链接失败:', err);
          // 降级方案：使用 window.open
          window.open(updateInfo.download_url, '_blank');
        });
    } else {
      // 降级方案：使用 window.open
      console.log('使用 window.open 打开下载链接');
      window.open(updateInfo.download_url, '_blank');
    }
  }, [updateInfo, isForceUpdate]);

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
      <Router>
        <div className="App">
          {/* 如果是强制更新，完全隐藏应用内容，阻止使用 */}
          {!isForceUpdate && <Routes />}
          {/* 更新对话框显示逻辑：
              1. 强制更新：isForceUpdate 为 true 且 updateInfo 存在（必须显示）
              2. 非强制更新：showUpdateDialog 为 true 且 updateInfo 存在 */}
          {updateInfo && (
            (isForceUpdate) || 
            (showUpdateDialog && !isForceUpdate)
          ) && (
            <UpdateDialog
              updateInfo={updateInfo}
              isForce={isForceUpdate}
              onClose={handleCloseUpdateDialog}
              onDownload={handleDownload}
            />
          )}
          {/* 登录提示弹窗 */}
          {showLoginDialog && (
            <LoginDialog
              message={loginDialogConfig.message}
              type={loginDialogConfig.type}
              showCancel={loginDialogConfig.showCancel}
              onConfirm={loginDialogConfig.onConfirm}
              onCancel={loginDialogConfig.onCancel}
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
        </div>
      </Router>
    </Provider>
  );
}

export default App;