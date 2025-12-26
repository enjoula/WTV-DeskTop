// pages/Search.js
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { searchVideoList, clearSearchResults } from '../store/videoSlice';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';
import './SearchPage.css';

const Search = () => {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const { searchResults } = useSelector(state => state.video);
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [hasSearched, setHasSearched] = useState(false); // 跟踪是否执行过搜索
  const SEARCH_PAGE_SIZE = 10; // 每页最大 10 条

  useEffect(() => {
    // 如果URL中有搜索关键词，则执行搜索
    const query = searchParams.get('q');
    if (query) {
      setKeyword(query);
      setHasSearched(true);
      dispatch(searchVideoList({ keyword: query, page: 1, size: SEARCH_PAGE_SIZE }));
    } else {
      setHasSearched(false);
    }
    
    // 清理搜索结果
    return () => {
      dispatch(clearSearchResults());
    };
  }, [searchParams, dispatch]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (keyword.trim()) {
      setHasSearched(true);
      dispatch(searchVideoList({ keyword, page: 1, size: SEARCH_PAGE_SIZE }));
    }
  };

  const handleClear = () => {
    setKeyword('');
    setHasSearched(false);
    dispatch(clearSearchResults());
  };

  const renderResults = () => {
    const results = searchResults.data || [];
    
    if (searchResults.loading) {
      return <div className="loading">加载中...</div>;
    }
    
    if (searchResults.error) {
      return <div className="error-message">{searchResults.error}</div>;
    }
    
    if (results.length > 0) {
      return (
        <div className="search-results-new">
          <div className="video-grid">
            {results.map(video => (
              <div key={video.id || video.title} className="video-card">
                <div 
                  onClick={() => {
                    // 在新窗口打开视频详情页
                    if (window.electronAPI && window.electronAPI.openVideoWindow) {
                      window.electronAPI.openVideoWindow(video.id, video);
                    }
                  }}
                  className="video-card-link"
                  style={{ cursor: 'pointer' }}
                >
                  <div className="video-card-image">
                    <VideoImage src={video.cover_url || video.pic} alt={video.title || video.name} />
                    {(video.is_update === 1 || video.is_update === true || video.is_new === 1 || video.is_new === true) && <span className="new-badge">新</span>}
                    {(video.score || video.rating) && (
                      <div className="video-rating-overlay">
                        <StarRating score={parseFloat(video.score || video.rating || 0)} />
                      </div>
                    )}
                  </div>
                  <div className="video-card-content">
                    <h3 className="video-title">{video.title || video.name}</h3>
                    <div className="video-card-meta">
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
        </div>
      );
    }
    
    // 只有当真正执行过搜索且没有结果时，才显示"没有找到"的提示
    if (hasSearched && keyword && !searchResults.loading && results.length === 0) {
      return (
        <div className="no-results">
          <p>没有找到与 "{keyword}" 相关的视频</p>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="search-page-new">
      {/* 顶部搜索栏 */}
      <div className="search-bar">
        <form onSubmit={handleSearch} className="search-bar-form">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索电影 / 演员名称"
          />
          {keyword && <button type="button" className="mic-btn" onClick={handleClear}>✖</button>}
        </form>
      </div>

      {/* 结果区域 */}
      {renderResults()}
    </div>
  );
};

export default Search;