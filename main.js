const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { registerSupabaseHandlers } = require('./supabase-backend');
const { maakUpdateBeheer } = require('./update-beheer');

// BinnenApp heeft geen GPU-versnelling nodig en blijft zo stabiel op Windows-
// systemen waar Electron geen bruikbare GPU-runtime kan starten.
app.disableHardwareAcceleration();

let mainWindow   = null;
let splashWindow = null;
let forceQuit    = false;
let mainReadyToShow = false;
let startupSyncReady = false;
let startupShowTimer = null;
let _backend = null;
let opstartUpdateActief = false;
let opstartGegevensGestart = false;

async function startGegevensNaUpdate() {
  if (opstartGegevensGestart) return;
  opstartGegevensGestart = true;
  opstartUpdateActief = false;
  sendSplash({ type: 'starting' });
  await loadDataAndStart(_backend);
}

function sendUpdateStatus(status) {
  if (opstartUpdateActief) {
    if (status.fase === 'downloaden') sendSplash({ type: 'downloading', percent: status.percent });
    if (status.fase === 'installeren') sendSplash({ type: 'installing' });
    if (status.fout && status.fase === 'gereed') void startGegevensNaUpdate();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('binnenapp-update-status', status);
  }
}

const updateBeheer = maakUpdateBeheer({
  updater: autoUpdater,
  versie: app.getVersion(),
  actief: app.isPackaged,
  onStatus: sendUpdateStatus,
  onVerplichtGereed: () => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainReadyToShow || !startupSyncReady) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.flashFrame(true);
  },
  logWaarschuwing: melding => console.warn('[updater]', melding),
  afsluiten: () => { forceQuit = true; app.quit(); }
});

// ─── Splash ───────────────────────────────────────────────────────────────────

function sendSplash(data) {
  if (splashWindow && !splashWindow.isDestroyed())
    splashWindow.webContents.send('splash-status', data);
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420, height: 420,
    frame: false, resizable: false,
    maximizable: false, minimizable: false,
    alwaysOnTop: true, autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
}

// ─── Hoofdvenster ─────────────────────────────────────────────────────────────

function createMainWindow() {
  mainReadyToShow = false;
  startupSyncReady = false;
  if (startupShowTimer) clearTimeout(startupShowTimer);

  mainWindow = new BrowserWindow({
    width: 1400, height: 900,
    show: false, frame: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  mainWindow.webContents.on('did-finish-load', () => sendUpdateStatus(updateBeheer.snapshot()));
  mainWindow.on('focus', () => {
    mainWindow.flashFrame(false);
    updateBeheer.controleer();
  });
  mainWindow.loadFile(path.join(__dirname, 'BinnenApp.html'));
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') mainWindow.webContents.toggleDevTools();
  });
  mainWindow.once('ready-to-show', () => {
    mainReadyToShow = true;
    showMainWindowWhenReady();
  });
  startupShowTimer = setTimeout(() => {
    startupSyncReady = true;
    showMainWindowWhenReady();
  }, 20000);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showMainWindowWhenReady() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainReadyToShow || !startupSyncReady) return;
  if (startupShowTimer) {
    clearTimeout(startupShowTimer);
    startupShowTimer = null;
  }
  mainWindow.maximize();
  mainWindow.show();
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.on('minimize-window', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('close-window',    () => { forceQuit = true; app.quit(); });
ipcMain.on('startup-sync-ready', () => {
  startupSyncReady = true;
  showMainWindowWhenReady();
});
ipcMain.handle('get-app-version', () => app.getVersion());

function isHoofdvensterVerzoek(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;
}
ipcMain.handle('binnenapp-update-status', event => {
  if (!isHoofdvensterVerzoek(event)) throw new Error('Updategegevens zijn alleen in het hoofdvenster beschikbaar.');
  return updateBeheer.snapshot();
});
ipcMain.handle('binnenapp-update-herstart', event => {
  if (!isHoofdvensterVerzoek(event)) return { ok: false, fout: 'Opnieuw opstarten is alleen vanuit BinnenApp toegestaan.' };
  return updateBeheer.herstart();
});

// ─── Data prefetch & push ────────────────────────────────────────────────────

let _prefetchedData = null;

// Synchrone IPC: preload.js haalt data op vóór de eerste render
ipcMain.on('get-prefetched-data-sync', (event) => {
  event.returnValue = _prefetchedData;
  _prefetchedData = null;
});

async function loadDataAndStart(backend) {
  sendSplash({ type: 'loading-data', percent: 0, label: 'Verbinden met database...' });

  // Laatste vangnet: wat er ook misgaat in de prefetch, het venster gaat open.
  // Zonder dit blijft de app in het splash screen hangen als een query blijft
  // wachten - de gebruiker kan er dan niet omheen.
  const noodrem = new Promise(resolve => setTimeout(() => {
    console.warn('[prefetch] duurde te lang, app wordt zonder voorgeladen data gestart');
    resolve(null);
  }, 20000));

  try {
    _prefetchedData = await Promise.race([
      backend.prefetchAll((loaded, total, label) => {
        sendSplash({ type: 'loading-data', percent: Math.round(loaded / total * 100), label: label });
      }),
      noodrem
    ]);
  } catch (err) {
    console.error('[prefetch] mislukt:', err);
    _prefetchedData = null;
  }

  sendSplash({ type: 'loading-data', percent: 100, label: 'App openen...' });
  createMainWindow();
}

app.whenReady().then(() => {
  _backend = registerSupabaseHandlers({
    app,
    safeStorage,
    ipcMain,
    onCartRealtime: (bericht) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('supabase-cart-realtime', bericht);
    }
  });
  const backend = _backend;
  createSplashWindow();

  splashWindow.webContents.once('did-finish-load', async () => {
    sendSplash({ type: 'version', version: app.getVersion() });

    opstartUpdateActief = true;
    sendSplash({ type: 'checking-update' });
    let wachtTimer;
    // Bij een trage verbinding blijft starten mogelijk. De controle loopt dan
    // op de achtergrond verder en toont de normale updatemelding.
    await Promise.race([
      updateBeheer.start(),
      new Promise(resolve => { wachtTimer = setTimeout(resolve, 30000); })
    ]);
    clearTimeout(wachtTimer);
    if (updateBeheer.snapshot().fase === 'gereed') {
      const resultaat = updateBeheer.herstart();
      if (resultaat.ok) return;
    }
    await startGegevensNaUpdate();
  });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => updateBeheer.voorAfsluiten(event));
app.on('will-quit', () => updateBeheer.stop());
