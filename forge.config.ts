import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Função para gerar hashes de integridade
function generateIntegrityFile(buildDir: string): void {
  const integrityConfig = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    buildId: `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`,
    files: {} as Record<string, string>,
  };

  // Arquivos a verificar
  const filesToHash = ['main.js', 'preload.js'];
  
  for (const fileName of filesToHash) {
    const filePath = path.join(buildDir, fileName);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      integrityConfig.files[fileName] = hash;
      console.log(`[INTEGRITY] ✓ ${fileName}: ${hash.substring(0, 16)}...`);
    }
  }

  // Ler versão do package.json
  try {
    const pkgPath = path.resolve(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    integrityConfig.version = pkg.version || '1.0.0';
  } catch (e) {
    console.warn('[INTEGRITY] Could not read package.json');
  }

  const outputPath = path.join(buildDir, 'integrity.json');
  fs.writeFileSync(outputPath, JSON.stringify(integrityConfig, null, 2));
  console.log(`[INTEGRITY] ✓ Saved: ${outputPath}`);
}

const config: ForgeConfig = {
  hooks: {
    // Hook que roda após o empacotamento para copiar módulos necessários
    packageAfterPrune: async (_config, buildPath) => {
      // Copia patchright para o build
      const modulesToCopy = ['patchright', 'patchright-core'];
      for (const moduleName of modulesToCopy) {
        const src = path.resolve(__dirname, 'node_modules', moduleName);
        const dest = path.join(buildPath, 'node_modules', moduleName);

        if (fs.existsSync(src)) {
          console.log(`[HOOK] Copying ${moduleName} to build...`);
          await fs.promises.cp(src, dest, { recursive: true });
        } else {
          console.warn(`[HOOK] Could not find ${moduleName} to copy.`);
        }
      }

      // Gerar arquivo de integridade após compilação
      const viteBuildDir = path.resolve(__dirname, '.vite', 'build');
      if (fs.existsSync(viteBuildDir)) {
        console.log('[INTEGRITY] Generating integrity hashes...');
        generateIntegrityFile(viteBuildDir);
      }
    }
  },
  packagerConfig: {
    name: 'Ferramentas Guru',
    executableName: 'ferramentas-guru',
    icon: path.resolve(__dirname, 'imgs/icons/icon'),
    extraResource: ['./browsers'],
    asar: {
      unpack: '*.{node,dll}',
      unpackDir: '{**/node_modules/patchright/**,**/node_modules/patchright-core/**}',
    },
  },
  rebuildConfig: {},
  makers: [
    // WINDOWS - Setup.exe
    new MakerSquirrel({
      setupIcon: path.resolve(__dirname, 'imgs/icons/icon.ico'),
    }),
    // MACOS - ZIP
    new MakerZIP({}, ['darwin']),
    // LINUX
    new MakerRpm({
      options: {
        icon: path.resolve(__dirname, 'imgs/icons/icon.png'),
      }
    }),
    new MakerDeb({
      options: {
        icon: path.resolve(__dirname, 'imgs/icons/icon.png'),
      }
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
