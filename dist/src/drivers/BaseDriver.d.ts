import { BrowserContext, Page } from 'playwright';
import { ProviderConfig, ProviderType } from '../types/providers.js';
export declare class WebProviderError extends Error {
    readonly reason: string;
    constructor(message: string, reason: string);
}
export declare abstract class BaseDriver {
    protected config: ProviderConfig;
    protected context: BrowserContext | null;
    protected page: Page | null;
    protected isInitialized: boolean;
    constructor(config: ProviderConfig);
    get providerId(): ProviderType;
    get displayName(): string;
    protected currentChatUrl?: string;
    setChatUrl(url?: string): void;
    getChatUrl(): string | undefined;
    /**
     * Inicializa el contexto de navegador persistente con técnicas anti-detección avanzadas
     */
    init(headless?: boolean, initialChatUrl?: string): Promise<void>;
    /**
     * Abre la URL del proveedor y permite al usuario autenticarse manualmente
     */
    login(): Promise<void>;
    /**
     * Navega a la página del chat (o a una URL de chat específica) y espera a que esté lista
     */
    ensureChatPage(targetChatUrl?: string, checkAuth?: boolean): Promise<void>;
    /**
     * Inyecta de forma universal y ultra-rápida prompts de cualquier longitud
     * compatible con editores ricos (Lexical, ProseMirror, React, Draft.js, Svelte).
     */
    injectPrompt(inputSelector: string, prompt: string): Promise<void>;
    /**
     * Detecta tempranamente errores de la web (Rate Limits, Cloudflare, saturación)
     */
    detectWebErrors(): Promise<string | null>;
    /**
     * Auto-healing: Encuentra semánticamente el campo de entrada si los selectores cambiaron
     */
    findSemanticInput(): Promise<string | null>;
    /**
     * Cierra automáticamente popups, banners o modales que bloqueen la interfaz
     */
    dismissModals(): Promise<void>;
    /**
     * Detiene en caliente la generación del LLM haciendo clic en el botón de stop o enviando Escape
     */
    stopGeneration(): Promise<boolean>;
    /**
     * Método abstracto para enviar prompt y esperar la respuesta completa del LLM con soporte de streaming opcional
     */
    abstract sendMessage(prompt: string, onChunk?: (chunk: string) => void): Promise<string>;
    /**
     * Método abstracto para verificar si la respuesta sigue en proceso (streaming)
     */
    abstract isStreaming(): Promise<boolean>;
    /**
     * Cierra el contexto del navegador y libera recursos
     */
    close(): Promise<void>;
    /**
     * Helper seguro para encontrar un elemento entre una lista de selectores alternativos con auto-healing
     */
    protected findFirstVisibleSelector(selectors: string[], timeoutMs?: number): Promise<string | null>;
    /**
     * Diagnóstico exhaustivo de salud, autenticación y selectores de UI del proveedor
     */
    verifyHealth(testPing?: boolean): Promise<DriverHealthReport>;
    /**
     * Verifica que los selectores clave del proveedor sigan presentes en la página.
     */
    verifyUI(): Promise<{
        name: string;
        found: boolean;
        selector?: string;
    }[]>;
}
export interface DriverHealthReport {
    providerId: string;
    displayName: string;
    url: string;
    currentUrl?: string;
    authenticated: boolean;
    authReason?: string;
    cloudflareBlocked: boolean;
    inputSelectorFound: boolean;
    inputSelector?: string;
    sendButtonFound: boolean;
    sendButtonSelector?: string;
    responseContainerFound: boolean;
    latencyMs: number;
    pingSuccess?: boolean;
    pingResponse?: string;
    pingDurationMs?: number;
    error?: string;
}
