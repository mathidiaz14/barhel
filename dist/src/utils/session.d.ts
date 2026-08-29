import { ProviderType } from '../types/providers.js';
export declare function getSessionBasePath(): string;
export declare function getProviderSessionPath(provider: ProviderType | string): string;
export declare function listSessionsStatus(): Record<string, {
    path: string;
    exists: boolean;
    fileCount: number;
}>;
