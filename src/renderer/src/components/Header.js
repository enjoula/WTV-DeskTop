// components/Header.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logoutUser } from '../store/authSlice';

const Header = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector(state => state.auth);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    dispatch(logoutUser()).then(() => {
      navigate('/login');
    });
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <Link to="/" className="logo">
          <img 
            src="/logo.svg" 
            alt="看视频 - WTV" 
            className="logo-image"
            onError={(e) => {
              // 如果logo.svg不存在，隐藏图片，只显示文字
              e.target.style.display = 'none';
            }}
          />
          <h1>看视频</h1>
        </Link>
        
        <nav className="main-nav">
          <Link to="/videos/movies">电影</Link>
          <Link to="/videos/tv">电视剧</Link>
          <Link to="/videos/anime">动漫</Link>
          <Link to="/videos/tvshow">综艺</Link>
          <Link to="/videos/documentary">纪录片</Link>
        </nav>
        
        <div className="header-actions">
          <Link to="/search" className="search-link">
            搜索
          </Link>
          
          {isAuthenticated ? (
            <div className="user-menu">
              <div className="user-dropdown">
                <button className="user-dropdown-toggle" onClick={toggleMenu}>
                  欢迎, {user?.nickname || user?.username}
                </button>
                {isMenuOpen && (
                  <div className="user-dropdown-menu">
                    <Link to="/favorites" onClick={toggleMenu}>我的收藏</Link>
                    <Link to="/profile" onClick={toggleMenu}>个人中心</Link>
                    <button onClick={() => { handleLogout(); toggleMenu(); }}>退出</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="auth-links">
              <Link to="/login">登录</Link>
              <Link to="/register">注册</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;