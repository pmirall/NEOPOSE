// NEOPOSE desktop shell: serves app/ through a private app:// scheme (fetch, localStorage and clipboard need a secure origin)
const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', 'app');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// menu and save dialog follow the language chosen in the app (English unless it says Spanish)
const UI = {
  en: { reload: 'Reload', full: 'Full screen', dev: 'Developer tools', quit: 'Quit', view: 'View', zoom0: 'Actual size', zoomIn: 'Zoom in', zoomOut: 'Zoom out', save: 'Save image' },
  es: { reload: 'Recargar', full: 'Pantalla completa', dev: 'Herramientas de desarrollo', quit: 'Salir', view: 'Ver', zoom0: 'Tamaño real', zoomIn: 'Ampliar', zoomOut: 'Reducir', save: 'Guardar imagen' }
};
let lang = 'en';
function setMenu() {
  const t = UI[lang];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'NEOPOSE', submenu: [{ role: 'reload', label: t.reload }, { role: 'togglefullscreen', label: t.full }, { type: 'separator' }, { role: 'toggleDevTools', label: t.dev }, { type: 'separator' }, { role: 'quit', label: t.quit }] },
    { label: t.view, submenu: [{ role: 'resetZoom', label: t.zoom0 }, { role: 'zoomIn', label: t.zoomIn }, { role: 'zoomOut', label: t.zoomOut }] }
  ]));
}

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
  win.webContents.session.on('will-download', (e, item) => { item.setSaveDialogOptions({ title: UI[lang].save, defaultPath: path.join(app.getPath('pictures'), item.getFilename()) }); });
  // switching language reloads the page, so check it after every load
  win.webContents.on('did-finish-load', () => win.webContents.executeJavaScript('document.documentElement.lang').then(l => { lang = UI[l] ? l : 'en'; setMenu(); }, () => {}));
  win.loadURL('app://neopose/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  setMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
