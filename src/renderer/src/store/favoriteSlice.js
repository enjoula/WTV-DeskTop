// store/favoriteSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getFavorites, toggleFavorite } from '../api/user';

// 异步action - 获取用户收藏列表
export const fetchFavorites = createAsyncThunk(
  'favorite/fetchFavorites',
  async (params, { rejectWithValue }) => {
    try {
      const response = await getFavorites(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// 异步action - 切换收藏状态
export const toggleVideoFavorite = createAsyncThunk(
  'favorite/toggleVideoFavorite',
  async (videoData, { rejectWithValue }) => {
    // 兼容处理：支持传递 ID 字符串或完整的视频对象
    const videoId = typeof videoData === 'object' ? videoData.id : videoData;
    const fullVideo = typeof videoData === 'object' ? videoData : null;
    
    try {
      const response = await toggleFavorite(videoId);
      return { videoId, fullVideo, ...response.data };
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

const favoriteSlice = createSlice({
  name: 'favorite',
  initialState: {
    favorites: {
      data: [],
      pagination: {},
      loading: false,
      error: null,
    },
    // 跟踪正在切换收藏状态的视频ID
    toggling: {},
  },
  reducers: {
    clearFavorites: (state) => {
      state.favorites = {
        data: [],
        pagination: {},
        loading: false,
        error: null,
      };
    },
  },
  extraReducers: (builder) => {
    builder
      // 获取收藏列表
      .addCase(fetchFavorites.pending, (state) => {
        state.favorites.loading = true;
        state.favorites.error = null;
      })
      .addCase(fetchFavorites.fulfilled, (state, action) => {
        state.favorites.loading = false;
        
        // 处理分页数据：如果是第一页，替换数据；否则追加数据
        const newData = action.payload.data?.list || [];
        const currentPage = action.payload.data?.page || 1;
        
        if (currentPage === 1) {
          // 第一页，替换数据
          state.favorites.data = newData;
        } else {
          // 后续页，追加数据
          state.favorites.data = [...state.favorites.data, ...newData];
        }
        
        state.favorites.pagination = {
          page: currentPage,
          size: action.payload.data?.size || 20,
          total: action.payload.data?.total || 0,
          has_next: action.payload.data?.has_next || false,
        };
      })
      .addCase(fetchFavorites.rejected, (state, action) => {
        state.favorites.loading = false;
        state.favorites.error = action.payload?.message || '获取收藏列表失败';
      })
      // 切换收藏状态
      .addCase(toggleVideoFavorite.pending, (state, action) => {
        const videoId = action.meta.arg;
        state.toggling[videoId] = true;
      })
      .addCase(toggleVideoFavorite.fulfilled, (state, action) => {
        const videoId = action.payload.videoId;
        const fullVideo = action.payload.fullVideo;
        delete state.toggling[videoId];
        
        // 更新收藏列表
        if (action.payload.data.is_favorite) {
          // 如果已收藏，添加到列表中（如果不存在）
          const exists = state.favorites.data.some(video => String(video.id) === String(videoId));
          if (!exists && fullVideo) {
            // 如果提供了完整的视频对象，则添加
            state.favorites.data = [fullVideo, ...state.favorites.data];
            state.favorites.pagination.total += 1;
          }
        } else {
          // 如果取消收藏，从列表中移除
          state.favorites.data = state.favorites.data.filter(video => String(video.id) !== String(videoId));
          state.favorites.pagination.total = Math.max(0, state.favorites.pagination.total - 1);
        }
      })
      .addCase(toggleVideoFavorite.rejected, (state, action) => {
        const videoId = action.meta.arg;
        delete state.toggling[videoId];
        // 错误处理可以在组件中进行
      });
  },
});

export const { clearFavorites } = favoriteSlice.actions;
export default favoriteSlice.reducer;