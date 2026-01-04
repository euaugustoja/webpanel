import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import https from 'https';
import os from 'os';

const IS_DEV = process.env.NODE_ENV === 'development';

// Caminho padrão do executável no Windows
const WARP_CLI_PATH = 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe';
const WARP_INSTALLER_URL = 'https://1.1.1.1/Cloudflare_WARP_Release-x64.msi';

export const checkWarpInstalled = (): boolean => {
  return fs.existsSync(WARP_CLI_PATH);
};

export const getWarpStatus = async (): Promise<{ installed: boolean; connected: boolean; status: string }> => {
  const installed = checkWarpInstalled();
  if (!installed) {
    return { installed: false, connected: false, status: 'not_installed' };
  }

  return new Promise((resolve) => {
    exec(`"${WARP_CLI_PATH}" status`, (error, stdout, stderr) => {
      if (error) {
        console.error('[WARP] Erro ao checar status:', error);
        resolve({ installed: true, connected: false, status: 'error' });
        return;
      }

      const output = stdout.toLowerCase();
      // O status pode variar, mas geralmente busca "Connected" ou "Disconnected"
      const connected = output.includes('connected') && !output.includes('disconnected');
      
      resolve({ 
        installed: true, 
        connected, 
        status: connected ? 'connected' : 'disconnected' 
      });
    });
  });
};

export const installWarp = async (): Promise<boolean> => {
  console.log('[WARP] Iniciando instalação silenciosa...');
  
  const tempDir = app.getPath('temp');
  const installerPath = path.join(tempDir, 'Cloudflare_WARP.msi');

  // 1. Download
  try {
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(installerPath);
      https.get(WARP_INSTALLER_URL, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Falha no download: Status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(installerPath, () => {});
        reject(err);
      });
    });
    console.log('[WARP] Download concluído:', installerPath);
  } catch (e) {
    console.error('[WARP] Erro no download:', e);
    return false;
  }

  // 2. Install (Silent)
  // msiexec /i "path" /qn /norestart
  return new Promise((resolve) => {
    const installCmd = `msiexec /i "${installerPath}" /qn /norestart ACCEPT_TOS="yes"`;
    
    exec(installCmd, (error, stdout, stderr) => {
      if (error) {
        console.error('[WARP] Erro na instalação:', error);
        resolve(false);
      } else {
        console.log('[WARP] Instalação finalizada com sucesso (teoricamente).');
        
        // Aguardar um pouco para o serviço subir
        setTimeout(async () => {
             // Tentar registrar após instalar
             await registerWarp();
             resolve(true);
        }, 5000);
      }
    });
  });
};

const registerWarp = async (): Promise<void> => {
    return new Promise((resolve) => {
        // Tenta registrar novo cliente (necessário na primeira vez)
        exec(`"${WARP_CLI_PATH}" registration new`, (error, stdout) => {
             // Ignora erro se já estiver registrado
             if (IS_DEV) console.log('[WARP] Registro:', stdout);
             resolve();
        });
    });
}

export const toggleWarp = async (enable: boolean): Promise<boolean> => {
  const installed = checkWarpInstalled();
  if (!installed) return false;

  const cmd = enable ? 'connect' : 'disconnect';
  
  return new Promise((resolve) => {
    exec(`"${WARP_CLI_PATH}" ${cmd}`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`[WARP] Erro ao executar ${cmd}:`, stderr);
        
        // Se falhar ao conectar, pode ser falta de registro
        if (enable && (stderr.includes('registration') || stdout.includes('registration'))) {
            console.log('[WARP] Tentando registrar antes de conectar novamente...');
            await registerWarp();
            // Tenta de novo
            exec(`"${WARP_CLI_PATH}" ${cmd}`, (err2) => {
                resolve(!err2);
            });
            return;
        }

        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};
