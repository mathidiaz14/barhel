import { ProviderType } from '../types/providers.js';
export interface ImportResult {
    provider: string;
    success: boolean;
    skipped: boolean;
    message: string;
}
export declare function getSessionBasePath(): string;
export declare function getProviderSessionPath(provider: ProviderType | string): string;
export declare function listSessionsStatus(): Record<string, {
    path: string;
    exists: boolean;
    fileCount: number;
}>;
/**
 * Importa sesiones de un navegador real (Chrome/Edge) a los perfiles de barhel
 * para todos los proveedores configurados que no tengan sesión activa.
 */
export declare function importSessionsFromBrowser(providersToImport: string[], browserName?: string, force?: boolean): ImportResult[];
