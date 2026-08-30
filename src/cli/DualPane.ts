import pc from 'picocolors';
import path from 'node:path';
import { TodoItem } from '../types/actions.js';
import { getGitBranch } from '../utils/git.js';
import { getBarhelVersion } from '../utils/version.js';
import { ProgressSupervisor } from '../engine/ProgressSupervisor.js';
import { DriverFactory } from '../drivers/DriverFactory.js';

export interface SessionDashboardState {
  title: string;
  sessionId: string;
  workdir: string;
  branch?: string;
  leaderName: string;
  leaderStatus: string;
  workers: Array<{ id: string; name: string; status: string }>;
  autonomous: boolean;
  planOnly: boolean;
  todos: TodoItem[];
  metrics: {
    turns: number;
    actions: number;
    filesRead: number;
    filesWritten: number;
    durationSec: number;
  };
}

/**
 * Utilidad para calcular el ancho visual de un string ignorando secuencias ANSI de color
 */
export function visualLength(str: string): number {
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return str.replace(ansiRegex, '').length;
}

/**
 * Rellena un string con espacios a la derecha hasta alcanzar el ancho visual deseado
 */
export function padRightVisual(str: string, targetWidth: number): string {
  const len = visualLength(str);
  if (len >= targetWidth) {
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    const plain = str.replace(ansiRegex, '');
    if (plain.length > targetWidth) {
      return str.slice(0, targetWidth - 1) + '…';
    }
    return str;
  }
  return str + ' '.repeat(targetWidth - len);
}

export class DualPane {
  private static state: SessionDashboardState = {
    title: 'Sesión de trabajo',
    sessionId: 'nueva',
    workdir: process.cwd(),
    branch: '',
    leaderName: 'DeepSeek Chat (V3 / R1)',
    leaderStatus: 'Inactivo',
    workers: [
      { id: 'claude', name: 'Claude', status: 'idle' },
      { id: 'chatgpt', name: 'ChatGPT', status: 'idle' },
      { id: 'gemini', name: 'Gemini', status: 'idle' },
      { id: 'qwen', name: 'Qwen', status: 'idle' },
    ],
    autonomous: false,
    planOnly: false,
    todos: [],
    metrics: {
      turns: 0,
      actions: 0,
      filesRead: 0,
      filesWritten: 0,
      durationSec: 0,
    },
  };

  public static updateState(partial: Partial<SessionDashboardState>): void {
    this.state = {
      ...this.state,
      ...partial,
      metrics: {
        ...this.state.metrics,
        ...(partial.metrics || {}),
      },
    };
  }

  public static setTodos(todos: TodoItem[]): void {
    this.state.todos = todos;
  }

  public static setLeaderStatus(status: string): void {
    this.state.leaderStatus = status;
  }

  public static setWorkers(workerIds: string[]): void {
    this.state.workers = workerIds.map((id) => {
      const meta = DriverFactory.getMeta(id);
      return {
        id,
        name: meta?.name || id.toUpperCase(),
        status: 'idle',
      };
    });
  }

  public static incrementAction(type: string): void {
    this.state.metrics.actions++;
    if (type === 'read_file') this.state.metrics.filesRead++;
    if (type === 'write_file') this.state.metrics.filesWritten++;
  }

  public static incrementTurn(): void {
    this.state.metrics.turns++;
  }

  /**
   * Genera el bloque del Banner Superior Izquierdo (ASCII + Subtítulo + Hints)
   */
  public static buildLeftHeaderLines(): string[] {
    const lines: string[] = [];
    lines.push(pc.cyan('      ____             __          __   '));
    lines.push(pc.cyan('     / __ )____ ______/ /_  ___   / /   '));
    lines.push(pc.cyan('    / __  / __ `/ ___/ __ \\/ _ \\ / /    '));
    lines.push(pc.cyan('   / /_/ / /_/ / /  / / / /  __// /     '));
    lines.push(pc.cyan('  /_____/\\__,_/_/  /_/ /_/\\___//_/      '));
    lines.push(pc.bold(pc.white('  Autonomous Multi-Model Coding Agent   ')));
    lines.push(pc.gray('  ' + '─'.repeat(40)));
    lines.push(
      `  ${pc.dim('Type')} ${pc.cyan('/')} ${pc.dim('for palette')} ${pc.dim('•')} ${pc.cyan('/workers')} ${pc.dim('•')} ${pc.cyan('/help')}`
    );
    return lines;
  }

  /**
   * Genera las 3 Cajas del Panel Lateral Derecho
   * Caja 1: Metadatos de Sesión y Workspace
   * Caja 2: Estado de Subagentes (Workers) en vivo
   * Caja 3: Lista de Tareas (TODO List)
   */
  public static buildRightSidebarLines(boxWidth = 48): string[] {
    const lines: string[] = [];
    const dirBase = path.basename(this.state.workdir) || this.state.workdir;
    const branchStr = this.state.branch || getGitBranch(this.state.workdir);
    const branchTag = branchStr ? `:${branchStr}` : '';
    const idBadge = `#${this.state.sessionId.slice(0, 8)}`;
    const modeBadge = this.state.autonomous ? pc.green('autonomous') : pc.yellow('safe');
    const version = getBarhelVersion();

    const g = pc.dim;
    const w = pc.white;
    const cy = pc.cyan;
    const gr = pc.gray;

    const topBorder = (title: string) => gr(`┌─ ${pc.bold(title)} ${'─'.repeat(Math.max(2, boxWidth - visualLength(title) - 5))}┐`);
    const bottomBorder = () => gr(`└${'─'.repeat(boxWidth - 1)}┘`);
    const lineWrapper = (content: string) => `${gr('│')} ${padRightVisual(content, boxWidth - 4)} ${gr('│')}`;

    // ── CAJA 1: SESIÓN & METADATOS ──────────────────────────────────────────────
    lines.push(topBorder('SESIÓN & METADATOS'));
    lines.push(lineWrapper(`${g('Session   :')} ${w(this.state.title.slice(0, 18))} ${g(`(${idBadge})`)}`));
    lines.push(lineWrapper(`${g('Workspace :')} ${w(dirBase)} ${g(`(${this.state.workdir.slice(0, 14)}${branchTag})`)}`));
    lines.push(lineWrapper(`${g('Leader    :')} ${cy(this.state.leaderName.slice(0, 20))} ${g(`(${this.state.leaderStatus})`)}`));
    
    const workerNames = this.state.workers.length > 0
      ? this.state.workers.map((wrk) => wrk.id).join(', ')
      : 'ninguno';
    lines.push(lineWrapper(`${g('Workers   :')} ${pc.yellow(workerNames)}`));
    lines.push(lineWrapper(`${g('Mode      :')} ${modeBadge} ${g('(/auto to toggle)')}`));
    lines.push(lineWrapper(`${g('Version   :')} ${w(`Barhel ${version}`)}`));
    lines.push(bottomBorder());

    // ── CAJA 2: ESTADO DE SUBAGENTES (WORKERS) ──────────────────────────────────
    const supervisorSnapshot = ProgressSupervisor.getSnapshot();
    lines.push(topBorder('ESTADO DE SUBAGENTES'));

    if (this.state.workers.length === 0) {
      lines.push(lineWrapper(g('  Sin workers secundarios configurados')));
    } else {
      for (const wrk of this.state.workers) {
        const agInfo = supervisorSnapshot.agents[wrk.id.toLowerCase()];
        let icon = pc.dim('[●]');
        let statusText = pc.dim('En espera (Listo)');

        if (agInfo) {
          if (agInfo.status === 'thinking' || agInfo.status === 'executing') {
            icon = pc.yellow('[⚡]');
            statusText = pc.cyan(`Trabajando (${agInfo.percentage}%)`);
          } else if (agInfo.status === 'completed') {
            icon = pc.green('[✓]');
            statusText = pc.green('Completado');
          } else if (agInfo.status === 'failed') {
            icon = pc.red('[✖]');
            statusText = pc.red('No disponible');
          }
        }

        const nameLabel = w(wrk.name.slice(0, 15).padEnd(15));
        lines.push(lineWrapper(` ${icon} ${nameLabel} : ${statusText}`));
      }
    }
    lines.push(bottomBorder());

    // ── CAJA 3: PLAN DE TAREAS (TODO LIST) ──────────────────────────────────────
    lines.push(topBorder('PLAN DE TAREAS (TODOS)'));
    const todos = this.state.todos;

    if (todos.length === 0) {
      lines.push(lineWrapper(g('  (Sin plan de tareas activo)')));
    } else {
      const completedCount = todos.filter(
        (t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done'
      ).length;
      const pct = Math.round((completedCount / todos.length) * 100);
      const barLen = 12;
      const filled = Math.round((pct / 100) * barLen);
      const empty = barLen - filled;
      const progressBar = `[${pc.green('█'.repeat(filled))}${pc.dim('░'.repeat(empty))}] ${pct}% (${completedCount}/${todos.length})`;

      lines.push(lineWrapper(` ${progressBar}`));

      // Mostrar hasta 5 subtareas más relevantes
      const previewTodos = todos.slice(0, 5);
      previewTodos.forEach((item, idx) => {
        let statusIcon = pc.dim('[ ]');
        const st = (item.status || 'pending').toLowerCase();
        if (st === 'completed' || st === 'done') {
          statusIcon = pc.green('[✓]');
        } else if (st === 'in_progress' || st === 'running') {
          statusIcon = pc.yellow('[▶]');
        } else if (st === 'failed') {
          statusIcon = pc.red('[✖]');
        }

        const agentTag = item.assignedTo ? g(` [${item.assignedTo.toUpperCase()}]`) : '';
        const taskName = w(item.task.slice(0, 24));
        lines.push(lineWrapper(` ${statusIcon} ${idx + 1}. ${taskName}${agentTag}`));
      });

      if (todos.length > 5) {
        lines.push(lineWrapper(g(`    ... (+${todos.length - 5} tareas más)`)));
      }
    }
    lines.push(bottomBorder());

    return lines;
  }

  /**
   * Renderiza el marco inicial de pantalla dividida (Header Izquierdo + Sidebar Derecha de 3 Cajas)
   */
  public static renderSplitFrame(leftCustomLines?: string[]): void {
    const totalCols = process.stdout.columns || 120;
    const leftWidth = 44;
    const rightBoxWidth = Math.min(Math.max(42, totalCols - leftWidth - 6), 56);
    const sep = pc.gray('│');

    const leftLines = leftCustomLines || this.buildLeftHeaderLines();
    const rightLines = this.buildRightSidebarLines(rightBoxWidth);
    const maxRows = Math.max(leftLines.length, rightLines.length);

    console.log();
    for (let r = 0; r < maxRows; r++) {
      const leftRaw = leftLines[r] || '';
      const rightRaw = rightLines[r] || '';

      const leftPadded = padRightVisual(leftRaw, leftWidth);
      console.log(`  ${leftPadded}  ${sep}  ${rightRaw}`);
    }
    console.log();
  }

  /**
   * Renderiza únicamente la Sidebar lateral derecha completa con sus 3 cajas
   */
  public static renderRightSidebar(): void {
    const totalCols = process.stdout.columns || 120;
    const rightBoxWidth = Math.min(Math.max(44, Math.floor(totalCols * 0.45)), 56);
    const lines = this.buildRightSidebarLines(rightBoxWidth);
    lines.forEach((l) => console.log(`  ${l}`));
    console.log();
  }
}
