import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { select } from '@inquirer/prompts';
import pc from 'picocolors';
import { encryptObject, decryptToObject, isEncryptionEnabled } from './crypto.js';

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
  summary?: string;
  lastSummarizedTurnIndex?: number;
}

const SESSIONS_HISTORY_DIR =
  process.env.BARHEL_HISTORY_DIR || path.join(os.homedir(), '.dev-agent-sessions', 'history');

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
   * Guarda o actualiza una sesión en disco (cifrada si BARHEL_SECRET está definido)
   */
  public static saveSession(session: ChatSession): void {
    this.ensureDir();
    session.updatedAt = new Date().toISOString();

    const jsonContent = JSON.stringify(session, null, 2);
    const plainPath = path.join(SESSIONS_HISTORY_DIR, `${session.id}.json`);

    if (isEncryptionEnabled()) {
      const encPath = path.join(SESSIONS_HISTORY_DIR, `${session.id}.json.enc`);
      fs.writeFileSync(encPath, encryptObject(session), 'utf-8');
      // Evitar dejar copia en claro si quedaba un .json previo
      if (fs.existsSync(plainPath)) {
        try {
          fs.unlinkSync(plainPath);
        } catch {
          // Ignorar fallo de limpieza
        }
      }
    } else {
      fs.writeFileSync(plainPath, jsonContent, 'utf-8');
    }
  }

  /**
   * Obtiene una sesión por su ID (soporta archivos .json y .json.enc)
   */
  public static getSession(id: string): ChatSession | null {
    this.ensureDir();
    const cleanId = id.replace(/\.json(\.enc)?$/, '').trim();

    const fileCandidates = [
      path.join(SESSIONS_HISTORY_DIR, `${cleanId}.json.enc`),
      path.join(SESSIONS_HISTORY_DIR, `${cleanId}.json`),
    ];

    for (const filePath of fileCandidates) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (filePath.endsWith('.enc')) {
          const session = decryptToObject<ChatSession>(raw);
          if (session) return session;
          continue;
        }
        return JSON.parse(raw) as ChatSession;
      } catch {
        // Probar siguiente candidato
      }
    }
    return null;
  }

  /**
   * Lista todas las sesiones guardadas ordenadas por última actualización
   */
  public static listSessions(): ChatSession[] {
    this.ensureDir();
    try {
      const files = fs
        .readdirSync(SESSIONS_HISTORY_DIR)
        .filter((f) => f.endsWith('.json') && !f.endsWith('.json.enc'));

      const encFiles = fs
        .readdirSync(SESSIONS_HISTORY_DIR)
        .filter((f) => f.endsWith('.json.enc'));

      const sessions: ChatSession[] = [];

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(SESSIONS_HISTORY_DIR, file), 'utf-8');
          sessions.push(JSON.parse(raw) as ChatSession);
        } catch {
          // Ignorar archivos corruptos
        }
      }

      for (const file of encFiles) {
        try {
          const raw = fs.readFileSync(path.join(SESSIONS_HISTORY_DIR, file), 'utf-8');
          const session = decryptToObject<ChatSession>(raw);
          if (session) sessions.push(session);
        } catch {
          // Ignorar archivos corruptos o sin secret
        }
      }

      return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Comprueba si existen sesiones cifradas que requieren BARHEL_SECRET para leerse
   */
  public static hasEncryptedSessions(): boolean {
    try {
      if (!fs.existsSync(SESSIONS_HISTORY_DIR)) return false;
      return fs.readdirSync(SESSIONS_HISTORY_DIR).some((f) => f.endsWith('.json.enc'));
    } catch {
      return false;
    }
  }

  /**
   * Convierte una sesión a Markdown legible para documentación/exportación
   */
  public static sessionToMarkdown(session: ChatSession): string {
    const lines: string[] = [];
    lines.push(`# Sesión Barhel: ${session.title}`);
    lines.push('');
    lines.push(`- **ID:** ${session.id}`);
    lines.push(`- **Creada:** ${session.createdAt}`);
    lines.push(`- **Actualizada:** ${session.updatedAt}`);
    lines.push(`- **Directorio:** \`${session.workdir}\``);
    lines.push(`- **Líder:** ${session.leader}`);
    lines.push(`- **Workers:** ${session.workers.join(', ') || 'ninguno'}`);
    if (session.chatUrl) lines.push(`- **Chat web:** ${session.chatUrl}`);
    if (session.summary) {
      lines.push('');
      lines.push('## Resumen de memoria');
      lines.push('');
      lines.push(session.summary);
    }
    lines.push('');
    lines.push(`## Conversación (${session.turns.length} turnos)`);
    lines.push('');

    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i];
      lines.push(`### Turno ${i + 1} — ${turn.timestamp}`);
      lines.push('');
      lines.push(`**Usuario:** ${turn.prompt}`);
      if (turn.thought) lines.push('');
      lines.push(`**Pensamiento:** ${turn.thought || ''}`);
      lines.push('');
      lines.push(`**Acción:** \`${turn.actionType || 'desconocida'}\``);
      if (turn.summary) {
        lines.push('');
        lines.push(`**Resumen de acción:** ${turn.summary}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    lines.push(`*Exportado por Barhel v2.*`);
    return lines.join('\n');
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
