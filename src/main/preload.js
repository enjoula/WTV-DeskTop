// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getVersionCode: () => ipcRenderer.invoke('get-version-code'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openVideoWindow: (videoId, videoData) => ipcRenderer.invoke('open-video-window', videoId, videoData),
  updateVideoWindowTitle: (title) => ipcRenderer.invoke('update-video-window-title', title),
  getVideoData: () => ipcRenderer.invoke('get-video-data'),
});