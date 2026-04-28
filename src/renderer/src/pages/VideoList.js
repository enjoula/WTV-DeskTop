// pages/VideoList.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const pageStorageKey = useCallback((targetCategory) => `videoList.page.${targetCategory}`, []);
  const scrollStorageKey = useCallback((targetCategory) => `videoList.scroll.${targetCategory}`, []);
  const readStoredNumber = useCallback((key) => {
    if (!key) {
      return null;
    }
    const rawValue = sessionStorage.getItem(key);
    if (rawValue === null) {
      return null;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }, []);
  const [page, setPage] = useState(() => {
    const storedPage = readStoredNumber(pageStorageKey(category));
    return storedPage && storedPage > 0 ? storedPage : 1;
  });
  const [activeFilters, setActiveFilters] = useState({});
  const { movies, tvShows, anime, varietyShows, documentaries, filterResults } = useSelector(state => state.video);
  const { isAuthenticated } = useSelector(state => state.auth);
  const loadingRef = useRef(false); // 防止重复加载
  const observerInstance = useRef(null); // Intersection Observer 实例
  const categoryFetchedRef = useRef(null); // 记录已获取的分类，防止重复调用
  const fetchingRef = useRef(false); // 防止同一分类同时发起多个请求
  // 用于标记上一次的类别
  const prevCategoryRef = useRef(null);
  // 标记当前分类是否已完成滚动恢复，避免数据追加时重复触发
  const restoredCategoryRef = useRef(null);
  
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
  
  // 监听 category 变化：保存旧分类滚动位置，并重置当前分类恢复标记
  useEffect(() => {
    if (prevCategoryRef.current && prevCategoryRef.current !== category) {
      const scrollY = window.scrollY;
      sessionStorage.setItem(scrollStorageKey(prevCategoryRef.current), String(scrollY));
    }
    restoredCategoryRef.current = null;
    prevCategoryRef.current = category;
  }, [category, scrollStorageKey]);

  // 列表滚动过程中持续保存当前位置，保证切换/返回时更准确
  useEffect(() => {
    let rafId = null;
    const persistScroll = () => {
      rafId = null;
      sessionStorage.setItem(scrollStorageKey(category), String(window.scrollY));
    };
    const handleScroll = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(persistScroll);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      const scrollY = window.scrollY;
      sessionStorage.setItem(scrollStorageKey(category), String(scrollY));
    };
  }, [category, scrollStorageKey]);
  
  // 分类切换后仅恢复一次滚动位置，避免加载下一页时重复触发导致“回顶”
  useEffect(() => {
    if (restoredCategoryRef.current === category) {
      return;
    }

    const savedPosition = readStoredNumber(scrollStorageKey(category)) || 0;
    const shouldWaitForData =
      savedPosition > 0 && categoryData.loading && categoryData.data.length === 0;

    if (shouldWaitForData) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedPosition, left: 0, behavior: 'auto' });
      restoredCategoryRef.current = category;
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [category, categoryData.loading, categoryData.data.length, readStoredNumber, scrollStorageKey]);
  
  useEffect(() => {
    // 防止重复调用：如果正在获取同一分类的数据，跳过
    if (fetchingRef.current && categoryFetchedRef.current === category) {
      console.log('正在获取该分类数据，跳过重复调用:', category);
      return;
    }

    // 防止重复调用：如果当前分类已经获取过数据，且数据不为空且不在加载中，则不重复调用
    if (categoryFetchedRef.current === category && categoryData.data.length > 0 && !categoryData.loading) {
      console.log('分类数据已存在，跳过重复调用:', category);
      return;
    }

    // 如果数据正在加载中，不重复调用
    if (categoryData.loading) {
      console.log('数据正在加载中，跳过重复调用:', category);
      return;
    }

    // 记录当前分类，用于详情页顶部高亮
    dispatch(setCurrentCategory(category));

    // 切换分类时的处理
    if (categoryFetchedRef.current !== category) {
      // 如果新类别没有数据，才需要获取
      if (categoryData.data.length === 0) {
        // 重置页码
        setPage(1);
        sessionStorage.setItem(pageStorageKey(category), '1');
        // 重置加载状态
        loadingRef.current = false;
        
        // 标记当前分类已开始获取
        categoryFetchedRef.current = category;
        fetchingRef.current = true;
        
        // 获取数据后，滚动位置会在专门的 useEffect 中恢复
      } else {
        // 如果已有数据，标记分类并返回（滚动位置由专门的 useEffect 处理）
        categoryFetchedRef.current = category;
        fetchingRef.current = false;
        return; // 已有数据，不需要重新获取
      }
    } else {
      // 同一分类，标记并继续
      categoryFetchedRef.current = category;
      fetchingRef.current = true;
    }
    
    // 根据类别获取数据
    const fetchData = (pageNum) => {
      const params = { page: pageNum, size: 10 }; // API文档使用 size 而不是 page_size
      let fetchPromise;
      switch (category) {
        case 'movies':
          fetchPromise = dispatch(fetchMovies(params));
          break;
        case 'tv':
          fetchPromise = dispatch(fetchTVShows(params));
          break;
        case 'anime':
          fetchPromise = dispatch(fetchAnime(params));
          break;
        case 'tvshow':
          fetchPromise = dispatch(fetchVarietyShows(params));
          break;
        case 'documentary':
          fetchPromise = dispatch(fetchDocumentaries(params));
          break;
        default:
          fetchPromise = dispatch(fetchMovies(params));
      }
      
      // 请求完成后清除 fetching 标志（滚动位置由专门的 useEffect 处理）
      fetchPromise.finally(() => {
        fetchingRef.current = false;
      });
    };
    
    fetchData(1);
  }, [category, dispatch, categoryData.loading, categoryData.data.length, pageStorageKey]); // 添加 categoryData 相关依赖，确保状态变化时能正确判断

  // 同步当前页码（来自分页信息或本地缓存）
  useEffect(() => {
    const currentPage = categoryData.pagination?.page;
    if (currentPage && currentPage !== page) {
      setPage(currentPage);
    }
    if (currentPage) {
      sessionStorage.setItem(pageStorageKey(category), String(currentPage));
      return;
    }
    const storedPage = readStoredNumber(pageStorageKey(category));
    if (storedPage && storedPage !== page) {
      setPage(storedPage);
    }
  }, [category, categoryData.pagination?.page, page, pageStorageKey, readStoredNumber]);
  
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
    
    const currentPage = categoryData.pagination?.page || page || 1;
    const nextPage = currentPage + 1;
    console.log('加载下一页:', nextPage);
    setPage(nextPage);
    sessionStorage.setItem(pageStorageKey(category), String(nextPage));
    
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

  // 始终保持 loadMore 最新引用，避免 Observer 闭包捕获过期值
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // 懒加载：callback ref，DOM 元素挂载时创建 Observer，卸载时销毁
  // 避免依赖数据状态重建 Observer，防止每次追加数据后立即触发下一页加载
  const observerTargetCallback = useCallback((node) => {
    // 先销毁旧的 Observer
    if (observerInstance.current) {
      observerInstance.current.disconnect();
      observerInstance.current = null;
    }
    if (!node) return;

    observerInstance.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current();
        }
      },
      { root: null, rootMargin: '100px', threshold: 0.1 }
    );
    observerInstance.current.observe(node);
  }, []); // 空依赖：callback ref 本身不需要重建
  
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
                } else {
                  // 降级处理：如果没有 Electron API，使用 navigate（开发环境可能用到）
                  navigate(`/video/${video.id}`, { state: { video } });
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
                ref={observerTargetCallback}
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