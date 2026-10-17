// NEOPOSE desktop shell: serves app/ through a private app:// scheme (fetch, localStorage and clipboard need a secure origin)
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain } = require('electron');
const fs = require('node:fs'), os = require('node:os'), { spawn, execFileSync } = require('node:child_process');
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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, preload: path.join(__dirname, 'preload.js') }
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


// "Open in…": the drawing programs installed on this computer, and opening a file in one of them
const PROGRAMS = [
  { id: 'krita', name: 'Krita', fmt: 'psd', exe: ['krita.exe'], win: ['Krita (x64)/bin/krita.exe', 'Krita/bin/krita.exe'], bin: ['krita'], flatpak: 'org.kde.krita', mac: 'krita' },
  { id: 'csp', name: 'Clip Studio Paint', fmt: 'psd', exe: ['CLIPStudioPaint.exe'], win: ['CELSYS/CLIP STUDIO */CLIP STUDIO PAINT/CLIPStudioPaint.exe', 'CELSYS/CLIP STUDIO/CLIP STUDIO PAINT/CLIPStudioPaint.exe'], mac: 'CLIP STUDIO PAINT' },
  { id: 'photoshop', name: 'Photoshop', fmt: 'psd', exe: ['Photoshop.exe'], win: ['Adobe/Adobe Photoshop */Photoshop.exe'], mac: 'Adobe Photoshop *' },
  { id: 'affinity', name: 'Affinity Photo', fmt: 'psd', win: ['Affinity/Photo 2/Photo.exe', 'Affinity/Photo/Photo.exe'], mac: 'Affinity Photo *' },
  { id: 'gimp', name: 'GIMP', fmt: 'psd', exe: ['gimp-3.0.exe', 'gimp-2.10.exe'], win: ['GIMP 3/bin/gimp-3.0.exe', 'GIMP 2/bin/gimp-2.10.exe'], bin: ['gimp'], flatpak: 'org.gimp.GIMP', mac: 'GIMP*' },
  { id: 'medibang', name: 'MediBang Paint', fmt: 'psd', win: ['Medibang/MediBang Paint Pro/MediBangPaintPro.exe'], mac: 'MediBang Paint Pro' },
  { id: 'paintnet', name: 'Paint.NET', fmt: 'png', exe: ['paintdotnet.exe'], win: ['paint.net/paintdotnet.exe'] },
  { id: 'pureref', name: 'PureRef', fmt: 'png', win: ['PureRef/PureRef.exe'], bin: ['PureRef', 'pureref'], mac: 'PureRef' }
];
const inFlatpak = !!process.env.FLATPAK_ID || fs.existsSync('/.flatpak-info');
// a path with one * segment matched against what is there
function globOne(base, rel) {
  const segs = rel.split('/'); let cur = [base];
  for (const sg of segs) {
    const next = [];
    for (const d of cur) {
      if (!sg.includes('*')) { const p = path.join(d, sg); if (fs.existsSync(p)) next.push(p); continue; }
      const re = new RegExp('^' + sg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
      try { for (const e of fs.readdirSync(d)) if (re.test(e)) next.push(path.join(d, e)); } catch (_) {}
    }
    cur = next.sort().reverse();
  }
  return cur[0] || null;
}
function findProgram(p) {
  if (process.platform === 'win32') {
    for (const e of p.exe || []) {  // registered with Windows ("App Paths")
      for (const hive of ['HKLM', 'HKCU']) try {
        const out = execFileSync('reg', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${e}`, '/ve'], { encoding: 'utf8', windowsHide: true });
        const m = /REG_SZ\s+(.+)/.exec(out); if (m && fs.existsSync(m[1].trim().replace(/"/g, ''))) return { cmd: m[1].trim().replace(/"/g, '') };
      } catch (_) {}
    }
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean))
      for (const rel of p.win || []) { const f = globOne(base, rel); if (f) return { cmd: f }; }
  } else if (process.platform === 'darwin') {
    if (p.mac) { const f = globOne('/Applications', p.mac + '.app'); if (f) return { cmd: 'open', args: ['-a', f] }; }
  } else {
    for (const b of p.bin || []) for (const d of (process.env.PATH || '').split(':')) { const f = path.join(d, b); try { fs.accessSync(f, fs.constants.X_OK); return { cmd: f }; } catch (_) {} }
    if (p.flatpak) for (const d of ['/var/lib/flatpak/app', path.join(os.homedir(), '.local/share/flatpak/app')]) if (fs.existsSync(path.join(d, p.flatpak))) return { cmd: 'flatpak', args: ['run', p.flatpak] };
  }
  return null;
}
ipcMain.handle('neopose:apps', () => {
  if (inFlatpak) return [];  // sandboxed: the system's "open with" chooses
  return PROGRAMS.map(p => { const f = findProgram(p); return f ? { id: p.id, name: p.name, fmt: p.fmt } : null; }).filter(Boolean);
});
ipcMain.handle('neopose:openIn', async (e, id, name, bytes) => {
  try {
    const dir = path.join(os.tmpdir(), 'NEOPOSE'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(String(name)).replace(/[^\w.\-]+/g, '_'));
    fs.writeFileSync(file, Buffer.from(bytes));
    const p = PROGRAMS.find(x => x.id === id), f = p && !inFlatpak ? findProgram(p) : null;
    if (!f) { const err = await shell.openPath(file); return err ? { ok: false, error: err } : { ok: true }; }
    const child = spawn(f.cmd, [...(f.args || []), file], { detached: true, stdio: 'ignore', windowsHide: false }); child.unref();
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});

// .neopose files from the system (double click, "Open with"): on the command line at start, from a second launch while
// running (one window only), or from macOS's open-file; handed to the page once it is ready
const pending = [];
const isScene = a => typeof a === 'string' && /\.neopose$/i.test(a) && fs.existsSync(a);
function sendScenes() {
  const win = BrowserWindow.getAllWindows()[0]; if (!win || !win.ready) return;
  while (pending.length) { const f = pending.shift(); try { win.webContents.send('neopose:file', path.basename(f), fs.readFileSync(f)); } catch (_) {} }
  if (win.isMinimized()) win.restore(); win.focus();
}
for (const a of process.argv.slice(1)) if (isScene(a)) pending.push(a);
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv) => { for (const a of argv.slice(1)) if (isScene(a)) pending.push(a); sendScenes(); });
app.on('open-file', (e, f) => { e.preventDefault(); if (isScene(f)) { pending.push(f); sendScenes(); } });
ipcMain.on('neopose:ready', e => { const win = BrowserWindow.fromWebContents(e.sender); if (win) { win.ready = true; sendScenes(); } });

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
