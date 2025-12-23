// pages/Search.js
import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { searchVideoList, clearSearchResults, filterVideoList } from '../store/videoSlice';
import FilterPanel from '../components/FilterPanel';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';

const Search = () => {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const { searchResults, filterResults } = useSelector(state => state.video);
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState('search'); // 'search' or 'filter'
  const [selectedCategory, setSelectedCategory] = useState('movies');
  const SEARCH_PAGE_SIZE = 10; // 每页最大 10 条

  useEffect(() => {
    // 如果URL中有搜索关键词，则执行搜索
    const query = searchParams.get('q');
    if (query) {
      setKeyword(query);
      dispatch(searchVideoList({ keyword: query, page: 1, size: SEARCH_PAGE_SIZE }));
    }
    
    // 清理搜索结果
    return () => {
      dispatch(clearSearchResults());
    };
  }, [searchParams, dispatch]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (keyword.trim()) {
      dispatch(searchVideoList({ keyword, page: 1, size: SEARCH_PAGE_SIZE }));
    }
  };

  const handleClear = () => {
    setKeyword('');
    dispatch(clearSearchResults());
  };

  const handleFilterChange = (filters) => {
    // 当筛选条件改变时的处理逻辑
    console.log('筛选条件改变:', filters);
  };

  const handleApplyFilters = () => {
    // 应用筛选条件
    const filterParams = {
      type: selectedCategory,
      page: 1,
      size: 20 // API文档使用 size 而不是 page_size
    };
    
    dispatch(filterVideoList(filterParams));
  };

  const renderResults = () => {
    const results = activeTab === 'search' ? searchResults : filterResults;
    
    if (results.loading) {
      return <div className="loading">加载中...</div>;
    }
    
    if (results.error) {
      return <div className="error-message">{results.error}</div>;
    }
    
    if (results.data.length > 0) {
      return (
        <div className="search-results">
          <h2>{activeTab === 'search' ? '搜索结果' : '筛选结果'}</h2>
          <div className="video-grid">
            {results.data.map(video => (
              <div key={video.id} className="video-card">
                <Link to={`/video/${video.id}`} state={{ video }}>
                  <div className="video-card-image">
                    <VideoImage src={video.cover_url} alt={video.title} />
                    {(video.is_update === 1 || video.is_update === true || video.is_new === 1 || video.is_new === true) && <span className="new-badge">新</span>}
                    {(video.score || video.rating) && (
                      <div className="video-rating-overlay">
                        <StarRating score={parseFloat(video.score || video.rating || 0)} />
                      </div>
                    )}
                  </div>
                  <div className="video-card-content">
                  <h3>{video.title}</h3>
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
            ))}
          </div>
        </div>
      );
    }
    
    if (activeTab === 'search' && keyword && !results.loading && results.data.length === 0) {
      return (
        <div className="no-results">
          <p>没有找到与 "{keyword}" 相关的视频</p>
        </div>
      );
    }
    
    if (activeTab === 'filter' && !results.loading && results.data.length === 0) {
      return (
        <div className="no-results">
          <p>没有找到符合条件的视频</p>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="search-page">
      <div className="search-header">
        <h1>搜索和筛选视频</h1>
      </div>
      
      <div className="search-tabs">
        <button 
          className={activeTab === 'search' ? 'active' : ''}
          onClick={() => setActiveTab('search')}
        >
          搜索
        </button>
        <button 
          className={activeTab === 'filter' ? 'active' : ''}
          onClick={() => setActiveTab('filter')}
        >
          筛选
        </button>
      </div>
      
      {activeTab === 'search' ? (
        <div className="search-section">
          <form onSubmit={handleSearch} className="search-form">
            <div className="search-input-container">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="请输入搜索关键词"
                className="search-input"
              />
              <button type="submit" className="search-button">搜索</button>
            </div>
            {keyword && (
              <button type="button" onClick={handleClear} className="clear-button">清空</button>
            )}
          </form>
        </div>
      ) : (
        <div className="filter-section">
          <div className="category-selector">
            <label>选择分类:</label>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="category-select"
            >
              <option value="movies">电影</option>
              <option value="tv">电视剧</option>
              <option value="anime">动漫</option>
              <option value="tvshow">综艺</option>
              <option value="documentary">纪录片</option>
            </select>
          </div>
          
          <FilterPanel 
            type={selectedCategory} 
            onFilterChange={handleFilterChange}
          />
          
          <div className="filter-actions">
            <button onClick={handleApplyFilters} className="apply-filter-button">应用筛选</button>
          </div>
        </div>
      )}
      
      {renderResults()}
    </div>
  );
};

export default Search;