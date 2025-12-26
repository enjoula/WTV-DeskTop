// pages/Favorites.js
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { fetchFavorites } from '../store/favoriteSlice';
import { logoutUser } from '../store/authSlice';
import { toggleFavorite } from '../api/user';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';
import { showCenterTip } from '../utils/tips';

const Favorites = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
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

  const handleToggleFavorite = async (videoId, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // 在收藏页面，所有视频都是已收藏状态，所以点击就是取消收藏
    const wasFavorite = true;
    
    try {
      const response = await toggleFavorite(videoId);
      const resData = response?.data || {};
      const code = resData.code;

      if (code === 0) {
        // 成功：根据状态提示用户，并更新收藏列表
        const isFavFromData =
          resData?.data?.is_favorite ??
          resData?.is_favorite;

        // 根据状态显示相应提示（在收藏页，取消收藏后会从列表中移除）
        if (isFavFromData === false || isFavFromData === undefined) {
          // 取消收藏成功
          showCenterTip('取消收藏成功', 1500);
        } else {
          // 理论上不应该出现，但如果返回已收藏，也显示相应提示
          showCenterTip('收藏成功', 1500);
        }
        // 重新获取收藏列表，从第一页开始
        setPage(1);
        dispatch(fetchFavorites({ page: 1, size: 20 }));
      } else if (code === 401) {
        // 401：账号在其他设备登录
        showCenterTip('账号在其它设备登录，当前设备已下线', 1500);
        // 延迟跳转，让用户看到提示
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        // 400：视频ID不能为空
        showCenterTip('视频ID不能为空！', 1500);
        // 页面不做任何变更
      } else if (code === 500) {
        // 500：操作过快
        showCenterTip('操作过快，请稍后重试！', 1500);
      } else {
        // 其他错误
        const errorMsg = resData.message || '操作失败，请稍后重试';
        showCenterTip(errorMsg, 1500);
      }
    } catch (err) {
      console.error('切换收藏状态失败:', err);
      const resData = err?.response?.data || {};
      const code = resData.code;

      if (code === 401) {
        showCenterTip('账号在其它设备登录，当前设备已下线', 1500);
        setTimeout(() => {
          dispatch(logoutUser()).then(() => {
            navigate('/login');
          });
        }, 1000);
      } else if (code === 400) {
        showCenterTip('视频ID不能为空！', 1500);
      } else if (code === 500) {
        showCenterTip('操作过快，请稍后重试！', 1500);
      } else {
        const errorMsg = resData.message || err?.message || '操作失败，请稍后重试';
        showCenterTip(errorMsg, 1500);
      }
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
                    <div 
                      onClick={() => {
                        // 在新窗口打开视频详情页
                        if (window.electronAPI && window.electronAPI.openVideoWindow) {
                          window.electronAPI.openVideoWindow(video.id, video);
                        }
                      }}
                      className="favorite-card-link"
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="favorite-card-image">
                        <VideoImage src={video.cover_url} alt={video.title} />
                        {(video.is_update === 1 || video.is_update === true || video.is_new === 1 || video.is_new === true) && <span className="new-badge">新</span>}
                        {(video.score || video.rating) && (
                          <div className="video-rating-overlay">
                            <StarRating score={parseFloat(video.score || video.rating || 0)} />
                          </div>
                        )}
                        {/* 收藏爱心 - 收藏页的视频都是已收藏状态 */}
                        <div
                          className="favorite-card-favorite"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(video.id, e);
                          }}
                          title="取消收藏"
                        >
                          <span className="favorite-card-favorite-icon favorited">
                            ❤️
                          </span>
                        </div>
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
                    </div>
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