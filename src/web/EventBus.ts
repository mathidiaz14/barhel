import type { TodoItem } from '../types/actions.js';
import type { SupervisionSnapshot } from '../engine/ProgressSupervisor.js';

export type BusEventType =
  | 'system'
  | 'stream'
  | 'thought'
  | 'action'
  | 'tool_result'
  | 'diff'
  | 'todos'
  | 'worker'
  | 'finish'
  | 'error'
  | 'interrupt'
  | 'model'
  | 'auth_status'
  | 'turn_start'
  | 'turn_end'
  | 'session_meta'
  | 'clear'
  | 'progress';

export interface BusEventPayload {
  thought?: string;
  durationMs?: number;
  type?: string;
  details?: Record<string, unknown>;
  success?: boolean;
  output?: string;
  error?: string;
  toolType?: string;
  path?: string;
  oldContent?: string | null;
  newContent?: string;
  todos?: TodoItem[];
  workerName?: string;
  subtaskPrompt?: string;
  fullResponse?: string;
  summary?: string;
  preview?: string;
  chars?: number;
  modelName?: string;
  message?: string;
  level?: string;
  autonomous?: boolean;
  planOnly?: boolean;
  thinking?: boolean;
  snapshot?: SupervisionSnapshot;
}

export interface BusMessage {
  sessionId: string;
  type: BusEventType;
  payload: BusEventPayload;
  ts: string;
}

export type BusListener = (msg: BusMessage) => void;

type SessionSnapshot = {
  todos: TodoItem[];
  progress: SupervisionSnapshot | null;
  turnRunning: boolean;
  turnCount: number;
  title: string;
  leader: string;
  workers: string[];
  autonomous: boolean;
  planOnly: boolean;
  thinking: boolean;
  workdir: string;
  chatUrl?: string;
  summary?: string;
  finishedLast: boolean;
};

/**
 * Bus de eventos global con namespace por sessionId.
 * Permite a cualquier módulo (TUI, logger, Orchestrator) emitir eventos programáticos
 * en paralelo a la salida de consola, y al servidor web reenviarlos por WebSocket.
 */
export class EventBus {
  private static listeners: BusListener[] = [];
  private static sessions: Map<string, SessionSnapshot> = new Map();

  public static subscribe(listener: BusListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  public static emit(sessionId: string, type: BusEventType, payload: BusEventPayload = {}): void {
    const msg: BusMessage = { sessionId, type, payload, ts: new Date().toISOString() };
    this.updateSnapshot(sessionId, type, payload);
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch {
        // Silencioso
      }
    }
  }

  public static register(sessionId: string, meta: BusEventPayload = {}): void {
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

  public static getSnapshot(sessionId: string): SessionSnapshot | null {
    return this.sessions.get(sessionId) || null;
  }

  public static listSnapshots(): BusMessage[] {
    const out: BusMessage[] = [];
    for (const [sessionId, snap] of this.sessions.entries()) {
      out.push({ sessionId, type: 'session_meta', payload: { ...snap } as unknown as BusEventPayload, ts: new Date().toISOString() });
    }
    return out;
  }

  public static clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private static updateSnapshot(sessionId: string, type: BusEventType, payload: BusEventPayload): void {
    const snap = this.sessions.get(sessionId);
    if (!snap) return;

    switch (type) {
      case 'todos':
        if (payload.todos) snap.todos = payload.todos;
        break;
      case 'progress':
        if (payload.snapshot) snap.progress = payload.snapshot;
        break;
      case 'turn_start':
        snap.turnRunning = true;
        break;
      case 'turn_end':
      case 'finish':
      case 'interrupt':
        snap.turnRunning = false;
        if (type === 'finish') snap.finishedLast = true;
        if (type === 'interrupt') snap.finishedLast = false;
        break;
      case 'session_meta':
        if (payload.todos) snap.todos = payload.todos;
        if (typeof payload.message === 'string') snap.title = payload.message;
        if (payload.modelName) snap.leader = payload.modelName;
        if (payload.autonomous !== undefined) snap.autonomous = payload.autonomous;
        if (payload.planOnly !== undefined) snap.planOnly = payload.planOnly;
        if (payload.thinking !== undefined) snap.thinking = payload.thinking;
        break;
      case 'model':
        if (payload.modelName) snap.leader = payload.modelName;
        if (payload.autonomous !== undefined) snap.autonomous = payload.autonomous;
        if (payload.planOnly !== undefined) snap.planOnly = payload.planOnly;
        if (payload.thinking !== undefined) snap.thinking = payload.thinking;
        break;
      default:
        break;
    }
  }
}
