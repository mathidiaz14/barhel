import { TodoItem } from '../types/actions.js';
export interface AgentProgress {
    agentId: string;
    displayName: string;
    role: 'leader' | 'worker';
    status: 'idle' | 'thinking' | 'executing' | 'completed' | 'failed';
    currentTask: string;
    percentage: number;
    startTime: number;
    durationSec: number;
}
export interface SupervisionSnapshot {
    overallPercentage: number;
    totalTodos: number;
    completedTodos: number;
    agents: Record<string, AgentProgress>;
    summary: string;
}
export declare class ProgressSupervisor {
    private static agents;
    private static todos;
    private static listeners;
    static reset(): void;
    static registerAgent(agentId: string, displayName: string, role: 'leader' | 'worker'): void;
    static updateAgentProgress(agentId: string, partial: {
        status?: 'idle' | 'thinking' | 'executing' | 'completed' | 'failed';
        currentTask?: string;
        percentage?: number;
    }): void;
    static setTodos(todos: TodoItem[]): void;
    static getSnapshot(): SupervisionSnapshot;
    static formatProgressReport(): string;
    private static renderProgressBar;
    static onProgress(listener: (snapshot: SupervisionSnapshot) => void): () => void;
    private static notify;
}
