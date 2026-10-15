// NEOPOSE desktop shell: serves app/ through a private app:// scheme (fetch, localStorage and clipboard need a secure origin)
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', 'app');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: 'NEOPOSE', backgroundColor: '#e4ddcb', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  win.once('ready-to-show', () => win.show());
  // links (credits, Sketchfab, Poly Haven) open in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // exported PNGs: ask where to save
  win.webContents.session.on('will-download', (e, item) => { item.setSaveDialogOptions({ title: 'Guardar imagen', defaultPath: path.join(app.getPath('pictures'), item.getFilename()) }); });
  win.loadURL('app://neopose/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'NEOPOSE', submenu: [{ role: 'reload', label: 'Recargar' }, { role: 'togglefullscreen', label: 'Pantalla completa' }, { type: 'separator' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }, { type: 'separator' }, { role: 'quit', label: 'Salir' }] },
    { label: 'Ver', submenu: [{ role: 'resetZoom', label: 'Tamaño real' }, { role: 'zoomIn', label: 'Ampliar' }, { role: 'zoomOut', label: 'Reducir' }] }
  ]));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
