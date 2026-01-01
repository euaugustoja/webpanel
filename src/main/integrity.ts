/**
 * Sistema de Verificação de Integridade
 * 
 * Este módulo verifica se os arquivos críticos da aplicação foram modificados
 * comparando hashes SHA-256 gerados no build com os hashes calculados em runtime.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface IntegrityConfig {
  version: string;
  generatedAt: string;
  buildId: string;
  files: {
    [filename: string]: string; // filename -> SHA-256 hash
  };
}

// Armazenar violações detectadas
let integrityViolations: string[] = [];
let integrityChecked = false;
let integrityValid = false;

/**
 * Calcula o hash SHA-256 de um arquivo
 */
function calculateFileHash(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (error) {
    console.error(`[INTEGRITY] Error calculating hash for ${filePath}:`, error);
    return null;
  }
}

/**
 * Carrega a configuração de integridade
 */
function loadIntegrityConfig(): IntegrityConfig | null {
  try {
    // Em produção, o arquivo está dentro do pacote da app
    const possiblePaths = [
      path.join(app.getAppPath(), 'integrity.json'),
      path.join(app.getAppPath(), '.vite', 'build', 'integrity.json'),
      path.join(__dirname, 'integrity.json'),
      path.join(__dirname, '..', 'integrity.json'),
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as IntegrityConfig;
      }
    }

    console.warn('[INTEGRITY] No integrity.json found - skipping verification in development mode');
    return null;
  } catch (error) {
    console.error('[INTEGRITY] Error loading integrity config:', error);
    return null;
  }
}

/**
 * Verifica a integridade de todos os arquivos
 * @returns true se todos os arquivos são válidos, false caso contrário
 */
export function verifyIntegrity(): boolean {
  // Se já verificou, retorna o resultado anterior
  if (integrityChecked) {
    return integrityValid;
  }

  integrityViolations = [];
  integrityChecked = true;

  const config = loadIntegrityConfig();

  // Se não há configuração de integridade, permite execução (modo desenvolvimento)
  if (!config) {
    console.log('[INTEGRITY] Running in development mode - integrity check skipped');
    integrityValid = true;
    return true;
  }

  console.log(`[INTEGRITY] Verifying integrity (Build: ${config.buildId}, Generated: ${config.generatedAt})`);

  const appPath = app.getAppPath();
  let allValid = true;

  for (const [relativePath, expectedHash] of Object.entries(config.files)) {
    // Tentar encontrar o arquivo em diferentes localizações
    const possiblePaths = [
      path.join(appPath, relativePath),
      path.join(appPath, '.vite', 'build', relativePath),
      path.join(__dirname, relativePath),
      path.join(__dirname, '..', relativePath),
    ];

    let fileFound = false;
    let fileValid = false;

    for (const filePath of possiblePaths) {
      const currentHash = calculateFileHash(filePath);
      if (currentHash !== null) {
        fileFound = true;
        if (currentHash === expectedHash) {
          fileValid = true;
          console.log(`[INTEGRITY] ✓ ${relativePath}`);
          break;
        } else {
          console.error(`[INTEGRITY] ✗ ${relativePath} - Hash mismatch`);
          console.error(`[INTEGRITY]   Expected: ${expectedHash}`);
          console.error(`[INTEGRITY]   Got:      ${currentHash}`);
        }
      }
    }

    if (!fileFound) {
      console.error(`[INTEGRITY] ✗ ${relativePath} - File not found`);
      integrityViolations.push(`${relativePath} (arquivo não encontrado)`);
      allValid = false;
    } else if (!fileValid) {
      integrityViolations.push(`${relativePath} (modificado)`);
      allValid = false;
    }
  }

  integrityValid = allValid;

  if (allValid) {
    console.log('[INTEGRITY] All files verified successfully');
  } else {
    console.error(`[INTEGRITY] Verification failed - ${integrityViolations.length} violation(s) detected`);
  }

  return allValid;
}

/**
 * Retorna a lista de arquivos que falharam na verificação de integridade
 */
export function getIntegrityViolations(): string[] {
  return [...integrityViolations];
}

/**
 * Retorna se a verificação de integridade já foi executada
 */
export function isIntegrityChecked(): boolean {
  return integrityChecked;
}

/**
 * Reseta o estado da verificação (apenas para testes)
 */
export function resetIntegrityState(): void {
  integrityChecked = false;
  integrityValid = false;
  integrityViolations = [];
}
