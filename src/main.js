const { app, BrowserWindow, ipcMain, desktopCapturer, screen, clipboard, Menu } = require('electron');
const path = require('path');

let mainWindow = null;
let overlayWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 760,
    minHeight: 520,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'color-picker-logo.ico'),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Sleek Color Picker'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createOverlayWindow(targetDisplay) {
  const display = targetDisplay || screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    movable: false,
    resizable: false,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setContentProtection(true);
  overlayWindow.loadFile(path.join(__dirname, 'overlay', 'index.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// IPC bridge
ipcMain.handle('overlay:start', async () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) return true;
  const pt = screen.getCursorScreenPoint();
  const disp = screen.getDisplayNearestPoint(pt);
  createOverlayWindow(disp);
  return true;
});

ipcMain.on('overlay:done', (_evt, hex) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('eyedropper:color', hex);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
});

ipcMain.on('overlay:cancel', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
});

app.whenReady().then(() => {
  // Ensure Windows taskbar pinning uses our identity & icon
  try { app.setAppUserModelId('com.example.colorpicker'); } catch {}
  // Hide the default application menu (File/Edit/View...)
  try { Menu.setApplicationMenu(null); } catch {}
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Optional: provide helpers to overlay via IPC invoking
ipcMain.handle('system:get-cursor', () => {
  try {
    return screen.getCursorScreenPoint();
  } catch (e) {
    return { x: 0, y: 0 };
  }
});

ipcMain.handle('system:get-display-info-for-point', async (_e, point) => {
  const disp = screen.getDisplayNearestPoint(point);
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const match = sources.find((s) => s.display_id === String(disp.id)) || sources[0];
  return {
    displayId: String(disp.id),
    scaleFactor: disp.scaleFactor,
    bounds: disp.bounds,
    sourceId: match ? match.id : null
  };
});

ipcMain.handle('overlay:set-bounds', (_e, bounds) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setBounds(bounds);
  }
  return true;
});

ipcMain.handle('clipboard:write', (_e, text) => {
  try {
    clipboard.writeText(String(text ?? ''));
    return true;
  } catch {
    return false;
  }
});

