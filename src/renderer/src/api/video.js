// api/video.js
import apiClient from './client';

// 获取电影列表
export const getMovies = (params) => {
  return apiClient.get('/video/movies', { params });
};

// 获取电视剧列表
export const getTVShows = (params) => {
  return apiClient.get('/video/tv', { params });
};

// 获取动漫列表
export const getAnime = (params) => {
  return apiClient.get('/video/anime', { params });
};

// 获取综艺列表
export const getVarietyShows = (params) => {
  return apiClient.get('/video/tvshow', { params });
};

// 获取纪录片列表
export const getDocumentaries = (params) => {
  return apiClient.get('/video/documentary', { params });
};

// 获取筛选条件（带类型参数）
export const getFilters = (type) => {
  return apiClient.get(`/video/filters?type=${type}`);
};

// 获取所有筛选条件（应用启动时调用，不需要 type 参数）
export const getAllFilters = () => {
  return apiClient.get('/video/filters');
};

// 筛选视频
export const filterVideos = (params) => {
  return apiClient.get('/video/filter', { params });
};

// 搜索视频
export const searchVideos = (params) => {
  return apiClient.get('/video/search', { params });
};

// 获取视频剧集信息
// 根据API文档，参数应该是 id 而不是 videoid
export const getEpisodes = (videoId) => {
  return apiClient.get(`/video/episodes?id=${videoId}`, {
    // 未登录进入详情页时不弹全局登录框，播放时再触发登录流程
    skipUnauthorizedHandling: true,
  });
};

// 获取播放地址
export const getPlayUrl = (params) => {
  return apiClient.get('/video/play', { params });
};