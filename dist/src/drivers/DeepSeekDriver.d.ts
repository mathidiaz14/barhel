import { BaseDriver } from './BaseDriver.js';
import { ProviderConfig } from '../types/providers.js';
export declare const DEEPSEEK_CONFIG: ProviderConfig;
export declare class DeepSeekDriver extends BaseDriver {
    constructor(customConfig?: Partial<ProviderConfig>);
    isStreaming(): Promise<boolean>;
    sendMessage(prompt: string, onChunk?: (chunk: string) => void): Promise<string>;
    private countResponses;
    private waitForCompletion;
    private extractLatestResponse;
}
