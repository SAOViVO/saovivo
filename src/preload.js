const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saovivo', {
  loadState: () => ipcRenderer.invoke('state:load'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  ingestYouTube: (payload) => ipcRenderer.invoke('youtube:ingest', payload),
  selectLocalFiles: (options) => ipcRenderer.invoke('local:select', options),
  prepareItems: (items) => ipcRenderer.invoke('queue:prepare', items),
  startStream: (payload) => ipcRenderer.invoke('stream:start', payload),
  stopStream: () => ipcRenderer.invoke('stream:stop'),
  updateLoop: (enabled) => ipcRenderer.invoke('stream:loop', enabled),
  navigateStream: (direction) => ipcRenderer.invoke('stream:navigate', direction),
  updateStreamQueue: (queue, context) => ipcRenderer.invoke('stream:queue', queue, context),
  getStreamStatus: () => ipcRenderer.invoke('stream:status'),
  openDataFolder: () => ipcRenderer.invoke('data:open'),
  showStreamKeyContextMenu: () => ipcRenderer.send('stream-key:context-menu'),
  onEngineEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('engine:event', handler);
    return () => ipcRenderer.removeListener('engine:event', handler);
  }
});
