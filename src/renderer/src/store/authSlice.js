// store/authSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { login as loginApi, getCurrentUser, logout as logoutApi } from '../api/user';

// 异步action - 用户登录
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await loginApi(credentials);
      console.log('登录响应:', response);
      // 检查响应结构
      if (response.data && (response.data.code === 200 || response.data.data)) {
        return response.data;
      }
      return response.data;
    } catch (error) {
      console.error('登录错误:', error);
      // 改进错误处理
      const errorData = error.response?.data || { message: error.message || '登录失败' };
      return rejectWithValue(errorData);
    }
  }
);

// 异步action - 获取当前用户
export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await getCurrentUser();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// 异步action - 用户登出
export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await logoutApi();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

const initialToken = localStorage.getItem('token') || null;

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: initialToken,
    // 如果本地有 token，视为已登录态，后续若 401 会自动清除
    isAuthenticated: !!initialToken,
    loading: false,
    error: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setToken: (state, action) => {
      state.token = action.payload || null;
      state.isAuthenticated = !!action.payload;
      if (action.payload) {
      localStorage.setItem('token', action.payload);
      } else {
        localStorage.removeItem('token');
      }
    },
    setUser: (state, action) => {
      state.user = action.payload;
      state.isAuthenticated = !!state.token;
    },
    setAuthData: (state, action) => {
      // 同时设置token和用户信息
      const { token, user } = action.payload;
      state.token = token || null;
      state.user = user || null;
      state.isAuthenticated = !!token;
      if (token) {
        localStorage.setItem('token', token);
      } else {
        localStorage.removeItem('token');
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // 登录相关
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        // 处理不同的响应结构
        const responseData = action.payload?.data || action.payload;
        if (responseData) {
          state.token = responseData.token || responseData.access_token;
          state.isAuthenticated = !!state.token;
          state.user = responseData.user || responseData;
          if (state.token) {
            localStorage.setItem('token', state.token);
          }
        } else {
          // 如果响应结构不符合预期，设置错误
          state.error = '登录响应格式错误';
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        // 改进错误消息显示
        const errorMessage = action.payload?.message || 
                            action.payload?.error || 
                            action.error?.message || 
                            '登录失败，请检查用户名和密码';
        state.error = errorMessage;
        console.error('登录失败:', action.payload || action.error);
      })
      // 获取用户信息相关
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.data;
        state.isAuthenticated = true;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.loading = false;
        // 不向 UI 暴露“获取用户信息失败”这类错误，避免超过 3 台登录时提示影响登录页体验
        state.error = null;
        state.isAuthenticated = false;
        state.token = null;
        state.user = null;
        localStorage.removeItem('token');
      })
      // 登出相关
      .addCase(logoutUser.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        state.isAuthenticated = false;
        localStorage.removeItem('token');
      })
      .addCase(logoutUser.rejected, (state) => {
        // 即使API调用失败，我们也清除本地状态
        state.token = null;
        state.user = null;
        state.isAuthenticated = false;
        localStorage.removeItem('token');
      });
  },
});

export const { clearError, setToken, setUser, setAuthData } = authSlice.actions;
export default authSlice.reducer;