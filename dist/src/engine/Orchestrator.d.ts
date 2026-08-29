import { CLIOptions } from '../types/actions.js';
import { ChatSession } from '../utils/history.js';
export declare class Orchestrator {
    private leaderDriver;
    private leaderId;
    private activeWorkers;
    private workerDrivers;
    private toolEngine;
    private options;
    private currentSession;
    private currentTodos;
    private isShuttingDown;
    private isInitialized;
    private turnCount;
    private shutdownPromise;
    private fallbackOrder;
    private fallbackUsed;
    private sendFailures;
    private autoSummarize;
    private autoCommit;
    constructor(options?: CLIOptions);
    get isClosing(): boolean;
    getSession(): ChatSession;
    getSessionId(): string;
    getSessionTitle(): string;
    setSessionTitle(newTitle: string): void;
    getLeaderId(): string;
    getActiveWorkers(): string[];
    getWorkdir(): string;
    isAutonomous(): boolean;
    toggleAutonomous(): boolean;
    /**
     * Cambia dinámicamente el modelo líder o los workers
     */
    switchModels(newLeaderId: string, newWorkers: string[]): Promise<void>;
    isPlanOnly(): boolean;
    togglePlanOnly(): boolean;
    getFallbackOrder(): string[];
    setLeader(leaderId: string): Promise<void>;
    setPlanOnly(planOnly: boolean): Promise<void>;
    /**
     * Genera (o regenera) el resumen de memoria de la sesión usando el líder
     */
    summarizeSession(): Promise<string | null>;
    /**
     * Prepara un commit git con los cambios del workspace
     */
    commitWork(message?: string): Promise<string>;
    /**
     * Repositorio: estado y diff actual
     */
    reviewGit(): Promise<string>;
    /**
     * Cambia a una sesión guardada previa, cargando su hilo web exacto
     */
    switchSession(sessionId: string): Promise<ChatSession>;
    /**
     * Inicia una nueva sesión limpia con un nuevo chat en el LLM
     */
    startNewSession(title?: string): Promise<ChatSession>;
    /**
     * Captura señales de interrupción para cerrar navegadores ordenadamente
     */
    private setupProcessSignals;
    /**
     * Inicializa la sesión del Agente Líder una sola vez para conversación continua
     */
    initSession(): Promise<void>;
    /**
     * Obtiene o inicializa perezosamente un driver de worker
     */
    private getWorkerDriver;
    isTurnRunning: boolean;
    private isInterrupted;
    /**
     * Cancela o interrumpe en caliente la generación y razonamiento actual del LLM
     */
    interruptCurrentTurn(): Promise<void>;
    /**
     * Ejecuta un turno de conversación (ReAct Loop) sin cerrar el navegador al terminar
     */
    runTurn(userGoal: string): Promise<void>;
    /**
     * Devuelve el próximo proveedor de respaldo disponible (no el actual, no usado aún)
     */
    private getNextFallback;
    /**
     * Cambia el líder actual a un proveedor de respaldo (nuevo hilo web para ese proveedor)
     */
    private applyFallbackLeader;
    /**
     * Guarda la respuesta cruda del modelo en ~/.dev-agent-sessions/debug para diagnóstico
     */
    private dumpRawResponse;
    /**
     * Resume los turnos nuevos de la sesión y persiste el resumen en memoria
     */
    private summarizeSessionInternal;
    /**
     * Auto-commit al concluir la tarea si autoCommit está activo en modo autónomo
     */
    private tryAutoCommit;
    /**
     * Cierra ordenadamente todas las instancias de navegadores y persiste la sesión
     */
    shutdown(): Promise<void>;
    private doShutdown;
    /**
     * Genera el System Prompt inicial
     */
    private buildSystemPrompt;
    /**
     * Genera prompt para turnos de conversación sucesivos
     */
    private buildTurnPrompt;
}
