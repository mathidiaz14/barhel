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
export declare class DualPane {
    private static state;
    static updateState(partial: Partial<SessionDashboardState>): void;
    static setTodos(todos: TodoItem[]): void;
    static setLeaderStatus(status: string): void;
    static setWorkers(workerIds: string[]): void;
    static incrementAction(type: string): void;
    static incrementTurn(): void;
    /**
     * 1. Renderiza el Header superior con el Logo ASCII y atajos
     */
    static renderLogoHeader(dividerWidth?: number): void;
    /**
     * 2. Renderiza la Caja de Datos de la Sesión y Workspace
     */
    static renderSessionDataBox(boxWidth?: number): void;
    /**
     * 3. Renderiza el Estado de los Subagentes (Workers)
     */
    static renderSubagentsBox(boxWidth?: number): void;
    /**
     * 4. Renderiza la Lista de Tareas (TODO) si existe
     */
    static renderTodosBox(boxWidth?: number): void;
    /**
     * 5. Renderiza el Historial de la Sesión Anterior con Fecha y Hora exacta
     */
    static renderSessionHistory(session: ChatSession, boxWidth?: number): void;
    /**
     * Renderiza el dashboard completo secuencial:
     * 1. Logo superior
     * 2. Datos de la sesión
     * 3. Estado de subagentes
     * 4. TODO si existe
     * 5. Historial previo si existe con fecha y hora
     */
    static renderFullScreen(session?: ChatSession): void;
}
