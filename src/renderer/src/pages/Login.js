// pages/Login.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser } from '../store/authSlice';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated } = useSelector(state => state.auth);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    // 确保传递 device 参数
    dispatch(loginUser({ username, password, device: 'PC-Electron' }));
  };

  const handleRegisterRedirect = () => {
    navigate('/register');
  };

  return (
    <div className="auth-page login-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1 className="auth-title">欢迎回来</h1>
          <p className="auth-subtitle">登录您的账户以继续</p>
        </div>
        <div className="auth-form-wrapper">
        {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
              <label htmlFor="username">用户名</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
              required
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
                placeholder="请输入密码"
              required
                autoComplete="current-password"
            />
          </div>
            <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
          <div className="auth-footer">
            <p>
              还没有账号？{' '}
              <button type="button" className="auth-link-button" onClick={handleRegisterRedirect}>
                立即注册
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;