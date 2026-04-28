// pages/Search.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { searchVideoList, clearSearchResults } from '../store/videoSlice';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';
import PlatformIcon from '../components/PlatformIcon';
import './SearchPage.css';

const SEARCH_HISTORY_KEY = 'wtv_search_history';
const MAX_SEARCH_HISTORY = 10;

// 获取搜索历史记录
const getSearchHistory = () => {
  try {
    const history = localStorage.getItem(SEARCH_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('获取搜索历史失败:', error);
    return [];
  }
};

// 保存搜索关键字到历史记录
const saveSearchKeyword = (keyword) => {
  if (!keyword || !keyword.trim()) return;
  
  try {
    const trimmedKeyword = keyword.trim();
    let history = getSearchHistory();
    
    // 移除已存在的相同关键字
    history = history.filter(item => item !== trimmedKeyword);
    
    // 将新关键字添加到最前面
    history.unshift(trimmedKeyword);
    
    // 只保留最近10个
    history = history.slice(0, MAX_SEARCH_HISTORY);
    
    // 保存到localStorage
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('保存搜索历史失败:', error);
  }
};

// 删除搜索历史记录
const deleteSearchHistory = (keyword) => {
  try {
    let history = getSearchHistory();
    history = history.filter(item => item !== keyword);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('删除搜索历史失败:', error);
  }
};

// 清空搜索历史记录
const clearSearchHistory = () => {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (error) {
    console.error('清空搜索历史失败:', error);
  }
};

const Search = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { searchResults } = useSelector(state => state.video);
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [hasSearched, setHasSearched] = useState(false); // 跟踪是否执行过搜索
  const [searchHistory, setSearchHistory] = useState([]); // 搜索历史记录
  const loadingRef = useRef(false); // 防止重复加载
  const observerTarget = useRef(null); // Intersection Observer 的目标元素
  const SEARCH_PAGE_SIZE = 10; // 每页最大 10 条

  // 加载搜索历史记录
  useEffect(() => {
    const history = getSearchHistory();
    setSearchHistory(history);
  }, []);

  useEffect(() => {
    // 如果URL中有搜索关键词，则执行搜索
    const query = searchParams.get('q');
    if (query) {
      setKeyword(query);
      setHasSearched(true);
      // 搜索新关键词时，先清空之前的结果
      dispatch(clearSearchResults());
      // 重置加载状态
      loadingRef.current = false;
      dispatch(searchVideoList({ keyword: query, page: 1, size: SEARCH_PAGE_SIZE }));
      // 保存搜索关键字到历史记录
      saveSearchKeyword(query);
      // 更新搜索历史状态
      setSearchHistory(getSearchHistory());
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
      // 搜索新关键词时，先清空之前的结果
      dispatch(clearSearchResults());
      // 重置加载状态
      loadingRef.current = false;
      dispatch(searchVideoList({ keyword, page: 1, size: SEARCH_PAGE_SIZE }));
      // 保存搜索关键字到历史记录
      saveSearchKeyword(keyword);
      // 更新搜索历史状态
      setSearchHistory(getSearchHistory());
    }
  };

  // 点击历史记录进行搜索
  const handleHistoryClick = (historyKeyword) => {
    setKeyword(historyKeyword);
    setHasSearched(true);
    // 搜索新关键词时，先清空之前的结果
    dispatch(clearSearchResults());
    // 重置加载状态
    loadingRef.current = false;
    dispatch(searchVideoList({ keyword: historyKeyword, page: 1, size: SEARCH_PAGE_SIZE }));
    // 保存搜索关键字到历史记录（会移到最前面）
    saveSearchKeyword(historyKeyword);
    // 更新搜索历史状态
    setSearchHistory(getSearchHistory());
  };

  // 删除单个历史记录
  const handleDeleteHistory = (e, historyKeyword) => {
    e.stopPropagation(); // 阻止事件冒泡
    deleteSearchHistory(historyKeyword);
    setSearchHistory(getSearchHistory());
  };

  // 清空所有历史记录
  const handleClearHistory = () => {
    clearSearchHistory();
    setSearchHistory([]);
  };

  const handleClear = () => {
    setKeyword('');
    setHasSearched(false);
    dispatch(clearSearchResults());
  };

  // 懒加载：加载更多数据
  const loadMore = useCallback(() => {
    // 防止重复加载
    if (loadingRef.current || searchResults.loading || !keyword.trim()) {
      return;
    }

    const pagination = searchResults.pagination || {};
    const hasNext = pagination.has_next !== undefined ? pagination.has_next : 
                   (pagination.total > 0 ? searchResults.data.length < pagination.total : true);
    
    // 如果没有下一页，不加载
    if (!hasNext) {
      return;
    }

    console.log('搜索列表懒加载触发，加载更多数据');
    loadingRef.current = true;

    const nextPage = (pagination.page || 1) + 1;
    console.log('加载搜索结果的下一页:', nextPage);
    
    dispatch(searchVideoList({ keyword, page: nextPage, size: SEARCH_PAGE_SIZE })).finally(() => {
      loadingRef.current = false;
    });
  }, [keyword, searchResults, dispatch]);

  // 懒加载：使用 Intersection Observer 监听滚动到底部
  useEffect(() => {
    const pagination = searchResults.pagination || {};
    const hasNext = pagination.has_next !== undefined ? pagination.has_next : 
                   (pagination.total > 0 ? searchResults.data.length < pagination.total : true);
    
    // 如果没有下一页或正在加载，不设置观察器
    const targetElement = observerTarget.current;
    if (!hasNext || searchResults.loading || !targetElement || !hasSearched) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // 当目标元素进入视口时，触发加载
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      {
        root: null, // 使用视口作为根
        rootMargin: '100px', // 提前100px开始加载
        threshold: 0.1
      }
    );

    observer.observe(targetElement);

    return () => {
      if (targetElement) {
        observer.unobserve(targetElement);
      }
    };
  }, [searchResults.pagination, searchResults.loading, searchResults.data.length, hasSearched, loadMore]);

  const renderResults = () => {
    const results = searchResults.data || [];
    
    if (searchResults.loading && results.length === 0) {
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
                    } else {
                      // 降级处理：如果没有 Electron API，使用 navigate（开发环境可能用到）
                      navigate(`/video/${video.id}`, { state: { video } });
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
                          <span className="meta-label">首映:</span> <span className="meta-value">{video.release_date}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* 懒加载指示器 */}
          {results.length > 0 && (
            <>
              {/* 加载中的提示 */}
              {searchResults.loading && (
                <div className="loading" style={{ padding: '20px', textAlign: 'center' }}>
                  加载中...
                </div>
              )}
              
              {/* Intersection Observer 目标元素 */}
              {(() => {
                const pagination = searchResults.pagination || {};
                const hasNext = pagination.has_next !== undefined ? pagination.has_next : 
                               (pagination.total > 0 ? results.length < pagination.total : true);
                
                if (!hasNext) {
                  return (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                      已加载全部
                    </div>
                  );
                }
                
                // 返回一个不可见的观察目标元素
                return (
                  <div 
                    ref={observerTarget}
                    style={{ 
                      height: '20px', 
                      width: '100%',
                      visibility: 'hidden'
                    }}
                  />
                );
              })()}
            </>
          )}
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
          <PlatformIcon className="search-icon" iconName="search" fallback="🔍" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索电影 / 演员名称"
          />
          {keyword && <button type="button" className="mic-btn" onClick={handleClear}>✖</button>}
        </form>
        </div>
      
      {/* 搜索历史记录 */}
      {!hasSearched && searchHistory.length > 0 && (
        <div className="search-history">
          <div className="search-history-header">
            <span className="search-history-title">最近搜索</span>
            <button 
              type="button" 
              className="clear-history-btn" 
              onClick={handleClearHistory}
            >
              清空
            </button>
          </div>
          <div className="search-history-list">
            {searchHistory.map((item, index) => (
              <div key={index} className="search-history-item">
                <button
                  type="button"
                  className="search-history-keyword"
                  onClick={() => handleHistoryClick(item)}
                >
                  {item}
                </button>
                <button
                  type="button"
                  className="search-history-delete"
                  onClick={(e) => handleDeleteHistory(e, item)}
                  title="删除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 结果区域 */}
      {renderResults()}
    </div>
  );
};

export default Search;