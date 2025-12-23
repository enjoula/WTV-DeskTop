// store/index.js
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import videoReducer from './videoSlice';
import favoriteReducer from './favoriteSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    video: videoReducer,
    favorite: favoriteReducer,
  },
});

export default store;