const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('win-minimize'),
  maximize: () => ipcRenderer.invoke('win-maximize'),
  close: () => ipcRenderer.invoke('win-close'),
  restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onMaximizeChange: (cb) => {
    ipcRenderer.on('win-maximize-changed', (_e, maximized) => cb(maximized));
  },
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update-available', (_e, info) => cb(info));
  },
  onUpdateNotAvailable: (cb) => {
    ipcRenderer.on('update-not-available', () => cb());
  },
  onUpdateDownloaded: (cb) => {
    ipcRenderer.on('update-downloaded', () => cb());
  },
  onUpdateDownloadProgress: (cb) => {
    ipcRenderer.on('update-download-progress', (_e, progress) => cb(progress));
  },
  onUpdateError: (cb) => {
    ipcRenderer.on('update-error', (_e, msg) => cb(msg));
  },
});
