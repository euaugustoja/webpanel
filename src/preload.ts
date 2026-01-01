import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Lança um novo navegador com perfil
  launchApp: (args: any) => ipcRenderer.invoke('launch-app', args),

  // Fecha um perfil específico por ID
  killProfile: (profileId: string) => ipcRenderer.invoke('apps:kill-profile', profileId),

  // Fecha todos os navegadores abertos
  killAllApps: () => ipcRenderer.invoke('apps:kill-all'),

  // Ouve quando um navegador fecha
  onAppClosed: (callback: (event: any, id: string) => void) =>
    ipcRenderer.on('app-closed', callback),

  // Abre a pasta do download
  openDownloadFolder: (path: string) => ipcRenderer.invoke('downloads:open-folder', path)
});
