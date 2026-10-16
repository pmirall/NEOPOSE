// The page asks the desktop shell for two things only: which drawing programs are installed, and to open a file in one
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('neoposeNative', {
  apps: () => ipcRenderer.invoke('neopose:apps'),
  openIn: (id, name, bytes) => ipcRenderer.invoke('neopose:openIn', id, name, bytes)
});
