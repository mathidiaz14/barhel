import { TodoItem } from '../types/actions.js';
export interface ActionRecord {
    type: string;
    details?: Record<string, unknown>;
    outputPreview?: string;
}
export interface TurnRecord {
    prompt: string;
    thought?: string;
    actionType?: string;
    actions?: ActionRecord[];
    todos?: TodoItem[];
    summary?: string;
    timestamp: string;
}
export interface ChatSession {
    id: string;
    title: string;
    workdir: string;
    leader: string;
    workers: string[];
    chatUrl?: string;
    createdAt: string;
    updatedAt: string;
    turns: TurnRecord[];
    todos?: TodoItem[];
    summary?: string;
    lastSummarizedTurnIndex?: number;
}
export declare class HistoryManager {
    private static ensureDir;
    /**
     * Crea una nueva sesión de conversación
     */
    static createSession(options: {
        workdir?: string;
        leader: string;
        workers: string[];
        title?: string;
        chatUrl?: string;
    }): ChatSession;
    /**
     * Guarda o actualiza una sesión en disco (cifrada si BARHEL_SECRET está definido)
     */
    static saveSession(session: ChatSession): void;
    /**
     * Obtiene una sesión por su ID (soporta archivos .json y .json.enc)
     */
    static getSession(id: string): ChatSession | null;
    /**
     * Lista todas las sesiones guardadas ordenadas por última actualización (opcionalmente filtradas por workdir)
     */
    static listSessions(workdir?: string): ChatSession[];
    /**
     * Comprueba si existen sesiones cifradas que requieren BARHEL_SECRET para leerse
     */
    static hasEncryptedSessions(): boolean;
    /**
     * Convierte una sesión a Markdown legible para documentación/exportación
     */
    static sessionToMarkdown(session: ChatSession): string;
    /**
     * Obtiene la sesión más reciente del directorio de trabajo actual (si existe)
     */
    static getLatestSessionForWorkdir(workdir: string): ChatSession | null;
    /**
     * Muestra un menú interactivo para seleccionar una sesión previa
     */
    static promptSelectSession(currentWorkdir?: string): Promise<ChatSession | null>;
    /**
     * Genera un título limpio a partir del primer prompt del usuario
     */
    static generateTitle(prompt: string): string;
    /**
     * Formato legible de tiempo relativo
     */
    private static formatRelativeTime;
}
