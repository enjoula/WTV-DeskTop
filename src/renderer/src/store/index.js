// store/index.js
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { clearAuth } from './authSlice';
import videoReducer from './videoSlice';
import favoriteReducer from './favoriteSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    video: videoReducer,
    favorite: favoriteReducer,
  },
});

// 监听来自 api/client.js 的强制登出事件（避免循环依赖）
if (typeof window !== 'undefined') {
  window.addEventListener('auth:force-logout', () => {
    store.dispatch(clearAuth());
  });
}

export default store;