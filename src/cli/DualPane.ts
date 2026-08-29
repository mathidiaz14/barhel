import pc from 'picocolors';
import path from 'node:path';
import { TodoItem } from '../types/actions.js';
import { getGitBranch } from '../utils/git.js';
import { getBarhelVersion } from '../utils/version.js';

export interface SessionDashboardState {
  title: string;
  sessionId: string;
  workdir: string;
  branch?: string;
  leaderName: string;
  leaderStatus: string;
  workers: Array<{ name: string; status: string }>;
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
  // Regex para remover códigos de escape ANSI
  const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return str.replace(ansiRegex, '').length;
}

/**
 * Rellena un string con espacios a la derecha hasta alcanzar el ancho visual deseado
 */
export function padRightVisual(str: string, targetWidth: number): string {
  const len = visualLength(str);
  if (len >= targetWidth) {
    // Si excede, recortar preservando o simplemente cortando caracteres seguros
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
    title: 'Sesión activa',
    sessionId: 'nueva',
    workdir: process.cwd(),
    branch: '',
    leaderName: 'DeepSeek',
    leaderStatus: 'Inactivo',
    workers: [],
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

  private static sessionStartTime = Date.now();

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

  public static incrementAction(type: string): void {
    this.state.metrics.actions++;
    if (type === 'read_file') this.state.metrics.filesRead++;
    if (type === 'write_file') this.state.metrics.filesWritten++;
  }

  public static incrementTurn(): void {
    this.state.metrics.turns++;
  }

  /**
   * Genera las líneas de la columna derecha (Dashboard de sesión + Lista de Tareas)
   */
  public static buildRightPaneLines(width: number): string[] {
    const lines: string[] = [];
    const w = width - 2; // Espacio interno

    const hr = pc.gray('─'.repeat(Math.max(10, w)));
    const dirBase = path.basename(this.state.workdir) || this.state.workdir;
    const branchStr = this.state.branch || getGitBranch(this.state.workdir);
    const branchTag = branchStr ? `:${branchStr}` : '';
    const idBadge = `#${this.state.sessionId.slice(0, 8)}`;
    const modeBadge = this.state.autonomous ? pc.green('Autónomo') : pc.yellow('Seguro (Safe)');
    const planBadge = this.state.planOnly ? pc.magenta(' [Plan Only]') : '';

    // Encabezado de la sesión
    lines.push(pc.bold(pc.cyan('PANEL DE SESIÓN')) + ' ' + pc.dim(`(${idBadge})`));
    lines.push(hr);

    // Metadata de la sesión
    lines.push(`${pc.dim('Título    :')} ${pc.white(this.state.title.slice(0, w - 13))}`);
    lines.push(`${pc.dim('Workspace :')} ${pc.cyan(dirBase)}${pc.dim(branchTag)}`);
    lines.push(`${pc.dim('Líder     :')} ${pc.green(this.state.leaderName)} ${pc.dim(`(${this.state.leaderStatus})`)}`);

    if (this.state.workers.length > 0) {
      const wNames = this.state.workers.map((wrk) => wrk.name).join(', ');
      lines.push(`${pc.dim('Workers   :')} ${pc.magenta(wNames.slice(0, w - 13))}`);
    } else {
      lines.push(`${pc.dim('Workers   :')} ${pc.dim('ninguno activo')}`);
    }

    lines.push(`${pc.dim('Modo      :')} ${modeBadge}${planBadge}`);
    lines.push(hr);

    // Lista de tareas (Todos)
    const todos = this.state.todos;
    if (todos && todos.length > 0) {
      const completed = todos.filter((t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done').length;
      lines.push(pc.bold(pc.white('PLAN DE TAREAS')) + ' ' + pc.dim(`(${completed}/${todos.length})`));

      todos.forEach((item, idx) => {
        const num = `${idx + 1}.`;
        let icon = pc.dim('[ ]');
        let text = item.task;
        const st = (item.status || 'pending').toLowerCase();

        if (st === 'completed' || st === 'done') {
          icon = pc.green('[✓]');
          text = pc.dim(item.task);
        } else if (st === 'in_progress' || st === 'active' || st === 'running') {
          icon = pc.yellow('[▶]');
          text = pc.yellow(pc.bold(item.task));
        } else if (st === 'failed' || st === 'error') {
          icon = pc.red('[✖]');
          text = pc.red(item.task);
        }

        const agentBadge = item.assignedTo ? pc.magenta(` [${item.assignedTo.toUpperCase()}]`) : '';
        const maxTaskLen = Math.max(10, w - 12 - (item.assignedTo ? item.assignedTo.length + 3 : 0));
        const truncatedTask = text.length > maxTaskLen ? text.slice(0, maxTaskLen - 1) + '…' : text;

        lines.push(` ${icon} ${pc.dim(num)} ${truncatedTask}${agentBadge}`);
      });
      lines.push(hr);
    }

    // Métricas de la sesión
    const elapsedMinutes = Math.floor((Date.now() - this.sessionStartTime) / 60000);
    const timeStr = elapsedMinutes > 0 ? `${elapsedMinutes}m` : `${Math.floor((Date.now() - this.sessionStartTime) / 1000)}s`;

    lines.push(pc.bold(pc.white('MÉTRICAS')));
    lines.push(
      `${pc.dim('Turnos:')} ${pc.white(String(this.state.metrics.turns))}  ` +
      `${pc.dim('Lecturas:')} ${pc.cyan(String(this.state.metrics.filesRead))}  ` +
      `${pc.dim('Escrituras:')} ${pc.green(String(this.state.metrics.filesWritten))}  ` +
      `${pc.dim('Tiempo:')} ${pc.white(timeStr)}`
    );
    lines.push(hr);

    // Atajos de comandos
    lines.push(pc.dim('Comandos: / (menú) • /workers • /auto • /exit'));

    return lines;
  }

  /**
   * Renderiza el marco dividido completo en pantalla
   */
  public static renderSplitFrame(leftContentLines: string[]): void {
    const totalCols = process.stdout.columns || 120;
    const totalRows = process.stdout.rows || 30;

    // Calcular anchos: 60% para chat e interacción a la izquierda, 40% para el dashboard a la derecha
    const leftWidth = Math.max(40, Math.floor(totalCols * 0.60));
    const rightWidth = Math.max(30, totalCols - leftWidth - 1);
    const sep = pc.gray('│');

    const rightLines = this.buildRightPaneLines(rightWidth);

    // Determinar la cantidad de filas a renderizar
    const maxRows = Math.max(leftContentLines.length, rightLines.length);

    for (let r = 0; r < maxRows; r++) {
      const leftRaw = leftContentLines[r] || '';
      const rightRaw = rightLines[r] || '';

      const leftPadded = padRightVisual(leftRaw, leftWidth);
      const rightPadded = padRightVisual(rightRaw, rightWidth);

      console.log(`${leftPadded}${sep} ${rightPadded}`);
    }
  }
}
