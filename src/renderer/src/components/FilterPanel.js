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
    
    // 自动应用筛选（调用回调函数）
    if (onFilterChange) {
      onFilterChange(newFilters);
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

  // 筛选条件的显示标签映射和顺序
  const filterOrder = ['genres', 'regions', 'years']; // 类型、地区、年份的顺序
  const filterLabels = {
    'genres': '类型',
    'regions': '地区',
    'years': '年份'
  };

  // 处理标签点击
  const handleTagClick = (filterType, value) => {
    // 如果点击的是已选中的值，则取消选择（设为空）
    const currentValue = selectedFilters[filterType] || '';
    const newValue = currentValue === value ? '' : value;
    handleFilterChange(filterType, newValue);
  };

  return (
    <div className="filter-panel">
      <div className="filter-rows">
        {filterOrder.map((filterType) => {
          // 只显示存在的筛选类型
          if (!filtersForType[filterType]) return null;
          
          // 处理筛选选项，确保每个值都是独立的
          let options = [];
          const rawOptions = filtersForType[filterType];
          
          if (Array.isArray(rawOptions)) {
            // 如果已经是数组，需要进一步处理每个元素
            options = rawOptions.reduce((acc, item) => {
              if (typeof item === 'string') {
                // 如果元素是字符串，检查是否包含中英文逗号/顿号
                const hasDelimiter = /[,，、]/.test(item);
                if (hasDelimiter) {
                  // 按中英文逗号/顿号分隔，去除空白，过滤空值
                  const splitItems = item
                    .split(/[,，、]/)
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                  acc.push(...splitItems);
                } else {
                  // 单个值，直接添加
                  const v = item.trim();
                  if (v) acc.push(v);
                }
              } else {
                // 非字符串类型，直接添加
                acc.push(item);
              }
              return acc;
            }, []);
          } else if (typeof rawOptions === 'string') {
            // 如果是字符串，按中英文逗号/顿号分隔
            options = rawOptions
              .split(/[,，、]/)
              .map(s => s.trim())
              .filter(s => s.length > 0);
          }
          
          // 去重，保持顺序
          const uniqueOptions = Array.from(new Set(options));
          
          const label = filterLabels[filterType] || filterType;
          const selectedValue = selectedFilters[filterType] || '';
    
    return (
            <div key={filterType} className="filter-row">
              <div className="filter-row-label">{label}：</div>
              <div className="filter-row-tags">
                {/* 全部选项 */}
          <button
                  className={`filter-tag ${selectedValue === '' ? 'active' : ''}`}
                  onClick={() => handleTagClick(filterType, '')}
          >
            全部
          </button>
                {/* 其他选项 */}
                {uniqueOptions.map((option, index) => (
              <button
                    key={`${option}-${index}`}
                    className={`filter-tag ${selectedValue === option ? 'active' : ''}`}
                    onClick={() => handleTagClick(filterType, option)}
              >
                    {option}
              </button>
                ))}
        </div>
      </div>
    );
        })}
      </div>
    </div>
  );
};

export default FilterPanel;