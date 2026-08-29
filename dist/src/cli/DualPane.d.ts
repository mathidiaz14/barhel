import { TodoItem } from '../types/actions.js';
export interface SessionDashboardState {
    title: string;
    sessionId: string;
    workdir: string;
    branch?: string;
    leaderName: string;
    leaderStatus: string;
    workers: Array<{
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
    static incrementAction(type: string): void;
    static incrementTurn(): void;
    /**
     * Genera las líneas de la columna derecha con ancho proporcional y sin espacios vacíos gigantes
     */
    static buildRightPaneLines(): string[];
    /**
     * Renderiza el marco dividido de dos columnas de forma perfectamente balanceada y sin espacios sobrantes
     */
    static renderSplitFrame(leftContentLines: string[]): void;
}
