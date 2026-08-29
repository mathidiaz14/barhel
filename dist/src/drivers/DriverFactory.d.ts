import { BaseDriver } from './BaseDriver.js';
import { ProviderConfig, ProviderType } from '../types/providers.js';
export interface ProviderMeta {
    id: ProviderType;
    name: string;
    url: string;
    description: string;
    config: ProviderConfig;
    createDriver: () => BaseDriver;
}
export declare const AVAILABLE_PROVIDERS: Record<string, ProviderMeta>;
export declare class DriverFactory {
    static createDriver(providerId?: string): BaseDriver;
    static getMeta(providerId?: string): ProviderMeta | undefined;
    static getAllProviders(): ProviderMeta[];
}
