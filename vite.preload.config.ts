import { defineConfig } from 'vite';
import obfuscatorPlugin from 'rollup-plugin-obfuscator';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            plugins: [
                // Ofuscação de código - ativado apenas em produção
                process.env.NODE_ENV === 'production' && obfuscatorPlugin({
                    options: {
                        // Configurações médias para preload (precisa manter compatibilidade com contextBridge)
                        compact: true,
                        controlFlowFlattening: true,
                        controlFlowFlatteningThreshold: 0.5,
                        deadCodeInjection: true,
                        deadCodeInjectionThreshold: 0.3,
                        debugProtection: false,
                        disableConsoleOutput: false,
                        identifierNamesGenerator: 'hexadecimal',
                        log: false,
                        numbersToExpressions: true,
                        renameGlobals: false,
                        selfDefending: false, // Desativado para preload
                        simplify: true,
                        splitStrings: true,
                        splitStringsChunkLength: 10,
                        stringArray: true,
                        stringArrayEncoding: ['base64'],
                        stringArrayThreshold: 0.75,
                        transformObjectKeys: false, // Desativado para manter contextBridge funcionando
                        unicodeEscapeSequence: false,
                    },
                }),
            ].filter(Boolean),
        },
    },
});
