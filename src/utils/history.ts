import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { select } from '@inquirer/prompts';
import pc from 'picocolors';

export interface TurnRecord {
  prompt: string;
  thought?: string;
  actionType?: string;
  summary?: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  workdir: string;
  leader: string;
  workers: string[];
  chatUrl?: string;
  createdAt: string;
  updatedAt: string;
  turns: TurnRecord[];
}

const SESSIONS_HISTORY_DIR = path.join(os.homedir(), '.dev-agent-sessions', 'history');

export class HistoryManager {
  private static ensureDir(): void {
    if (!fs.existsSync(SESSIONS_HISTORY_DIR)) {
      fs.mkdirSync(SESSIONS_HISTORY_DIR, { recursive: true });
    }
  }

  /**
   * Crea una nueva sesión de conversación
   */
  public static createSession(options: {
    workdir?: string;
    leader: string;
    workers: string[];
    title?: string;
    chatUrl?: string;
  }): ChatSession {
    this.ensureDir();
    const id = crypto.randomBytes(4).toString('hex'); // ej: a1b2c3d4
    const now = new Date().toISOString();

    const session: ChatSession = {
      id,
      title: options.title || 'Nueva sesión de trabajo',
      workdir: options.workdir || process.cwd(),
      leader: options.leader,
      workers: options.workers,
      chatUrl: options.chatUrl,
      createdAt: now,
      updatedAt: now,
      turns: [],
    };

    this.saveSession(session);
    return session;
  }

  /**
   * Guarda o actualiza una sesión en disco
   */
  public static saveSession(session: ChatSession): void {
    this.ensureDir();
    session.updatedAt = new Date().toISOString();
    const filePath = path.join(SESSIONS_HISTORY_DIR, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Obtiene una sesión por su ID
   */
  public static getSession(id: string): ChatSession | null {
    this.ensureDir();
    const cleanId = id.replace('.json', '').trim();
    const filePath = path.join(SESSIONS_HISTORY_DIR, `${cleanId}.json`);

    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as ChatSession;
      }
    } catch {
      // Ignorar error de lectura
    }
    return null;
  }

  /**
   * Lista todas las sesiones guardadas ordenadas por última actualización
   */
  public static listSessions(): ChatSession[] {
    this.ensureDir();
    try {
      const files = fs.readdirSync(SESSIONS_HISTORY_DIR).filter((f) => f.endsWith('.json'));
      const sessions: ChatSession[] = [];

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(SESSIONS_HISTORY_DIR, file), 'utf-8');
          sessions.push(JSON.parse(raw) as ChatSession);
        } catch {
          // Ignorar archivos corruptos
        }
      }

      return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Obtiene la sesión más reciente del directorio de trabajo actual (si existe)
   */
  public static getLatestSessionForWorkdir(workdir: string): ChatSession | null {
    const normalizedWorkdir = path.resolve(workdir).toLowerCase();
    const sessions = this.listSessions();
    for (const session of sessions) {
      if (path.resolve(session.workdir).toLowerCase() === normalizedWorkdir) {
        return session;
      }
    }
    return null;
  }

  /**
   * Muestra un menú interactivo para seleccionar una sesión previa
   */
  public static async promptSelectSession(currentWorkdir?: string): Promise<ChatSession | null> {
    const sessions = this.listSessions();

    if (sessions.length === 0) {
      console.log(pc.yellow('\n⚠ No hay sesiones guardadas en el historial. Iniciando nueva sesión.\n'));
      return null;
    }

    console.log(pc.cyan('\n📜 Historial de Sesiones Guardadas de Barhel:'));

    const choices = sessions.map((s) => {
      const dirName = path.basename(s.workdir) || s.workdir;
      const isCurrentDir = currentWorkdir && path.resolve(s.workdir) === path.resolve(currentWorkdir);
      const dirBadge = isCurrentDir ? pc.green(`[este proyecto: ${dirName}]`) : pc.dim(`[${dirName}]`);
      const relativeTime = this.formatRelativeTime(new Date(s.updatedAt));
      const modelBadge = pc.cyan(`👑 ${s.leader}`);
      const turnsCount = pc.dim(`(${s.turns.length} turnos)`);

      return {
        name: `${pc.bold(s.title)}  ${dirBadge}  ${modelBadge} ${turnsCount} - ${pc.dim(relativeTime)}`,
        value: s.id,
        description: `ID: ${s.id} | Ruta: ${s.workdir} | Chat Web: ${s.chatUrl || 'Inicial'}`,
      };
    });

    choices.push({
      name: pc.yellow('+ Iniciar una nueva sesión limpia'),
      value: '__new__',
      description: 'Crea una sesión nueva con un chat limpio en el LLM',
    });

    const selectedId = await select({
      message: '📂 Selecciona la sesión que deseas reanudar:',
      choices,
      pageSize: 12,
    });

    if (selectedId === '__new__') {
      return null;
    }

    return this.getSession(selectedId);
  }

  /**
   * Genera un título limpio a partir del primer prompt del usuario
   */
  public static generateTitle(prompt: string): string {
    const clean = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/[¿?¡!]/g, '')
      .trim();

    if (clean.length === 0) return 'Sesión sin título';
    if (clean.length <= 50) return clean;
    return clean.substring(0, 47).trim() + '...';
  }

  /**
   * Formato legible de tiempo relativo
   */
  private static formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'hace un momento';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffHours < 24) return `hace ${diffHours} h`;
    if (diffDays === 1) return 'ayer';
    if (diffDays < 30) return `hace ${diffDays} días`;
    return date.toLocaleDateString();
  }
}
