// pages/Login.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, fetchCurrentUser } from '../store/authSlice';
import { fetchMovies, fetchTVShows, fetchAnime } from '../store/videoSlice';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error, isAuthenticated, user } = useSelector(state => state.auth);

  useEffect(() => {
    if (isAuthenticated) {
      // 登录成功后，刷新视频列表数据
      console.log('登录成功，刷新视频列表数据...');
      dispatch(fetchMovies({ page: 1, size: 10 }));
      dispatch(fetchTVShows({ page: 1, size: 10 }));
      dispatch(fetchAnime({ page: 1, size: 10 }));
      // 获取用户信息（仅在缺失时请求，避免重复调用 /user/me）
      if (!user) {
        dispatch(fetchCurrentUser());
      }
      // 不再自动获取收藏列表，只在用户进入收藏列表页面时获取

      // 登录成功后优先回到来源页面（如视频详情页），否则回首页
      const from = location.state?.from;
      const fallbackRedirect = sessionStorage.getItem('postLoginRedirect');
      let redirectTarget = '/';
      if (typeof from === 'string' && from) {
        redirectTarget = from;
      } else if (from && typeof from === 'object') {
        const pathname = from.pathname || '/';
        const search = from.search || '';
        const hash = from.hash || '';
        redirectTarget = `${pathname}${search}${hash}`;
      } else if (fallbackRedirect && fallbackRedirect.startsWith('/')) {
        // 兜底：处理全局 401 跳转到登录页的场景，保持回到当前详情页
        redirectTarget = fallbackRedirect;
      }

      sessionStorage.removeItem('postLoginRedirect');

      // 延迟跳转，确保数据已刷新
      setTimeout(() => {
        navigate(redirectTarget, { replace: true });
      }, 100);
    }
  }, [isAuthenticated, user, navigate, dispatch, location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // device参数会在API层自动检测，无需手动传递
    const result = await dispatch(loginUser({ username, password }));
    
    // 登录后用户信息由上面的 useEffect 统一处理，避免重复请求 /user/me
    if (result.type === 'auth/loginUser/fulfilled') {
      // 不再自动获取收藏列表，只在用户进入收藏列表页面时获取
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