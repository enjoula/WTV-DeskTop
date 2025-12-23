// pages/Favorites.js
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchFavorites } from '../store/favoriteSlice';
import { toggleFavorite } from '../api/user';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';

const Favorites = () => {
  const dispatch = useDispatch();
  const { favorites } = useSelector(state => state.favorite);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // 获取收藏列表
    dispatch(fetchFavorites({ page, size: 20 })); // API文档使用 size 而不是 page_size
  }, [dispatch, page]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    // 直接 dispatch，不更新 page state，避免触发 useEffect
    dispatch(fetchFavorites({ page: nextPage, size: 20 })).then(() => {
      // 请求成功后再更新 page state
    setPage(nextPage);
    });
  };

  const handleRemoveFavorite = async (videoId, event) => {
    try {
      // 添加动画类名以触发点击效果
      const button = event.target;
      button.classList.add('remove-click-animation');
      
      await toggleFavorite(videoId);
      // 重新获取收藏列表，从第一页开始
      setPage(1);
      dispatch(fetchFavorites({ page: 1, size: 20 }));
    } catch (err) {
      console.error('取消收藏失败:', err);
      alert('取消收藏失败，请稍后重试');
    }
  };

  return (
    <div className="favorites-page">
      <div className="favorites-header">
        <h1>我的收藏</h1>
        <div className="favorites-stats">共 {favorites.data.length} 个收藏</div>
      </div>
      
      {favorites.error && <div className="error-message">{favorites.error}</div>}
      
      {favorites.loading && favorites.data.length === 0 ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          {favorites.data.length === 0 ? (
            <div className="empty-favorites">
              <div className="empty-favorites-icon">♡</div>
              <div className="empty-favorites-text">您还没有收藏任何视频</div>
              <Link to="/" className="go-browse-button">
                去浏览视频
              </Link>
            </div>
          ) : (
            <div className="favorites-content">
              <div className="favorites-grid">
                {favorites.data.map(video => (
                  <div key={video.id} className="favorite-card">
                    <Link 
                      to={`/video/${video.id}`} 
                      state={{ video }} // 传递完整的视频信息
                      className="favorite-card-link"
                    >
                      <div className="favorite-card-image">
                        <VideoImage src={video.cover_url} alt={video.title} />
                        {(video.is_update === 1 || video.is_update === true || video.is_new === 1 || video.is_new === true) && <span className="new-badge">新</span>}
                        {(video.score || video.rating) && (
                          <div className="video-rating-overlay">
                            <StarRating score={parseFloat(video.score || video.rating || 0)} />
                          </div>
                        )}
                        <button 
                          className="favorite-remove"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRemoveFavorite(video.id, e);
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div className="favorite-card-content">
                        <h3 className="favorite-card-title">{video.title}</h3>
                        <div className="favorite-card-meta">
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
                ))}
              </div>
              
              {favorites.loading && favorites.data.length > 0 && (
                <div className="loading">加载中...</div>
              )}
              
              {!favorites.loading && favorites.pagination && favorites.pagination.has_next && (
                <div className="load-more-container">
                  <button 
                    className="load-more-button"
                    onClick={handleLoadMore} 
                    disabled={favorites.loading}
                  >
                    {favorites.loading ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Favorites;