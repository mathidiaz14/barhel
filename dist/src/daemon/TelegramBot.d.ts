import { Orchestrator } from '../engine/Orchestrator.js';
export interface TelegramMessage {
    message_id: number;
    from: {
        id: number;
        first_name?: string;
        username?: string;
    };
    chat: {
        id: number;
    };
    text?: string;
}
export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
}
export declare class TelegramBot {
    private token;
    private allowedChatIds;
    private orchestrator;
    private isPolling;
    private lastUpdateId;
    private pollingAbortController;
    constructor(token: string, allowedChatIds?: number[]);
    setOrchestrator(orchestrator: Orchestrator): void;
    /**
     * Inicia el bucle de Long-Polling para recibir y procesar mensajes de Telegram
     */
    start(): Promise<void>;
    stop(): void;
    private pollUpdates;
    private handleMessage;
    sendMessage(chatId: number, text: string): Promise<void>;
    broadcast(text: string): Promise<void>;
}
