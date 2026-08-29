import { BaseDriver } from './BaseDriver.js';
import { ProviderConfig } from '../types/providers.js';
export declare const MISTRAL_CONFIG: ProviderConfig;
export declare class MistralDriver extends BaseDriver {
    constructor(customConfig?: Partial<ProviderConfig>);
    isStreaming(): Promise<boolean>;
    sendMessage(prompt: string, onChunk?: (chunk: string) => void): Promise<string>;
}
