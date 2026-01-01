const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Script para garantir o download do Chromium correto
const browsersPath = path.resolve(__dirname, '../browsers');
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

console.log(`\n🚀 [FERRAMENTAS GURU] Iniciando download do Chromium...`);
console.log(`📂 Destino: ${browsersPath}`);
console.log(`💻 Sistema: ${process.platform} | Arquitetura: ${os.arch()}`);

try {
    if (!fs.existsSync(browsersPath)) {
        fs.mkdirSync(browsersPath, { recursive: true });
    }

    console.log(`📦 Executando: npx patchright install chromium`);

    execSync(`npx patchright install chromium`, {
        stdio: 'inherit',
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath }
    });

    console.log(`\n✅ [SUCESSO] Chromium instalado com sucesso em ./browsers`);
} catch (error) {
    console.error(`\n❌ [ERRO] Falha ao baixar o Chromium:`, error.message);
    process.exit(1);
}
