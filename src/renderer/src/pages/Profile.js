// pages/Profile.js
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchCurrentUser, logoutUser } from '../store/authSlice';
import { updateProfile, updateAvatar } from '../api/user';
import { showCenterTip } from '../utils/tips';

const Profile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, loading, error } = useSelector(state => state.auth);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    nickname: '',
    email: '',
    phone: '',
    gender: '',
    birthday: '',
    bio: ''
  });

  useEffect(() => {
    // 获取当前用户信息
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  useEffect(() => {
    if (user) {
      setFormData({
        nickname: user.nickname || '',
        email: user.email || '',
        phone: user.phone || '',
        gender: user.gender || '',
        birthday: user.birthday || '',
        bio: user.bio || ''
      });
    }
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveProfile = async () => {
    try {
      const response = await updateProfile(formData);
      const resData = response?.data || {};
      const code = resData.code;

      if (code === 0) {
        // 成功：显示提示并更新用户信息
        showCenterTip('更新成功', 1500);
        setIsEditing(false);
        // 重新获取用户信息以更新状态
        dispatch(fetchCurrentUser());
      } else if (code === 401) {
        // 401：账号在其他设备登录
        showCenterTip('账号在其它设备登录，当前设备已下线', 1500);
        // 延迟跳转，让用户看到提示
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        // 400：昵称和密码至少需要传入一个
        showCenterTip('昵称和密码至少需要传入一个！', 1500);
        // 页面不做任何变更
      } else if (code === 500) {
        // 500：更新用户信息失败
        showCenterTip('更新用户信息失败，请稍后重试', 1500);
      } else {
        // 其他错误
        const errorMsg = resData.message || '更新失败，请稍后重试';
        showCenterTip(errorMsg, 1500);
      }
    } catch (err) {
      console.error('更新资料失败:', err);
      const resData = err?.response?.data || {};
      const code = resData.code;

      if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线', 1500);
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('昵称和密码至少需要传入一个！', 1500);
      } else if (code === 500) {
        showCenterTip('更新用户信息失败，请稍后重试', 1500);
      } else {
        const errorMsg = resData.message || err?.message || '更新失败，请稍后重试';
        showCenterTip(errorMsg, 1500);
      }
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const response = await updateAvatar();
      const resData = response?.data || {};
      const code = resData.code;

      if (code === 0) {
        // 成功：显示提示并更新头像
        showCenterTip('更新成功', 1500);
        // 重新获取用户信息以更新头像
        dispatch(fetchCurrentUser());
      } else if (code === 401) {
        // 401：账号在其他设备登录
        showCenterTip('账号在其它设备登录，当前设备已下线', 1500);
        // 延迟跳转，让用户看到提示
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        // 400：操作太频繁
        showCenterTip('操作太频繁，请在10分钟后尝试！', 1500);
        // 页面不做任何变更
      } else if (code === 500) {
        // 500：头像生成失败
        showCenterTip('头像生成失败，请稍后重试', 1500);
      } else {
        // 其他错误
        const errorMsg = resData.message || '更新失败，请稍后重试';
        showCenterTip(errorMsg, 1500);
      }
    } catch (err) {
      console.error('更新头像失败:', err);
      const resData = err?.response?.data || {};
      const code = resData.code;

      if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线', 1500);
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('操作太频繁，请在10分钟后尝试！', 1500);
      } else if (code === 500) {
        showCenterTip('头像生成失败，请稍后重试', 1500);
      } else {
        const errorMsg = resData.message || err?.message || '更新失败，请稍后重试';
        showCenterTip(errorMsg, 1500);
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
      <div className="profile-header">
        <h1>个人资料</h1>
        <div className="profile-actions">
          {isEditing ? (
            <>
              <button onClick={handleSaveProfile} className="save-button">保存</button>
              <button onClick={() => setIsEditing(false)} className="cancel-button">取消</button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="edit-button">编辑资料</button>
          )}
        </div>
      </div>
      
      <div className="profile-info">
        <div className="avatar-section">
          <div className="avatar-container">
            <img src={user.avatar || '/default-avatar.png'} alt="头像" />
            <button onClick={handleChangeAvatar} className="change-avatar-btn">更换头像</button>
          </div>
        </div>
        
        <div className="user-info">
          <div className="info-section">
            <h2>基本信息</h2>
            <div className="info-grid">
              <div className="info-item">
                <label>用户名:</label>
                <span>{user.username}</span>
              </div>
              
              <div className="info-item">
                <label>昵称:</label>
                {isEditing ? (
                  <input
                    type="text"
                    name="nickname"
                    value={formData.nickname}
                    onChange={handleInputChange}
                    placeholder="请输入昵称"
                  />
                ) : (
                  <span>{formData.nickname || '未设置'}</span>
                )}
              </div>
              
              <div className="info-item">
                <label>注册时间:</label>
                <span>{new Date(user.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div className="info-section">
            <h2>联系方式</h2>
            <div className="info-grid">
              <div className="info-item">
                <label>邮箱:</label>
                {isEditing ? (
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="请输入邮箱"
                  />
                ) : (
                  <span>{formData.email || '未设置'}</span>
                )}
              </div>
              
              <div className="info-item">
                <label>手机号:</label>
                {isEditing ? (
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="请输入手机号"
                  />
                ) : (
                  <span>{formData.phone || '未设置'}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="info-section">
            <h2>个人详情</h2>
            <div className="info-grid">
              <div className="info-item">
                <label>性别:</label>
                {isEditing ? (
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                  >
                    <option value="">请选择</option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                ) : (
                  <span>
                    {formData.gender === 'male' && '男'}
                    {formData.gender === 'female' && '女'}
                    {formData.gender === 'other' && '其他'}
                    {!formData.gender && '未设置'}
                  </span>
                )}
              </div>
              
              <div className="info-item">
                <label>生日:</label>
                {isEditing ? (
                  <input
                    type="date"
                    name="birthday"
                    value={formData.birthday}
                    onChange={handleInputChange}
                  />
                ) : (
                  <span>{formData.birthday || '未设置'}</span>
                )}
              </div>
              
              <div className="info-item full-width">
                <label>个人简介:</label>
                {isEditing ? (
                  <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleInputChange}
                    rows="4"
                    placeholder="请输入个人简介..."
                  />
                ) : (
                  <span className="bio-text">{formData.bio || '未设置'}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="profile-footer">
        <button onClick={handleLogout} className="logout-button">退出登录</button>
      </div>
    </div>
  );
};

export default Profile;