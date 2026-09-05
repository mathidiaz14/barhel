import { BaseDriver, DriverHealthReport } from './BaseDriver.js';
import { ProviderConfig } from '../types/providers.js';
export declare const FREELLMAPI_CONFIG: ProviderConfig;
export declare const FREELLMAPI_RECOMMENDED_MODELS: {
    id: string;
    name: string;
    desc: string;
}[];
export declare class FreeLLMAPIDriver extends BaseDriver {
    private activeController;
    private isStreamingActive;
    private customBaseUrl?;
    private customApiKey?;
    private customModel?;
    constructor(customConfig?: Partial<ProviderConfig>, options?: {
        baseUrl?: string;
        apiKey?: string;
        model?: string;
    });
    getBaseUrl(): string;
    getApiKey(): string;
    getModel(): string;
    init(headless?: boolean, initialChatUrl?: string): Promise<void>;
    isStreaming(): Promise<boolean>;
    stopGeneration(): Promise<boolean>;
    close(): Promise<void>;
    sendMessage(prompt: string, onChunk?: (chunk: string) => void): Promise<string>;
    verifyHealth(testPing?: boolean): Promise<DriverHealthReport>;
}
