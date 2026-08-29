export class ProgressSupervisor {
    static agents = new Map();
    static todos = [];
    static listeners = [];
    static reset() {
        this.agents.clear();
        this.todos = [];
    }
    static registerAgent(agentId, displayName, role) {
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
    static updateAgentProgress(agentId, partial) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        if (partial.status)
            agent.status = partial.status;
        if (partial.currentTask !== undefined)
            agent.currentTask = partial.currentTask;
        if (partial.percentage !== undefined)
            agent.percentage = Math.max(0, Math.min(100, partial.percentage));
        agent.durationSec = Math.floor((Date.now() - agent.startTime) / 1000);
        this.notify();
    }
    static setTodos(todos) {
        this.todos = todos;
        // Actualizar porcentajes de tareas por agente automáticamente
        if (todos.length > 0) {
            const completed = todos.filter((t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done').length;
            const overall = Math.round((completed / todos.length) * 100);
            // Actualizar el líder con el porcentaje global
            for (const [id, ag] of this.agents.entries()) {
                if (ag.role === 'leader') {
                    ag.percentage = overall;
                }
                else {
                    // Calcular porcentaje del worker según sus tareas asignadas
                    const workerTasks = todos.filter((t) => (t.assignedTo || '').toLowerCase() === id.toLowerCase());
                    if (workerTasks.length > 0) {
                        const wDone = workerTasks.filter((t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done').length;
                        ag.percentage = Math.round((wDone / workerTasks.length) * 100);
                    }
                }
            }
        }
        this.notify();
    }
    static getSnapshot() {
        const totalTodos = this.todos.length;
        const completedTodos = this.todos.filter((t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done').length;
        let overallPercentage = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;
        const agentsObj = {};
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
    static formatProgressReport() {
        const snap = this.getSnapshot();
        const lines = [];
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
    static renderProgressBar(percentage, length = 15) {
        const filled = Math.round((percentage / 100) * length);
        const empty = length - filled;
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
    }
    static onProgress(listener) {
        this.listeners.push(listener);
        return () => {
            const idx = this.listeners.indexOf(listener);
            if (idx !== -1)
                this.listeners.splice(idx, 1);
        };
    }
    static notify() {
        const snapshot = this.getSnapshot();
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            }
            catch {
                // Silencioso
            }
        }
    }
}
//# sourceMappingURL=ProgressSupervisor.js.map