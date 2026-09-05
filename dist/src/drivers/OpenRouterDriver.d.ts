import { BaseDriver, DriverHealthReport } from './BaseDriver.js';
import { ProviderConfig } from '../types/providers.js';
export declare const OPENROUTER_CONFIG: ProviderConfig;
export declare const OPENROUTER_FREE_MODELS: {
    id: string;
    name: string;
    desc: string;
}[];
export declare class OpenRouterDriver extends BaseDriver {
    private activeController;
    private isStreamingActive;
    private customApiKey?;
    private customModel?;
    constructor(customConfig?: Partial<ProviderConfig>, options?: {
        apiKey?: string;
        model?: string;
    });
    getApiKey(): string;
    getModel(): string;
    init(headless?: boolean, initialChatUrl?: string): Promise<void>;
    isStreaming(): Promise<boolean>;
    stopGeneration(): Promise<boolean>;
    close(): Promise<void>;
    sendMessage(prompt: string, onChunk?: (chunk: string) => void): Promise<string>;
    verifyHealth(testPing?: boolean): Promise<DriverHealthReport>;
}
