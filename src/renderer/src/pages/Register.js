// pages/Register.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { register as registerUser } from '../api/user';
import { setAuthData } from '../store/authSlice';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, token } = useSelector(state => state.auth);
  
  // 监听认证状态，如果已认证则自动跳转
  useEffect(() => {
    if (isAuthenticated && token && success) {
      console.log('检测到已认证，执行自动跳转');
      sessionStorage.setItem('registerSuccess', 'true');
      
      // 延迟一下确保状态完全更新
      setTimeout(() => {
        console.log('自动跳转到首页');
        window.location.hash = '#/';
      }, 100);
    }
  }, [isAuthenticated, token, success, navigate]);

  // 验证用户名：长度 6-11，必须是字母和数字的组合
  const validateUsername = (value) => {
    if (!value) {
      setUsernameError('');
      return false;
    }
    
    if (value.length < 6 || value.length > 11) {
      setUsernameError('用户名长度为 6-11 个字符');
      return false;
    }
    
    // 检查是否只包含字母和数字
    if (!/^[a-zA-Z0-9]+$/.test(value)) {
      setUsernameError('用户名只能包含字母和数字');
      return false;
    }
    
    // 检查是否同时包含字母和数字
    const hasLetter = /[a-zA-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    
    if (!hasLetter || !hasNumber) {
      setUsernameError('用户名必须同时包含字母和数字');
      return false;
    }
    
    setUsernameError('');
    return true;
  };

  // 验证密码：不能包含汉字，其他无限制
  const validatePassword = (value) => {
    if (!value) {
      setPasswordError('');
      return false;
    }
    
    // 检查是否包含汉字（中文字符）
    // Unicode 范围：\u4e00-\u9fff 是基本的中文字符范围
    // 还包括其他可能的中文相关字符范围
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(value)) {
      setPasswordError('密码不能包含汉字');
      return false;
    }
    
    setPasswordError('');
    return true;
  };

  // 用户名输入处理
  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);
    validateUsername(value);
  };

  // 密码输入处理
  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    validatePassword(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 清除之前的错误
    setError('');
    setUsernameError('');
    setPasswordError('');
    
    // 验证用户名
    if (!validateUsername(username)) {
      return;
    }
    
    // 验证密码
    if (!validatePassword(password)) {
      return;
    }
    
    // 基本验证
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      console.log('开始注册，用户名:', username);
      const response = await registerUser({ username, password });
      console.log('注册响应完整数据:', JSON.stringify(response, null, 2));
      console.log('注册响应 data:', response?.data);
      console.log('注册响应 code:', response?.data?.code);
      console.log('注册响应 data.data:', response?.data?.data);
      
      if (response && response.data) {
        // 检查多种可能的成功状态码
        const isSuccess = response.data.code === 200 || response.data.code === 0 || response.data.code === '200';
        
        if (isSuccess) {
          // 注册成功，保存token、nickname、avatar并跳转到首页
          // 尝试多种可能的数据结构
          const responseData = response.data.data || response.data || {};
          const token = responseData.token || responseData.access_token;
          
          console.log('提取的 token:', token ? '存在' : '不存在');
          console.log('responseData 完整内容:', JSON.stringify(responseData, null, 2));
          
          const user = {
            username: responseData.username || username,
            nickname: responseData.nickname || responseData.username || username,
            avatar: responseData.avatar || responseData.avatar_url || null,
            avatar_url: responseData.avatar_url || responseData.avatar || null,
          };
          
          console.log('注册成功，保存用户信息:', { token: !!token, user });
          
          // 检查token是否存在
          if (!token) {
            console.error('注册响应中没有token，完整响应:', response);
            setError('注册成功，但未获取到登录凭证，请重新登录');
            setLoading(false);
            return;
          }
          
          // 同时保存token和用户信息
          console.log('开始保存认证信息到 Redux...');
          dispatch(setAuthData({ token, user }));
          console.log('认证信息已保存到 Redux');
          
          // 验证 token 是否已保存到 localStorage
          setTimeout(() => {
            const savedToken = localStorage.getItem('token');
            console.log('验证 token 是否已保存:', savedToken ? '已保存' : '未保存');
          }, 100);
          
        setSuccess(true);
          
          console.log('准备跳转到首页...');
          console.log('当前 URL:', window.location.href);
          console.log('当前 hash:', window.location.hash);
          
          // 在 HashRouter 环境下，使用 sessionStorage 传递注册成功标志
          sessionStorage.setItem('registerSuccess', 'true');
          
          // 使用多种方式确保跳转成功
          setTimeout(() => {
            console.log('执行跳转到首页，当前 hash:', window.location.hash);
            
            // 方式1: 使用 navigate（可以传递 state）
            try {
              navigate('/', { state: { fromRegister: true }, replace: true });
              console.log('navigate 命令已执行');
            } catch (navError) {
              console.error('navigate 失败:', navError);
            }
            
            // 方式2: 使用 window.location.hash（HashRouter 环境）
            setTimeout(() => {
              console.log('使用 window.location.hash 跳转');
              window.location.hash = '#/';
              
              // 方式3: 如果前两种都失败，强制刷新
        setTimeout(() => {
                const currentHash = window.location.hash;
                console.log('检查跳转结果，当前 hash:', currentHash);
                if (!currentHash || currentHash === '#/register' || currentHash === '#/login') {
                  console.log('跳转未成功，强制刷新到首页');
                  window.location.href = '#/';
                }
              }, 500);
            }, 100);
          }, 200);
        } else {
          const errorMsg = response.data.message || `注册失败 (code: ${response.data.code})`;
          console.error('注册失败:', errorMsg, response.data);
          setError(errorMsg);
        }
      } else {
        console.error('注册响应格式异常:', response);
        setError('注册失败，服务器响应异常');
      }
    } catch (err) {
      console.error('注册异常:', err);
      const errorMsg = err.response?.data?.message || err.message || '注册失败，请稍后重试';
      console.error('注册错误详情:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page register-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1 className="auth-title">创建账户</h1>
          <p className="auth-subtitle">注册新账户以开始使用</p>
        </div>
        <div className="auth-form-wrapper">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">注册成功！正在跳转...</div>}
          <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
              <label htmlFor="username">用户名</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={handleUsernameChange}
              onBlur={() => validateUsername(username)}
              placeholder="请输入用户名（6-11位字母和数字组合）"
              required
              minLength="6"
              maxLength="11"
                autoComplete="username"
            />
            {usernameError && <div className="field-error-message">{usernameError}</div>}
          </div>
          <div className="form-group">
              <label htmlFor="password">密码</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={handlePasswordChange}
              onBlur={() => validatePassword(password)}
              placeholder="请输入密码（不能包含汉字）"
              required
                autoComplete="new-password"
            />
            {passwordError && <div className="field-error-message">{passwordError}</div>}
          </div>
          <div className="form-group">
              <label htmlFor="confirmPassword">确认密码</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
              required
                autoComplete="new-password"
            />
          </div>
            <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>
          <div className="auth-footer">
            <p>
              已有账号？{' '}
              <button type="button" className="auth-link-button" onClick={() => navigate('/login')}>
                立即登录
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;