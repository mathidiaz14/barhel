import { TodoItem } from '../types/actions.js';
export declare class TUI {
    private static thinkingStartTime;
    private static timerInterval;
    private static showFullThinking;
    static toggleThinkingDisplay(): boolean;
    private static currentModelName;
    private static currentActionDescription;
    private static streamedCharCount;
    static isShowingFullThinking(): boolean;
    /**
     * Inicia el spinner de razonamiento en tiempo real con descripción dinámica
     */
    static startThinking(modelName?: string, customText?: string): void;
    /**
     * Actualiza el progreso de streaming en vivo con el número de caracteres y lo que el modelo está pensando/haciendo
     */
    static updateThinkingChunk(charCount: number, modelName?: string, previewText?: string): void;
    /**
     * Detiene el spinner de pensamiento y retorna el tiempo transcurrido en ms
     */
    static stopThinking(): number;
    /**
     * Renderiza el bloque de pensamiento (+ Thought: 159ms y explicación de lo que está haciendo)
     */
    static renderThought(thought: string, durationMs?: number): void;
    /**
     * Muestra de forma compacta y coloreada exactamente qué código se va a modificar y por cuál
     */
    static renderDiff(relPath: string, oldContent: string | null, newContent: string): void;
    /**
     * Renderiza el panel de lista de tareas (Todo Checklist) con estados y agentes asignados
     */
    static renderTodoList(todos: Array<{
        task: string;
        status: string;
        assignedTo?: string;
    }>): void;
    /**
     * Renderiza la invocación de herramientas
     */
    static renderAction(type: string, details: Record<string, unknown>): void;
    /**
     * Renderiza el resultado de herramientas de forma sobria (resumiendo lecturas sin volcar el código entero)
     */
    static renderToolResult(toolType: string, success: boolean, output: string): void;
    /**
     * Renderiza la tarjeta de asistencia de un agente secundario
     */
    static renderWorkerDelegation(workerName: string, subtaskPrompt: string, response: string, durationMs?: number): void;
    /**
     * Modal interactivo para inspeccionar el análisis completo de los agentes
     */
    static promptWorkerInspection(): Promise<void>;
    /**
     * Pantalla principal de Barhel dividida en dos columnas ocupando todo el ancho de la consola:
     * Columna Izquierda: Logo ASCII, bienvenida y flujo de conversación
     * Columna Derecha: Panel de Sesión en vivo, Estado del Líder, Workers, Lista de Tareas y Métricas
     */
    static renderBanner(workdir?: string, autonomous?: boolean, leaderName?: string, workersStr?: string, sessionTitle?: string, sessionId?: string, todos?: TodoItem[]): void;
    /**
     * Renderiza el historial previo de turnos al reanudar una sesión
     */
    /**
     * Renderiza el historial previo de turnos al reanudar una sesión con formato amplio y legible
     */
    static renderSessionHistory(session: {
        id: string;
        title: string;
        workdir?: string;
        turns: Array<{
            prompt: string;
            thought?: string;
            summary?: string;
            timestamp?: string;
            actions?: Array<{
                type: string;
                details?: Record<string, unknown>;
            }>;
        }>;
    }): void;
    static getPromptPrefix(leaderName?: string): string;
    private static getWorkerBrand;
}
