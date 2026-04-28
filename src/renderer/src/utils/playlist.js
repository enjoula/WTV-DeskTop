// utils/playlist.js
// 播放列表本地存储工具

const STORAGE_KEY = 'wtv_playlist';
const MAX_PLAYLIST_COUNT = 100; // 最多保存100个视频

/**
 * 获取播放列表
 */
export function getPlaylist() {
  try {
    const playlistStr = localStorage.getItem(STORAGE_KEY);
    if (!playlistStr) {
      return [];
    }
    const parsed = JSON.parse(playlistStr);
    return parsed;
  } catch (error) {
    console.error('❌ 获取播放列表失败:', error);
    return [];
  }
}

/**
 * 保存播放列表
 * @param {Array} playlist - 播放列表数组
 */
export function savePlaylist(playlist) {
  try {
    // 限制列表数量
    const limitedPlaylist = playlist.slice(0, MAX_PLAYLIST_COUNT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedPlaylist));
    console.log('💾 保存播放列表到 localStorage:', {
      totalVideos: limitedPlaylist.length,
      storageKey: STORAGE_KEY
    });
    return true;
  } catch (error) {
    console.error('保存播放列表失败:', error);
    return false;
  }
}

/**
 * 添加视频到播放列表
 * @param {Object} video - 视频对象
 * @param {string} video.videoId - 视频ID
 * @param {string} video.videoTitle - 视频标题
 * @param {string} video.videoCover - 视频封面
 * @param {string} video.videoType - 视频类型 (movie/tv/anime/tvshow/documentary)
 * @param {number|null} video.episode - 集数（电影为null）
 * @param {number} video.timestamp - 添加时间戳
 */
export function addToPlaylist(video) {
  try {
    let playlist = getPlaylist();
    
    const videoItem = {
      videoId: video.videoId,
      videoTitle: video.videoTitle || '未知视频',
      videoCover: video.videoCover || '',
      videoType: video.videoType || 'movie',
      episode: video.episode || null,
      timestamp: video.timestamp || Date.now()
    };
    
    // 检查是否已存在（同一视频ID和集数）
    const existingIndex = playlist.findIndex(
      item => item.videoId === videoItem.videoId && 
              (item.episode === videoItem.episode || (item.episode === null && videoItem.episode === null))
    );
    
    if (existingIndex >= 0) {
      // 如果已存在，更新并移到最前面
      playlist[existingIndex] = {
        ...playlist[existingIndex],
        ...videoItem,
        timestamp: Date.now() // 更新时间戳
      };
      const updatedItem = playlist.splice(existingIndex, 1)[0];
      playlist.unshift(updatedItem);
    } else {
      // 添加新视频到列表开头
      playlist.unshift(videoItem);
    }
    
    // 限制列表数量
    if (playlist.length > MAX_PLAYLIST_COUNT) {
      playlist = playlist.slice(0, MAX_PLAYLIST_COUNT);
    }
    
    savePlaylist(playlist);
    console.log('✅ 添加到播放列表:', videoItem);
    return true;
  } catch (error) {
    console.error('添加到播放列表失败:', error);
    return false;
  }
}

/**
 * 从播放列表移除视频
 * @param {string} videoId - 视频ID
 * @param {number|null} episode - 集数（电影为null）
 */
export function removeFromPlaylist(videoId, episode = null) {
  try {
    let playlist = getPlaylist();
    playlist = playlist.filter(
      item => !(item.videoId === videoId && 
                (item.episode === episode || (item.episode === null && episode === null)))
    );
    savePlaylist(playlist);
    console.log('✅ 从播放列表移除:', { videoId, episode });
    return true;
  } catch (error) {
    console.error('从播放列表移除失败:', error);
    return false;
  }
}

/**
 * 清空播放列表
 */
export function clearPlaylist() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('✅ 清空播放列表');
    return true;
  } catch (error) {
    console.error('清空播放列表失败:', error);
    return false;
  }
}

/**
 * 检查视频是否在播放列表中
 * @param {string} videoId - 视频ID
 * @param {number|null} episode - 集数（电影为null）
 */
export function isInPlaylist(videoId, episode = null) {
  try {
    const playlist = getPlaylist();
    return playlist.some(
      item => item.videoId === videoId && 
              (item.episode === episode || (item.episode === null && episode === null))
    );
  } catch (error) {
    console.error('检查播放列表失败:', error);
    return false;
  }
}

/**
 * 从播放记录同步到播放列表
 * 将播放记录中的所有视频添加到播放列表
 */
export function syncFromPlayHistory() {
  try {
    const { getPlayHistory } = require('./playHistory');
    const playHistory = getPlayHistory();
    
    playHistory.forEach(record => {
      addToPlaylist({
        videoId: record.videoId,
        videoTitle: record.videoTitle,
        videoCover: record.videoCover,
        videoType: record.videoType,
        episode: record.episode,
        timestamp: record.timestamp
      });
    });
    
    console.log('✅ 从播放记录同步到播放列表完成，共', playHistory.length, '个视频');
    return true;
  } catch (error) {
    console.error('从播放记录同步失败:', error);
    return false;
  }
}
