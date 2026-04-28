// utils/playHistory.js
// 播放记录本地存储工具

const STORAGE_KEY = 'wtv_play_history';
const MAX_HISTORY_COUNT = 50; // 最多保存50条记录

// 动态导入播放列表工具，避免循环依赖
let addToPlaylistFn = null;
const getAddToPlaylist = () => {
  if (!addToPlaylistFn) {
    try {
      const playlistModule = require('./playlist');
      addToPlaylistFn = playlistModule.addToPlaylist;
    } catch (error) {
      console.warn('无法导入播放列表工具:', error);
    }
  }
  return addToPlaylistFn;
};

/**
 * 获取所有播放记录
 */
export function getPlayHistory() {
  try {
    const historyStr = localStorage.getItem(STORAGE_KEY);
    console.log('🔍 getPlayHistory: localStorage 原始字符串:', historyStr ? historyStr.substring(0, 200) + '...' : 'null');
    if (!historyStr) {
      console.log('🔍 getPlayHistory: localStorage 中没有数据，返回空数组');
      return [];
    }
    const parsed = JSON.parse(historyStr);
    console.log('🔍 getPlayHistory: 解析后的数据数量:', parsed.length);
    return parsed;
  } catch (error) {
    console.error('❌ 获取播放记录失败:', error);
    return [];
  }
}

/**
 * 保存播放记录
 * @param {Object} record - 播放记录对象
 * @param {string} record.videoId - 视频ID
 * @param {string} record.videoTitle - 视频标题
 * @param {string} record.videoCover - 视频封面
 * @param {string} record.videoType - 视频类型 (movie/tv/anime/tvshow/documentary)
 * @param {number} record.episode - 集数（电影为null）
 * @param {number} record.progress - 播放进度（秒）
 * @param {number} record.duration - 视频总时长（秒）
 * @param {number} record.timestamp - 更新时间戳
 */
export function savePlayHistory(record) {
  try {
    let history = getPlayHistory();
    
    // 确保 record 中的 progress 和 duration 是数字类型
    const normalizedRecord = {
      ...record,
      progress: Number(record.progress) || 0,
      duration: Number(record.duration) || 0,
      timestamp: record.timestamp || Date.now()
    };
    
    // 查找是否已存在该视频的记录（同一视频ID，不区分集数）
    const existingIndex = history.findIndex(
      item => item.videoId === normalizedRecord.videoId
    );
    
    if (existingIndex >= 0) {
      // 更新现有记录（覆盖集数、进度等信息）
      history[existingIndex] = {
        ...history[existingIndex],
        ...normalizedRecord,
        timestamp: Date.now()
      };
      // 将更新后的记录移到最前面（因为时间戳更新了）
      const updatedRecord = history.splice(existingIndex, 1)[0];
      history.unshift(updatedRecord);
    } else {
      // 添加新记录
      history.unshift({
        ...normalizedRecord,
        timestamp: Date.now()
      });
    }
    
    // 限制记录数量
    if (history.length > MAX_HISTORY_COUNT) {
      history = history.slice(0, MAX_HISTORY_COUNT);
    }
    
    // 按时间戳倒序排序（最新的在前）
    history.sort((a, b) => b.timestamp - a.timestamp);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    console.log('💾 保存播放记录到 localStorage:', {
      record: normalizedRecord,
      totalRecords: history.length,
      storageKey: STORAGE_KEY
    });
    
    // 验证保存是否成功
    const verifyStr = localStorage.getItem(STORAGE_KEY);
    if (verifyStr) {
      try {
        const verifyData = JSON.parse(verifyStr);
        console.log('✅ 验证保存成功，当前记录数:', verifyData.length);
      } catch (e) {
        console.error('❌ 验证失败：无法解析保存的数据！', e);
      }
    } else {
      console.error('❌ 验证失败：保存后无法读取数据！');
    }
    
    return true;
  } catch (error) {
    console.error('保存播放记录失败:', error);
    return false;
  }
}

/**
 * 获取指定视频的播放记录
 * @param {string} videoId - 视频ID
 * @param {number|null} episode - 集数（电影为null，此参数已废弃，保留用于兼容性）
 */
export function getVideoPlayHistory(videoId, episode = null) {
  try {
    const history = getPlayHistory();
    // 同一视频只保留一条记录，所以只需要匹配videoId
    return history.find(item => item.videoId === videoId);
  } catch (error) {
    console.error('获取视频播放记录失败:', error);
    return null;
  }
}

/**
 * 删除播放记录
 * @param {string} videoId - 视频ID
 * @param {number|null} episode - 集数（电影为null，此参数已废弃，保留用于兼容性）
 */
export function deletePlayHistory(videoId, episode = null) {
  try {
    let history = getPlayHistory();
    // 同一视频只保留一条记录，所以只需要匹配videoId
    history = history.filter(item => item.videoId !== videoId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.error('删除播放记录失败:', error);
    return false;
  }
}

/**
 * 清空所有播放记录
 */
export function clearPlayHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('清空播放记录失败:', error);
    return false;
  }
}

/**
 * 更新播放进度
 * @param {string} videoId - 视频ID
 * @param {number|null} episode - 集数（电影为null）
 * @param {number} progress - 播放进度（秒）
 * @param {number} duration - 视频总时长（秒）
 */
export function updatePlayProgress(videoId, episode, progress, duration, videoTitle, videoCover, videoType) {
  try {
    console.log('updatePlayProgress 被调用:', { videoId, episode, progress, duration, videoTitle, videoCover, videoType });
    
    // 查找该视频的记录（不区分集数，因为同一视频只保留一条记录）
    let record = getVideoPlayHistory(videoId);
    console.log('查找到的记录:', record);
    
    if (!record) {
      // 如果记录不存在，创建新记录
      // 确保 progress 和 duration 是数字类型
      record = {
        videoId: videoId,
        videoTitle: videoTitle || '未知视频',
        videoCover: videoCover || '',
        videoType: videoType || 'movie',
        episode: episode,
        progress: Number(progress) || 0,
        duration: Number(duration) || 0,
        timestamp: Date.now()
      };
      console.log('创建新记录:', record);
    } else {
      // 确保 progress 和 duration 是数字类型
      const numProgress = Number(progress) || 0;
      const numDuration = Number(duration) || 0;
      
      // 如果播放进度接近结束（剩余时间少于5秒），视为播放完成
      const remainingTime = numDuration - numProgress;
      if (remainingTime <= 5 && numDuration > 0) {
        // 播放完成，从头开始
        record.progress = 0;
        console.log('播放完成，重置进度为0');
      } else {
        record.progress = numProgress;
        console.log('更新进度:', numProgress);
      }
      
      // 更新 duration 的策略：
      // 1. 如果新的 duration > 0，总是更新（即使记录中已有值）
      // 2. 如果新的 duration 为 0，但记录中已有有效的 duration，保留原值
      // 3. 如果新的 duration 为 0，且记录中也没有有效时长，也更新为 0（但会在后续播放时更新）
      if (numDuration > 0) {
        const oldDuration = record.duration;
        record.duration = numDuration;
        console.log('✅ 更新时长:', {
          旧时长: oldDuration,
          新时长: numDuration,
          是否变化: oldDuration !== numDuration
        });
      } else {
        // 如果当前 duration 为 0，但记录中已有有效的 duration，保留原值
        if (!record.duration || record.duration === 0) {
          console.log('⚠️ duration 为 0，且记录中也没有有效时长，保持为 0');
          // 保持为 0，等待后续更新
        } else {
          console.log('✅ duration 为 0，保留原有时长:', record.duration);
        }
      }
      
      // 确保 progress 总是更新（除非播放完成）
      // 即使 progress 为 0，也要更新（可能是从头开始播放）
      if (numProgress >= 0) {
        // progress 已经在上面更新了，这里只是确保逻辑正确
        console.log('最终进度:', record.progress, '最终时长:', record.duration);
      }
      
      record.episode = episode; // 更新当前播放的集数（如果集数变化）
      // 如果提供了视频信息，更新标题和封面（可能会变化）
      if (videoTitle) record.videoTitle = videoTitle;
      if (videoCover) record.videoCover = videoCover;
      if (videoType) record.videoType = videoType;
      record.timestamp = Date.now();
    }
    
    // 确保保存前 record 中的 progress 和 duration 都是有效数字
    record.progress = Number(record.progress) || 0;
    record.duration = Number(record.duration) || 0;
    
    console.log('准备保存的记录:', {
      videoId: record.videoId,
      progress: record.progress,
      duration: record.duration,
      episode: record.episode,
      progressType: typeof record.progress,
      durationType: typeof record.duration
    });
    
    const result = savePlayHistory(record);
    console.log('保存播放记录结果:', result);
    
    // 📋 自动添加到播放列表（如果播放记录保存成功）
    if (result) {
      try {
        const addToPlaylist = getAddToPlaylist();
        if (addToPlaylist) {
          addToPlaylist({
            videoId: record.videoId,
            videoTitle: record.videoTitle,
            videoCover: record.videoCover,
            videoType: record.videoType,
            episode: record.episode,
            timestamp: record.timestamp
          });
          console.log('✅ 已自动添加到播放列表:', {
            videoId: record.videoId,
            videoTitle: record.videoTitle,
            episode: record.episode
          });
        }
      } catch (error) {
        console.warn('添加到播放列表失败（不影响播放记录保存）:', error);
      }
    }
    
    // 验证保存是否成功
    const savedRecord = getVideoPlayHistory(videoId);
    if (savedRecord) {
      // 再次确保数据类型正确
      savedRecord.progress = Number(savedRecord.progress) || 0;
      savedRecord.duration = Number(savedRecord.duration) || 0;
      
      console.log('保存后的记录验证:', {
        videoId: savedRecord.videoId,
        progress: savedRecord.progress,
        duration: savedRecord.duration,
        progressType: typeof savedRecord.progress,
        durationType: typeof savedRecord.duration,
        episode: savedRecord.episode,
        timestamp: savedRecord.timestamp,
        rawProgress: savedRecord.progress,
        rawDuration: savedRecord.duration
      });
      
      // 如果保存后 progress 或 duration 仍然是 0，输出警告
      if (savedRecord.progress === 0 && savedRecord.duration === 0) {
        console.warn('⚠️ 警告：保存后的记录 progress 和 duration 都为 0！', {
          videoId: savedRecord.videoId,
          传入的progress: progress,
          传入的duration: duration,
          保存的progress: savedRecord.progress,
          保存的duration: savedRecord.duration,
          原始record: record
        });
      } else if (savedRecord.duration === 0 && savedRecord.progress > 0) {
        console.warn('⚠️ 警告：保存后的记录 duration 为 0，但 progress > 0！', {
          videoId: savedRecord.videoId,
          progress: savedRecord.progress,
          duration: savedRecord.duration
        });
      }
    } else {
      console.error('❌ 保存后未找到记录，可能保存失败！', { videoId });
    }
  } catch (error) {
    console.error('更新播放进度失败:', error);
  }
}

