// pages/Home.js
import React, { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom'; // Link 仍然用于"查看更多"链接
import { useSelector, useDispatch } from 'react-redux';
import { fetchMovies, fetchTVShows, fetchAnime } from '../store/videoSlice';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';
import { showCenterTip } from '../utils/tips';
import PlatformIcon from '../components/PlatformIcon';

// 使用全局标记防止 React.StrictMode 导致的重复调用
if (!window.__homeDataFetched) {
  window.__homeDataFetched = { movies: false, tvShows: false, anime: false };
}

const Home = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const { movies, tvShows, anime } = useSelector(state => {
    console.log('Redux state 更新:', state);
    return state.video;
  });
  const fetchingRef = useRef({ movies: false, tvShows: false, anime: false }); // 防止同时发起多个请求

  // 检查是否从注册页面跳转过来
  useEffect(() => {
    // 检查 location state 或 sessionStorage
    const fromRegister = location.state?.fromRegister || sessionStorage.getItem('registerSuccess');
    
    if (fromRegister) {
      // 在应用正中心显示注册成功提示，显示时长3秒
      showCenterTip('注册成功，并进入系统');
      // 清除标志，避免刷新后重复显示
      sessionStorage.removeItem('registerSuccess');
      // 清除 location state
      if (location.state?.fromRegister) {
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state]);

  useEffect(() => {
    console.log('首页组件挂载，开始获取视频列表数据...');
    console.log('当前Redux状态:', { 
      movies: { dataLength: movies.data?.length, loading: movies.loading },
      tvShows: { dataLength: tvShows.data?.length, loading: tvShows.loading },
      anime: { dataLength: anime.data?.length, loading: anime.loading }
    });
    
    // 只在数据不存在且不在加载中时获取，避免重复调用
    // 使用全局标记和 Redux 状态双重检查，防止 React.StrictMode 导致的重复调用
    if ((!movies.data || movies.data.length === 0) && !movies.loading && !fetchingRef.current.movies && !window.__homeDataFetched.movies) {
      fetchingRef.current.movies = true;
      window.__homeDataFetched.movies = true;
      console.log('开始获取电影列表...');
    dispatch(fetchMovies({ page: 1, size: 10 })) // API文档使用 size 而不是 page_size
      .then(result => {
        console.log('电影列表获取成功:', result);
          fetchingRef.current.movies = false;
      })
      .catch(error => {
        console.error('电影列表获取失败:', error);
          fetchingRef.current.movies = false;
          window.__homeDataFetched.movies = false; // 失败时重置标记，允许重试
      });
    } else {
      console.log('电影列表已存在或正在加载，跳过调用', {
        hasData: movies.data?.length > 0,
        loading: movies.loading,
        fetching: fetchingRef.current.movies,
        globalFetched: window.__homeDataFetched.movies
      });
    }
      
    if ((!tvShows.data || tvShows.data.length === 0) && !tvShows.loading && !fetchingRef.current.tvShows && !window.__homeDataFetched.tvShows) {
      fetchingRef.current.tvShows = true;
      window.__homeDataFetched.tvShows = true;
      console.log('开始获取电视剧列表...');
    dispatch(fetchTVShows({ page: 1, size: 10 })) // API文档使用 size 而不是 page_size
      .then(result => {
        console.log('电视剧列表获取成功:', result);
          fetchingRef.current.tvShows = false;
      })
      .catch(error => {
        console.error('电视剧列表获取失败:', error);
          fetchingRef.current.tvShows = false;
          window.__homeDataFetched.tvShows = false; // 失败时重置标记，允许重试
      });
    } else {
      console.log('电视剧列表已存在或正在加载，跳过调用', {
        hasData: tvShows.data?.length > 0,
        loading: tvShows.loading,
        fetching: fetchingRef.current.tvShows,
        globalFetched: window.__homeDataFetched.tvShows
      });
    }
      
    if ((!anime.data || anime.data.length === 0) && !anime.loading && !fetchingRef.current.anime && !window.__homeDataFetched.anime) {
      fetchingRef.current.anime = true;
      window.__homeDataFetched.anime = true;
      console.log('开始获取动漫列表...');
    dispatch(fetchAnime({ page: 1, size: 10 })) // API文档使用 size 而不是 page_size
      .then(result => {
        console.log('动漫列表获取成功:', result);
          fetchingRef.current.anime = false;
      })
      .catch(error => {
        console.error('动漫列表获取失败:', error);
          fetchingRef.current.anime = false;
          window.__homeDataFetched.anime = false; // 失败时重置标记，允许重试
        });
    } else {
      console.log('动漫列表已存在或正在加载，跳过调用', {
        hasData: anime.data?.length > 0,
        loading: anime.loading,
        fetching: fetchingRef.current.anime,
        globalFetched: window.__homeDataFetched.anime
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]); // 只依赖 dispatch，避免因数据变化导致重复调用

  // 添加渲染调试信息
  console.log('Home组件渲染，movies数据:', movies);
  console.log('Home组件渲染，tvShows数据:', tvShows);
  console.log('Home组件渲染，anime数据:', anime);

  const renderVideoList = (title, videos, category) => {
    // 检查videos对象是否存在且有data属性
    if (!videos || !videos.data || !Array.isArray(videos.data)) {
      console.log(`Warning: Invalid videos data for ${title}`, videos);
      return null;
    }
    
    return (
      <div className="video-section">
        <div className="section-header">
          <h2>{title}</h2>
          <Link to={`/videos/${category}`} className="view-more-link">
            更多 &gt;
          </Link>
        </div>
        <div className="video-grid">
          {videos.data.slice(0, 8).map(video => {
            // 检查video对象是否存在必要属性
            if (!video || !video.id) {
              console.log('Warning: Invalid video object', video);
              return null;
            }
            
            return (
              <div key={video.id} className="video-card">
                <div 
                  onClick={() => {
                    // 在新窗口打开视频详情页
                    if (window.electronAPI && window.electronAPI.openVideoWindow) {
                      window.electronAPI.openVideoWindow(video.id, video);
                    } else {
                      // 降级处理：如果没有 Electron API，使用 navigate（开发环境可能用到）
                      navigate(`/video/${video.id}`, { state: { video } });
                    }
                  }}
                  className="video-card-link"
                  style={{ cursor: 'pointer' }}
                >
                  <div className="video-card-image">
                    <VideoImage src={video.cover_url} alt={video.title || '视频封面'} />
                    {(video.is_update === 1 || video.is_update === true || video.is_new === 1 || video.is_new === true) && <span className="new-badge">新</span>}
                    {(video.score || video.rating) && (
                      <div className="video-rating-overlay">
                        <StarRating score={parseFloat(video.score || video.rating || 0)} />
                      </div>
                    )}
                  </div>
                  <div className="video-card-content">
                    <h3 className="video-title">{video.title || '无标题'}</h3>
                    <div className="video-card-meta">
                      {video.release_date && (
                        <div className="video-release-date">
                          <span className="meta-label">首映:</span> <span className="meta-value">{video.release_date}</span>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="home-page">
      <div className="hero-section">
        <h1>欢迎来到WTV</h1>
        <p>发现最新最热的影视作品，随时随地享受观影乐趣</p>
      </div>
      
      {renderVideoList('热门电影', movies, 'movies')}
      {renderVideoList('热播电视剧', tvShows, 'tv')}
      {renderVideoList('热门动漫', anime, 'anime')}
      
      <div className="quick-links">
        <h2>快速导航</h2>
        <div className="links-grid">
          <Link to="/videos/tvshow" className="quick-link-card">
            <PlatformIcon className="link-icon" iconName="tv" fallback="📺" />
            <span>综艺</span>
          </Link>
          <Link to="/videos/documentary" className="quick-link-card">
            <PlatformIcon className="link-icon" iconName="documentary" fallback="🎬" />
            <span>纪录片</span>
          </Link>
          <Link to="/search" className="quick-link-card">
            <PlatformIcon className="link-icon" iconName="search" fallback="🔍" />
            <span>搜索</span>
          </Link>
          <Link to="/favorites" className="quick-link-card">
            <PlatformIcon className="link-icon" iconName="favorite" fallback="❤️" />
            <span>我的收藏</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;