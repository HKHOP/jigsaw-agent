const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

Menu.setApplicationMenu(null);

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

const DATA_DIR = app.getPath('userData');

async function startServer() {
  process.env.DATA_DIR = DATA_DIR;
  fs.mkdirSync(DATA_DIR, { recursive: true });

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

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
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
