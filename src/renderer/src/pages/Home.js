// pages/Home.js
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchMovies, fetchTVShows, fetchAnime } from '../store/videoSlice';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';

const Home = () => {
  const dispatch = useDispatch();
  const { movies, tvShows, anime } = useSelector(state => {
    console.log('Redux state 更新:', state);
    return state.video;
  });

  useEffect(() => {
    console.log('首页组件挂载，开始获取视频列表数据...');
    console.log('当前Redux状态:', { movies, tvShows, anime });
    
    // 获取各类视频列表
    dispatch(fetchMovies({ page: 1, size: 10 })) // API文档使用 size 而不是 page_size
      .then(result => {
        console.log('电影列表获取成功:', result);
      })
      .catch(error => {
        console.error('电影列表获取失败:', error);
      });
      
    dispatch(fetchTVShows({ page: 1, size: 10 })) // API文档使用 size 而不是 page_size
      .then(result => {
        console.log('电视剧列表获取成功:', result);
      })
      .catch(error => {
        console.error('电视剧列表获取失败:', error);
      });
      
    dispatch(fetchAnime({ page: 1, size: 10 })) // API文档使用 size 而不是 page_size
      .then(result => {
        console.log('动漫列表获取成功:', result);
      })
      .catch(error => {
        console.error('动漫列表获取失败:', error);
      });
  }, [dispatch]);

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
                <Link 
                  to={`/video/${video.id}`} 
                  state={{ video }} // 传递完整的视频信息
                  className="video-card-link"
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
                          <span className="meta-label">上映:</span>
                          <span className="meta-value">{video.release_date}</span>
                      </div>
                    )}
                    </div>
                  </div>
                </Link>
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
        <h1>欢迎来到看视频</h1>
        <p>发现最新最热的影视作品，随时随地享受观影乐趣</p>
      </div>
      
      {renderVideoList('热门电影', movies, 'movies')}
      {renderVideoList('热播电视剧', tvShows, 'tv')}
      {renderVideoList('热门动漫', anime, 'anime')}
      
      <div className="quick-links">
        <h2>快速导航</h2>
        <div className="links-grid">
          <Link to="/videos/tvshow" className="quick-link-card">
            <div className="link-icon">📺</div>
            <span>综艺</span>
          </Link>
          <Link to="/videos/documentary" className="quick-link-card">
            <div className="link-icon">🎬</div>
            <span>纪录片</span>
          </Link>
          <Link to="/search" className="quick-link-card">
            <div className="link-icon">🔍</div>
            <span>搜索</span>
          </Link>
          <Link to="/favorites" className="quick-link-card">
            <div className="link-icon">❤️</div>
            <span>我的收藏</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;