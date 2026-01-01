import { defineConfig } from 'vite';
import obfuscatorPlugin from 'rollup-plugin-obfuscator';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            external: ['patchright', 'patchright-core'],
            plugins: [
                // Ofuscação de código - ativado apenas em produção
                process.env.NODE_ENV === 'production' && obfuscatorPlugin({
                    options: {
                        // Configurações de alta proteção
                        compact: true,
                        controlFlowFlattening: true,
                        controlFlowFlatteningThreshold: 0.75,
                        deadCodeInjection: true,
                        deadCodeInjectionThreshold: 0.4,
                        debugProtection: false,
                        disableConsoleOutput: false,
                        identifierNamesGenerator: 'hexadecimal',
                        log: false,
                        numbersToExpressions: true,
                        renameGlobals: false,
                        selfDefending: true,
                        simplify: true,
                        splitStrings: true,
                        splitStringsChunkLength: 5,
                        stringArray: true,
                        stringArrayCallsTransform: true,
                        stringArrayEncoding: ['base64'],
                        stringArrayIndexShift: true,
                        stringArrayRotate: true,
                        stringArrayShuffle: true,
                        stringArrayWrappersCount: 2,
                        stringArrayWrappersChainedCalls: true,
                        stringArrayWrappersParametersMaxCount: 4,
                        stringArrayWrappersType: 'function',
                        stringArrayThreshold: 0.75,
                        transformObjectKeys: true,
                        unicodeEscapeSequence: false,
                    },
                }),
            ].filter(Boolean),
        },
    },
});
