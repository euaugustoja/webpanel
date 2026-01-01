/**
 * Sistema de Atualização Automática - Ferramentas Guru
 * 
 * Suporta dois níveis de prioridade:
 * - "low": usuário pode adiar a atualização
 * - "high": atualização obrigatória (crítica/segurança)
 */

import { app, dialog, shell, BrowserWindow } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// URL base do servidor de atualizações
const UPDATE_SERVER_URL = 'https://membros.ferramentasguru.com/updates';

// Interface para o JSON de versão no servidor
interface UpdateInfo {
  version: string;
  priority: 'low' | 'high';
  releaseDate: string;
  changelog: string[];
  // Suporta formato antigo (downloadUrl) ou novo (downloads por OS)
  downloadUrl?: string;
  downloads?: {
    windows?: string;
    mac?: string;
    linux?: string;
  };
  minVersion?: string;
  sha256?: string;
}

/**
 * Retorna a URL de download para o sistema operacional atual
 */
function getDownloadUrlForOS(updateInfo: UpdateInfo): string | null {
  // Se tiver o objeto downloads, usa por OS
  if (updateInfo.downloads) {
    const platform = process.platform;
    if (platform === 'win32' && updateInfo.downloads.windows) {
      return updateInfo.downloads.windows;
    } else if (platform === 'darwin' && updateInfo.downloads.mac) {
      return updateInfo.downloads.mac;
    } else if (platform === 'linux' && updateInfo.downloads.linux) {
      return updateInfo.downloads.linux;
    }
  }
  
  // Fallback para downloadUrl único (compatibilidade)
  if (updateInfo.downloadUrl) {
    return updateInfo.downloadUrl;
  }
  
  return null;
}

/**
 * Busca informações de atualização do servidor
 */
async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  return new Promise((resolve) => {
    const url = `${UPDATE_SERVER_URL}/latest.json?t=${Date.now()}`;
    const client = url.startsWith('https') ? https : http;

    const request = client.get(url, { timeout: 10000 }, (response) => {
      if (response.statusCode !== 200) {
        console.log('[AutoUpdater] Servidor retornou status:', response.statusCode);
        resolve(null);
        return;
      }

      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          const updateInfo = JSON.parse(data) as UpdateInfo;
          resolve(updateInfo);
        } catch (error) {
          console.error('[AutoUpdater] Erro ao parsear JSON:', error);
          resolve(null);
        }
      });
    });

    request.on('error', (error) => {
      console.error('[AutoUpdater] Erro na requisição:', error.message);
      resolve(null);
    });

    request.on('timeout', () => {
      request.destroy();
      console.error('[AutoUpdater] Timeout na requisição');
      resolve(null);
    });
  });
}

/**
 * Compara duas versões semânticas
 * Retorna: 1 se v1 > v2, -1 se v1 < v2, 0 se iguais
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Baixa o arquivo de atualização
 */
async function downloadUpdate(
  downloadUrl: string, 
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const fileName = `ferramentas-guru-update-${Date.now()}.exe`;
    const filePath = path.join(tempDir, fileName);
    const file = fs.createWriteStream(filePath);

    const client = downloadUrl.startsWith('https') ? https : http;

    const request = client.get(downloadUrl, (response) => {
      // Seguir redirecionamentos
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(filePath);
          downloadUpdate(redirectUrl, onProgress).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download falhou com status ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0 && onProgress) {
          const percent = Math.round((downloadedSize / totalSize) * 100);
          onProgress(percent);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });
    });

    request.on('error', (error) => {
      file.close();
      fs.unlink(filePath, () => {});
      reject(error);
    });

    file.on('error', (error) => {
      file.close();
      fs.unlink(filePath, () => {});
      reject(error);
    });
  });
}

/**
 * Mostra diálogo de atualização disponível (baixa prioridade)
 */
async function showLowPriorityUpdateDialog(
  updateInfo: UpdateInfo,
  parentWindow: BrowserWindow | null
): Promise<'update' | 'later' | 'skip'> {
  const changelogText = updateInfo.changelog.length > 0
    ? `\n\n📋 Novidades:\n• ${updateInfo.changelog.join('\n• ')}`
    : '';

  const result = await dialog.showMessageBox(parentWindow || undefined as any, {
    type: 'info',
    icon: undefined,
    title: '🚀 Nova Atualização Disponível',
    message: `Uma nova versão está disponível!`,
    detail: `Versão ${updateInfo.version} (${updateInfo.releaseDate})${changelogText}\n\nDeseja atualizar agora?`,
    buttons: ['Atualizar Agora', 'Lembrar Depois', 'Pular Esta Versão'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  const actions: ('update' | 'later' | 'skip')[] = ['update', 'later', 'skip'];
  return actions[result.response];
}

/**
 * Mostra diálogo de atualização obrigatória (alta prioridade)
 */
async function showHighPriorityUpdateDialog(
  updateInfo: UpdateInfo,
  parentWindow: BrowserWindow | null
): Promise<void> {
  const changelogText = updateInfo.changelog.length > 0
    ? `\n\n📋 Novidades:\n• ${updateInfo.changelog.join('\n• ')}`
    : '';

  await dialog.showMessageBox(parentWindow || undefined as any, {
    type: 'warning',
    icon: undefined,
    title: '⚠️ Atualização Obrigatória',
    message: `Uma atualização crítica é necessária!`,
    detail: `Versão ${updateInfo.version} (${updateInfo.releaseDate})${changelogText}\n\n⚠️ Esta atualização contém correções importantes de segurança ou funcionalidade.\n\nO aplicativo precisa ser atualizado para continuar funcionando.`,
    buttons: ['Atualizar Agora'],
    defaultId: 0,
    noLink: true,
  });
}

/**
 * Mostra diálogo de progresso de download
 */
async function showDownloadProgress(
  updateInfo: UpdateInfo,
  parentWindow: BrowserWindow | null
): Promise<string | null> {
  // Criar janela de progresso
  const progressWindow = new BrowserWindow({
    width: 400,
    height: 150,
    parent: parentWindow || undefined,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const progressHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: #e0e0e0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          border-radius: 12px;
          overflow: hidden;
        }
        .container {
          text-align: center;
          padding: 30px;
          width: 100%;
        }
        h3 { color: #00d9ff; margin-bottom: 15px; font-size: 16px; }
        .progress-bar {
          width: 100%;
          height: 8px;
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00d9ff, #00ff88);
          border-radius: 4px;
          transition: width 0.3s ease;
          width: 0%;
        }
        .progress-text { font-size: 14px; opacity: 0.8; }
      </style>
    </head>
    <body>
      <div class="container">
        <h3>📦 Baixando Atualização v${updateInfo.version}</h3>
        <div class="progress-bar">
          <div class="progress-fill" id="progress"></div>
        </div>
        <div class="progress-text" id="text">Iniciando download...</div>
      </div>
      <script>
        window.updateProgress = (percent) => {
          document.getElementById('progress').style.width = percent + '%';
          document.getElementById('text').textContent = percent + '% concluído';
        };
      </script>
    </body>
    </html>
  `;

  await progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(progressHtml)}`);

  try {
    const downloadUrl = getDownloadUrlForOS(updateInfo);
    if (!downloadUrl) {
      throw new Error('Não há download disponível para este sistema operacional');
    }
    
    const filePath = await downloadUpdate(downloadUrl, (percent) => {
      progressWindow.webContents.executeJavaScript(`window.updateProgress(${percent})`);
    });
    progressWindow.close();
    return filePath;
  } catch (error) {
    progressWindow.close();
    console.error('[AutoUpdater] Erro no download:', error);
    return null;
  }
}

/**
 * Instala a atualização baixada
 */
async function installUpdate(filePath: string): Promise<void> {
  console.log('[AutoUpdater] Abrindo instalador:', filePath);
  
  // Mostrar mensagem para o usuário
  dialog.showMessageBox({
    type: 'info',
    title: 'Instalando Atualização',
    message: 'O instalador será aberto agora.\n\nClique em "Instalar" quando a janela aparecer.\n\nO aplicativo será fechado para permitir a atualização.',
    buttons: ['OK']
  });
  
  // Abrir o instalador
  shell.openPath(filePath);
  
  // Aguardar um pouco para o instalador iniciar
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Fechar o aplicativo para permitir a atualização
  app.quit();
}

/**
 * Armazena versões que o usuário optou por pular
 */
function getSkippedVersions(): string[] {
  try {
    const configPath = path.join(app.getPath('userData'), 'skipped-versions.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (error) {
    console.error('[AutoUpdater] Erro ao ler versões puladas:', error);
  }
  return [];
}

function addSkippedVersion(version: string): void {
  try {
    const configPath = path.join(app.getPath('userData'), 'skipped-versions.json');
    const skipped = getSkippedVersions();
    if (!skipped.includes(version)) {
      skipped.push(version);
      fs.writeFileSync(configPath, JSON.stringify(skipped));
    }
  } catch (error) {
    console.error('[AutoUpdater] Erro ao salvar versão pulada:', error);
  }
}

/**
 * Função principal - Verifica e processa atualizações
 */
export async function checkForUpdates(
  currentVersion: string,
  parentWindow: BrowserWindow | null = null,
  silent: boolean = false
): Promise<boolean> {
  console.log(`[AutoUpdater] Verificando atualizações... Versão atual: ${currentVersion}`);

  const updateInfo = await fetchUpdateInfo();

  if (!updateInfo) {
    if (!silent) {
      dialog.showMessageBox(parentWindow || undefined as any, {
        type: 'info',
        title: 'Verificação de Atualizações',
        message: 'Não foi possível verificar atualizações.',
        detail: 'Verifique sua conexão com a internet e tente novamente.',
      });
    }
    return false;
  }

  // Comparar versões
  const comparison = compareVersions(updateInfo.version, currentVersion);
  
  if (comparison <= 0) {
    console.log('[AutoUpdater] Aplicativo está atualizado!');
    if (!silent) {
      dialog.showMessageBox(parentWindow || undefined as any, {
        type: 'info',
        title: '✅ Tudo Atualizado',
        message: 'Você já está usando a versão mais recente!',
        detail: `Versão atual: ${currentVersion}`,
      });
    }
    return false;
  }

  console.log(`[AutoUpdater] Nova versão disponível: ${updateInfo.version} (prioridade: ${updateInfo.priority})`);

  // Verificar se usuário pulou esta versão (só para baixa prioridade)
  if (updateInfo.priority === 'low') {
    const skippedVersions = getSkippedVersions();
    if (skippedVersions.includes(updateInfo.version)) {
      console.log('[AutoUpdater] Usuário optou por pular esta versão');
      return false;
    }
  }

  // Processar de acordo com a prioridade
  if (updateInfo.priority === 'high') {
    // Atualização obrigatória
    await showHighPriorityUpdateDialog(updateInfo, parentWindow);
    
    const filePath = await showDownloadProgress(updateInfo, parentWindow);
    
    if (filePath) {
      await installUpdate(filePath);
      return true;
    } else {
      dialog.showErrorBox(
        'Erro na Atualização',
        'Não foi possível baixar a atualização. O aplicativo será fechado.\n\nPor favor, baixe manualmente a nova versão em:\nhttps://membros.ferramentasguru.com'
      );
      app.quit();
      return false;
    }
  } else {
    // Atualização opcional (baixa prioridade)
    const action = await showLowPriorityUpdateDialog(updateInfo, parentWindow);

    if (action === 'update') {
      const filePath = await showDownloadProgress(updateInfo, parentWindow);
      
      if (filePath) {
        await installUpdate(filePath);
        return true;
      } else {
        dialog.showErrorBox(
          'Erro no Download',
          'Não foi possível baixar a atualização. Tente novamente mais tarde.'
        );
        return false;
      }
    } else if (action === 'skip') {
      addSkippedVersion(updateInfo.version);
      console.log(`[AutoUpdater] Versão ${updateInfo.version} marcada para pular`);
    }
    
    return false;
  }
}

/**
 * Inicia verificação automática ao iniciar o app
 */
export function initAutoUpdater(
  currentVersion: string, 
  parentWindow: BrowserWindow | null = null,
  delayMs: number = 3000
): void {
  console.log('[AutoUpdater] Inicializando sistema de atualização automática...');
  
  // Verificar após um delay para não bloquear o startup
  setTimeout(async () => {
    await checkForUpdates(currentVersion, parentWindow, true);
  }, delayMs);
}
