import type { TodoItem } from '../types/actions.js';
import type { SupervisionSnapshot } from '../engine/ProgressSupervisor.js';
export type BusEventType = 'system' | 'stream' | 'thought' | 'action' | 'tool_result' | 'diff' | 'todos' | 'worker' | 'finish' | 'error' | 'interrupt' | 'model' | 'auth_status' | 'turn_start' | 'turn_end' | 'session_meta' | 'clear' | 'progress';
export interface BusEventPayload {
    thought?: string;
    durationMs?: number;
    type?: string;
    details?: Record<string, unknown>;
    success?: boolean;
    output?: string;
    error?: string;
    toolType?: string;
    path?: string;
    oldContent?: string | null;
    newContent?: string;
    todos?: TodoItem[];
    workerName?: string;
    subtaskPrompt?: string;
    fullResponse?: string;
    summary?: string;
    preview?: string;
    chars?: number;
    modelName?: string;
    message?: string;
    level?: string;
    autonomous?: boolean;
    planOnly?: boolean;
    thinking?: boolean;
    snapshot?: SupervisionSnapshot;
}
export interface BusMessage {
    sessionId: string;
    type: BusEventType;
    payload: BusEventPayload;
    ts: string;
}
export type BusListener = (msg: BusMessage) => void;
type SessionSnapshot = {
    todos: TodoItem[];
    progress: SupervisionSnapshot | null;
    turnRunning: boolean;
    turnCount: number;
    title: string;
    leader: string;
    workers: string[];
    autonomous: boolean;
    planOnly: boolean;
    thinking: boolean;
    workdir: string;
    chatUrl?: string;
    summary?: string;
    finishedLast: boolean;
};
/**
 * Bus de eventos global con namespace por sessionId.
 * Permite a cualquier módulo (TUI, logger, Orchestrator) emitir eventos programáticos
 * en paralelo a la salida de consola, y al servidor web reenviarlos por WebSocket.
 */
export declare class EventBus {
    private static listeners;
    private static sessions;
    static subscribe(listener: BusListener): () => void;
    static emit(sessionId: string, type: BusEventType, payload?: BusEventPayload): void;
    static register(sessionId: string, meta?: BusEventPayload): void;
    static getSnapshot(sessionId: string): SessionSnapshot | null;
    static listSnapshots(): BusMessage[];
    static clear(sessionId: string): void;
    private static updateSnapshot;
}
export {};
