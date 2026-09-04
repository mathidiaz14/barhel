/**
 * Bus de eventos global con namespace por sessionId.
 * Permite a cualquier módulo (TUI, logger, Orchestrator) emitir eventos programáticos
 * en paralelo a la salida de consola, y al servidor web reenviarlos por WebSocket.
 */
export class EventBus {
    static listeners = [];
    static sessions = new Map();
    static subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            const idx = this.listeners.indexOf(listener);
            if (idx !== -1)
                this.listeners.splice(idx, 1);
        };
    }
    static emit(sessionId, type, payload = {}) {
        const msg = { sessionId, type, payload, ts: new Date().toISOString() };
        this.updateSnapshot(sessionId, type, payload);
        for (const listener of this.listeners) {
            try {
                listener(msg);
            }
            catch {
                // Silencioso
            }
        }
    }
    static register(sessionId, meta = {}) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                todos: [],
                progress: null,
                turnRunning: false,
                turnCount: 0,
                title: 'Nueva sesión',
                leader: '',
                workers: [],
                autonomous: meta.autonomous ?? false,
                planOnly: meta.planOnly ?? false,
                thinking: meta.thinking ?? true,
                workdir: '',
                finishedLast: false,
            });
        }
        this.emit(sessionId, 'session_meta', meta);
    }
    static getSnapshot(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    static listSnapshots() {
        const out = [];
        for (const [sessionId, snap] of this.sessions.entries()) {
            out.push({ sessionId, type: 'session_meta', payload: { ...snap }, ts: new Date().toISOString() });
        }
        return out;
    }
    static clear(sessionId) {
        this.sessions.delete(sessionId);
    }
    static updateSnapshot(sessionId, type, payload) {
        const snap = this.sessions.get(sessionId);
        if (!snap)
            return;
        switch (type) {
            case 'todos':
                if (payload.todos)
                    snap.todos = payload.todos;
                break;
            case 'progress':
                if (payload.snapshot)
                    snap.progress = payload.snapshot;
                break;
            case 'turn_start':
                snap.turnRunning = true;
                break;
            case 'turn_end':
            case 'finish':
            case 'interrupt':
                snap.turnRunning = false;
                if (type === 'finish')
                    snap.finishedLast = true;
                if (type === 'interrupt')
                    snap.finishedLast = false;
                break;
            case 'session_meta':
                if (payload.todos)
                    snap.todos = payload.todos;
                if (typeof payload.message === 'string')
                    snap.title = payload.message;
                if (payload.modelName)
                    snap.leader = payload.modelName;
                if (payload.autonomous !== undefined)
                    snap.autonomous = payload.autonomous;
                if (payload.planOnly !== undefined)
                    snap.planOnly = payload.planOnly;
                if (payload.thinking !== undefined)
                    snap.thinking = payload.thinking;
                if (payload.workdir !== undefined)
                    snap.workdir = payload.workdir;
                break;
            case 'model':
                if (payload.modelName)
                    snap.leader = payload.modelName;
                if (payload.autonomous !== undefined)
                    snap.autonomous = payload.autonomous;
                if (payload.planOnly !== undefined)
                    snap.planOnly = payload.planOnly;
                if (payload.thinking !== undefined)
                    snap.thinking = payload.thinking;
                break;
            default:
                break;
        }
    }
}
//# sourceMappingURL=EventBus.js.map