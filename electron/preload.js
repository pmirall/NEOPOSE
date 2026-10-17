// The page asks the desktop shell for three things only: which drawing programs are installed, to open a file in one,
// and the .neopose files the app was opened with
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('neoposeNative', {
  apps: () => ipcRenderer.invoke('neopose:apps'),
  openIn: (id, name, bytes) => ipcRenderer.invoke('neopose:openIn', id, name, bytes),
  // a .neopose the app was opened with (double click, "Open with"), now or while it runs
  onOpenFile: cb => { ipcRenderer.on('neopose:file', (e, name, bytes) => cb(name, bytes)); ipcRenderer.send('neopose:ready'); }
});
