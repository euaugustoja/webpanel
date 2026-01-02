import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import os from 'os';
import pkg from '../package.json';
import squirrelStartup from 'electron-squirrel-startup';
import { activeBrowsers } from './main/state';
import { handleLaunchApp } from './main/launch-handler';
import { verifyIntegrity, getIntegrityViolations } from './main/integrity';
import { initAutoUpdater, checkForUpdates } from './main/auto-updater';

// Limite de memória para evitar OOM
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('disable-webrtc');
app.commandLine.appendSwitch('disable-features', 'WebRTC');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');

if (squirrelStartup) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  const platformName = process.platform === 'win32' ? 'WINDOWS' : process.platform === 'darwin' ? 'MAC' : 'LINUX';
  const archName = os.arch().toUpperCase();
  const windowTitle = `Ferramentas Guru - Versão ${pkg.version} - ${platformName} / ${archName}`;

  mainWindow = new BrowserWindow({
    width: 1720,
    height: 880,
    title: windowTitle,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      // Usar partition persistente para salvar login/localStorage entre sessões
      partition: 'persist:ferramentas-guru',
    },
  });

  mainWindow.setMenu(null);
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  // URL DO PAINEL WEB - Seu painel Vercel
  const PANEL_URL = process.env.PANEL_URL || 'https://web-panel-gamma.vercel.app';
  
  mainWindow.loadURL(PANEL_URL).catch(() => {
    const errorHtml = `
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #e0e0e0;">
        <div style="text-align: center; padding: 40px; background: rgba(255,255,255,0.1); border-radius: 20px; backdrop-filter: blur(10px);">
          <h1 style="color: #00d9ff; margin-bottom: 20px;">🔧 Ferramentas Guru</h1>
          <h2 style="color: #ff5252; margin-bottom: 10px;">Problema de Conexão</h2>
          <p>Não foi possível conectar ao servidor.</p>
          <p style="font-size: 0.9em; opacity: 0.8;">Verifique sua internet ou se o painel está online.</p>
          <p style="margin-top: 20px; font-size: 0.8em; opacity: 0.6;">URL: ${PANEL_URL}</p>
        </div>
      </body>
      </html>
    `;
    mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
  });
};

// Verificação de integridade no startup
app.on('ready', () => {
  // NOTA: Verificação de integridade desativada temporariamente
  // O sistema de integridade bloqueia após atualizações pois os hashes mudam
  // TODO: Regenerar integrity.json em cada build e incluir no instalador
  try {
    console.log('[START] Verificação de integridade desativada - permitindo inicialização');
    // const isValid = verifyIntegrity();
    // 
    // if (!isValid) {
    //   const violations = getIntegrityViolations();
    //   const message = violations.length > 0
    //     ? `Os seguintes arquivos foram modificados:\n\n• ${violations.join('\n• ')}\n\nPor segurança, a aplicação não pode ser executada.`
    //     : 'A aplicação detectou modificações não autorizadas e não pode ser executada.';
    //   
    //   dialog.showErrorBox(
    //     '⚠️ Erro de Integridade - Ferramentas Guru',
    //     message
    //   );
    //   app.quit();
    //   return;
    // }
  } catch (error) {
    // Se houver erro na verificação de integridade, log e continua
    console.error('[START] Erro na verificação de integridade:', error);
    // Em caso de erro, permite iniciar para não bloquear o usuário
  }

  try {
    createWindow();
  } catch (error) {
    console.error('[START] Erro ao criar janela:', error);
    dialog.showErrorBox('Erro', `Falha ao iniciar: ${error}`);
    app.quit();
    return;
  }

  // Iniciar verificação de atualizações após 3 segundos
  initAutoUpdater(pkg.version, mainWindow, 3000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// IPC Handlers
ipcMain.handle('launch-app', async (event, args) => {
  return handleLaunchApp(event, args, mainWindow);
});

// Fechar um perfil específico por ID
ipcMain.handle('apps:kill-profile', async (event, profileId: string) => {
  const browser = activeBrowsers.get(profileId);
  if (browser && browser.isConnected()) {
    await browser.close().catch(() => { });
    activeBrowsers.delete(profileId);
    return true;
  }
  return false;
});

// Fechar todos os browsers
ipcMain.handle('apps:kill-all', async () => {
  for (const [id, browser] of activeBrowsers) { 
    if (browser.isConnected()) await browser.close().catch(() => { }); 
  }
  activeBrowsers.clear();
  return true;
});

ipcMain.handle('downloads:open-folder', async (event, filePath) => { 
  if (filePath) shell.showItemInFolder(filePath); 
});
