const { app, BrowserWindow, ipcMain, safeStorage, dialog, shell, Menu } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { StreamEngine } = require('./stream-engine');
const { normalizeQueueItem } = require('./media-source');

let mainWindow;
let engine;
let allowClose = false;
const screenshotMode = process.env.SAOVIVO_SCREENSHOT === '1';
const smokeMode = process.env.SAOVIVO_SMOKE === '1';
const testDataPath = process.env.SAOVIVO_TEST_DIR || path.join(__dirname, '..', '.test-user-data');

if (screenshotMode || smokeMode) {
  app.setPath('userData', testDataPath);
}

const statePath = () => path.join(app.getPath('userData'), 'state.json');

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    let streamKey = '';
    if (parsed.streamKey && safeStorage.isEncryptionAvailable()) {
      streamKey = safeStorage.decryptString(Buffer.from(parsed.streamKey, 'base64'));
    }
    return {
      queue: Array.isArray(parsed.queue) ? parsed.queue.map(normalizeQueueItem) : [],
      loop: parsed.loop !== false,
      streamKey
    };
  } catch {
    return { queue: [], loop: true, streamKey: '' };
  }
}

function saveState(state) {
  const toSave = { queue: (state.queue || []).map(normalizeQueueItem), loop: state.loop !== false };
  if (state.streamKey && safeStorage.isEncryptionAvailable()) {
    toSave.streamKey = safeStorage.encryptString(state.streamKey).toString('base64');
  }
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(toSave, null, 2));
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 900,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#111315',
    title: 'SAOViVO',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#181818', symbolColor: '#cccccc', height: 30 },
    show: !screenshotMode,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (screenshotMode) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const normal = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview.png'), normal.toPNG());
      send('engine:event', { type: 'prepare-progress', status: 'preparing', phase: 'adjusting', itemId: 'demo-4', progress: 43, at: new Date().toISOString() });
      send('engine:event', { type: 'prepare', status: 'checking', itemId: 'demo-5', message: 'Comprobando archivo…', at: new Date().toISOString() });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const loading = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview-loading.png'), loading.toPNG());
      send('engine:event', { type: 'prepare', status: 'ready', itemId: 'demo-4', message: 'Video listo.', at: new Date().toISOString() });
      send('engine:event', { type: 'prepare', status: 'ready', itemId: 'demo-5', message: 'Video listo.', at: new Date().toISOString() });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await mainWindow.webContents.executeJavaScript("document.querySelector('#modifyButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 150));
      const editing = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview-edit.png'), editing.toPNG());
      await mainWindow.webContents.executeJavaScript("document.querySelector('#modifyButton').click(); document.querySelector('#settingsButton').click()");
      await new Promise((resolve) => setTimeout(resolve, 150));
      const settings = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview-settings.png'), settings.toPNG());
      await mainWindow.webContents.executeJavaScript("document.querySelector('#closeSettings').click()");
      send('engine:event', {
        type: 'youtube-item',
        item: { id: 'demo-vertical-confirm', sourceType: 'youtube', title: 'Video vertical de prueba', duration: 75, isVertical: true, url: 'https://www.youtube.com/shorts/demo' },
        message: 'Video agregado.'
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const verticalConfirmation = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview-confirm-vertical.png'), verticalConfirmation.toPNG());
      await mainWindow.webContents.executeJavaScript("document.querySelector('#cancelMedia').click()");
      send('engine:event', { type: 'connecting', message: 'Conectando con YouTube…', at: new Date().toISOString() });
      send('engine:event', { type: 'live', message: 'Salida RTMPS activa. Confirmá la señal en YouTube Studio.', at: new Date().toISOString() });
      send('engine:event', { type: 'progress', activeIndex: 0, activeItemId: 'demo-1', elapsed: 75, totalElapsed: 75 });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const live = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview-live.png'), live.toPNG());
      const stopDialogVisible = await mainWindow.webContents.executeJavaScript("document.querySelector('#streamButton').click(); !document.querySelector('#stopConfirmModal').classList.contains('hidden')");
      if (!stopDialogVisible) throw new Error('La verificación visual no pudo abrir la confirmación de STOP STREAM.');
      await mainWindow.webContents.executeJavaScript("new Promise((resolve) => setTimeout(resolve, 250))");
      const stopDialogPaintState = await mainWindow.webContents.executeJavaScript("(() => { const modal = document.querySelector('#stopConfirmModal'); return { visible: !modal.classList.contains('hidden'), display: getComputedStyle(modal).display, opacity: getComputedStyle(modal).opacity }; })()");
      if (!stopDialogPaintState.visible || stopDialogPaintState.display === 'none') throw new Error(`La confirmación de STOP STREAM se cerró antes de la captura: ${JSON.stringify(stopDialogPaintState)}`);
      const stopConfirmation = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview-stop-confirm.png'), stopConfirmation.toPNG());
      await mainWindow.webContents.executeJavaScript("document.querySelector('#continueStream').click()");
      send('engine:event', { type: 'warning', message: 'Loop desactivado. El vivo terminará al final de esta vuelta.', attention: 'scheduled', at: new Date().toISOString() });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const alert = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview-alert.png'), alert.toPNG());
      send('engine:event', { type: 'warning', message: 'Comenzó un video de YouTube en vivo. La cola continuará cuando termine el vivo o cuando elijas SIGUIENTE.', attention: 'live-source', at: new Date().toISOString() });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const liveSourceAlert = await mainWindow.webContents.capturePage();
      fs.writeFileSync(path.join(testDataPath, 'ui-preview-live-source-alert.png'), liveSourceAlert.toPNG());
      allowClose = true;
      app.quit();
    });
  }
  mainWindow.on('close', async (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (engine?.isStreaming) {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Seguir transmitiendo', 'Cerrar y terminar el vivo'],
        defaultId: 0,
        cancelId: 0,
        title: 'Hay un vivo en curso',
        message: 'Si cerrás SAOViVO, la transmisión se termina.'
      });
      if (answer.response !== 1) return;
    }
    allowClose = true;
    await engine?.shutdown('El vivo terminó porque se cerró SAOViVO.');
    mainWindow.close();
  });
}

app.whenReady().then(async () => {
  const initialState = screenshotMode ? {
    loop: true,
    streamKey: '',
    queue: [
      { id: 'demo-1', sourceType: 'youtube', title: 'Atardecer en la costa — episodio completo', duration: 1542, thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
      { id: 'demo-2', sourceType: 'local', title: 'Sesión acústica en vivo desde Buenos Aires', duration: 2864, thumbnail: '', localPath: 'C:\\Videos\\sesion-acustica.mp4' },
      { id: 'demo-3', title: 'Especial: una noche de música y conversación', duration: 3688, thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
      { id: 'demo-4', title: 'Detrás de escena — capítulo final', duration: 945, thumbnail: 'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' },
      { id: 'demo-5', title: 'Entrevista completa: cómo nació el proyecto', duration: 1280, thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
      { id: 'demo-6', title: 'Las mejores historias de la temporada', duration: 2140, thumbnail: 'https://i.ytimg.com/vi/ScMzIvxBSi4/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=ScMzIvxBSi4' },
      { id: 'demo-7', title: 'Especial vertical de medianoche — episodio siete', duration: 1855, isVertical: true, isShort: true, thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg', url: 'https://www.youtube.com/shorts/jNQXAC9IVRw' },
      { id: 'demo-8', title: 'Cobertura especial en directo', duration: 0, isLive: true, liveStatus: 'is_live', thumbnail: 'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' }
    ]
  } : loadState();
  engine = new StreamEngine({
    appDataPath: app.getPath('userData'),
    operationalPath: screenshotMode || smokeMode ? path.join(testDataPath, 'SAOViVO Data') : path.join(app.getPath('documents'), 'SAOViVO Data'),
    ffmpegPath: require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'),
    notify: (event) => send('engine:event', event)
  });
  await engine.initialize();

  if (smokeMode) {
    engine.getMetadata('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
      .then((items) => {
        fs.mkdirSync(testDataPath, { recursive: true });
        fs.writeFileSync(path.join(testDataPath, 'youtube-smoke-result.json'), JSON.stringify(items, null, 2));
        app.quit();
      })
      .catch((error) => {
        fs.mkdirSync(testDataPath, { recursive: true });
        fs.writeFileSync(path.join(testDataPath, 'youtube-smoke-result.json'), JSON.stringify({ error: error.message }, null, 2));
        app.exit(1);
      });
    return;
  }

  ipcMain.handle('state:load', () => initialState);
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('state:save', (_event, state) => {
    saveState(state);
    return { ok: true };
  });
  ipcMain.handle('youtube:ingest', (_event, payload) => engine.ingestYouTube(payload?.url, { knownIds: payload?.knownIds || [] }));
  ipcMain.handle('local:select', async (_event, { single = false } = {}) => {
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: single ? 'Volver a seleccionar el video' : 'Agregar videos locales',
      buttonLabel: single ? 'Seleccionar' : 'Agregar a la cola',
      properties: single ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos MP4', extensions: ['mp4'] }]
    });
    if (selection.canceled || !selection.filePaths.length) return [];
    return engine.getLocalMetadata(selection.filePaths);
  });
  ipcMain.handle('queue:prepare', (_event, items) => screenshotMode
    ? items.map((item) => ({ id: item.id, ready: true, file: 'demo.mp4' }))
    : engine.prepare(items));
  ipcMain.handle('stream:start', (_event, payload) => engine.start(payload));
  ipcMain.handle('stream:stop', () => engine.stop());
  ipcMain.handle('stream:status', () => engine.status());
  ipcMain.handle('stream:loop', (_event, enabled) => engine.updateLoop(enabled));
  ipcMain.handle('stream:navigate', (_event, direction) => engine.navigate(direction));
  ipcMain.handle('stream:queue', (_event, queue, context) => engine.updateQueue(queue, context));
  ipcMain.handle('data:open', async () => {
    await fsp.mkdir(engine.operationalPath, { recursive: true });
    return shell.openPath(engine.operationalPath);
  });
  ipcMain.on('stream-key:context-menu', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return;
    Menu.buildFromTemplate([
      { label: 'Pegar', role: 'paste' },
      { type: 'separator' },
      { label: 'Seleccionar todo', role: 'selectAll' }
    ]).popup({ window });
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
