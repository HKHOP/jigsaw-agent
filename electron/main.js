const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');

Menu.setApplicationMenu(null);

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let mainWindow = null;
let serverModule = null;

ipcMain.handle('win-minimize', () => mainWindow?.minimize());
ipcMain.handle('win-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('win-close', () => mainWindow?.close());
ipcMain.handle('restart-and-update', () => {
  autoUpdater.quitAndInstall(false, true);
});
ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
});
ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdates().catch(() => {});
});

const DATA_DIR = app.getPath('userData');
const PROJECT_DIR = path.dirname(__dirname);

function migrateData() {
  const projectData = path.join(PROJECT_DIR, 'data');
  const settingsDest = path.join(DATA_DIR, 'settings.json');
  const chatsDest = path.join(DATA_DIR, 'chats.json');
  let migrated = false;

  if (!fs.existsSync(settingsDest)) {
    const settingsSrc = path.join(projectData, 'settings.json');
    if (fs.existsSync(settingsSrc)) {
      try {
        fs.copyFileSync(settingsSrc, settingsDest);
        migrated = true;
      } catch {}
    }
  }

  if (!fs.existsSync(chatsDest)) {
    const chatsSrc = path.join(projectData, 'chats.json');
    if (fs.existsSync(chatsSrc)) {
      try {
        fs.copyFileSync(chatsSrc, chatsDest);
        migrated = true;
      } catch {}
    }
  }

  return migrated;
}

function getReleaseChannel() {
  try {
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const data = JSON.parse(raw);
    return data.releaseChannel || 'stable';
  } catch {
    return 'stable';
  }
}

async function startServer() {
  process.env.DATA_DIR = DATA_DIR;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  migrateData();

  serverModule = require(path.join(__dirname, '..', 'index.js'));

  const port = await serverModule.start();
  return port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    title: 'Jigsaw Agent',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('maximize', () => mainWindow?.webContents.send('win-maximize-changed', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('win-maximize-changed', false));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdater() {
  const channel = getReleaseChannel();
  autoUpdater.channel = channel === 'nightly' ? 'nightly' : 'latest';
  autoUpdater.allowPrerelease = channel === 'nightly';

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', progress);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', err?.message || err?.toString() || 'Unknown error');
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
    setupAutoUpdater();
  } catch (err) {
    dialog.showErrorBox('Startup Error', 'Failed to start server:\n' + err.message);
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  if (serverModule) {
    await serverModule.stop();
  }
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null && serverModule) {
    createWindow(serverModule.port);
  }
});
