// pages/Profile.js
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchCurrentUser, logoutUser } from '../store/authSlice';
import { updateProfile, updateAvatar } from '../api/user';
import { showCenterTip } from '../utils/tips';
import PasswordDialog from '../components/PasswordDialog';

const Profile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, loading, error } = useSelector(state => state.auth);
  const [avatarError, setAvatarError] = useState(false);
  const [nickname, setNickname] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null); // 用于存储当前显示的头像URL

  useEffect(() => {
    // 获取当前用户信息
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  // 处理头像URL，确保是完整URL
  const processAvatarUrl = (url) => {
    if (!url) return null;
    
    // 如果已经是完整URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // 如果是相对路径，需要拼接API基础URL
    const getBaseURL = () => {
      const isElectron = typeof window !== 'undefined' && (
        window.electronAPI || 
        window.location.protocol === 'file:' ||
        navigator.userAgent.includes('Electron')
      );
      
      if (isElectron) {
        return 'http://124.222.196.128:6660';
      }
      
      if (process.env.NODE_ENV === 'development') {
        return '/api';
      }
      
      return 'http://124.222.196.128:6660';
    };
    
    const baseURL = getBaseURL();
    
    // 如果URL以/开头，直接拼接
    if (url.startsWith('/')) {
      return `${baseURL}${url}`;
    }
    
    // 否则添加/后拼接
    return `${baseURL}/${url}`;
  };

  useEffect(() => {
    if (user) {
      setNickname(user.nickname || '');
      // 设置头像URL，处理相对路径
      const avatar = user.avatar_url || user.avatar;
      if (avatar) {
        const processedUrl = processAvatarUrl(avatar);
        console.log('原始头像URL:', avatar);
        console.log('处理后的头像URL:', processedUrl);
        setAvatarUrl(processedUrl);
      } else {
        setAvatarUrl(null);
      }
      // 重置头像错误状态
      setAvatarError(false);
    }
  }, [user]);

  // 保存昵称
  const handleSaveNickname = async () => {
    try {
      const response = await updateProfile({ nickname });
      const resData = response?.data || {};
      const code = resData.code;

      if (code === 0) {
        showCenterTip('更新成功');
        setIsEditingNickname(false);
      // 重新获取用户信息以更新状态
      dispatch(fetchCurrentUser());
      } else if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线');
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('昵称和密码至少需要传入一个！');
      } else if (code === 500) {
        showCenterTip('更新用户信息失败，请稍后重试');
      } else {
        const errorMsg = resData.message || '更新失败，请稍后重试';
        showCenterTip(errorMsg);
      }
    } catch (err) {
      console.error('更新昵称失败:', err);
      const resData = err?.response?.data || {};
      const code = resData.code;

      if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线');
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('昵称和密码至少需要传入一个！');
      } else if (code === 500) {
        showCenterTip('更新用户信息失败，请稍后重试');
      } else {
        const errorMsg = resData.message || err?.message || '更新失败，请稍后重试';
        showCenterTip(errorMsg);
      }
    }
  };

  // 修改密码
  const handleChangePassword = async (newPassword) => {
    try {
      const response = await updateProfile({ password: newPassword });
      const resData = response?.data || {};
      const code = resData.code;

      if (code === 0) {
        showCenterTip('密码修改成功');
        setShowPasswordDialog(false);
      } else if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线');
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('昵称和密码至少需要传入一个！');
      } else if (code === 500) {
        showCenterTip('密码修改失败，请稍后重试');
      } else {
        const errorMsg = resData.message || '密码修改失败，请稍后重试';
        showCenterTip(errorMsg);
    }
    } catch (err) {
      console.error('修改密码失败:', err);
      const resData = err?.response?.data || {};
      const code = resData.code;

      if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线');
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('昵称和密码至少需要传入一个！');
      } else if (code === 500) {
        showCenterTip('密码修改失败，请稍后重试');
      } else {
        const errorMsg = resData.message || err?.message || '密码修改失败，请稍后重试';
        showCenterTip(errorMsg);
      }
    }
  };

  // 更换头像
  const handleChangeAvatar = async () => {
    try {
      const response = await updateAvatar();
      const resData = response?.data || {};
      const code = resData.code;

      if (code === 0) {
        // 成功：从返回数据中获取新头像地址并立即更新显示
        // 尝试多种可能的数据结构
        const newAvatarUrl = resData.data?.avatar_url || 
                            resData.data?.avatar || 
                            resData.avatar_url || 
                            resData.avatar ||
                            (resData.data && typeof resData.data === 'string' ? resData.data : null);
        
        console.log('头像接口返回数据:', resData);
        console.log('提取的头像URL:', newAvatarUrl);
        
        if (newAvatarUrl) {
          // 处理头像URL，确保是完整URL
          const processedUrl = processAvatarUrl(newAvatarUrl);
          console.log('更换头像 - 原始URL:', newAvatarUrl);
          console.log('更换头像 - 处理后URL:', processedUrl);
          setAvatarUrl(processedUrl);
          setAvatarError(false);
          showCenterTip('头像更换成功');
          
          // 同时更新 Redux 中的用户信息
          dispatch(fetchCurrentUser());
        } else {
          // 如果没有返回头像地址，重新获取用户信息
          console.log('接口未返回头像URL，重新获取用户信息');
      dispatch(fetchCurrentUser());
          showCenterTip('头像更换成功');
        }
      } else if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线');
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('操作太频繁，请在10分钟后尝试！');
      } else if (code === 500) {
        showCenterTip('头像生成失败，请稍后重试');
      } else {
        const errorMsg = resData.message || '更新失败，请稍后重试';
        showCenterTip(errorMsg);
      }
    } catch (err) {
      console.error('更新头像失败:', err);
      const resData = err?.response?.data || {};
      const code = resData.code;

      if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线');
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('操作太频繁，请在10分钟后尝试！');
      } else if (code === 500) {
        showCenterTip('头像生成失败，请稍后重试');
      } else {
        const errorMsg = resData.message || err?.message || '更新失败，请稍后重试';
        showCenterTip(errorMsg);
      }
    }
  };

  const handleLogout = () => {
    dispatch(logoutUser()).then(() => {
      navigate('/login');
    });
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!user) {
    return <div className="error-message">请先登录</div>;
  }

  return (
    <div className="profile-page">
      <div className="profile-header-modern">
        <div className="profile-header-content">
          <h1 className="profile-title">个人中心</h1>
          <p className="profile-subtitle">管理您的账户信息和设置</p>
        </div>
      </div>
      
      <div className="profile-content-wrapper">
        <div className="profile-card profile-card-avatar">
          <div className="avatar-section-modern">
            <div className="avatar-wrapper">
              {avatarUrl && !avatarError ? (
                <div className="avatar-image-container">
                  <img 
                    src={avatarUrl} 
                    alt="头像"
                    className="avatar-image"
                    onError={() => {
                      setAvatarError(true);
                    }}
                  />
                  <div className="avatar-overlay"></div>
                </div>
              ) : (
                <div className="avatar-placeholder-modern">
                  <span className="avatar-initial">{(user?.nickname || user?.username || '用')[0]}</span>
                </div>
              )}
              <button onClick={handleChangeAvatar} className="change-avatar-btn-modern">
                <span className="avatar-btn-icon">🔄</span>
                <span>换一换</span>
              </button>
            </div>
          </div>
        </div>
        
        <div className="profile-card profile-card-info">
          <div className="info-section-modern">
            <div className="info-section-header">
              <div className="info-section-icon">👤</div>
            <h2>基本信息</h2>
            </div>
            <div className="info-items-modern">
              <div className="info-item-modern">
                <div className="info-item-label">
                  <span className="info-icon">🆔</span>
                  <span>用户ID</span>
                </div>
                <div className="info-item-value">
                  <span className="info-value-text">{user.user_id || user.id || '未知'}</span>
                </div>
              </div>
              
              <div className="info-item-modern">
                <div className="info-item-label">
                  <span className="info-icon">✏️</span>
                  <span>昵称</span>
                </div>
                <div className="info-item-value">
                  {isEditingNickname ? (
                    <div className="nickname-edit-modern">
                  <input
                    type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                    placeholder="请输入昵称"
                        className="nickname-input-modern"
                        autoFocus
                      />
                      <div className="nickname-actions-modern">
                        <button onClick={handleSaveNickname} className="btn-primary-small">
                          <span>✓</span> 保存
                        </button>
                        <button onClick={() => {
                          setIsEditingNickname(false);
                          setNickname(user.nickname || '');
                        }} className="btn-secondary-small">
                          <span>✕</span> 取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="nickname-display-modern">
                      <span className="info-value-text">{nickname || '未设置'}</span>
                      <button onClick={() => setIsEditingNickname(true)} className="btn-edit-inline">
                        <span>✏️</span> 编辑
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="info-item-modern">
                <div className="info-item-label">
                  <span className="info-icon">💻</span>
                  <span>设备信息</span>
                </div>
                <div className="info-item-value">
                  <span className="info-value-text device-badge">{user.devices?.device || '未知设备'}</span>
                </div>
              </div>
            </div>
          </div>
              </div>
              
        <div className="profile-card profile-card-security">
          <div className="info-section-modern">
            <div className="info-section-header">
              <div className="info-section-icon">🔒</div>
              <h2>账户安全</h2>
            </div>
            <div className="info-items-modern">
              <div className="info-item-modern">
                <div className="info-item-label">
                  <span className="info-icon">🔑</span>
                  <span>用户密码</span>
          </div>
                <div className="info-item-value">
                  <div className="password-display-modern">
                    <span className="password-mask">••••••••</span>
                    <button onClick={() => setShowPasswordDialog(true)} className="btn-primary-modern">
                      <span>🔐</span> 修改密码
                    </button>
              </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="profile-footer-modern">
        <button onClick={handleLogout} className="logout-button-modern">
          <span className="logout-icon">🚪</span>
          <span>退出登录</span>
        </button>
      </div>

      {/* 修改密码弹窗 */}
      {showPasswordDialog && (
        <PasswordDialog
          onClose={() => setShowPasswordDialog(false)}
          onConfirm={handleChangePassword}
        />
      )}
    </div>
  );
};

export default Profile;