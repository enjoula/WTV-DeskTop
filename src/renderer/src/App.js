import React from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter as Router } from 'react-router-dom';
import store from './store';
import Routes from './Routes';
import { fetchAllFilters } from './store/videoSlice';
import { checkUpdate } from './api/app';
import UpdateDialog from './components/UpdateDialog';
import './App.css';

function App() {
  const [version, setVersion] = React.useState('未知版本');
  const [versionCode, setVersionCode] = React.useState(null);
  const [platform, setPlatform] = React.useState(null);
  const [updateInfo, setUpdateInfo] = React.useState(null);
  const [isForceUpdate, setIsForceUpdate] = React.useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = React.useState(false);

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
        console.log('更新数据详情:', {
          version_code: updateData.version_code,
          version_name: updateData.version_name,
          download_url: updateData.download_url,
          is_force: updateData.is_force
        });
        
        const info = {
          version_code: updateData.version_code,
          version_name: updateData.version_name,
          download_url: updateData.download_url,
          update_content: updateData.update_content,
          file_size: updateData.file_size
        };
        
        console.log('设置更新信息:', info);
        setUpdateInfo(info);
        setIsForceUpdate(updateData.is_force || false);
        console.log('设置 showUpdateDialog = true');
        setShowUpdateDialog(true);
        
        // 如果是强制更新，不允许关闭对话框
        if (updateData.is_force) {
          console.log('检测到强制更新');
        }
      } else {
        console.log('当前已是最新版本，has_update:', updateData?.has_update);
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      console.error('错误详情:', error.response?.data || error.message);
    }
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

  // 当 versionCode 和 platform 都获取到后，检查更新
  React.useEffect(() => {
    if (versionCode && platform) {
      // 延迟检查更新，避免影响应用启动速度
      const timer = setTimeout(() => {
        handleCheckUpdate(versionCode, platform);
      }, 2000); // 2秒后检查更新
      
      return () => clearTimeout(timer);
    }
  }, [versionCode, platform, handleCheckUpdate]);

  // 处理下载更新
  const handleDownload = () => {
    if (updateInfo && updateInfo.download_url) {
      // 在 Electron 中打开下载链接
      if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(updateInfo.download_url).catch(err => {
          console.error('打开下载链接失败:', err);
          // 降级方案：使用 window.open
          window.open(updateInfo.download_url, '_blank');
        });
      } else {
        // 降级方案：使用 window.open
        window.open(updateInfo.download_url, '_blank');
      }
    }
  };

  // 处理关闭更新对话框
  const handleCloseUpdateDialog = () => {
    if (isForceUpdate) {
      // 强制更新不允许关闭
      return;
    }
    setShowUpdateDialog(false);
  };

  // 调试：打印当前状态
  React.useEffect(() => {
    console.log('App 状态更新:', {
      showUpdateDialog,
      hasUpdateInfo: !!updateInfo,
      updateInfo,
      isForceUpdate
    });
  }, [showUpdateDialog, updateInfo, isForceUpdate]);

  return (
    <Provider store={store}>
      <Router>
        <div className="App">
          {/* 如果是强制更新，完全隐藏应用内容，阻止使用 */}
          {!isForceUpdate && <Routes />}
          {showUpdateDialog && updateInfo && (
            <UpdateDialog
              updateInfo={updateInfo}
              isForce={isForceUpdate}
              onClose={handleCloseUpdateDialog}
              onDownload={handleDownload}
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
            </div>
          )}
        </div>
      </Router>
    </Provider>
  );
}

export default App;