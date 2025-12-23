// pages/Register.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { register as registerUser } from '../api/user';
import { setToken } from '../store/authSlice';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 基本验证
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    
    if (password.length < 6) {
      setError('密码长度至少6位');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await registerUser({ username, password });
      if (response.data.code === 200) {
        // 注册成功，保存token并跳转到首页
        dispatch(setToken(response.data.data.token));
        setSuccess(true);
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setError(response.data.message || '注册失败');
      }
    } catch (err) {
      setError(err.response?.data?.message || '注册失败，请稍后重试');
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
              onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名（至少3个字符）"
              required
              minLength="3"
                autoComplete="username"
            />
          </div>
          <div className="form-group">
              <label htmlFor="password">密码</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码（至少6个字符）"
              required
              minLength="6"
                autoComplete="new-password"
            />
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