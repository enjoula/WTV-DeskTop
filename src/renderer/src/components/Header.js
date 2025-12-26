// components/Header.js
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logoutUser, fetchCurrentUser } from '../store/authSlice';
import { fetchFavorites } from '../store/favoriteSlice';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector(state => state.auth);
  const { currentCategory } = useSelector(state => state.video || {});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleLogout = () => {
    dispatch(logoutUser()).then(() => {
      navigate('/login');
    });
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // 应用启动时，如果用户已登录但没有用户信息，自动获取用户信息
  React.useEffect(() => {
    if (isAuthenticated && !user) {
      dispatch(fetchCurrentUser()).catch(err => {
        console.error('获取用户信息失败:', err);
      });
    }
  }, [isAuthenticated, user, dispatch]);

  // 登录后拉取一次用户收藏列表，避免详情页无法识别已收藏状态
  // 使用 ref 避免重复调用
  const hasFetchedFavoritesRef = React.useRef(false);
  React.useEffect(() => {
    if (isAuthenticated && user && !hasFetchedFavoritesRef.current) {
      hasFetchedFavoritesRef.current = true;
      dispatch(fetchFavorites({ page: 1, size: 50 }));
    }
    // 如果用户登出，重置标志
    if (!isAuthenticated) {
      hasFetchedFavoritesRef.current = false;
    }
  }, [isAuthenticated, user, dispatch]);

  // 点击外部区域关闭菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMenuOpen && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      // 添加事件监听器
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    // 清理函数：移除事件监听器
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMenuOpen]);

  const isActive = (path) => {
    const { pathname } = location;
    // 列表页：严格匹配自身路径或其子路径，避免 /videos/tv 和 /videos/tvshow 同时高亮
    if (pathname === path || pathname.startsWith(`${path}/`)) return true;
    // 详情页：根据当前记录的分类高亮
    if (pathname.startsWith('/video/') && currentCategory) {
      if (path === '/videos/movies' && currentCategory === 'movies') return true;
      if (path === '/videos/tv' && currentCategory === 'tv') return true;
      if (path === '/videos/anime' && currentCategory === 'anime') return true;
      if (path === '/videos/tvshow' && currentCategory === 'tvshow') return true;
      if (path === '/videos/documentary' && currentCategory === 'documentary') return true;
    }
    return false;
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
          <Link to="/videos/movies" className={isActive('/videos/movies') ? 'active' : ''}>
            <span className="nav-icon">🎬</span>
            <span className="nav-text">电影</span>
          </Link>
          <Link to="/videos/tv" className={isActive('/videos/tv') ? 'active' : ''}>
            <span className="nav-icon">📺</span>
            <span className="nav-text">电视剧</span>
          </Link>
          <Link to="/videos/anime" className={isActive('/videos/anime') ? 'active' : ''}>
            <span className="nav-icon">🎨</span>
            <span className="nav-text">动漫</span>
          </Link>
          <Link to="/videos/tvshow" className={isActive('/videos/tvshow') ? 'active' : ''}>
            <span className="nav-icon">🎪</span>
            <span className="nav-text">综艺</span>
          </Link>
          <Link to="/videos/documentary" className={isActive('/videos/documentary') ? 'active' : ''}>
            <span className="nav-icon">📽️</span>
            <span className="nav-text">纪录片</span>
          </Link>
        </nav>
        
        <div className="header-actions">
          <Link to="/search" className="search-link" aria-label="搜索">
            <span className="search-icon-header">🔍</span>
          </Link>
          
          {isAuthenticated ? (
            <div className="user-menu">
              <div className="user-dropdown" ref={dropdownRef}>
                <button className="user-dropdown-toggle" onClick={toggleMenu}>
                  <div className="user-toggle-content">
                    <div className="user-avatar">
                      {user?.avatar_url || user?.avatar ? (
                        <img
                          src={user.avatar_url || user.avatar}
                          alt={user?.nickname || user?.username || '用户头像'}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <span>
                          {(user?.nickname || user?.username || '用')[0]}
                        </span>
                      )}
                    </div>
                    <span className="user-name">
                      {user?.nickname || user?.username || '用户'}
                    </span>
                  </div>
                </button>
                {isMenuOpen && (
                  <div className="user-dropdown-menu">
                    <Link to="/profile" onClick={toggleMenu}>个人中心</Link>
                    <Link to="/favorites" onClick={toggleMenu}>我的收藏</Link>
                    <Link to="/play-history" onClick={toggleMenu}>播放记录</Link>
                    <button onClick={() => { handleLogout(); toggleMenu(); }}>退出登录</button>
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