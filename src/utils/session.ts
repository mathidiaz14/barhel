import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { ProviderType } from '../types/providers.js';

export interface ImportResult {
  provider: string;
  success: boolean;
  skipped: boolean;
  message: string;
}

const SESSIONS_BASE_DIR = path.join(os.homedir(), '.dev-agent-sessions');

export function getSessionBasePath(): string {
  if (!fs.existsSync(SESSIONS_BASE_DIR)) {
    fs.mkdirSync(SESSIONS_BASE_DIR, { recursive: true });
  }
  return SESSIONS_BASE_DIR;
}

export function getProviderSessionPath(provider: ProviderType | string): string {
  const base = getSessionBasePath();
  const providerPath = path.join(base, provider.toLowerCase());
  if (!fs.existsSync(providerPath)) {
    fs.mkdirSync(providerPath, { recursive: true });
  }
  return providerPath;
}

export function listSessionsStatus(): Record<string, { path: string; exists: boolean; fileCount: number }> {
  const providers = Object.values(ProviderType);
  const result: Record<string, { path: string; exists: boolean; fileCount: number }> = {};
  const base = getSessionBasePath();

  for (const provider of providers) {
    const pPath = path.join(base, provider.toLowerCase());
    let count = 0;
    let hasRealSession = false;
    try {
      if (fs.existsSync(pPath)) {
        const files = fs.readdirSync(pPath);
        count = files.length;
        // Un perfil con cookies reales contiene Default o subdirectorios de almacenamiento
        hasRealSession = count > 2 && files.some((f) =>
          ['Default', 'Network', 'Cookies', 'Local Storage', 'Session Storage', 'IndexedDB'].includes(f)
        );
      }
    } catch {
      count = 0;
      hasRealSession = false;
    }

    result[provider] = {
      path: pPath,
      exists: hasRealSession,
      fileCount: count,
    };
  }

  return result;
}

/**
 * Detecta la ruta del perfil de un navegador en el sistema.
 * Busca Chrome y Edge en las rutas estándar de Windows.
 */
function findBrowserProfile(browserName: string): string | null {
  const localAppData = process.env.LOCALAPPDATA || '';

  const browsers: Record<string, string[]> = {
    chrome: [
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default'),
    ],
    edge: [
      path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default'),
    ],
  };

  const candidates = browsers[browserName.toLowerCase()] || [
    ...browsers.chrome,
    ...browsers.edge,
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      // Verificar que tenga archivos de perfil reales
      try {
        const files = fs.readdirSync(candidate);
        const hasProfile = files.some(f =>
          ['Cookies', 'Preferences', 'Local Storage', 'Session Storage'].includes(f)
        );
        if (hasProfile) return candidate;
      } catch {
        // Continuar con el siguiente candidato
      }
    }
  }

  return null;
}

/**
 * Copia recursiva de directorios, similar a cp -r.
 * Maneja archivos bloqueados en Windows de forma tolerante.
 * Ignora directorios grandes innecesarios (Cache, etc).
 */
function copyDirSync(src: string, dest: string, maxDepth: number = 3): void {
  if (maxDepth <= 0) return;

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Directorios a ignorar completamente (cachés, datos temporales)
  const skipDirs = new Set([
    'Cache', 'Code Cache', 'GPUCache', 'Service Worker',
    'CacheStorage', 'ScriptCache', 'GrShaderCache', 'DawnCache',
    'ShaderCache', 'blob_storage', 'GCM Store',
    'BudgetDatabase', 'Session Budget',
  ]);

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    try {
      if (entry.isDirectory()) {
        copyDirSync(srcPath, destPath, maxDepth - 1);
      } else {
        // Limitar tamaño de archivos individuales a 10MB
        const stat = fs.statSync(srcPath);
        if (stat.size <= 10 * 1024 * 1024) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    } catch {
      // Archivo bloqueado, continuar
    }
  }
}

/**
 * Importa sesiones de un navegador real (Chrome/Edge) a los perfiles de barhel
 * para todos los proveedores configurados que no tengan sesión activa.
 */
export function importSessionsFromBrowser(
  providersToImport: string[],
  browserName: string = 'chrome',
  force: boolean = false
): ImportResult[] {
  const results: ImportResult[] = [];

  // 1. Encontrar el perfil del navegador
  const browserProfile = findBrowserProfile(browserName);
  if (!browserProfile) {
    // Si no se encontró el navegador específico, intentar el otro
    const fallback = browserName === 'chrome' ? 'edge' : 'chrome';
    const fallbackProfile = findBrowserProfile(fallback);
    if (!fallbackProfile) {
      return [{
        provider: '*',
        success: false,
        skipped: false,
        message: `No se encontró un perfil de navegador válido (Chrome/Edge) en el sistema.`,
      }];
    }
    // Usar el fallback
    return importSessionsFromBrowser(providersToImport, fallback, force);
  }

  const browserDir = path.dirname(browserProfile); // User Data directory

  // 2. Para cada proveedor, intentar importar
  for (const providerId of providersToImport) {
    const normalized = providerId.toLowerCase().trim();
    const sessionDir = getProviderSessionPath(normalized);

    // Verificar si ya tiene sesión activa
    if (!force && hasActiveSession(sessionDir)) {
      results.push({
        provider: normalized,
        success: true,
        skipped: true,
        message: 'Ya tiene sesión activa, omitido.',
      });
      continue;
    }

    // Copiar archivos esenciales del perfil del navegador al directorio de sesión
    const filesToCopy = [
      'Cookies',
      'Cookies-journal',
      'Preferences',
      'Secure Preferences',
      'Local Storage',
      'Session Storage',
      'IndexedDB',
      'Network',
      'Service Worker',
      'Extension State',
    ];

    let copiedCount = 0;
    for (const file of filesToCopy) {
      const srcPath = path.join(browserProfile, file);
      const destPath = path.join(sessionDir, file);

      if (!fs.existsSync(srcPath)) continue;

      try {
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
          copyDirSync(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
        copiedCount++;
      } catch {
        // Archivo bloqueado, continuar
      }
    }

    if (copiedCount > 0) {
      results.push({
        provider: normalized,
        success: true,
        skipped: false,
        message: `Sesión importada (${copiedCount} archivos/ directorios copiados).`,
      });
    } else {
      results.push({
        provider: normalized,
        success: false,
        skipped: false,
        message: 'No se pudieron copiar archivos del navegador.',
      });
    }
  }

  return results;
}

/**
 * Verifica si un directorio de sesión tiene una sesión activa real.
 */
function hasActiveSession(sessionDir: string): boolean {
  try {
    if (!fs.existsSync(sessionDir)) return false;
    const files = fs.readdirSync(sessionDir);
    return files.length > 2 && files.some(f =>
      ['Cookies', 'Local Storage', 'Session Storage', 'IndexedDB', 'Network'].includes(f)
    );
  } catch {
    return false;
  }
}
