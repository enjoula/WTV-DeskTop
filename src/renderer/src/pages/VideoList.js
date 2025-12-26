// pages/VideoList.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { 
  fetchMovies, 
  fetchTVShows, 
  fetchAnime, 
  fetchVarietyShows, 
  fetchDocumentaries,
  filterVideoList,
  setCurrentCategory,
  clearCategoryData,
} from '../store/videoSlice';
import FilterPanel from '../components/FilterPanel';
import VideoImage from '../components/VideoImage';
import StarRating from '../components/StarRating';

const VideoList = () => {
  const { category } = useParams();
  const dispatch = useDispatch();
  const [page, setPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState({});
  const { movies, tvShows, anime, varietyShows, documentaries, filterResults } = useSelector(state => state.video);
  const loadingRef = useRef(false); // 防止重复加载
  const observerTarget = useRef(null); // Intersection Observer 的目标元素
  
  // 根据类别选择对应的状态
  const getCategoryData = () => {
    // 如果有筛选条件且筛选结果不为空，使用筛选结果
    const hasActiveFilters = Object.keys(activeFilters).some(key => activeFilters[key] && activeFilters[key] !== '');
    if (hasActiveFilters && filterResults.data.length > 0 && filterResults.loading === false) {
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
    // 记录当前分类，用于详情页顶部高亮
    dispatch(setCurrentCategory(category));

    // 切换分类时，先清空当前分类的数据，避免显示旧数据
    dispatch(clearCategoryData(category));

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
    const hasActiveFilters = Object.keys(activeFilters).some(key => activeFilters[key] && activeFilters[key] !== '');
    if (hasActiveFilters && filterResults.data.length > 0) {
      const nextPage = (filterResults.pagination?.page || 1) + 1;
      console.log('加载筛选结果的下一页:', nextPage);
      
      // 构建筛选参数
      const filterMapping = {
        'regions': 'country',
        'years': 'year',
        'genres': 'tags'
      };
      const typeMapping = {
        'movies': 'movie',
        'tv': 'tv',
        'anime': 'anime',
        'tvshow': 'tvshow',
        'documentary': 'doc'
      };
      
      const filterParams = Object.entries(activeFilters).reduce((acc, [key, value]) => {
        if (value && value !== '') {
          const apiKey = filterMapping[key] || key;
          acc[apiKey] = value;
        }
        return acc;
      }, {
        type: typeMapping[category] || category,
        page: nextPage,
        size: 10
      });
      
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
  }, [category, page, categoryData, activeFilters, filterResults, dispatch]);

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
  
  // 处理筛选条件改变，自动应用筛选
  const handleFilterChange = (newFilters) => {
    setActiveFilters(newFilters);
    setPage(1); // 重置到第一页
    
    // 构建筛选参数
    const filterMapping = {
      'regions': 'country',
      'years': 'year',
      'genres': 'tags'
    };
    const typeMapping = {
      'movies': 'movie',
      'tv': 'tv',
      'anime': 'anime',
      'tvshow': 'tvshow',
      'documentary': 'doc'
    };
    
    // 构建筛选参数，确保使用接口返回的原始值
    const activeFilterParams = Object.entries(newFilters).reduce((acc, [key, value]) => {
      if (value && value !== '') {
        const apiKey = filterMapping[key] || key;
        // value 是从接口返回的原始值拆分出来的，可以直接使用
        // 例如：接口返回 "中国内地, 中国香港"，拆分后用户选择 "中国内地"
        // 这里传递的 "中国内地" 就是接口返回的原始值的一部分
        acc[apiKey] = value;
        console.log(`筛选参数 ${apiKey}:`, value, '(使用接口返回的原始值)');
      }
      return acc;
    }, {});
    
    // 如果有筛选条件，使用筛选接口；否则加载原始数据
    if (Object.keys(activeFilterParams).length > 0) {
    const filterParams = {
        type: typeMapping[category] || category,
        ...activeFilterParams,
      page: 1,
        size: 10
    };
    dispatch(filterVideoList(filterParams));
    } else {
      // 没有筛选条件，加载原始数据
      const params = { page: 1, size: 10 };
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
    }
  };
  
  // 切换分类时重置筛选条件
  useEffect(() => {
    setActiveFilters({});
  }, [category]);
  
  return (
    <div className="video-list-page">
      <div className="page-header">
      </div>
      
        <div className="filter-section">
          <FilterPanel 
            type={category} 
            onFilterChange={handleFilterChange}
          />
        </div>
      
      {categoryData.error && <div className="error-message">{categoryData.error}</div>}
      
      {categoryData.data.length === 0 && !categoryData.loading && (
        <div className="no-results">
          <p>暂无相关视频</p>
        </div>
      )}
      
      <div className="video-grid">
        {categoryData.data.map(video => (
          <div key={video.id} className="video-card">
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
            </div>
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