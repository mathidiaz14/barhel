import { TodoItem } from '../types/actions.js';
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
    static buildLeftHeaderLines(): string[];
    /**
     * Genera las 3 Cajas del Panel Lateral Derecho
     * Caja 1: Metadatos de Sesión y Workspace
     * Caja 2: Estado de Subagentes (Workers) en vivo
     * Caja 3: Lista de Tareas (TODO List)
     */
    static buildRightSidebarLines(boxWidth?: number): string[];
    /**
     * Renderiza el marco inicial de pantalla dividida (Header Izquierdo + Sidebar Derecha de 3 Cajas)
     */
    static renderSplitFrame(leftCustomLines?: string[]): void;
    /**
     * Renderiza únicamente la Sidebar lateral derecha completa con sus 3 cajas
     */
    static renderRightSidebar(): void;
}
