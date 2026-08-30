import { TodoItem } from '../types/actions.js';
import { ChatSession } from '../utils/history.js';
export interface SessionDashboardState {
    title: string;
    sessionId: string;
    workdir: string;
    branch?: string;
    leaderName: string;
    leaderStatus: string;
    workers: Array<{
        id: string;
        name: string;
        status: string;
    }>;
    autonomous: boolean;
    planOnly: boolean;
    todos: TodoItem[];
    metrics: {
        turns: number;
        actions: number;
        filesRead: number;
        filesWritten: number;
        durationSec: number;
    };
}
/**
 * Utilidad para calcular el ancho visual de un string ignorando secuencias ANSI de color
 */
export declare function visualLength(str: string): number;
/**
 * Rellena un string con espacios a la derecha hasta alcanzar el ancho visual deseado
 */
export declare function padRightVisual(str: string, targetWidth: number): string;
/**
 * Divide un texto en líneas que respeten el ancho máximo visual
 */
export declare function wrapTextVisual(text: string, maxWidth: number): string[];
export declare class DualPane {
    private static state;
    static updateState(partial: Partial<SessionDashboardState>): void;
    static setTodos(todos: TodoItem[]): void;
    static setLeaderStatus(status: string): void;
    static setWorkers(workerIds: string[]): void;
    static incrementAction(type: string): void;
    static incrementTurn(): void;
    /**
     * Genera el bloque del Banner Superior Izquierdo (ASCII + Subtítulo + Hints)
     */
    static buildLeftHeaderLines(maxWidth?: number): string[];
    /**
     * Genera las 3 Cajas del Panel Lateral Derecho
     * Caja 1: Metadatos de Sesión y Workspace
     * Caja 2: Estado de Subagentes (Workers) en vivo
     * Caja 3: Lista de Tareas (TODO List)
     */
    static buildRightSidebarLines(boxWidth?: number): string[];
    /**
     * Construye las líneas formateadas de los turnos previos de la sesión para el panel izquierdo
     */
    static buildChatHistoryLines(session: ChatSession, maxChatWidth?: number): string[];
    /**
     * Renderiza la pantalla completa en Split-Screen permanente (Header + Chat a la izquierda, 3 Cajas a la derecha)
     */
    static renderFullScreen(session?: ChatSession): void;
    /**
     * Renderiza el marco inicial de pantalla dividida
     */
    static renderSplitFrame(leftCustomLines?: string[]): void;
}
