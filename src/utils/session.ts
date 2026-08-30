import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { ProviderType } from '../types/providers.js';

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
