/**
 * 视频播放控制器
 * 统一管理视频播放状态和控制逻辑
 */

export class PlaybackController {
  constructor() {
    // 播放状态
    this.state = {
      userPaused: false,      // 用户是否手动暂停（最高优先级）
      isPlaying: false,       // 应用层的播放意图
      isSeeking: false,       // 是否正在拖动进度条
      isBuffering: false,     // 是否正在缓冲
      playerReady: false      // 播放器是否准备好
    };
    
    // 监控定时器
    this.pauseMonitor = null;
    
    // 日志前缀
    this.LOG_PREFIX = {
      PLAY: '🟢',
      PAUSE: '🔴',
      INFO: '🔵',
      WARNING: '🟡'
    };
  }

  /**
   * 判断是否可以播放
   * 这是整个播放控制的核心逻辑
   */
  canPlay() {
    // 如果 state 不存在，返回 false
    if (!this.state) {
      console.warn(`${this.LOG_PREFIX.WARNING} canPlay: state 不存在，返回 false`);
      return false;
    }
    
    const result = !this.state.userPaused && 
                   !this.state.isSeeking && 
                   this.state.isPlaying &&
                   this.state.playerReady;
    
    // 详细日志，特别标记用户暂停状态
    if (this.state.userPaused) {
      console.log(`${this.LOG_PREFIX.PAUSE} ❌ canPlay = false (用户已暂停)`, {
        userPaused: this.state.userPaused,
        isSeeking: this.state.isSeeking,
        isPlaying: this.state.isPlaying,
        playerReady: this.state.playerReady
      });
    } else {
      console.log(`${this.LOG_PREFIX.INFO} canPlay 检查:`, {
        userPaused: this.state.userPaused,
        isSeeking: this.state.isSeeking,
        isPlaying: this.state.isPlaying,
        playerReady: this.state.playerReady,
        result
      });
    }
    
    return result;
  }

  /**
   * 用户主动播放
   */
  userPlay() {
    this.state.userPaused = false;
    this.state.isPlaying = true;
    this.stopPauseMonitor();
  }

  /**
   * 用户主动暂停
   */
  userPause(videoElement) {
    this.state.userPaused = true;
    this.state.isPlaying = false;
    
    // 清除缓冲标志
    if (videoElement && videoElement._isBuffering) {
      videoElement._isBuffering = false;
    }
    
    // 确保视频暂停
    if (videoElement && !videoElement.paused) {
      videoElement.pause().catch(() => {});
    }
    
    // 启动暂停监控
    this.startPauseMonitor(videoElement);
  }

  /**
   * 开始拖动
   */
  startSeeking() {
    this.state.isSeeking = true;
  }

  /**
   * 结束拖动
   */
  endSeeking() {
    this.state.isSeeking = false;
  }

  /**
   * 设置播放器准备状态
   */
  setPlayerReady(ready) {
    this.state.playerReady = ready;
  }

  /**
   * 启动暂停监控
   * 持续监控视频状态，如果检测到自动播放，立即暂停
   */
  startPauseMonitor(videoElement) {
    // 清除之前的监控
    this.stopPauseMonitor();
    
    if (!videoElement) return;
    
    console.log(`${this.LOG_PREFIX.PAUSE} 启动暂停监控（持续5秒）`);
    
    this.pauseMonitor = setInterval(() => {
      // 如果用户重新开始播放，停止监控
      if (!this.state.userPaused) {
        this.stopPauseMonitor();
        return;
      }
      
      // 检测到视频自动播放，强制暂停
      if (videoElement && !videoElement.paused) {
        console.log(`${this.LOG_PREFIX.PAUSE} 监控检测到自动播放，强制暂停`);
        videoElement.pause().catch(() => {});
        this.state.isPlaying = false;
      }
    }, 100); // 每100ms检查一次
    
    // 5秒后停止监控
    setTimeout(() => this.stopPauseMonitor(), 5000);
  }

  /**
   * 停止暂停监控
   */
  stopPauseMonitor() {
    if (this.pauseMonitor) {
      clearInterval(this.pauseMonitor);
      this.pauseMonitor = null;
      console.log(`${this.LOG_PREFIX.INFO} 停止暂停监控`);
    }
  }

  /**
   * 处理 onPlay 事件
   */
  handleOnPlay(videoElement) {
    // 🎯 智能判断：如果播放器已准备好，并且收到 onPlay 事件
    // 很可能是用户点击了播放按钮，应该清除 userPaused
    if (this.state.userPaused && this.state.playerReady) {
      this.state.userPaused = false;
      this.state.isPlaying = true;
      this.stopPauseMonitor(); // 停止暂停监控
      return true;
    }
    
    // 如果用户已暂停且播放器未准备好，强制暂停视频
    if (this.state.userPaused) {
      if (videoElement && !videoElement.paused) {
        videoElement.pause().catch(() => {});
      }
      this.state.isPlaying = false;
      return false; // 返回 false 表示阻止播放
    }
    
    // 允许播放
    this.state.isPlaying = true;
    return true;
  }

  /**
   * 处理 onPause 事件
   */
  handleOnPause(videoElement, isSeeking = false) {
    // 如果是拖动导致的暂停，忽略
    if (isSeeking) {
      return;
    }
    
    // 标记为用户暂停
    this.userPause(videoElement);
  }

  /**
   * 处理 onPlaying 事件
   */
  handleOnPlaying(videoElement) {
    // 如果用户已暂停，强制暂停视频
    if (this.state.userPaused) {
      if (videoElement && !videoElement.paused) {
        videoElement.pause().catch(() => {});
      }
      this.state.isPlaying = false;
      if (videoElement && videoElement._isBuffering) {
        videoElement._isBuffering = false;
      }
      return false; // 返回 false 表示阻止播放
    }
    
    // 允许播放
    return true;
  }

  /**
   * 重置状态（切换视频时调用）
   */
  reset() {
    console.log(`${this.LOG_PREFIX.INFO} 重置播放控制器状态`);
    
    // 如果 state 被销毁了（可能在 React StrictMode 中发生），重新初始化
    if (!this.state) {
      this.state = {
        userPaused: false,
        isPlaying: false,
        isSeeking: false,
        isBuffering: false,
        playerReady: false
      };
      console.log(`${this.LOG_PREFIX.WARNING} state 为 null，已重新初始化`);
      return;
    }
    
    this.state.userPaused = false;
    this.state.isPlaying = false;
    this.state.isSeeking = false;
    this.state.isBuffering = false;
    this.state.playerReady = false;
    this.stopPauseMonitor();
  }

  /**
   * 获取当前状态（用于 React 状态同步）
   */
  getState() {
    // 如果 state 被销毁了，返回默认状态
    if (!this.state) {
      return {
        userPaused: false,
        isPlaying: false,
        isSeeking: false,
        isBuffering: false,
        playerReady: false
      };
    }
    return { ...this.state };
  }

  /**
   * 销毁控制器
   */
  destroy() {
    this.stopPauseMonitor();
    // 不设置为 null，而是重置为初始状态，避免在 React StrictMode 中出错
    if (this.state) {
      this.state.userPaused = false;
      this.state.isPlaying = false;
      this.state.isSeeking = false;
      this.state.isBuffering = false;
      this.state.playerReady = false;
    }
  }
}
