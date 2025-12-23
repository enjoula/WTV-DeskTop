// components/FilterPanel.js
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { filterVideoList } from '../store/videoSlice';

const FilterPanel = ({ type, onFilterChange, onApplyFilters }) => {
  const dispatch = useDispatch();
  const { allFilters } = useSelector(state => state.video);
  const [selectedFilters, setSelectedFilters] = useState({});

  // 根据类型获取对应的筛选条件
  const getFiltersForType = () => {
    console.log('FilterPanel - 当前类型:', type);
    console.log('FilterPanel - allFilters:', allFilters);
    
    if (!type) {
      console.log('FilterPanel - 没有类型，返回空对象');
      return {};
    }
    
    if (!allFilters.data || Object.keys(allFilters.data).length === 0) {
      console.log('FilterPanel - allFilters.data 为空或未定义');
      return {};
    }
    
    // 类型映射：URL 中的类型 -> store 中的类型
    const typeMapping = {
      'movies': 'movies',
      'tv': 'tv',
      'anime': 'anime',
      'tvshow': 'tvshow',
      'documentary': 'documentary'
    };
    
    const mappedType = typeMapping[type] || type;
    const filters = allFilters.data[mappedType] || {};
    
    console.log(`FilterPanel - 映射类型: ${type} -> ${mappedType}`);
    console.log(`FilterPanel - 获取到的筛选条件:`, filters);
    
    return filters;
  };

  useEffect(() => {
    // 切换类型时重置筛选条件
    setSelectedFilters({});
  }, [type]);

  const handleFilterChange = (filterType, value) => {
    const newFilters = {
      ...selectedFilters,
      [filterType]: value
    };
    
    setSelectedFilters(newFilters);
    
    // 如果提供了回调函数，则调用它
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
  };
 
  const handleApplyFilters = () => {
    // 构建筛选参数，过滤掉空值
    // 根据API文档，筛选参数映射：regions -> country, years -> year, genres -> tags
    const filterMapping = {
      'regions': 'country',  // 地区映射到country
      'years': 'year',       // 年份映射到year
      'genres': 'tags',      // 类型映射到tags
      'country': 'country',  // 如果已经是正确字段名，保持不变
      'year': 'year',
      'tags': 'tags'
    };
    
    // 类型映射：应用内类型 -> API 期望的类型
    const typeMapping = {
      'movies': 'movie',
      'tv': 'tv',
      'anime': 'anime',
      'tvshow': 'tvshow',
      'documentary': 'doc'
    };
    
    const activeFilters = Object.entries(selectedFilters).reduce((acc, [key, value]) => {
      if (value && value !== '') {
        // 映射字段名到API参数名
        const apiKey = filterMapping[key] || key;
        acc[apiKey] = value;
      }
      return acc;
    }, {});
    
    // 映射类型到 API 期望的类型
    const apiType = typeMapping[type] || type;
    
    const filterParams = {
      type: apiType, // 使用映射后的类型
      ...activeFilters,
      page: 1,
      size: 20 // API文档使用 size 而不是 page_size
    };
    
    // 如果提供了外部应用筛选的回调，使用它；否则使用内部dispatch
    if (onApplyFilters) {
      onApplyFilters(filterParams);
    } else {
      dispatch(filterVideoList(filterParams));
    }
  };

  const handleResetFilters = () => {
    setSelectedFilters({});
    
    // 如果提供了回调函数，则调用它
    if (onFilterChange) {
      onFilterChange({});
    }
  };

  // 调试：每次渲染时打印状态
  useEffect(() => {
    console.log('FilterPanel - 组件渲染，类型:', type);
    console.log('FilterPanel - allFilters 状态:', {
      loading: allFilters.loading,
      error: allFilters.error,
      hasData: !!allFilters.data,
      dataKeys: allFilters.data ? Object.keys(allFilters.data) : []
    });
  }, [type, allFilters]);

  if (allFilters.loading) {
    return <div className="filter-panel loading">加载筛选条件中...</div>;
  }

  if (allFilters.error) {
    console.error('FilterPanel - 筛选条件加载错误:', allFilters.error);
    return <div className="filter-panel error-message">{allFilters.error}</div>;
  }

  // 获取当前类型的筛选条件
  const filtersForType = getFiltersForType();
  
  // 如果没有筛选条件，不显示面板
  if (!filtersForType || Object.keys(filtersForType).length === 0) {
    console.log('FilterPanel - 没有筛选条件，不显示面板');
    return null;
  }
  
  // 筛选条件的显示标签映射
  const filterLabels = {
    'regions': '地区',
    'years': '年份',
    'genres': '类型'
  };

  return (
    <div className="filter-panel">
      <div className="filter-header">
        <h3>筛选条件</h3>
        <div className="filter-actions">
          <button onClick={handleApplyFilters}>应用筛选</button>
          <button onClick={handleResetFilters}>重置筛选</button>
        </div>
      </div>
      
      <div className="filter-options">
        {Object.entries(filtersForType).map(([filterType, filterOptions]) => {
          // filterOptions 应该是数组（已经处理过的）
          const options = Array.isArray(filterOptions) ? filterOptions : [];
          const label = filterLabels[filterType] || filterType;
          
          return (
            <div key={filterType} className="filter-group">
              <label>{label}:</label>
              <select 
                value={selectedFilters[filterType] || ''}
                onChange={(e) => handleFilterChange(filterType, e.target.value)}
              >
                <option value="">全部</option>
                {options.map((option, index) => (
                  <option key={option || index} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FilterPanel;