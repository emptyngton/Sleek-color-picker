const { contextBridge, ipcRenderer } = require('electron');

function toHex(r, g, b) {
  const c = (n) => n.toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

contextBridge.exposeInMainWorld('api', {
  // Renderer main UI
  startEyedropper: () => ipcRenderer.invoke('overlay:start'),
  onEyedropperColor: (cb) => {
    const handler = (_e, hex) => cb(hex);
    ipcRenderer.on('eyedropper:color', handler);
    return () => ipcRenderer.removeListener('eyedropper:color', handler);
  },
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  // Overlay helpers
  getCursorPoint: () => ipcRenderer.invoke('system:get-cursor'),
  getDisplayInfoForPoint: (point) => ipcRenderer.invoke('system:get-display-info-for-point', point),
  overlayDone: (hex) => ipcRenderer.send('overlay:done', hex),
  overlayCancel: () => ipcRenderer.send('overlay:cancel'),
  setOverlayBounds: (bounds) => ipcRenderer.invoke('overlay:set-bounds', bounds),
  toHex
});

