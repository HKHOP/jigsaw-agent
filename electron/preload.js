const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('win-minimize'),
  maximize: () => ipcRenderer.invoke('win-maximize'),
  close: () => ipcRenderer.invoke('win-close'),
  restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),
  onMaximizeChange: (cb) => {
    ipcRenderer.on('win-maximize-changed', (_e, maximized) => cb(maximized));
  },
  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update-available', (_e, info) => cb(info));
  },
  onUpdateDownloaded: (cb) => {
    ipcRenderer.on('update-downloaded', () => cb());
  },
  onUpdateDownloadProgress: (cb) => {
    ipcRenderer.on('update-download-progress', (_e, progress) => cb(progress));
  },
});
