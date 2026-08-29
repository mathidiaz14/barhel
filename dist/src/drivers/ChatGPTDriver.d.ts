import { BaseDriver } from './BaseDriver.js';
import { ProviderConfig } from '../types/providers.js';
export declare const CHATGPT_CONFIG: ProviderConfig;
export declare class ChatGPTDriver extends BaseDriver {
    constructor(customConfig?: Partial<ProviderConfig>);
    isStreaming(): Promise<boolean>;
    sendMessage(prompt: string, onChunk?: (chunk: string) => void): Promise<string>;
    private waitForCompletion;
    private extractLatestResponse;
}
