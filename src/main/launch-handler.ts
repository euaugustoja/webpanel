import { app, BrowserWindow, dialog, shell } from 'electron';
import type { Browser, Page, Download, Frame } from 'patchright';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { chromium, IS_DEV } from './env';
import { activeBrowsers } from './state';

// Criar pasta oculta para cache do navegador (segurança) - MULTIPLATAFORMA
const createHiddenTempFolder = (): string => {
  let baseDir: string;
  
  // Detectar sistema operacional e usar pasta apropriada
  if (process.platform === 'win32') {
    // Windows: AppData/Local
    baseDir = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local');
  } else if (process.platform === 'darwin') {
    // macOS: ~/Library/Caches
    baseDir = path.join(os.homedir(), 'Library', 'Caches');
  } else {
    // Linux: ~/.cache
    baseDir = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  }
  
  const hiddenDir = path.join(baseDir, '.ferramentas-guru-cache'); // Pasta oculta
  
  // Criar hash aleatório para nome da pasta
  const randomHash = crypto.randomBytes(16).toString('hex');
  const tempDir = path.join(hiddenDir, randomHash);
  
  // Criar diretórios se não existirem
  if (!fs.existsSync(hiddenDir)) {
    fs.mkdirSync(hiddenDir, { recursive: true });
    // Tornar pasta oculta no Windows (em Unix, pastas que começam com . já são ocultas)
    if (process.platform === 'win32') {
      try {
        require('child_process').execSync(`attrib +h "${hiddenDir}"`, { stdio: 'ignore' });
      } catch (e) {}
    }
  }
  
  fs.mkdirSync(tempDir, { recursive: true });
  
  if (IS_DEV) console.log(`🔒 [SECURITY] Pasta temp oculta (${process.platform}): ${tempDir}`);
  return tempDir;
};

// Limpar pasta temp ao fechar
const cleanupTempFolder = (tempDir: string) => {
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (IS_DEV) console.log(`🧹 [CLEANUP] Pasta temp removida: ${tempDir}`);
    }
  } catch (e) {
    if (IS_DEV) console.error('❌ [CLEANUP] Erro ao limpar pasta temp:', e);
  }
};

export const handleLaunchApp = async (event: Electron.IpcMainInvokeEvent, args: any, mainWindow: BrowserWindow | null) => {
  if (IS_DEV) console.log("📥 [IPC] launch-app:", args.name);
  
  // Debug: Mostrar se autofill está ativado
  console.log(`🔑 [AUTOFILL DEBUG] Enabled: ${args.is_autofill_enabled}, Email: ${args.login ? 'SIM' : 'NÃO'}, Senha: ${args.password ? 'SIM' : 'NÃO'}`);
  
  // Debug: Mostrar se cookies estão sendo recebidos
  console.log(`🍪 [COOKIES DEBUG] Recebidos: ${args.custom_cookies ? (Array.isArray(args.custom_cookies) ? args.custom_cookies.length : 'não é array') : 'NÃO'}`);
  if (args.custom_cookies && Array.isArray(args.custom_cookies) && args.custom_cookies.length > 0) {
    console.log(`   Primeiro cookie: ${args.custom_cookies[0]?.name || 'sem nome'}`);
  }

  let browser: Browser | null = null;

  try {
    const {
      start_url: TARGET_URL,
      login: USER_EMAIL,
      password: USER_PASSWORD,
      proxy_data,
      session_data: SESSION_FILE_CONTENT,
      is_autofill_enabled,
      ublock_rules,
      url_blocks,
      save_strategy = 'always',
      login_selector,
      password_selector,
      is_debug = false,
      // Novos campos
      custom_cookies = [],
      custom_localstorage = {},
      custom_script = '',
      app_mode = false,
      extensions = [],
      custom_user_agent = '',
      selected_scripts_content = [],
      selected_element_rules_content = [],
      blocked_links = [],
      // Configurações de download
      download_mode = 'auto',
      download_path = '',
    } = args;

    const normalizeInput = (input: any): string[] => {
      if (!input) return [];
      if (Array.isArray(input)) return input;
      if (typeof input === 'string') return input.split('\n').map((s: string) => s.trim()).filter((s: string) => s);
      return [];
    };

    const normalizedUrlBlocks = normalizeInput(url_blocks);
    const normalizedUblockRules = normalizeInput(ublock_rules);

    let proxyConfig = undefined;
    if (proxy_data) {
      proxyConfig = {
        server: `${proxy_data.protocol}://${proxy_data.host}:${proxy_data.port}`,
        username: proxy_data.username,
        password: proxy_data.password
      };
      if (IS_DEV) console.log(`🌐 [PROXY] Usando: ${proxy_data.protocol}://${proxy_data.host}:${proxy_data.port}`);
    }

    // LANÇAR NAVEGADOR - Argumentos otimizados para performance
    const launchArgs = [
      '--start-maximized',
      // WebRTC LEAK PROTECTION - Bloqueia vazamento de IP
      '--disable-webrtc',
      '--disable-features=WebRTC,WebRtcHideLocalIpsWithMdns,WebRtcUseEchoCanceller3',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--disable-blink-features=WebRTC',
      '--disable-webrtc-hw-encoding',
      '--disable-webrtc-hw-decoding',
      '--disable-webrtc-encryption',
      '--disable-webrtc-hw-vp8-encoding',
      '--enforce-webrtc-ip-permission-check',
      // Forçar uso apenas de proxy para conexões
      '--proxy-bypass-list=<-loopback>',
      // Desabilitar UDP (WebRTC usa UDP para leak)
      '--disable-quic',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--safebrowsing-disable-auto-update',
      // Ocultar ícones e barra de extensões
      '--hide-scrollbars',
      '--disable-extensions-ui',
    ];
    
    if (!is_debug) {
      launchArgs.push('--disable-devtools');
    }
    
    // Modo App (sem barra de URL)
    if (app_mode) {
      launchArgs.push(`--app=${TARGET_URL}`);
      if (IS_DEV) console.log('🖥️ [APP MODE] Abrindo em modo aplicativo');
    }

    // EXTENSÕES - Download e carregamento
    const extensionPaths: string[] = [];
    if (extensions && Array.isArray(extensions) && extensions.length > 0) {
      const { app: electronApp } = await import('electron');
      const https = await import('https');
      const http = await import('http');
      const AdmZip = (await import('adm-zip')).default;
      
      const extensionsDir = path.join(electronApp.getPath('userData'), 'extensions', args.id || 'default');
      
      // Criar pasta de extensões se não existir
      if (!fs.existsSync(extensionsDir)) {
        fs.mkdirSync(extensionsDir, { recursive: true });
      }

      for (const ext of extensions) {
        if (!ext.name || !ext.url) continue;
        
        const extFolder = path.join(extensionsDir, ext.name.replace(/[^a-zA-Z0-9]/g, '_'));
        const zipPath = path.join(extensionsDir, `${ext.name.replace(/[^a-zA-Z0-9]/g, '_')}.zip`);
        
        try {
          // Download se não existir
          if (!fs.existsSync(extFolder) || !fs.readdirSync(extFolder).length) {
            if (IS_DEV) console.log(`📦 [EXT] Baixando: ${ext.name} de ${ext.url}`);
            
            await new Promise<void>((resolve, reject) => {
              const protocol = ext.url.startsWith('https') ? https : http;
              const file = fs.createWriteStream(zipPath);
              
              protocol.get(ext.url, (response: any) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                  // Seguir redirect
                  protocol.get(response.headers.location, (res: any) => {
                    res.pipe(file);
                    file.on('finish', () => { file.close(); resolve(); });
                  }).on('error', reject);
                } else {
                  response.pipe(file);
                  file.on('finish', () => { file.close(); resolve(); });
                }
              }).on('error', reject);
            });

            // Extrair ZIP
            if (IS_DEV) console.log(`📂 [EXT] Extraindo: ${ext.name}`);
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extFolder, true);
            
            // Limpar ZIP após extração
            fs.unlinkSync(zipPath);
          }

          // Verificar se tem manifest.json
          const manifestPath = path.join(extFolder, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            extensionPaths.push(extFolder);
            if (IS_DEV) console.log(`✅ [EXT] Carregado: ${ext.name}`);
          } else {
            // Verificar subpasta (alguns ZIPs têm pasta wrapper)
            const subfolders = fs.readdirSync(extFolder).filter(f => 
              fs.statSync(path.join(extFolder, f)).isDirectory()
            );
            if (subfolders.length === 1) {
              const subPath = path.join(extFolder, subfolders[0]);
              if (fs.existsSync(path.join(subPath, 'manifest.json'))) {
                extensionPaths.push(subPath);
                if (IS_DEV) console.log(`✅ [EXT] Carregado: ${ext.name} (subpasta)`);
              }
            }
          }
        } catch (e: any) {
          if (IS_DEV) console.error(`❌ [EXT] Erro ao carregar ${ext.name}:`, e.message);
        }
      }

      // Adicionar extensões ao launch args
      if (extensionPaths.length > 0) {
        launchArgs.push(`--load-extension=${extensionPaths.join(',')}`);
        launchArgs.push(`--disable-extensions-except=${extensionPaths.join(',')}`);
        if (IS_DEV) console.log(`🧩 [EXT] ${extensionPaths.length} extensão(ões) carregada(s)`);
      }
    }

    browser = await chromium.launch({
      headless: false,
      args: launchArgs
    });
    activeBrowsers.set(args.id || 'default', browser);

    // BROWSER-LEVEL SECURITY (DEVTOOLS KILLER)
    if (!is_debug) {
      try {
        const browserClient = await browser.newBrowserCDPSession();
        await browserClient.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true
        });

        browserClient.on('Target.attachedToTarget', async (params: any) => {
          const { targetInfo } = params;
          const url = targetInfo.url || '';
          const type = targetInfo.type;

          const isForbidden =
            type === 'devtools' ||
            url.startsWith('devtools://') ||
            (url.startsWith('chrome://') && !url.startsWith('chrome://downloads')) ||
            url.startsWith('edge://');

          if (isForbidden) {
            await browserClient.send('Target.closeTarget', { targetId: targetInfo.targetId }).catch(() => { });
          }
        });
      } catch (e) {
        if (IS_DEV) console.error("⚠️ Erro ao iniciar Browser-Level CDP:", e);
      }
    }

    // Criar pasta temporária oculta para este perfil
    const hiddenTempDir = createHiddenTempFolder();

    browser.on('disconnected', () => {
      if (args.id) activeBrowsers.delete(args.id);
      // Limpar pasta temporária ao desconectar
      cleanupTempFolder(hiddenTempDir);
    });

    // Determinar User-Agent e Headers baseado na plataforma
    const getDefaultUserAgent = (): string => {
      if (process.platform === 'darwin') {
        return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
      } else if (process.platform === 'linux') {
        return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
      }
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
    };

    const getPlatformName = (): string => {
      if (process.platform === 'darwin') return '"macOS"';
      if (process.platform === 'linux') return '"Linux"';
      return '"Windows"';
    };

    const contextOptions: any = {
      proxy: proxyConfig,
      viewport: null,
      locale: 'pt-BR',
      ignoreHTTPSErrors: true,
      // Usar User Agent customizado se fornecido, senão usar o apropriado para o sistema
      userAgent: custom_user_agent || getDefaultUserAgent(),
      extraHTTPHeaders: {
        'sec-ch-ua': '"Not A;Brand";v="99", "Chromium";v="143", "Google Chrome";v="143"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': getPlatformName(),
      },
      // Se modo 'browser', desativar interceptação do Playwright para permitir UI nativa
      acceptDownloads: download_mode !== 'browser'
    };
    
    if (custom_user_agent && IS_DEV) {
      console.log(`🌐 [USER-AGENT] Usando: ${custom_user_agent.substring(0, 60)}...`);
    }

    if (SESSION_FILE_CONTENT) {
      try {
        let storageState = typeof SESSION_FILE_CONTENT === 'string' ? JSON.parse(SESSION_FILE_CONTENT) : SESSION_FILE_CONTENT;
        if (storageState.session_data) storageState = storageState.session_data;
        contextOptions.storageState = storageState;

        if (IS_DEV) {
          const cookieCount = storageState.cookies?.length || 0;
          const originCount = storageState.origins?.length || 0;
          console.log(`📂 Sessão carregada. Cookies: ${cookieCount} | Origins: ${originCount}`);
        }
      } catch (e) { if (IS_DEV) console.error("❌ Erro ao carregar sessão:", e); }
    }

    const context = await browser.newContext(contextOptions);
    context.setDefaultTimeout(60000);

    // INJEÇÃO DE COOKIES PERSONALIZADOS (compatível com Cookie Editor export)
    if (custom_cookies && Array.isArray(custom_cookies) && custom_cookies.length > 0) {
      try {
        const targetUrlObj = new URL(TARGET_URL);
        const cookiesToAdd: any[] = [];
        
        for (const cookie of custom_cookies) {
          if (!cookie.name || cookie.value === undefined) continue;
          
          // Determinar domínio - usar o do cookie ou extrair da URL
          let domain = cookie.domain || targetUrlObj.hostname;
          
          // Mapear sameSite corretamente (compatível com Cookie Editor)
          let sameSite: 'Strict' | 'Lax' | 'None' = 'Lax';
          if (cookie.sameSite) {
            const s = String(cookie.sameSite).toLowerCase();
            if (s === 'strict') sameSite = 'Strict';
            else if (s === 'none' || s === 'no_restriction') sameSite = 'None';
            else sameSite = 'Lax';
          }
          
          // Construir cookie para Playwright - usar DOMAIN ao invés de URL
          const cookieObj: any = {
            name: String(cookie.name),
            value: String(cookie.value),
            domain: domain,
            path: cookie.path || '/',
            secure: cookie.secure === true,
            httpOnly: cookie.httpOnly === true,
            sameSite: sameSite,
          };
          
          // Expiração (Cookie Editor usa expirationDate)
          const expiration = cookie.expirationDate || cookie.expires;
          if (expiration && !cookie.session) {
            // Playwright espera timestamp em segundos
            cookieObj.expires = typeof expiration === 'number' 
              ? expiration 
              : Math.floor(new Date(expiration).getTime() / 1000);
          }
          
          cookiesToAdd.push(cookieObj);
        }
        
        if (IS_DEV) {
          console.log(`🍪 [COOKIES] Preparando ${cookiesToAdd.length} cookies para injeção:`);
          cookiesToAdd.slice(0, 5).forEach((c: any, i: number) => {
            console.log(`   ${i + 1}. ${c.name} @ ${c.domain}`);
          });
          if (cookiesToAdd.length > 5) {
            console.log(`   ... e mais ${cookiesToAdd.length - 5} cookies`);
          }
        }
        
        await context.addCookies(cookiesToAdd);
        if (IS_DEV) console.log(`✅ [COOKIES] ${cookiesToAdd.length} cookies injetados com sucesso!`);
      } catch (e: any) {
        if (IS_DEV) console.error('❌ [COOKIES] Erro ao injetar cookies:', e.message);
      }
    }

    // INJEÇÃO DE LOCALSTORAGE E SCRIPT PERSONALIZADO via addInitScript
    if ((custom_localstorage && Object.keys(custom_localstorage).length > 0) || custom_script) {
      const initScript = `
        (function() {
          // Injetar localStorage
          const localStorageData = ${JSON.stringify(custom_localstorage || {})};
          for (const [key, value] of Object.entries(localStorageData)) {
            try {
              localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            } catch (e) {}
          }
          ${Object.keys(custom_localstorage || {}).length > 0 ? `console.log('[INJECT] LocalStorage injetado:', Object.keys(localStorageData).length, 'itens');` : ''}
          
          // Executar script personalizado
          ${custom_script ? `
          try {
            ${custom_script}
            console.log('[INJECT] Script personalizado executado');
          } catch (e) {
            console.error('[INJECT] Erro no script personalizado:', e);
          }
          ` : ''}
        })();
      `;
      await context.addInitScript(initScript);
      if (IS_DEV) console.log('📜 [INJECT] Script de injeção registrado');
    }

    // LOCALHOST PROXY (PNA BYPASS)
    await context.route(/127\.0\.0\.1:3992/, async (route) => {
      const request = route.request();
      if (IS_DEV) console.log(`🔄 [PROXY] Redirecionando requisição local: ${request.url()}`);

      try {
        const headers = { ...request.headers() };
        delete headers['host'];
        delete headers['connection'];
        delete headers['content-length'];

        const fetchOptions: any = {
          method: request.method(),
          headers: headers,
          body: request.postDataBuffer() || undefined,
        };

        const response = await fetch(request.url(), fetchOptions).catch(async (err) => {
          if (err.cause && (err.cause.code === 'ECONNREFUSED' || err.cause.code === 'EADDRNOTAVAIL')) {
            const fallbackUrl = request.url().replace('127.0.0.1', 'localhost');
            return fetch(fallbackUrl, fetchOptions);
          }
          throw err;
        });

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((val, key) => responseHeaders[key] = val);
        responseHeaders['Access-Control-Allow-Origin'] = '*';
        responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        responseHeaders['Access-Control-Allow-Headers'] = '*';

        await route.fulfill({
          status: response.status,
          headers: responseHeaders,
          body: Buffer.from(await response.arrayBuffer())
        });
      } catch (e: any) {
        if (IS_DEV) console.error(`❌ [PROXY] Erro: ${e.message}`);
        await route.abort();
      }
    });

    // CDP SECURITY (URL BLOCKING)
    let page: Page | null = null;
    if (!is_debug) {
      try {
        page = await context.newPage();
        const client = await context.newCDPSession(page);
        await client.send('Target.setDiscoverTargets', { discover: true });

        const checkTarget = async (targetInfo: any) => {
          const url = targetInfo.url || '';
          const type = targetInfo.type;

          if (type === 'other' || (type === 'page' && url === '')) return;

          const isForbidden =
            url.startsWith('chrome://') ||
            url.startsWith('devtools://') ||
            url.startsWith('edge://') ||
            (url.startsWith('about:') && url !== 'about:blank');

          if (isForbidden) {
            if (IS_DEV) console.log(`🚫 [CDP] Bloqueando: ${url}`);
            try {
              await client.send('Target.closeTarget', { targetId: targetInfo.targetId });
            } catch (e) { }
          }
        };

        client.on('Target.targetCreated', async (params: any) => checkTarget(params.targetInfo));

        const pollingInterval = setInterval(async () => {
          try {
            if (!context.pages().length && !browser?.isConnected()) {
              clearInterval(pollingInterval);
              return;
            }
            const pages = context.pages();
            for (const p of pages) {
              const url = p.url();
              const isForbidden =
                url.startsWith('chrome://') ||
                url.startsWith('devtools://') ||
                url.startsWith('edge://') ||
                url.startsWith('chrome-extension://');

              if (isForbidden) {
                await p.close().catch(() => { });
              }
            }
          } catch (e) { }
        }, 300);

        context.on('close', () => clearInterval(pollingInterval));
      } catch (e) {
        if (IS_DEV) console.error("⚠️ Falha ao iniciar CDP:", e);
      }
    }

    // ROUTING SECURITY + AD BLOCKER
    if (!is_debug) {
      await context.route('devtools://**', route => route.abort());
      await context.route('chrome://**', route => route.abort());
      await context.route('edge://**', route => route.abort());
      await context.route('chrome-extension://**', route => route.abort());

      // BLOQUEIO DE ADS E TRACKERS (evita loops de navegação)
      const adPatterns = [
        '**/googleads.g.doubleclick.net/**',
        '**/pagead2.googlesyndication.com/**',
        '**/googlesyndication.com/**',
        '**/adservice.google.com/**',
        '**/ads.google.com/**',
        '**/doubleclick.net/**',
        '**/criteo.com/**',
        '**/taboola.com/**',
        '**/outbrain.com/**',
        '**/facebook.com/tr/**',
        '**/connect.facebook.net/**',
        '**/analytics.google.com/**',
        '**/google-analytics.com/**',
        '**/mc.yandex.ru/**',
        '**/adnxs.com/**',
        '**/adsrvr.org/**',
        '**/amazon-adsystem.com/**',
        '**/openx.net/**',
        '**/pubmatic.com/**',
        '**/rubiconproject.com/**',
        '**/casalemedia.com/**',
        '**/eskimi.com/**',
        '**/seedtag.com/**',
        '**/stickyadstv.com/**',
        '**/safeframe.googlesyndication.com/**',
        '**/nextmillmedia.com/**',
        '**/adkernel.com/**',
        '**/cootlogix.com/**',
        '**/ingage.tech/**',
        '**/onetag-sys.com/**',
        '**/yellowblue.io/**',
        '**/minutemedia-prebid.com/**',
        '**/adtarget.com.tr/**',
      ];

      for (const pattern of adPatterns) {
        await context.route(pattern, route => route.abort()).catch(() => {});
      }

      // Bloqueios personalizados do usuário
      if (normalizedUrlBlocks && normalizedUrlBlocks.length > 0) {
        for (const raw of normalizedUrlBlocks) {
          try {
            const pattern = raw.trim();
            if (!pattern) continue;

            let clean = pattern;
            if (clean.includes('://')) clean = clean.split('://')[1];
            if (clean.startsWith('www.')) clean = clean.substring(4);

            const escaped = clean.replace(/[.+^${}()|[\]\\]/g, '\\$&');
            let regexString: string;
            if (clean.includes('*')) {
              regexString = `^https?://(www\\.)?${escaped.replace(/\*/g, '.*')}$`;
            } else {
              regexString = `^https?://([a-zA-Z0-9-]+\\.)*${escaped}(/.*)?$`;
            }

            const routeRegex = new RegExp(regexString, 'i');
            await context.route(routeRegex, route => {
              if (IS_DEV) console.log(`🚫 [BLOCKED] ${route.request().url()}`);
              route.abort();
            });
          } catch (e) {
            if (IS_DEV) console.error(`⚠️ Erro na regra "${raw}":`, e);
          }
        }
      }

      // LINKS BLOQUEADOS pelo perfil (com página de aviso estilizada)
      const normalizedBlockedLinks = normalizeInput(blocked_links);
      if (normalizedBlockedLinks && normalizedBlockedLinks.length > 0) {
        for (const raw of normalizedBlockedLinks) {
          try {
            const pattern = raw.trim();
            if (!pattern) continue;

            let clean = pattern;
            if (clean.includes('://')) clean = clean.split('://')[1];
            if (clean.startsWith('www.')) clean = clean.substring(4);

            const escaped = clean.replace(/[.+^${}()|[\]\\]/g, '\\$&');
            let regexString: string;
            if (clean.includes('*')) {
              regexString = `^https?://(www\\.)?${escaped.replace(/\\*/g, '.*')}`;
            } else {
              regexString = `^https?://([a-zA-Z0-9-]+\\.)*${escaped}(/.*)?$`;
            }

            const routeRegex = new RegExp(regexString, 'i');
            await context.route(routeRegex, async (route) => {
              const blockedUrl = route.request().url();
              
              // Whitelist: não bloquear domínios de autenticação
              const authWhitelist = [
                'accounts.google.com',
                'accounts.youtube.com',
                'login.microsoftonline.com',
                'appleid.apple.com',
                'www.facebook.com/login',
                'api.twitter.com/oauth',
                'github.com/login',
              ];
              
              if (authWhitelist.some(domain => blockedUrl.includes(domain))) {
                return route.continue();
              }
              
              if (IS_DEV) console.log(`🚫 [BLOCKED-LINK] ${blockedUrl}`);
              
              // Página de bloqueio estilizada
              const blockPage = `
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                  <meta charset="UTF-8">
                  <title>Acesso Bloqueado</title>
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
                      color: #fff;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      min-height: 100vh;
                      text-align: center;
                      padding: 20px;
                    }
                    .container {
                      max-width: 500px;
                      background: rgba(255, 255, 255, 0.05);
                      backdrop-filter: blur(10px);
                      border-radius: 24px;
                      padding: 48px 40px;
                      border: 1px solid rgba(255, 107, 107, 0.3);
                      box-shadow: 0 25px 80px rgba(255, 107, 107, 0.15);
                    }
                    .icon {
                      font-size: 72px;
                      margin-bottom: 24px;
                      animation: shake 0.5s ease-in-out;
                    }
                    @keyframes shake {
                      0%, 100% { transform: translateX(0); }
                      25% { transform: translateX(-5px); }
                      75% { transform: translateX(5px); }
                    }
                    h1 {
                      font-size: 28px;
                      font-weight: 700;
                      margin-bottom: 16px;
                      color: #ff6b6b;
                    }
                    .url-box {
                      background: rgba(255, 107, 107, 0.15);
                      border: 1px solid rgba(255, 107, 107, 0.4);
                      padding: 12px 20px;
                      border-radius: 12px;
                      margin: 20px 0;
                      font-family: monospace;
                      font-size: 13px;
                      word-break: break-all;
                      color: #ff9999;
                    }
                    .message {
                      font-size: 16px;
                      color: #a0a0a0;
                      line-height: 1.6;
                      margin-bottom: 24px;
                    }
                    .warning {
                      background: linear-gradient(135deg, rgba(255, 193, 7, 0.15), rgba(255, 107, 107, 0.15));
                      border: 1px solid rgba(255, 193, 7, 0.4);
                      border-radius: 12px;
                      padding: 16px 20px;
                      margin-top: 24px;
                    }
                    .warning-icon { font-size: 24px; margin-bottom: 8px; }
                    .warning-text {
                      font-size: 14px;
                      color: #ffc107;
                      font-weight: 600;
                    }
                    .warning-sub {
                      font-size: 12px;
                      color: #ffcc66;
                      margin-top: 4px;
                    }
                    .btn {
                      display: inline-block;
                      background: linear-gradient(135deg, #6c5ce7, #a29bfe);
                      color: white;
                      border: none;
                      padding: 14px 32px;
                      border-radius: 12px;
                      font-size: 15px;
                      font-weight: 600;
                      cursor: pointer;
                      transition: all 0.3s ease;
                      text-decoration: none;
                      margin-top: 20px;
                    }
                    .btn:hover {
                      transform: translateY(-2px);
                      box-shadow: 0 10px 30px rgba(108, 92, 231, 0.4);
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="icon">🚫</div>
                    <h1>Acesso Bloqueado</h1>
                    <div class="url-box">${blockedUrl}</div>
                    <p class="message">
                      Este site foi bloqueado pelo administrador.<br>
                      Você não tem permissão para acessar este conteúdo.
                    </p>
                    <div class="warning">
                      <div class="warning-icon">⚠️</div>
                      <div class="warning-text">ATENÇÃO</div>
                      <div class="warning-sub">Tentativas repetidas de acesso a sites bloqueados podem resultar em banimento da conta.</div>
                    </div>
                    <a href="javascript:history.back()" class="btn">← Voltar</a>
                  </div>
                </body>
                </html>
              `;

              await route.fulfill({
                status: 403,
                contentType: 'text/html',
                body: blockPage,
              });
            });
          } catch (e) {
            if (IS_DEV) console.error(`⚠️ Erro na regra blocked_links "${raw}":`, e);
          }
        }
        if (IS_DEV) console.log(`🚫 [BLOCKED-LINKS] ${normalizedBlockedLinks.length} link(s) bloqueado(s)`);
      }
    }

    // SCRIPT DE INJEÇÃO (PROTEÇÃO DE SENHAS, WEBRTC, SPOOFING)
    const parseUblockRules = (rules: string[]) => {
      return rules.map(r => {
        r = r.trim();
        if (!r || r.startsWith('!')) return null;
        if (r.includes('##')) {
          const [domain, selector] = r.split('##');
          return { domain: domain.trim(), selector: selector.trim() };
        }
        return { domain: '', selector: r };
      }).filter(r => r !== null) as { domain: string, selector: string }[];
    };

    const parsedRules = parseUblockRules(normalizedUblockRules);

    const injectionScriptContent = `
      const params = ${JSON.stringify({
        rules: parsedRules,
        user: USER_EMAIL,
        pass: USER_PASSWORD,
        selUser: login_selector || 'input[type="email"], input[name*="user"], input[name*="login"]',
        selPass: password_selector || 'input[type="password"]',
        selBtn: 'button:has-text("Entrar"), button:has-text("Login"), input[type="submit"]',
        isAutofill: is_autofill_enabled,
        isDebug: is_debug
      })};

      const { rules, user, pass, selUser, selPass, selBtn, isAutofill, isDebug } = params;

      // CSS INJECTION (Proteção de senhas E emails)
      try {
        const INJECT_ID = 'guru-password-blur';
        if (!document.getElementById(INJECT_ID)) {
          const style = document.createElement('style');
          style.id = INJECT_ID;
          style.innerHTML = \`
            /* Proteção de senhas */
            input[type="password"],
            input[data-guru-protected="true"],
            input[name="Passwd"], 
            input[name*="pass" i] {
              filter: blur(5px) !important;
              -webkit-text-security: disc !important;
              color: transparent !important;
            }
            /* Proteção de emails */
            input[type="email"],
            input[data-guru-email-protected="true"],
            input[name*="email" i],
            input[name*="mail" i],
            input[name*="user" i]:not([type="password"]),
            input[id*="email" i],
            input[id*="mail" i],
            input[autocomplete="email"],
            input[autocomplete="username"] {
              filter: blur(5px) !important;
              color: transparent !important;
              text-shadow: 0 0 8px rgba(255,255,255,0.5) !important;
            }
            input::-ms-reveal, input::-ms-clear {
              display: none !important;
            }
          \`;
          (document.head || document.documentElement).appendChild(style);
        }
      } catch (e) {}

      // JS ENFORCEMENT (Type Lock para senhas E emails)
      if (!isDebug) {
        const applyMarker = (root = document) => {
          const allInputs = root.querySelectorAll ? root.querySelectorAll('input') : [];
          allInputs.forEach(el => {
            try {
              const name = (el.name || '').toLowerCase();
              const id = (el.id || '').toLowerCase();
              const type = el.type || '';
              const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
              
              // Detectar campos de senha
              const isPass = type === 'password' || name.includes('pass') || id.includes('pass');
              if (isPass) {
                el.setAttribute('data-guru-protected', 'true');
                el.style.setProperty('filter', 'blur(5px)', 'important');
                if (type !== 'password') el.type = 'password';
              }
              
              // Detectar campos de email/usuário
              const isEmail = type === 'email' || 
                              name.includes('email') || name.includes('mail') || name.includes('user') ||
                              id.includes('email') || id.includes('mail') ||
                              autocomplete === 'email' || autocomplete === 'username';
              if (isEmail && type !== 'password') {
                el.setAttribute('data-guru-email-protected', 'true');
                el.style.setProperty('filter', 'blur(5px)', 'important');
                el.style.setProperty('color', 'transparent', 'important');
              }
            } catch (e) { }
          });
        };

        applyMarker();
        const observer = new MutationObserver(() => applyMarker());
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setInterval(() => applyMarker(), 1000);
      }

      // WEBRTC BLOCKING - Proteção completa contra vazamento de IP
      try {
        // Bloqueia RTCPeerConnection completamente
        const fakeRTCPeerConnection = function(config) {
          console.log('[GURU] WebRTC blocked');
          return {
            createOffer: () => Promise.reject(new Error('WebRTC disabled')),
            createAnswer: () => Promise.reject(new Error('WebRTC disabled')),
            setLocalDescription: () => Promise.resolve(),
            setRemoteDescription: () => Promise.resolve(),
            addIceCandidate: () => Promise.resolve(),
            getConfiguration: () => ({}),
            close: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
            createDataChannel: () => ({ close: () => {} }),
            onicecandidate: null,
            onicegatheringstatechange: null,
            onsignalingstatechange: null,
            onconnectionstatechange: null,
            localDescription: null,
            remoteDescription: null,
            signalingState: 'closed',
            iceConnectionState: 'closed',
            connectionState: 'closed',
            iceGatheringState: 'complete'
          };
        };

        // Sobrescreve todas as variantes de RTCPeerConnection
        Object.defineProperty(window, 'RTCPeerConnection', { 
          value: fakeRTCPeerConnection, 
          writable: false, 
          configurable: false 
        });
        Object.defineProperty(window, 'webkitRTCPeerConnection', { 
          value: fakeRTCPeerConnection, 
          writable: false, 
          configurable: false 
        });
        Object.defineProperty(window, 'mozRTCPeerConnection', { 
          value: fakeRTCPeerConnection, 
          writable: false, 
          configurable: false 
        });

        // Bloqueia RTCDataChannel
        Object.defineProperty(window, 'RTCDataChannel', { 
          value: function() { return {}; }, 
          writable: false, 
          configurable: false 
        });

        // Bloqueia RTCSessionDescription
        Object.defineProperty(window, 'RTCSessionDescription', { 
          value: function() { return {}; }, 
          writable: false, 
          configurable: false 
        });

        // Bloqueia RTCIceCandidate
        Object.defineProperty(window, 'RTCIceCandidate', { 
          value: function() { return {}; }, 
          writable: false, 
          configurable: false 
        });

        // Bloqueia MediaDevices
        if (navigator.mediaDevices) {
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
            value: () => Promise.reject(new Error('Media access denied')),
            writable: false,
            configurable: false
          });
          Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
            value: () => Promise.resolve([]),
            writable: false,
            configurable: false
          });
          Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
            value: () => Promise.reject(new Error('Screen capture denied')),
            writable: false,
            configurable: false
          });
        }

        // Bloqueia getUserMedia antigo
        if (navigator.getUserMedia) {
          navigator.getUserMedia = function() {
            arguments[arguments.length - 1](new Error('Media access denied'));
          };
        }
        if (navigator.webkitGetUserMedia) {
          navigator.webkitGetUserMedia = function() {
            arguments[arguments.length - 1](new Error('Media access denied'));
          };
        }

      } catch (e) { }

      // NAVIGATOR SPOOFING
      try {
        const spoof = (obj, prop, value) => {
          try {
            Object.defineProperty(obj, prop, { value, writable: false, configurable: false, enumerable: true });
          } catch (e) {}
        };

        spoof(navigator, 'platform', 'Win32');
        spoof(navigator, 'vendor', 'Google Inc.');
        spoof(navigator, 'hardwareConcurrency', 8);
        spoof(navigator, 'deviceMemory', 8);
        spoof(navigator, 'maxTouchPoints', 0);
      } catch (e) { }

      // BLOCK INSPECTOR KEYS
      if (!isDebug) {
        window.addEventListener('keydown', (e) => {
          const isInspect = (e.key === 'F12') || 
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && (e.key === 'u' || e.key === 'U'));
          if (isInspect) { e.preventDefault(); e.stopPropagation(); }
        }, true);
      }

      // AUTOFILL
      if (isAutofill && user && pass) {
        let hasLoggedIn = false;
        const interval = setInterval(() => {
          if (hasLoggedIn) { clearInterval(interval); return; }
          const elUser = document.querySelector(selUser);
          const elPass = document.querySelector(selPass);
          if (elUser || elPass) {
            if (elUser && elUser.value !== user) {
              elUser.value = user;
              elUser.dispatchEvent(new Event('input', { bubbles: true }));
              elUser.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const elPassActual = document.querySelector(selPass);
            if (elPassActual && elPassActual.value === '') {
              elPassActual.value = pass;
              elPassActual.dispatchEvent(new Event('input', { bubbles: true }));
              elPassActual.dispatchEvent(new Event('change', { bubbles: true }));
              setTimeout(() => { 
                elPassActual.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); 
              }, 500);
              hasLoggedIn = true;
            }
          }
        }, 2000);
      }

      // UBLOCK RULES
      if (!document.getElementById('guru-ublock-styles')) {
        const currentHost = window.location.hostname;
        const activeSelectors = rules.filter(r => !r.domain || currentHost.includes(r.domain)).map(r => r.selector);
        const cssRules = activeSelectors.join(', ');
        if (cssRules) {
          const style = document.createElement('style');
          style.id = 'guru-ublock-styles';
          style.innerHTML = \`\${cssRules} { display: none !important; }\`;
          (document.head || document.documentElement).appendChild(style);
        }
      }
    `;

    const injectProtection = async (target: Page | Frame) => {
      try {
        // @ts-ignore
        await target.evaluate(injectionScriptContent).catch(() => { });
      } catch (e) { }
    };

    // DOWNLOAD HANDLER
    const setupDownloadHandler = (p: Page) => {
      // Se modo 'browser', não interceptar downloads - deixar o Chrome gerenciar nativamente
      if (download_mode === 'browser') {
        if (IS_DEV) console.log('📥 [DOWNLOAD] Modo: browser (não interceptando downloads)');
        return; // Não registra o handler - downloads ficam nativos do navegador
      }

      p.on('download', async (download: Download) => {
        if (IS_DEV) console.log("📥 [DOWNLOAD] Arquivo:", download.suggestedFilename());
        
        if (download_mode === 'auto') {
          // Modo automático: salva direto na pasta configurada
          const downloadDir = download_path || app.getPath('downloads');
          let fileName = download.suggestedFilename();
          let filePath = path.join(downloadDir, fileName);

          // Lógica de renomeação "Smart" estilo Windows (Evitar sobrescrever)
          // Se o arquivo já existir, adiciona (1), (2), etc.
          if (fs.existsSync(filePath)) {
            const ext = path.extname(fileName);
            const name = path.basename(fileName, ext);
            let counter = 1;
            
            while (fs.existsSync(filePath)) {
               const newName = `${name} (${counter})${ext}`;
               filePath = path.join(downloadDir, newName);
               counter++;
            }
          }
          
          // Criar pasta se não existir
          if (!fs.existsSync(downloadDir)) {
            try {
              fs.mkdirSync(downloadDir, { recursive: true });
              if (IS_DEV) console.log(`📁 [DOWNLOAD] Pasta criada: ${downloadDir}`);
            } catch (e) {
              if (IS_DEV) console.error('❌ [DOWNLOAD] Erro ao criar pasta:', e);
              // Fallback para pasta Downloads padrão
              const fallbackPath = path.join(app.getPath('downloads'), download.suggestedFilename());
              await download.saveAs(fallbackPath).catch(() => { });
              return;
            }
          }
          
          await download.saveAs(filePath).catch((e) => {
            if (IS_DEV) console.error('❌ [DOWNLOAD] Erro ao salvar:', e);
          });
          if (IS_DEV) console.log(`✅ [DOWNLOAD] Salvo em: ${filePath}`);
          
        } else if (download_mode === 'app') {
          // Modo app: mostra diálogo do Electron para escolher onde salvar
          if (mainWindow && !mainWindow.isDestroyed()) {
            const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
              title: 'Salvar Arquivo',
              defaultPath: path.join(app.getPath('downloads'), download.suggestedFilename()),
              buttonLabel: 'Salvar',
            });
            if (!canceled && filePath) {
              await download.saveAs(filePath).catch(() => { });
              if (IS_DEV) console.log(`✅ [DOWNLOAD] Salvo em: ${filePath}`);
            } else {
              await download.cancel().catch(() => { });
              if (IS_DEV) console.log('❌ [DOWNLOAD] Cancelado pelo usuário');
            }
          } else {
            // Fallback se janela não disponível
            const defaultPath = path.join(app.getPath('downloads'), download.suggestedFilename());
            await download.saveAs(defaultPath).catch(() => { });
          }
        }
      });
    };

    const setupPage = async (p: Page) => {
      // Skip setup if page is already closed (e.g., Google popup that closes quickly)
      if (p.isClosed()) {
        if (IS_DEV) console.log('[CDP] Página já fechada, pulando setup');
        return;
      }

      setupDownloadHandler(p);

      if (!is_debug) {
        try {
          // Para popups (about:blank), esperar a navegação real antes de setup
          const currentUrl = p.url();
          if (currentUrl === 'about:blank') {
            if (IS_DEV) console.log('[CDP] Popup detectado (about:blank), aguardando navegação...');
            // Esperar até 5 segundos pela navegação real, mas não bloquear
            await Promise.race([
              p.waitForNavigation({ waitUntil: 'commit', timeout: 5000 }).catch(() => {}),
              new Promise(resolve => setTimeout(resolve, 500)) // Timeout mínimo de 500ms
            ]);
            // Re-check if page is still open after wait
            if (p.isClosed()) return;
          }
          
          const client = await p.context().newCDPSession(p).catch(() => null);
          if (!client) {
            if (IS_DEV) console.log('[CDP] Não foi possível criar sessão para página, pulando...');
            return;
          }
          await client.send('Page.enable').catch(() => { });
          await client.send('Network.enable').catch(() => { });
          await client.send('Runtime.enable').catch(() => { });

          const spoofSource = `
            (function() {
              try {
                const spoof = (obj, prop, value) => {
                  try {
                    Object.defineProperty(obj, prop, {
                      get: () => value,
                      set: () => {},
                      configurable: false,
                      enumerable: true
                    });
                  } catch (e) {}
                };
                
                spoof(navigator, 'platform', 'Win32');
                spoof(navigator, 'oscpu', 'Windows NT 10.0; Win64; x64');
                spoof(navigator, 'vendor', 'Google Inc.');
                spoof(navigator, 'hardwareConcurrency', 8);
                spoof(navigator, 'deviceMemory', 8);
                spoof(navigator, 'maxTouchPoints', 0);
              } catch(e) {}
            })();
          `;

          const spoofOptions = {
            userAgent: contextOptions.userAgent,
            platform: 'Win32',
            userAgentMetadata: {
              platform: 'Windows',
              platformVersion: '10.0.0',
              architecture: 'x86_64',
              model: '',
              mobile: false,
              brands: [
                { brand: 'Not A;Brand', version: '99' },
                { brand: 'Chromium', version: '143' },
                { brand: 'Google Chrome', version: '143' }
              ]
            }
          };

          await client.send('Network.setUserAgentOverride', spoofOptions).catch(() => { });
          await client.send('Emulation.setUserAgentOverride', spoofOptions).catch(() => { });
          await client.send('Page.addScriptToEvaluateOnNewDocument', { source: spoofSource }).catch(() => { });

          // AUTOFILL INJECTION VIA CDP (mais confiável que JS injection)
          if (is_autofill_enabled && USER_EMAIL && USER_PASSWORD) {
            const autofillScript = `
              (function() {
                const credentials = {
                  email: ${JSON.stringify(USER_EMAIL)},
                  password: ${JSON.stringify(USER_PASSWORD)},
                  selEmail: ${JSON.stringify(login_selector || 'input[type="email"], input[type="text"][name*="user" i], input[type="text"][name*="login" i], input[type="text"][name*="email" i], input[name*="identifier" i], input[id*="user" i], input[id*="email" i], input[id*="login" i]')},
                  selPass: ${JSON.stringify(password_selector || 'input[type="password"]')}
                };

                let filled = false;
                let attempts = 0;
                const maxAttempts = 30;

                function simulateTyping(element, value) {
                  element.focus();
                  element.value = value;
                  
                  // Dispatch native events
                  element.dispatchEvent(new Event('focus', { bubbles: true }));
                  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                  
                  // React/Vue compatibility
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  nativeInputValueSetter.call(element, value);
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                }

                function tryAutofill() {
                  if (filled || attempts >= maxAttempts) return;
                  attempts++;

                  const emailField = document.querySelector(credentials.selEmail);
                  const passField = document.querySelector(credentials.selPass);

                  if (emailField && !emailField.value && credentials.email) {
                    simulateTyping(emailField, credentials.email);
                    console.log('[AUTOFILL] Email preenchido');
                  }

                  if (passField && !passField.value && credentials.password) {
                    simulateTyping(passField, credentials.password);
                    console.log('[AUTOFILL] Senha preenchida');
                    filled = true;
                  }
                }

                // Executar quando DOM estiver pronto
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(tryAutofill, 500);
                  });
                } else {
                  setTimeout(tryAutofill, 500);
                }

                // Observer para páginas SPA
                const observer = new MutationObserver(() => {
                  if (!filled) setTimeout(tryAutofill, 300);
                });
                observer.observe(document.documentElement, { childList: true, subtree: true });

                // Polling como fallback
                const interval = setInterval(() => {
                  if (filled || attempts >= maxAttempts) {
                    clearInterval(interval);
                    observer.disconnect();
                  } else {
                    tryAutofill();
                  }
                }, 1000);

                // Limpar após 30 segundos
                setTimeout(() => {
                  clearInterval(interval);
                  observer.disconnect();
                }, 30000);
              })();
            `;
            await client.send('Page.addScriptToEvaluateOnNewDocument', { source: autofillScript }).catch(() => { });
            if (IS_DEV) console.log('🔑 [AUTOFILL] Script de autofill injetado via CDP');
          }

          // SELECTED SCRIPTS INJECTION (Persistente em TODAS as páginas)
          if (selected_scripts_content && selected_scripts_content.length > 0) {
            for (let i = 0; i < selected_scripts_content.length; i++) {
              const scriptContent = selected_scripts_content[i];
              if (scriptContent && typeof scriptContent === 'string' && scriptContent.trim()) {
                const wrappedScript = `
                  (function() {
                    try {
                      ${scriptContent}
                    } catch(e) {
                      console.error('[GURU-SCRIPT #${i + 1}] Error:', e);
                    }
                  })();
                `;
                await client.send('Page.addScriptToEvaluateOnNewDocument', { source: wrappedScript }).catch(() => { });
              }
            }
            console.log(`📜 [SCRIPTS] ${selected_scripts_content.length} script(s) injetado(s) de forma persistente`);
          }

          // ELEMENT BLOCKER INJECTION (Persistente em TODAS as páginas)
          console.log(`🚫 [ELEMENT-BLOCKER] Regras recebidas:`, selected_element_rules_content);
          if (selected_element_rules_content && selected_element_rules_content.length > 0) {
            const blockerScript = `
              (function() {
                const rules = ${JSON.stringify(selected_element_rules_content)};
                console.log('[GURU-BLOCKER] Regras carregadas:', rules);
                
                function matchUrl(pattern, url) {
                  if (pattern === '*') return true;
                  var p = pattern.toLowerCase();
                  var u = url.toLowerCase();
                  if (p.startsWith('*') && p.endsWith('*')) return u.includes(p.slice(1, -1));
                  if (p.startsWith('*')) return u.endsWith(p.slice(1));
                  if (p.endsWith('*')) return u.startsWith(p.slice(0, -1));
                  return u.includes(p);
                }
                
                function applyRules() {
                  const currentUrl = window.location.href;
                  rules.forEach(function(rule) {
                    if (matchUrl(rule.url_pattern, currentUrl)) {
                      console.log('[GURU-BLOCKER] Aplicando regra:', rule.element_selector);
                      try {
                        const elements = document.querySelectorAll(rule.element_selector);
                        console.log('[GURU-BLOCKER] Elementos encontrados:', elements.length);
                        elements.forEach(function(el) {
                          if (rule.action === 'remove') {
                            el.remove();
                            console.log('[GURU-BLOCKER] Elemento removido');
                          } else {
                            el.style.cssText = 'display: none !important; visibility: hidden !important;';
                            console.log('[GURU-BLOCKER] Elemento ocultado');
                          }
                        });
                      } catch(e) {
                        console.error('[GURU-BLOCKER] Erro no seletor:', e);
                      }
                    }
                  });
                }
                
                // Aplicar imediatamente e observar mudanças
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', applyRules);
                } else {
                  applyRules();
                }
                new MutationObserver(applyRules).observe(document, { childList: true, subtree: true });
                window.addEventListener('load', applyRules);
                setInterval(applyRules, 1000);
              })();
            `;
            await client.send('Page.addScriptToEvaluateOnNewDocument', { source: blockerScript }).catch((e) => { 
              console.error('🚫 [ELEMENT-BLOCKER] Erro ao injetar:', e);
            });
            console.log(`🚫 [ELEMENT-BLOCKER] ${selected_element_rules_content.length} regra(s) de bloqueio injetada(s)`);
          } else {
            console.log('🚫 [ELEMENT-BLOCKER] Nenhuma regra de bloqueio selecionada');
          }

        } catch (e) { console.error('[CDP] Erro:', e); }
      }

      p.on('domcontentloaded', () => {
        p.frames().forEach((f: Frame) => injectProtection(f));
      });
      p.on('framenavigated', (f: Frame) => injectProtection(f));
    };

    context.on('page', setupPage);

    if (!page) {
      page = await context.newPage();
    } else {
      await setupPage(page);
    }

    // NAVEGAÇÃO - Múltiplas URLs em abas separadas
    const urls = TARGET_URL.split('\n').map((u: string) => u.trim()).filter((u: string) => u && u.startsWith('http'));
    
    if (urls.length === 0) {
      urls.push('https://google.com'); // Fallback
    }
    
    if (IS_DEV) console.log(`🌐 Navegando para ${urls.length} URL(s)...`);

    try {
      // Primeira URL na página principal
      await page.goto(urls[0], { timeout: 60000, waitUntil: 'commit' });
      
      // URLs adicionais em novas abas
      for (let i = 1; i < urls.length; i++) {
        const newTab = await context.newPage();
        await setupPage(newTab);
        await newTab.goto(urls[i], { timeout: 60000, waitUntil: 'commit' }).catch((e: any) => {
          if (IS_DEV) console.error(`⚠️ Erro ao abrir ${urls[i]}:`, e.message);
        });
        if (IS_DEV) console.log(`   ↳ Aba ${i + 1}: ${urls[i]}`);
      }
    } catch (gotoError: any) {
      if (IS_DEV) console.error("⚠️ Erro no page.goto:", gotoError.message);
      
      // Tentar navegar para uma página de erro amigável
      try {
        const errorMessage = gotoError.message.includes('net::ERR_ABORTED') 
          ? 'A conexão foi interrompida. Verifique se a proxy está funcionando corretamente.' 
          : gotoError.message.includes('Timeout') 
          ? 'Tempo limite de conexão excedido. Verifique sua conexão ou proxy.'
          : `Erro ao carregar a página: ${gotoError.message}`;
          
        await page.setContent(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Erro de Conexão</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                color: #fff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                text-align: center;
              }
              .icon { font-size: 64px; margin-bottom: 20px; }
              h1 { font-size: 24px; margin-bottom: 10px; color: #ff6b6b; }
              p { font-size: 16px; color: #a0a0a0; max-width: 500px; line-height: 1.6; }
              .url { 
                background: rgba(255,255,255,0.1); 
                padding: 8px 16px; 
                border-radius: 8px; 
                margin: 20px 0;
                font-family: monospace;
                word-break: break-all;
              }
              .actions { margin-top: 30px; display: flex; gap: 12px; }
              button {
                background: #6c5ce7;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
                transition: background 0.2s;
              }
              button:hover { background: #5b4cdb; }
              button.secondary { background: rgba(255,255,255,0.1); }
              button.secondary:hover { background: rgba(255,255,255,0.2); }
            </style>
          </head>
          <body>
            <div class="icon">⚠️</div>
            <h1>Não foi possível conectar</h1>
            <div class="url">${urls[0]}</div>
            <p>${errorMessage}</p>
            <div class="actions">
              <button onclick="location.reload()">🔄 Tentar Novamente</button>
              <button class="secondary" onclick="location.href='https://google.com'">🏠 Ir para Google</button>
            </div>
          </body>
          </html>
        `);
      } catch (e) {
        // Fallback final
        await page.goto('https://google.com', { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
      }
    }

    // SESSION SAVING
    let lastGoodSessionData: any = contextOptions.storageState || null;

    // FORCE CLOSE DETECTION - Polls API every 10 seconds to check if admin requested remote close
    let forceCloseInterval: NodeJS.Timeout | null = null;
    const checkForceClose = async () => {
      try {
        const token = args.token; // Token should be passed from web panel
        const apiBaseUrl = args.api_base_url || ''; // API base URL from web panel
        if (!token || !args.id) return;

        const response = await fetch(`${apiBaseUrl}/api/profiles/${args.id}/check-force-close`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.should_close) {
            if (IS_DEV) console.log(`🚨 [FORCE-CLOSE] Perfil será fechado remotamente por solicitação de admin`);
            
            // Limpar interval para não checar novamente
            if (forceCloseInterval) {
              clearInterval(forceCloseInterval);
              forceCloseInterval = null;
            }

            // Salvar sessão antes de fechar
            await tryCaptureSession('force-close');

            // Limpar sessão ativa no servidor
            try {
              await fetch(`${apiBaseUrl}/api/profiles/active-sessions`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ profile_id: args.id }),
              });
            } catch (e) {
              if (IS_DEV) console.error('Erro ao limpar sessão ativa:', e);
            }

            // Fechar navegador
            if (browser && browser.isConnected()) {
              await browser.close().catch(() => {});
            }
          }
        }
      } catch (e) {
        // Falha silenciosa - não interromper uso normal
        if (IS_DEV) console.error('[FORCE-CLOSE] Erro ao verificar:', e);
      }
    };

    // Iniciar polling a cada 10 segundos
    if (args.token && args.id) {
      forceCloseInterval = setInterval(checkForceClose, 10000);
      if (IS_DEV) console.log('🔄 [FORCE-CLOSE] Monitoramento iniciado (10s)');
    }

    // PLAN VALIDATION - Polls API every 30 seconds to check if user's plan is still valid
    let planCheckInterval: NodeJS.Timeout | null = null;
    const checkPlanStatus = async () => {
      try {
        const token = args.token;
        const apiBaseUrl = args.api_base_url || '';
        if (!token) return;

        const response = await fetch(`${apiBaseUrl}/api/user/plan-status`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.should_block) {
            if (IS_DEV) console.log(`🚨 [PLAN-CHECK] Plano inválido: ${data.block_reason} - ${data.message}`);
            
            // Limpar intervals
            if (planCheckInterval) {
              clearInterval(planCheckInterval);
              planCheckInterval = null;
            }
            if (forceCloseInterval) {
              clearInterval(forceCloseInterval);
              forceCloseInterval = null;
            }

            // Salvar sessão antes de fechar
            await tryCaptureSession('plan-expired');

            // Enviar mensagem para UI mostrar tela de bloqueio
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('plan-blocked', {
                reason: data.block_reason,
                message: data.message,
                plan_status: data.plan_status
              });
            }

            // Fechar navegador
            if (browser && browser.isConnected()) {
              await browser.close().catch(() => {});
            }
          }
        } else if (response.status === 401) {
          // Token inválido - sessão expirada
          if (IS_DEV) console.log('🚨 [PLAN-CHECK] Token inválido - sessão expirada');
          
          if (planCheckInterval) {
            clearInterval(planCheckInterval);
            planCheckInterval = null;
          }
          if (forceCloseInterval) {
            clearInterval(forceCloseInterval);
            forceCloseInterval = null;
          }

          // Enviar mensagem para UI fazer logout
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('session-expired');
          }

          // Fechar navegador
          if (browser && browser.isConnected()) {
            await browser.close().catch(() => {});
          }
        }
      } catch (e) {
        // Falha silenciosa - não interromper uso normal
        if (IS_DEV) console.error('[PLAN-CHECK] Erro ao verificar:', e);
      }
    };

    // Iniciar polling de plano a cada 30 segundos
    if (args.token) {
      planCheckInterval = setInterval(checkPlanStatus, 30000);
      // Fazer uma verificação inicial após 5 segundos
      setTimeout(checkPlanStatus, 5000);
      if (IS_DEV) console.log('🔄 [PLAN-CHECK] Monitoramento de plano iniciado (30s)');
    }

    const tryCaptureSession = async (reason: string) => {
      if (save_strategy === 'never') return;
      if (!context || !browser || !browser.isConnected()) return;

      try {
        if (IS_DEV) console.log(`💾 [SESSION] Salvando (${reason})...`);
        const fullStorageState = await context.storageState();
        const hasCookies = fullStorageState.cookies && fullStorageState.cookies.length > 0;
        const hasStorage = fullStorageState.origins && fullStorageState.origins.length > 0;

        if (hasCookies || hasStorage) {
          lastGoodSessionData = JSON.parse(JSON.stringify(fullStorageState));
          if (IS_DEV) console.log(`✅ [SESSION] Salvo. Cookies: ${fullStorageState.cookies?.length || 0}`);
        }
      } catch (e: any) {
        if (IS_DEV) console.error(`⚠️ [SESSION] Falha:`, e.message);
      }
    };

    await new Promise<void>((resolve) => {
      page.on('close', async () => {
        // Limpar força-fechamento e plano-check se ainda estiver ativo
        if (forceCloseInterval) {
          clearInterval(forceCloseInterval);
          forceCloseInterval = null;
        }
        if (planCheckInterval) {
          clearInterval(planCheckInterval);
          planCheckInterval = null;
        }
        await tryCaptureSession('page-close');
        resolve();
      });
      browser?.on('disconnected', () => {
        // Limpar intervalos se ainda estiverem ativos
        if (forceCloseInterval) {
          clearInterval(forceCloseInterval);
          forceCloseInterval = null;
        }
        if (planCheckInterval) {
          clearInterval(planCheckInterval);
          planCheckInterval = null;
        }
        resolve();
      });
    });

    await tryCaptureSession('final-check');
    const finalSessionData = lastGoodSessionData;

    if (browser && browser.isConnected()) await browser.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("app-closed", args.id);

    return { success: true, session_data: finalSessionData };

  } catch (error: any) {
    if (IS_DEV) console.error("Erro:", error);
    if (browser && browser.isConnected()) await browser.close().catch(() => { });
    return { success: false, error: error.message };
  }
};
