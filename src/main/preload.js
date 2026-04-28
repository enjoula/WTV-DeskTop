// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getVersionCode: () => ipcRenderer.invoke('get-version-code'),
  getInternalVersion: () => ipcRenderer.invoke('get-internal-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openVideoWindow: (videoId, videoData) => ipcRenderer.invoke('open-video-window', videoId, videoData),
  openPlayerWindow: (videoId, videoData, episodeNumber) => ipcRenderer.invoke('open-player-window', videoId, videoData, episodeNumber),
  openPageWindow: (path, title) => ipcRenderer.invoke('open-page-window', path, title),
  updateVideoWindowTitle: (title) => ipcRenderer.invoke('update-video-window-title', title),
  getVideoData: () => ipcRenderer.invoke('get-video-data'),
  downloadUpdate: (downloadUrl, fileName) => ipcRenderer.invoke('download-update', downloadUrl, fileName),
  installUpdate: (filePath) => ipcRenderer.invoke('install-update', filePath),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
    // 返回清理函数
    return () => {
      ipcRenderer.removeAllListeners('download-progress');
    };
  },
  isFullScreen: () => ipcRenderer.invoke('is-full-screen'),
  setFullScreen: (flag) => ipcRenderer.invoke('set-full-screen', flag),
  /** 渲染进程日志转发到主进程终端（开发时搜 WTV_PLAY_LOG） */
  wtvRendererLog: (tag, payload) => {
    try {
      ipcRenderer.send('wtv-renderer-log', tag, payload);
    } catch (_) {
      /* ignore */
    }
  },
});