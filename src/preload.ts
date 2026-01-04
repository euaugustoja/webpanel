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

  // Ouve quando o plano é bloqueado (expirado, suspenso, sem plano)
  onPlanBlocked: (callback: (event: any, data: { reason: string, message: string, plan_status: string }) => void) =>
    ipcRenderer.on('plan-blocked', callback),

  // Ouve quando a sessão expira (token inválido)
  onSessionExpired: (callback: (event: any) => void) =>
    ipcRenderer.on('session-expired', callback),

  // Abre a pasta do download
  openDownloadFolder: (path: string) => ipcRenderer.invoke('downloads:open-folder', path),

  // Seleciona uma pasta (para configuração de download)
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // --- WARP API ---
  getWarpStatus: () => ipcRenderer.invoke('warp:status'),
  installWarp: () => ipcRenderer.invoke('warp:install'),
  toggleWarp: (enable: boolean) => ipcRenderer.invoke('warp:toggle', enable),

  // Auto Update
  checkUpdate: (silent: boolean = true) => ipcRenderer.invoke('check-update', silent),
  onUpdateAvailable: (callback: (event: any, info: any) => void) => ipcRenderer.on('update-available', callback),
});
