// pages/VideoList.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { 
  fetchMovies, 
  fetchTVShows, 
  fetchAnime, 
  fetchVarietyShows, 
  fetchDocumentaries,
  filterVideoList
} from '../store/videoSlice';
import FilterPanel from '../components/FilterPanel';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';

const VideoList = () => {
  const { category } = useParams();
  const dispatch = useDispatch();
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const { movies, tvShows, anime, varietyShows, documentaries, filterResults } = useSelector(state => state.video);
  const loadingRef = useRef(false); // 防止重复加载
  const observerTarget = useRef(null); // Intersection Observer 的目标元素
  
  // 根据类别选择对应的状态
  const getCategoryData = () => {
    // 只有在显示筛选面板且筛选结果不为空时，才使用筛选结果
    // 注意：筛选结果应该通过FilterPanel的handleApplyFilters来触发
    // 这里仅用于显示筛选后的结果，不应该影响正常的分类列表显示
    if (showFilters && filterResults.data.length > 0 && filterResults.loading === false) {
      return filterResults;
    }
    
    switch (category) {
      case 'movies': return movies;
      case 'tv': return tvShows;
      case 'anime': return anime;
      case 'tvshow': return varietyShows;
      case 'documentary': return documentaries;
      default: return movies;
    }
  };
  
  const categoryData = getCategoryData();
  
  // 调试：打印当前状态
  useEffect(() => {
    console.log('VideoList 状态更新:', {
      category,
      page,
      dataLength: categoryData.data.length,
      pagination: categoryData.pagination,
      loading: categoryData.loading,
      hasNext: categoryData.pagination?.has_next,
      total: categoryData.pagination?.total
    });
  }, [category, page, categoryData.data.length, categoryData.pagination, categoryData.loading]);
  
  // 获取类别名称
  const getCategoryName = () => {
    switch (category) {
      case 'movies': return '电影';
      case 'tv': return '电视剧';
      case 'anime': return '动漫';
      case 'tvshow': return '综艺';
      case 'documentary': return '纪录片';
      default: return '视频';
    }
  };
  
  useEffect(() => {
    // 重置页码
    setPage(1);
    
    // 根据类别获取数据
    const fetchData = (pageNum) => {
      const params = { page: pageNum, size: 10 }; // API文档使用 size 而不是 page_size
      switch (category) {
        case 'movies':
          dispatch(fetchMovies(params));
          break;
        case 'tv':
          dispatch(fetchTVShows(params));
          break;
        case 'anime':
          dispatch(fetchAnime(params));
          break;
        case 'tvshow':
          dispatch(fetchVarietyShows(params));
          break;
        case 'documentary':
          dispatch(fetchDocumentaries(params));
          break;
        default:
          dispatch(fetchMovies(params));
      }
    };
    
    fetchData(1);
  }, [category, dispatch]);
  
  // 懒加载：加载更多数据
  const loadMore = useCallback(() => {
    // 防止重复加载
    if (loadingRef.current || categoryData.loading) {
      return;
    }

    const pagination = categoryData.pagination || {};
    const hasNext = pagination.has_next !== undefined ? pagination.has_next : 
                   (pagination.total > 0 ? categoryData.data.length < pagination.total : true);
    
    // 如果没有下一页，不加载
    if (!hasNext) {
      return;
    }

    console.log('懒加载触发，加载更多数据');
    loadingRef.current = true;

    // 如果当前显示的是筛选结果，也支持加载更多
    if (showFilters && filterResults.data.length > 0) {
      const nextPage = (filterResults.pagination?.page || 1) + 1;
      console.log('加载筛选结果的下一页:', nextPage);
      const filterParams = {
        type: category,
        page: nextPage,
        page_size: 10
      };
      dispatch(filterVideoList(filterParams)).finally(() => {
        loadingRef.current = false;
      });
      return;
    }
    
    const nextPage = page + 1;
    console.log('加载下一页:', nextPage);
    setPage(nextPage);
    
    // 现在 reducer 已经支持追加数据了
    const params = { page: nextPage, size: 10 }; // API文档使用 size 而不是 page_size
    console.log('请求参数:', params);
    
    const fetchPromise = (() => {
      switch (category) {
        case 'movies':
          return dispatch(fetchMovies(params));
        case 'tv':
          return dispatch(fetchTVShows(params));
        case 'anime':
          return dispatch(fetchAnime(params));
        case 'tvshow':
          return dispatch(fetchVarietyShows(params));
        case 'documentary':
          return dispatch(fetchDocumentaries(params));
        default:
          return dispatch(fetchMovies(params));
      }
    })();

    fetchPromise.finally(() => {
      loadingRef.current = false;
    });
  }, [category, page, categoryData, showFilters, filterResults, dispatch]);

  // 懒加载：使用 Intersection Observer 监听滚动到底部
  useEffect(() => {
    const pagination = categoryData.pagination || {};
    const hasNext = pagination.has_next !== undefined ? pagination.has_next : 
                   (pagination.total > 0 ? categoryData.data.length < pagination.total : true);
    
    // 如果没有下一页或正在加载，不设置观察器
    const targetElement = observerTarget.current;
    if (!hasNext || categoryData.loading || !targetElement) {
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
  }, [categoryData.pagination, categoryData.loading, categoryData.data.length, loadMore]);
  
  const handleFilterChange = (newFilters) => {
    // 当筛选条件改变时的处理逻辑
    console.log('筛选条件改变:', newFilters);
  };
  
  const handleApplyFilters = () => {
    // 应用筛选条件
    const filterParams = {
      type: category,
      page: 1,
      size: 10 // API文档使用 size 而不是 page_size
    };
    
    dispatch(filterVideoList(filterParams));
  };
  
  const handleResetFilters = () => {
    setShowFilters(false);
    setPage(1); // 重置页码
    // 重新加载原始数据
    const params = { page: 1, size: 10 }; // API文档使用 size 而不是 page_size
    switch (category) {
      case 'movies':
        dispatch(fetchMovies(params));
        break;
      case 'tv':
        dispatch(fetchTVShows(params));
        break;
      case 'anime':
        dispatch(fetchAnime(params));
        break;
      case 'tvshow':
        dispatch(fetchVarietyShows(params));
        break;
      case 'documentary':
        dispatch(fetchDocumentaries(params));
        break;
      default:
        dispatch(fetchMovies(params));
    }
  };
  
  return (
    <div className="video-list-page">
      <div className="page-header">
        <h1>{getCategoryName()}</h1>
        <button 
          className="filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? '隐藏筛选' : '显示筛选'}
        </button>
      </div>
      
      {showFilters && (
        <div className="filter-section">
          <FilterPanel 
            type={category} 
            onFilterChange={handleFilterChange}
          />
          <div className="filter-actions">
            <button onClick={handleApplyFilters}>应用筛选</button>
            <button onClick={handleResetFilters}>重置筛选</button>
          </div>
        </div>
      )}
      
      {categoryData.error && <div className="error-message">{categoryData.error}</div>}
      
      {categoryData.data.length === 0 && !categoryData.loading && (
        <div className="no-results">
          <p>暂无相关视频</p>
        </div>
      )}
      
      <div className="video-grid">
        {categoryData.data.map(video => (
          <div key={video.id} className="video-card">
            <Link 
              to={`/video/${video.id}`} 
              state={{ video }} // 传递完整的视频信息
              className="video-card-link"
            >
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
                <h3 className="video-title">{video.title}</h3>
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
      
      {/* 懒加载指示器 */}
      {categoryData.data.length > 0 && (
        <>
          {/* 加载中的提示 */}
          {categoryData.loading && (
            <div className="loading" style={{ padding: '20px', textAlign: 'center' }}>
              加载中...
            </div>
          )}
          
          {/* Intersection Observer 目标元素 */}
          {(() => {
            const pagination = categoryData.pagination || {};
            const hasNext = pagination.has_next !== undefined ? pagination.has_next : 
                           (pagination.total > 0 ? categoryData.data.length < pagination.total : true);
            
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
};

export default VideoList;