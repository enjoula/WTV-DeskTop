// pages/PlayHistory.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPlayHistory, deletePlayHistory, clearPlayHistory } from '../utils/playHistory';
import VideoImage from '../components/VideoImage';
import { showTip } from '../utils/tips';

const PlayHistory = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    console.log('📂 PlayHistory: 开始加载播放记录');
    const playHistory = getPlayHistory();
    console.log('📂 PlayHistory: 从 localStorage 获取的记录数量:', playHistory.length);
    console.log('📂 PlayHistory: 原始数据:', playHistory);
    
    // 确保 progress 和 duration 是数字类型
    const normalizedHistory = playHistory.map(item => {
      const progress = item.progress != null ? Number(item.progress) : 0;
      const duration = item.duration != null ? Number(item.duration) : 0;
      
      // 调试：打印原始值和转换后的值
      if (progress === 0 && duration === 0) {
        console.warn('播放记录中 progress 和 duration 都为 0:', {
          videoId: item.videoId,
          videoTitle: item.videoTitle,
          originalProgress: item.progress,
          originalDuration: item.duration,
          progressType: typeof item.progress,
          durationType: typeof item.duration
        });
      }
      
      return {
        ...item,
        progress: progress,
        duration: duration,
        // 确保 timestamp 也是数字
        timestamp: item.timestamp != null ? Number(item.timestamp) : Date.now()
      };
    });
    console.log('加载播放记录（标准化后）:', normalizedHistory);
    setHistory(normalizedHistory);
  };

  const handleDelete = (videoId, episode, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (deletePlayHistory(videoId, episode)) {
      showTip('删除成功');
      loadHistory();
    } else {
      showTip('删除失败');
    }
  };

  const handleClearAll = () => {
    if (window.confirm('确定要清空所有播放记录吗？')) {
      if (clearPlayHistory()) {
        showTip('清空成功');
        loadHistory();
      } else {
        showTip('清空失败');
      }
    }
  };

  const formatTime = (seconds) => {
    // 处理 null、undefined、空字符串等情况
    if (seconds === null || seconds === undefined || seconds === '') {
      return '00:00';
    }
    
    // 确保是数字类型
    const numSeconds = Number(seconds);
    
    // 检查是否为有效数字
    if (isNaN(numSeconds) || numSeconds < 0) {
      return '00:00';
    }
    
    // 如果是 0，也返回 00:00
    if (numSeconds === 0) {
      return '00:00';
    }
    
    const hours = Math.floor(numSeconds / 3600);
    const minutes = Math.floor((numSeconds % 3600) / 60);
    const secs = Math.floor(numSeconds % 60);
    
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 0 ? '刚刚' : `${minutes}分钟前`;
      }
      return `${hours}小时前`;
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  const getProgressPercent = (progress, duration) => {
    if (!duration || duration <= 0) return 0;
    return Math.min(100, (progress / duration) * 100);
  };

  if (history.length === 0) {
    return (
      <div className="play-history-page">
        <div className="page-header">
          <h1>播放记录</h1>
        </div>
        <div className="empty-state">
          <p>暂无播放记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className="play-history-page">
      <div className="page-header">
        <h1>播放记录</h1>
        <button className="clear-all-btn" onClick={handleClearAll}>
          清空全部
        </button>
      </div>
      
      <div className="play-history-list">
        {history.map((item, index) => {
          // 确保 progress 和 duration 是数字
          const progress = Number(item.progress) || 0;
          const duration = Number(item.duration) || 0;
          const progressPercent = getProgressPercent(progress, duration);
          const isCompleted = progress === 0 && duration > 0; // 播放完成，从头开始
          
          // 调试日志（所有记录，特别是 progress 和 duration 为 0 的记录）
          if (progress === 0 && duration === 0) {
            console.warn(`⚠️ 播放记录 ${index + 1} - progress 和 duration 都为 0:`, {
              videoId: item.videoId,
              videoTitle: item.videoTitle,
              episode: item.episode,
              progress: progress,
              duration: duration,
              originalProgress: item.progress,
              originalDuration: item.duration,
              progressType: typeof item.progress,
              durationType: typeof item.duration,
              timestamp: item.timestamp,
              rawItem: JSON.stringify(item) // 输出原始 JSON 用于调试
            });
          } else if (index < 3) {
            console.log(`播放记录项 ${index + 1}:`, {
              videoId: item.videoId,
              videoTitle: item.videoTitle,
              episode: item.episode,
              progress: progress,
              duration: duration,
              formattedProgress: formatTime(progress),
              formattedDuration: formatTime(duration)
            });
          }
          
          return (
            <div key={`${item.videoId}-${item.episode || 'movie'}-${index}`} className="play-history-item">
              <div 
                onClick={() => {
                  // 在新窗口打开视频详情页
                    const videoData = {
                      id: item.videoId,
                      title: item.videoTitle,
                      cover_url: item.videoCover,
                    pic: item.videoCover,
                    type: item.videoType, // 添加视频类型，方便 VideoDetail 识别
                    // 将播放记录信息也包含在 videoData 中，方便通过 Electron API 传递
                    playHistory: {
                      videoId: item.videoId,
                      videoTitle: item.videoTitle,
                      videoCover: item.videoCover,
                      videoType: item.videoType,
                      episode: item.episode,
                      progress: item.progress,
                      duration: item.duration
                    }
                  };
                  const playHistoryData = {
                    videoId: item.videoId,
                    videoTitle: item.videoTitle,
                    videoCover: item.videoCover,
                    videoType: item.videoType,
                    episode: item.episode,
                    progress: item.progress,
                    duration: item.duration
                  };
                  
                  if (window.electronAPI && window.electronAPI.openVideoWindow) {
                    // 通过 Electron API 打开时，playHistory 信息已包含在 videoData 中
                    window.electronAPI.openVideoWindow(item.videoId, videoData);
                  } else {
                    // 降级处理：如果没有 Electron API，使用 navigate（开发环境可能用到）
                    navigate(`/video/${item.videoId}`, { 
                      state: { 
                        video: videoData,
                        playHistory: playHistoryData // 传递播放记录信息
                      } 
                    });
                  }
                }}
                className="play-history-link"
                style={{ cursor: 'pointer' }}
              >
                <div className="play-history-image">
                  <div className="play-history-image-inner">
                    <VideoImage 
                      key={`${item.videoId}-${item.episode || 'movie'}-cover`}
                      src={item.videoCover} 
                      alt={item.videoTitle} 
                    />
                  </div>
                  <div className="play-history-overlay">
                    <div className="play-progress-bar">
                      <div 
                        className="play-progress-fill" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="play-status-container">
                    {isCompleted ? (
                      <div className="play-status completed">已看完</div>
                      ) : (
                        <div className="play-status play-time-info">
                          <span className="play-time-group">
                            <span className="play-time-overlay">{formatDate(item.timestamp)}</span>
                            <span className="play-seen-label">看到:</span>
                          </span>
                          {duration > 0 ? (
                            <span>{formatTime(progress)} / {formatTime(duration)}</span>
                    ) : (
                            <span>{formatTime(progress)} / --</span>
                          )}
                      </div>
                    )}
                    </div>
                  </div>
                </div>
                <div className="play-history-content">
                  <h3 className="play-history-title">
                    {item.videoTitle}
                  </h3>
                  <div className="play-history-meta">
                    <span className="play-status-wrapper">
                      {item.episode !== null && item.episode !== undefined && (
                        <span className="episode-badge">第{item.episode}集</span>
                      )}
                    {isCompleted ? (
                        <span className="play-status-text">看完</span>
                    ) : (
                      <span className="play-status-text">续播</span>
                    )}
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={(e) => handleDelete(item.videoId, item.episode, e)}
                title="删除记录"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlayHistory;

