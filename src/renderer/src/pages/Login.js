// pages/Login.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, fetchCurrentUser } from '../store/authSlice';
import { fetchMovies, fetchTVShows, fetchAnime } from '../store/videoSlice';
import { fetchFavorites } from '../store/favoriteSlice';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated } = useSelector(state => state.auth);

  useEffect(() => {
    if (isAuthenticated) {
      // 登录成功后，刷新视频列表数据
      console.log('登录成功，刷新视频列表数据...');
      dispatch(fetchMovies({ page: 1, size: 10 }));
      dispatch(fetchTVShows({ page: 1, size: 10 }));
      dispatch(fetchAnime({ page: 1, size: 10 }));
      // 获取用户信息和收藏列表
      dispatch(fetchCurrentUser());
      dispatch(fetchFavorites());
      
      // 延迟跳转，确保数据已刷新
      setTimeout(() => {
      navigate('/');
      }, 100);
    }
  }, [isAuthenticated, navigate, dispatch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // device参数会在API层自动检测，无需手动传递
    const result = await dispatch(loginUser({ username, password }));
    
    // 登录成功后，立即获取用户信息
    if (result.type === 'auth/loginUser/fulfilled') {
      dispatch(fetchCurrentUser());
      dispatch(fetchFavorites());
    }
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