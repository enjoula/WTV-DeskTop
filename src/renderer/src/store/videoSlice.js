// store/videoSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { 
  getMovies, 
  getTVShows, 
  getAnime, 
  getVarietyShows, 
  getDocumentaries,
  getFilters,
  getAllFilters,
  filterVideos,
  searchVideos,
  getEpisodes,
  getPlayUrl
} from '../api/video';

// 异步action - 获取电影列表
export const fetchMovies = createAsyncThunk(
  'video/fetchMovies',
  async (params, { rejectWithValue }) => {
    console.log('开始获取电影列表，参数:', params);
    try {
      const response = await getMovies(params);
      console.log('电影列表响应:', response);
      return response.data;
    } catch (error) {
      console.error('获取电影列表失败:', error);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// 异步action - 获取电视剧列表
export const fetchTVShows = createAsyncThunk(
  'video/fetchTVShows',
  async (params, { rejectWithValue }) => {
    console.log('开始获取电视剧列表，参数:', params);
    try {
      const response = await getTVShows(params);
      console.log('电视剧列表响应:', response);
      return response.data;
    } catch (error) {
      console.error('获取电视剧列表失败:', error);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// 异步action - 获取动漫列表
export const fetchAnime = createAsyncThunk(
  'video/fetchAnime',
  async (params, { rejectWithValue }) => {
    console.log('开始获取动漫列表，参数:', params);
    try {
      const response = await getAnime(params);
      console.log('动漫列表响应:', response);
      return response.data;
    } catch (error) {
      console.error('获取动漫列表失败:', error);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// 异步action - 获取综艺列表
export const fetchVarietyShows = createAsyncThunk(
  'video/fetchVarietyShows',
  async (params, { rejectWithValue }) => {
    try {
      const response = await getVarietyShows(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// 异步action - 获取纪录片列表
export const fetchDocumentaries = createAsyncThunk(
  'video/fetchDocumentaries',
  async (params, { rejectWithValue }) => {
    try {
      const response = await getDocumentaries(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// 异步action - 获取筛选条件（带类型参数）
export const fetchFilters = createAsyncThunk(
  'video/fetchFilters',
  async (type, { rejectWithValue }) => {
    try {
      const response = await getFilters(type);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// 异步action - 获取所有筛选条件（应用启动时调用）
export const fetchAllFilters = createAsyncThunk(
  'video/fetchAllFilters',
  async (_, { rejectWithValue }) => {
    try {
      console.log('fetchAllFilters - 开始调用 API');
      const response = await getAllFilters();
      console.log('fetchAllFilters - API 响应:', response);
      console.log('fetchAllFilters - response.data:', response.data);
      return response.data;
    } catch (error) {
      console.error('fetchAllFilters - API 调用失败:', error);
      console.error('fetchAllFilters - 错误详情:', error.response?.data || error.message);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// 异步action - 筛选视频
export const filterVideoList = createAsyncThunk(
  'video/filterVideoList',
  async (params, { rejectWithValue }) => {
    try {
      const response = await filterVideos(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// 异步action - 搜索视频
export const searchVideoList = createAsyncThunk(
  'video/searchVideoList',
  async (params, { rejectWithValue }) => {
    try {
      const response = await searchVideos(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// 异步action - 获取视频剧集信息
export const fetchEpisodes = createAsyncThunk(
  'video/fetchEpisodes',
  async (videoId, { rejectWithValue }) => {
    try {
      const response = await getEpisodes(videoId);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// 异步action - 获取播放地址
export const fetchPlayUrl = createAsyncThunk(
  'video/fetchPlayUrl',
  async (params, { rejectWithValue }) => {
    console.log('fetchPlayUrl called with params:', params);
    try {
      const response = await getPlayUrl(params);
      console.log('fetchPlayUrl response:', response);
      return response.data;
    } catch (error) {
      console.error('fetchPlayUrl error:', error);
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

const videoSlice = createSlice({
  name: 'video',
  initialState: {
    movies: {
      data: [],
      pagination: {},
      loading: false,
      error: null,
    },
    tvShows: {
      data: [],
      pagination: {},
      loading: false,
      error: null,
    },
    anime: {
      data: [],
      pagination: {},
      loading: false,
      error: null,
    },
    varietyShows: {
      data: [],
      pagination: {},
      loading: false,
      error: null,
    },
    documentaries: {
      data: [],
      pagination: {},
      loading: false,
      error: null,
    },
    filters: {
      data: {},
      loading: false,
      error: null,
    },
    allFilters: {
      data: {}, // 处理后的数据（用于显示）
      rawData: {}, // 原始数据（用于API调用）
      loading: false,
      error: null,
    },
    searchResults: {
      data: [],
      pagination: {},
      loading: false,
      error: null,
    },
    filterResults: {
      data: [],
      pagination: {},
      loading: false,
      error: null,
    },
    episodes: {
      data: [],
      recommendations: [], // 猜你喜欢推荐列表
      loading: false,
      error: null,
    },
    playUrl: {
      url: '',
      qualityOptions: [],
      selectedQuality: '',
      loading: false,
      error: null,
    },
    // 播放进度跟踪
    playbackProgress: {},
  },
  reducers: {
    clearSearchResults: (state) => {
      state.searchResults = {
        data: [],
        pagination: {},
        loading: false,
        error: null,
      };
    },
    clearFilterResults: (state) => {
      state.filterResults = {
        data: [],
        pagination: {},
        loading: false,
        error: null,
      };
    },
    clearPlayUrl: (state) => {
      state.playUrl = {
        url: '',
        qualityOptions: [],
        selectedQuality: '',
        loading: false,
        error: null,
      };
    },
    clearEpisodes: (state) => {
      state.episodes = {
        data: [],
        recommendations: [],
        loading: false,
        error: null,
      };
    },
    selectQuality: (state, action) => {
      const quality = action.payload;
      const selectedOption = state.playUrl.qualityOptions.find(option => option.quality === quality);
      if (selectedOption) {
        state.playUrl.selectedQuality = quality;
        state.playUrl.url = selectedOption.url;
      }
    },
    // 设置播放进度
    setPlaybackProgress: (state, action) => {
      const { videoId, episodeId, progress } = action.payload;
      const key = `${videoId}-${episodeId}`;
      state.playbackProgress[key] = progress;
    },
    // 清除播放进度
    clearPlaybackProgress: (state, action) => {
      const { videoId, episodeId } = action.payload;
      const key = `${videoId}-${episodeId}`;
      delete state.playbackProgress[key];
    },
    // 从 episodes 数据中设置播放地址
    setPlayUrlFromEpisode: (state, action) => {
      const { url, qualityOptions, selectedQuality } = action.payload;
      state.playUrl.url = url;
      state.playUrl.qualityOptions = qualityOptions || [];
      state.playUrl.selectedQuality = selectedQuality || '';
      state.playUrl.loading = false;
      state.playUrl.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // 电影列表
      .addCase(fetchMovies.pending, (state) => {
        state.movies.loading = true;
        state.movies.error = null;
      })
      .addCase(fetchMovies.fulfilled, (state, action) => {
        state.movies.loading = false;
        // 添加空值检查
        if (action.payload && action.payload.data && action.payload.data.list && Array.isArray(action.payload.data.list)) {
          const currentPage = action.payload.data.page || 1;
          const newList = action.payload.data.list;
          
          // 如果是第一页，替换数据；否则追加数据
          if (currentPage === 1) {
            state.movies.data = newList;
          } else {
            // 追加新数据，避免重复
            const existingIds = new Set(state.movies.data.map(item => item.id));
            const uniqueNewItems = newList.filter(item => !existingIds.has(item.id));
            state.movies.data = [...state.movies.data, ...uniqueNewItems];
          }
          
          const pageSize = action.payload.data.size || action.payload.data.page_size || 10;
          const total = action.payload.data.total || 0;
          
          // 计算 has_next
          // 如果返回的列表为空，说明没有下一页了
          let hasNext = newList.length > 0;
          
          // 如果返回了数据，再检查其他条件
          if (hasNext) {
            // 优先使用 API 返回的 has_next 字段
            if (action.payload.data.has_next !== undefined) {
              hasNext = Boolean(action.payload.data.has_next);
              console.log('电影列表 - 使用 API 返回的 has_next:', hasNext);
            } else if (total > 0) {
              // 如果有 total，根据 total 和当前数据量计算
              const currentTotal = state.movies.data.length;
              hasNext = currentTotal < total;
              console.log('电影列表 - 根据 total 计算 has_next:', {
                currentTotal,
                total,
                hasNext
              });
            } else if (newList.length < pageSize) {
              // 返回的数据量小于 pageSize，可能是最后一页
              hasNext = false;
              console.log('电影列表 - 返回数据量小于 pageSize，has_next = false');
            }
          } else {
            console.log('电影列表 - 返回列表为空，has_next = false');
          }
          
          console.log('电影列表 - 分页信息:', {
            currentPage,
            pageSize,
            total,
            newListLength: newList.length,
            currentDataLength: state.movies.data.length,
            hasNext
          });
          
          state.movies.pagination = {
            page: currentPage,
            pageSize: pageSize,
            total: total,
            has_next: hasNext,
          };
        } else {
          console.warn('Unexpected movies data structure:', action.payload);
          state.movies.data = [];
          state.movies.pagination = {};
        }
      })
      .addCase(fetchMovies.rejected, (state, action) => {
        state.movies.loading = false;
        state.movies.error = action.payload?.message || '获取电影列表失败';
      })
      // 电视剧列表
      .addCase(fetchTVShows.pending, (state) => {
        state.tvShows.loading = true;
        state.tvShows.error = null;
      })
      .addCase(fetchTVShows.fulfilled, (state, action) => {
        state.tvShows.loading = false;
        // 添加空值检查
        if (action.payload && action.payload.data && action.payload.data.list && Array.isArray(action.payload.data.list)) {
          const currentPage = action.payload.data.page || 1;
          const newList = action.payload.data.list;
          
          // 如果是第一页，替换数据；否则追加数据
          if (currentPage === 1) {
            state.tvShows.data = newList;
          } else {
            // 追加新数据，避免重复
            const existingIds = new Set(state.tvShows.data.map(item => item.id));
            const uniqueNewItems = newList.filter(item => !existingIds.has(item.id));
            state.tvShows.data = [...state.tvShows.data, ...uniqueNewItems];
          }
          
          const pageSize = action.payload.data.size || action.payload.data.page_size || 10;
          const total = action.payload.data.total || 0;
          
          // 如果返回的列表为空，说明没有下一页了
          let hasNext = newList.length > 0;
          
          // 如果返回了数据，再检查其他条件
          if (hasNext) {
            if (action.payload.data.has_next !== undefined) {
              hasNext = Boolean(action.payload.data.has_next);
            } else if (total > 0) {
              const currentTotal = state.tvShows.data.length;
              hasNext = currentTotal < total;
            } else if (newList.length < pageSize) {
              hasNext = false;
            }
          }
          
          state.tvShows.pagination = {
            page: currentPage,
            pageSize: pageSize,
            total: total,
            has_next: hasNext,
          };
        } else {
          console.warn('Unexpected TV shows data structure:', action.payload);
          state.tvShows.data = [];
          state.tvShows.pagination = {};
        }
      })
      .addCase(fetchTVShows.rejected, (state, action) => {
        state.tvShows.loading = false;
        state.tvShows.error = action.payload?.message || '获取电视剧列表失败';
      })
      // 动漫列表
      .addCase(fetchAnime.pending, (state) => {
        state.anime.loading = true;
        state.anime.error = null;
      })
      .addCase(fetchAnime.fulfilled, (state, action) => {
        state.anime.loading = false;
        // 添加空值检查
        if (action.payload && action.payload.data && action.payload.data.list && Array.isArray(action.payload.data.list)) {
          const currentPage = action.payload.data.page || 1;
          const newList = action.payload.data.list;
          
          // 如果是第一页，替换数据；否则追加数据
          if (currentPage === 1) {
            state.anime.data = newList;
          } else {
            // 追加新数据，避免重复
            const existingIds = new Set(state.anime.data.map(item => item.id));
            const uniqueNewItems = newList.filter(item => !existingIds.has(item.id));
            state.anime.data = [...state.anime.data, ...uniqueNewItems];
          }
          
          const pageSize = action.payload.data.size || action.payload.data.page_size || 10;
          const total = action.payload.data.total || 0;
          
          // 如果返回的列表为空，说明没有下一页了
          let hasNext = newList.length > 0;
          
          // 如果返回了数据，再检查其他条件
          if (hasNext) {
            if (action.payload.data.has_next !== undefined) {
              hasNext = Boolean(action.payload.data.has_next);
            } else if (total > 0) {
              const currentTotal = state.anime.data.length;
              hasNext = currentTotal < total;
            } else if (newList.length < pageSize) {
              hasNext = false;
            }
          }
          
          state.anime.pagination = {
            page: currentPage,
            pageSize: pageSize,
            total: total,
            has_next: hasNext,
          };
        } else {
          console.warn('Unexpected anime data structure:', action.payload);
          state.anime.data = [];
          state.anime.pagination = {};
        }
      })
      .addCase(fetchAnime.rejected, (state, action) => {
        state.anime.loading = false;
        state.anime.error = action.payload?.message || '获取动漫列表失败';
      })
      // 综艺列表
      .addCase(fetchVarietyShows.pending, (state) => {
        state.varietyShows.loading = true;
        state.varietyShows.error = null;
      })
      .addCase(fetchVarietyShows.fulfilled, (state, action) => {
        state.varietyShows.loading = false;
        // 添加空值检查
        if (action.payload && action.payload.data && action.payload.data.list && Array.isArray(action.payload.data.list)) {
          const currentPage = action.payload.data.page || 1;
          const newList = action.payload.data.list;
          
          // 如果是第一页，替换数据；否则追加数据
          if (currentPage === 1) {
            state.varietyShows.data = newList;
          } else {
            // 追加新数据，避免重复
            const existingIds = new Set(state.varietyShows.data.map(item => item.id));
            const uniqueNewItems = newList.filter(item => !existingIds.has(item.id));
            state.varietyShows.data = [...state.varietyShows.data, ...uniqueNewItems];
          }
          
          const pageSize = action.payload.data.size || action.payload.data.page_size || 10;
          const total = action.payload.data.total || 0;
          
          // 如果返回的列表为空，说明没有下一页了
          let hasNext = newList.length > 0;
          
          // 如果返回了数据，再检查其他条件
          if (hasNext) {
            if (action.payload.data.has_next !== undefined) {
              hasNext = Boolean(action.payload.data.has_next);
            } else if (total > 0) {
              const currentTotal = state.varietyShows.data.length;
              hasNext = currentTotal < total;
            } else if (newList.length < pageSize) {
              hasNext = false;
            }
          }
          
          state.varietyShows.pagination = {
            page: currentPage,
            pageSize: pageSize,
            total: total,
            has_next: hasNext,
          };
        } else {
          console.warn('Unexpected variety shows data structure:', action.payload);
          state.varietyShows.data = [];
          state.varietyShows.pagination = {};
        }
      })
      .addCase(fetchVarietyShows.rejected, (state, action) => {
        state.varietyShows.loading = false;
        state.varietyShows.error = action.payload?.message || '获取综艺列表失败';
      })
      // 纪录片列表
      .addCase(fetchDocumentaries.pending, (state) => {
        state.documentaries.loading = true;
        state.documentaries.error = null;
      })
      .addCase(fetchDocumentaries.fulfilled, (state, action) => {
        state.documentaries.loading = false;
        // 添加空值检查
        if (action.payload && action.payload.data && action.payload.data.list && Array.isArray(action.payload.data.list)) {
          const currentPage = action.payload.data.page || 1;
          const newList = action.payload.data.list;
          
          // 如果是第一页，替换数据；否则追加数据
          if (currentPage === 1) {
            state.documentaries.data = newList;
          } else {
            // 追加新数据，避免重复
            const existingIds = new Set(state.documentaries.data.map(item => item.id));
            const uniqueNewItems = newList.filter(item => !existingIds.has(item.id));
            state.documentaries.data = [...state.documentaries.data, ...uniqueNewItems];
          }
          
          const pageSize = action.payload.data.size || action.payload.data.page_size || 10;
          const total = action.payload.data.total || 0;
          
          // 如果返回的列表为空，说明没有下一页了
          let hasNext = newList.length > 0;
          
          // 如果返回了数据，再检查其他条件
          if (hasNext) {
            if (action.payload.data.has_next !== undefined) {
              hasNext = Boolean(action.payload.data.has_next);
            } else if (total > 0) {
              const currentTotal = state.documentaries.data.length;
              hasNext = currentTotal < total;
            } else if (newList.length < pageSize) {
              hasNext = false;
            }
          }
          
          state.documentaries.pagination = {
            page: currentPage,
            pageSize: pageSize,
            total: total,
            has_next: hasNext,
          };
        } else {
          console.warn('Unexpected documentaries data structure:', action.payload);
          state.documentaries.data = [];
          state.documentaries.pagination = {};
        }
      })
      .addCase(fetchDocumentaries.rejected, (state, action) => {
        state.documentaries.loading = false;
        state.documentaries.error = action.payload?.message || '获取纪录片列表失败';
      })
      // 筛选条件（带类型参数）
      .addCase(fetchFilters.pending, (state) => {
        state.filters.loading = true;
        state.filters.error = null;
      })
      .addCase(fetchFilters.fulfilled, (state, action) => {
        state.filters.loading = false;
        state.filters.data = action.payload.data;
      })
      .addCase(fetchFilters.rejected, (state, action) => {
        state.filters.loading = false;
        state.filters.error = action.payload?.message || '获取筛选条件失败';
      })
      // 所有筛选条件（应用启动时调用）
      .addCase(fetchAllFilters.pending, (state) => {
        state.allFilters.loading = true;
        state.allFilters.error = null;
      })
      .addCase(fetchAllFilters.fulfilled, (state, action) => {
        state.allFilters.loading = false;
        
        // 调试：打印原始响应数据
        console.log('fetchAllFilters 响应数据:', action.payload);
        
        // 处理返回的数据，将逗号分隔的字符串拆分成数组
        const processedData = {}; // 用于显示的数据（拆分后的数组）
        const rawDataForApi = {}; // 用于API调用的原始数据
        
        // 类型映射：API 返回的类型 -> 应用内使用的类型
        const typeMapping = {
          'movie': 'movies',
          'tv': 'tv',
          'anime': 'anime',
          'tvshow': 'tvshow',
          'doc': 'documentary'
        };
        
        // 尝试多种数据结构
        let rawData = null;
        if (action.payload?.data?.data) {
          rawData = action.payload.data.data;
        } else if (action.payload?.data) {
          rawData = action.payload.data;
        } else if (action.payload) {
          rawData = action.payload;
        }
        
        console.log('提取的原始数据:', rawData);
        
        // 处理每个类型的数据
        Object.keys(typeMapping).forEach(apiType => {
          const appType = typeMapping[apiType];
          
          // 尝试多种方式获取类型数据
          let typeData = null;
          if (rawData) {
            typeData = rawData[apiType] || rawData[appType];
          }
          
          console.log(`处理类型 ${apiType} (映射到 ${appType}):`, typeData);
          
          if (typeData) {
            processedData[appType] = {};
            rawDataForApi[appType] = {}; // 保存原始数据
            
            // 处理 regions、years、genres
            ['regions', 'years', 'genres'].forEach(filterKey => {
              const value = typeData[filterKey];
              if (value) {
                // 保存原始值（用于API调用）
                rawDataForApi[appType][filterKey] = value;
                
                // 处理显示用的数据（拆分后的数组）
                if (typeof value === 'string') {
                  // 如果是字符串，按中英文逗号/顿号分隔并去除空白
                  processedData[appType][filterKey] = value
                    .split(/[,，、]/)
                    .map(item => item.trim())
                    .filter(item => item.length > 0);
                } else if (Array.isArray(value)) {
                  // 如果已经是数组，直接使用
                  processedData[appType][filterKey] = value;
                } else {
                  processedData[appType][filterKey] = [];
                }
              } else {
                processedData[appType][filterKey] = [];
                rawDataForApi[appType][filterKey] = null;
              }
            });
            
            console.log(`处理后的 ${appType} 数据:`, processedData[appType]);
            console.log(`原始 ${appType} 数据:`, rawDataForApi[appType]);
          } else {
            console.warn(`未找到类型 ${apiType} 的数据`);
          }
        });
        
        console.log('最终处理的数据:', processedData);
        console.log('最终原始数据:', rawDataForApi);
        state.allFilters.data = processedData;
        state.allFilters.rawData = rawDataForApi;
      })
      .addCase(fetchAllFilters.rejected, (state, action) => {
        state.allFilters.loading = false;
        state.allFilters.error = action.payload?.message || '获取筛选条件失败';
      })
      // 搜索结果
      .addCase(searchVideoList.pending, (state) => {
        state.searchResults.loading = true;
        state.searchResults.error = null;
      })
      .addCase(searchVideoList.fulfilled, (state, action) => {
        state.searchResults.loading = false;
        // 添加空值检查
        if (action.payload && action.payload.data && action.payload.data.list && Array.isArray(action.payload.data.list)) {
          const currentPage = action.payload.data.page || 1;
          const newList = action.payload.data.list;
          
          // 如果是第一页，替换数据；否则追加数据
          if (currentPage === 1) {
            state.searchResults.data = newList;
          } else {
            // 追加新数据，避免重复
            const existingIds = new Set(state.searchResults.data.map(item => item.id));
            const uniqueNewItems = newList.filter(item => !existingIds.has(item.id));
            state.searchResults.data = [...state.searchResults.data, ...uniqueNewItems];
          }
          
          const pageSize = action.payload.data.size || action.payload.data.page_size || 10;
          const total = action.payload.data.total || 0;
          
          // 如果返回的列表为空，说明没有下一页了
          let hasNext = newList.length > 0;
          
          // 如果返回了数据，再检查其他条件
          if (hasNext) {
            if (action.payload.data.has_next !== undefined) {
              hasNext = Boolean(action.payload.data.has_next);
            } else if (total > 0) {
              const currentTotal = state.searchResults.data.length;
              hasNext = currentTotal < total;
            } else if (newList.length < pageSize) {
              hasNext = false;
            }
          }
          
          state.searchResults.pagination = {
            page: currentPage,
            pageSize: pageSize,
            total: total,
            has_next: hasNext,
          };
        } else {
          console.warn('Unexpected search results data structure:', action.payload);
          state.searchResults.data = [];
          state.searchResults.pagination = {};
        }
      })
      .addCase(searchVideoList.rejected, (state, action) => {
        state.searchResults.loading = false;
        state.searchResults.error = action.payload?.message || '搜索失败';
      })
      // 筛选结果
      .addCase(filterVideoList.pending, (state) => {
        state.filterResults.loading = true;
        state.filterResults.error = null;
      })
      .addCase(filterVideoList.fulfilled, (state, action) => {
        state.filterResults.loading = false;
        // 添加空值检查
        if (action.payload && action.payload.data && action.payload.data.list && Array.isArray(action.payload.data.list)) {
          const currentPage = action.payload.data.page || 1;
          const newList = action.payload.data.list;
          
          // 如果是第一页，替换数据；否则追加数据
          if (currentPage === 1) {
            state.filterResults.data = newList;
          } else {
            // 追加新数据，避免重复
            const existingIds = new Set(state.filterResults.data.map(item => item.id));
            const uniqueNewItems = newList.filter(item => !existingIds.has(item.id));
            state.filterResults.data = [...state.filterResults.data, ...uniqueNewItems];
          }
          
          const pageSize = action.payload.data.size || action.payload.data.page_size || 10;
          const total = action.payload.data.total || 0;
          
          // 如果返回的列表为空，说明没有下一页了
          let hasNext = newList.length > 0;
          
          // 如果返回了数据，再检查其他条件
          if (hasNext) {
            if (action.payload.data.has_next !== undefined) {
              hasNext = Boolean(action.payload.data.has_next);
            } else if (total > 0) {
              const currentTotal = state.filterResults.data.length;
              hasNext = currentTotal < total;
            } else if (newList.length < pageSize) {
              hasNext = false;
            }
          }
          
          state.filterResults.pagination = {
            page: currentPage,
            pageSize: pageSize,
            total: total,
            has_next: hasNext,
          };
        } else {
          console.warn('Unexpected filter results data structure:', action.payload);
          state.filterResults.data = [];
          state.filterResults.pagination = {};
        }
      })
      .addCase(filterVideoList.rejected, (state, action) => {
        state.filterResults.loading = false;
        state.filterResults.error = action.payload?.message || '筛选失败';
      })
      // 剧集信息
      .addCase(fetchEpisodes.pending, (state) => {
        state.episodes.loading = true;
        state.episodes.error = null;
      })
      .addCase(fetchEpisodes.fulfilled, (state, action) => {
        state.episodes.loading = false;
        console.log('fetchEpisodes.fulfilled - action.payload:', action.payload);
        
        // 根据API文档，响应结构可能是：
        // 1. { data: { list: [], recommendations: [] } }
        // 2. { list: [], recommendations: [] }
        // 3. { data: { data: { list: [], recommendations: [] } } }
        
        let recommendations = [];
        let episodeList = [];
        
        // 尝试多种数据结构
        if (action.payload) {
          // 情况1: action.payload.data.recommendations
          if (action.payload.data?.recommendations && Array.isArray(action.payload.data.recommendations)) {
            recommendations = action.payload.data.recommendations;
            console.log('找到推荐数据 (data.recommendations):', recommendations.length);
          }
          // 情况2: action.payload.recommendations
          else if (action.payload.recommendations && Array.isArray(action.payload.recommendations)) {
            recommendations = action.payload.recommendations;
            console.log('找到推荐数据 (recommendations):', recommendations.length);
          }
          // 情况3: action.payload.data.data.recommendations
          else if (action.payload.data?.data?.recommendations && Array.isArray(action.payload.data.data.recommendations)) {
            recommendations = action.payload.data.data.recommendations;
            console.log('找到推荐数据 (data.data.recommendations):', recommendations.length);
          }
          
          // 处理剧集列表
          if (action.payload.data?.list && Array.isArray(action.payload.data.list)) {
            episodeList = action.payload.data.list;
          } else if (action.payload.data?.data?.list && Array.isArray(action.payload.data.data.list)) {
            episodeList = action.payload.data.data.list;
          } else if (action.payload.list && Array.isArray(action.payload.list)) {
            episodeList = action.payload.list;
          } else if (Array.isArray(action.payload.data)) {
            episodeList = action.payload.data;
          }
        }
        
        state.episodes.data = episodeList;
        state.episodes.recommendations = recommendations;
        
        console.log('最终设置的推荐数据数量:', state.episodes.recommendations.length);
        console.log('最终设置的剧集数据数量:', state.episodes.data.length);
      })
      .addCase(fetchEpisodes.rejected, (state, action) => {
        state.episodes.loading = false;
        state.episodes.error = action.payload?.message || '获取剧集信息失败';
      })
      // 播放地址
      .addCase(fetchPlayUrl.pending, (state) => {
        console.log('fetchPlayUrl pending');
        state.playUrl.loading = true;
        state.playUrl.error = null;
      })
      .addCase(fetchPlayUrl.fulfilled, (state, action) => {
        console.log('fetchPlayUrl fulfilled with payload:', action.payload);
        state.playUrl.loading = false;
        state.playUrl.error = null;
        
        // fetchPlayUrl 返回的是 response.data，所以 action.payload 可能是：
        // 1. { data: { video_id, episode_number, play_url, updated_at } } - 如果 API 返回嵌套结构
        // 2. { video_id, episode_number, play_url, updated_at } - 如果 API 直接返回数据
        // 3. { play_url: ... } - 简化结构
        
        let playUrlData = action.payload;
        
        // 如果 payload 有 data 字段，使用 data
        if (playUrlData && playUrlData.data) {
          playUrlData = playUrlData.data;
        }
        
        if (playUrlData) {
          // 优先检查 play_url 字段（API文档中的标准字段）
          if (playUrlData.play_url) {
            state.playUrl.url = playUrlData.play_url;
            state.playUrl.qualityOptions = []; // API文档中没有质量选项
            state.playUrl.selectedQuality = '';
            console.log('Set play URL from API (play_url):', state.playUrl.url);
          } 
          // 兼容旧格式：支持 quality_options
          else if (playUrlData.quality_options && Array.isArray(playUrlData.quality_options) && playUrlData.quality_options.length > 0) {
            state.playUrl.qualityOptions = playUrlData.quality_options;
            const defaultQuality = playUrlData.quality_options[0];
          state.playUrl.selectedQuality = defaultQuality.quality;
          state.playUrl.url = defaultQuality.url;
            console.log('Set quality options (legacy format):', state.playUrl.qualityOptions);
          } 
          // 兼容 url 字段
          else if (playUrlData.url) {
            state.playUrl.url = playUrlData.url;
            state.playUrl.qualityOptions = [];
            state.playUrl.selectedQuality = '';
            console.log('Set play URL (url field):', state.playUrl.url);
          } 
          else {
            console.warn('No valid play URL found in payload:', playUrlData);
            state.playUrl.url = '';
          state.playUrl.qualityOptions = [];
          state.playUrl.selectedQuality = '';
            state.playUrl.error = '无法获取有效的播放地址';
          }
        } else {
          console.warn('No payload data found');
          state.playUrl.url = '';
          state.playUrl.qualityOptions = [];
          state.playUrl.selectedQuality = '';
          state.playUrl.error = '无法获取有效的播放地址';
        }
      })
      .addCase(fetchPlayUrl.rejected, (state, action) => {
        console.log('fetchPlayUrl rejected with error:', action.payload);
        state.playUrl.loading = false;
        state.playUrl.error = action.payload?.message || '获取播放地址失败';
      });
  },
});

export const { clearSearchResults, clearFilterResults, clearPlayUrl, clearEpisodes, selectQuality, setPlaybackProgress, clearPlaybackProgress, setPlayUrlFromEpisode } = videoSlice.actions;
export default videoSlice.reducer;