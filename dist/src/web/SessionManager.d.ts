import { Orchestrator } from '../engine/Orchestrator.js';
export interface ManagedSession {
    sessionId: string;
    workdir: string;
    title: string;
    leader: string;
    workers: string[];
    autonomous: boolean;
    planOnly: boolean;
    turnRunning: boolean;
    queuedTurns: number;
    startedAt: string;
    lastActive: string;
    chatUrl?: string;
    turnsCount: number;
}
export interface CommandResult {
    ok: boolean;
    output: string;
    message?: string;
}
export declare class SessionManager {
    private orchestrators;
    private queues;
    private abortControllers;
    getMaxConcurrent(): number;
    getActiveSessions(): ManagedSession[];
    hasSession(sessionId: string): boolean;
    getSession(sessionId: string): Orchestrator | undefined;
    changeWorkdir(sessionId: string, newWorkdir: string): {
        ok: boolean;
        workdir?: string;
        error?: string;
    };
    private toManaged;
    /**
     * Crea (o reutiliza) un orquestador para el workspace dado.
     * Respeta el límite de orquestadores simultáneos (navegadores Playwright).
     */
    createSession(options: {
        workdir?: string;
        sessionId?: string;
        leader?: string;
        workers?: string[];
        resume?: boolean;
    }): Promise<{
        sessionId: string;
        created: boolean;
        error?: string;
    }>;
    /**
     * Li Xpera un orquestador inactivo (con turno corrido y sin trabajo) para liberar slots.
     */
    private evictIdle;
    /**
     * Encola y ejecuta un turno en la sesión.
     */
    runTurn(sessionId: string, prompt: string): Promise<CommandResult>;
    interrupt(sessionId: string): Promise<CommandResult>;
    closeSession(sessionId: string): Promise<CommandResult>;
    shutdownAll(): Promise<void>;
    command(sessionId: string, cmd: string, arg: string): Promise<CommandResult>;
    private runDoctor;
    private listSkills;
    private handleSkill;
    private getProgressReport;
    private getWorkersAnalysis;
    private handleTelegram;
    private handleDaemon;
    private handleBackup;
    private handleRestore;
    private handleImportSessions;
    private handleClearSessions;
    private handleMemory;
    private handlePromptLibrary;
    private handleBranch;
    private handleGithub;
    private handleMcp;
    private handleContext;
    private getHelpText;
    private runTests;
    private runGraph;
    private commit;
    private newSession;
}
