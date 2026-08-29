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

export class ProgressSupervisor {
  private static agents: Map<string, AgentProgress> = new Map();
  private static todos: TodoItem[] = [];
  private static listeners: Array<(snapshot: SupervisionSnapshot) => void> = [];

  public static reset(): void {
    this.agents.clear();
    this.todos = [];
  }

  public static registerAgent(agentId: string, displayName: string, role: 'leader' | 'worker'): void {
    this.agents.set(agentId, {
      agentId,
      displayName,
      role,
      status: 'idle',
      currentTask: 'Listo para recibir instrucciones',
      percentage: 0,
      startTime: Date.now(),
      durationSec: 0,
    });
    this.notify();
  }

  public static updateAgentProgress(
    agentId: string,
    partial: {
      status?: 'idle' | 'thinking' | 'executing' | 'completed' | 'failed';
      currentTask?: string;
      percentage?: number;
    }
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    if (partial.status) agent.status = partial.status;
    if (partial.currentTask !== undefined) agent.currentTask = partial.currentTask;
    if (partial.percentage !== undefined) agent.percentage = Math.max(0, Math.min(100, partial.percentage));

    agent.durationSec = Math.floor((Date.now() - agent.startTime) / 1000);
    this.notify();
  }

  public static setTodos(todos: TodoItem[]): void {
    this.todos = todos;

    // Actualizar porcentajes de tareas por agente automáticamente
    if (todos.length > 0) {
      const completed = todos.filter(
        (t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done'
      ).length;

      const overall = Math.round((completed / todos.length) * 100);

      // Actualizar el líder con el porcentaje global
      for (const [id, ag] of this.agents.entries()) {
        if (ag.role === 'leader') {
          ag.percentage = overall;
        } else {
          // Calcular porcentaje del worker según sus tareas asignadas
          const workerTasks = todos.filter((t) => (t.assignedTo || '').toLowerCase() === id.toLowerCase());
          if (workerTasks.length > 0) {
            const wDone = workerTasks.filter(
              (t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done'
            ).length;
            ag.percentage = Math.round((wDone / workerTasks.length) * 100);
          }
        }
      }
    }

    this.notify();
  }

  public static getSnapshot(): SupervisionSnapshot {
    const totalTodos = this.todos.length;
    const completedTodos = this.todos.filter(
      (t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done'
    ).length;

    let overallPercentage = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

    const agentsObj: Record<string, AgentProgress> = {};
    for (const [id, agent] of this.agents.entries()) {
      agentsObj[id] = {
        ...agent,
        durationSec: Math.floor((Date.now() - agent.startTime) / 1000),
      };
    }

    let summary = `Progreso global: ${overallPercentage}% (${completedTodos}/${totalTodos} tareas)`;
    if (totalTodos === 0) {
      summary = 'En ejecución (sin lista de tareas definida)';
    }

    return {
      overallPercentage,
      totalTodos,
      completedTodos,
      agents: agentsObj,
      summary,
    };
  }

  public static formatProgressReport(): string {
    const snap = this.getSnapshot();
    const lines: string[] = [];

    lines.push(`📊 SUPERVISIÓN DE AGENTES [${snap.overallPercentage}%]`);
    lines.push(`Tareas completadas: ${snap.completedTodos}/${snap.totalTodos}`);
    lines.push('──────────────────────────────────────────────');

    for (const [, ag] of Object.entries(snap.agents)) {
      const icon = ag.status === 'completed' ? '✓' : ag.status === 'failed' ? '✖' : ag.status === 'executing' ? '▶' : '•';
      const roleBadge = ag.role === 'leader' ? '👑 LÍDER' : '👥 WORKER';
      const bar = this.renderProgressBar(ag.percentage);
      lines.push(`${icon} [${roleBadge}] ${ag.displayName} [${ag.percentage}%]`);
      lines.push(`   ${bar}`);
      lines.push(`   Estado: ${ag.status} (${ag.durationSec}s) • ${ag.currentTask}`);
    }

    return lines.join('\n');
  }

  private static renderProgressBar(percentage: number, length = 15): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  public static onProgress(listener: (snapshot: SupervisionSnapshot) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  private static notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Silencioso
      }
    }
  }
}
