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
   * Genera las líneas de la columna derecha con ancho proporcional y sin espacios vacíos gigantes
   */
  public static buildRightPaneLines(): string[] {
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

    const wNames = this.state.workers.length > 0
      ? this.state.workers.map((wrk) => wrk.name).join(', ')
      : 'none';

    lines.push(`${g('Session   :')} ${w(this.state.title)} ${g(`(${idBadge})`)}`);
    lines.push(`${g('Workspace :')} ${w(dirBase)} ${g(`(${this.state.workdir}${branchTag})`)}`);
    lines.push(`${g('Leader    :')} ${cy(this.state.leaderName)} ${g(`(${this.state.leaderStatus})`)}`);
    lines.push(`${g('Workers   :')} ${pc.yellow(wNames)}`);
    lines.push(`${g('Mode      :')} ${modeBadge} ${g('(/auto to toggle)')}`);
    lines.push(`${g('Version   :')} ${w(`Barhel ${version}`)}`);

    return lines;
  }

  /**
   * Renderiza el marco dividido de dos columnas de forma perfectamente balanceada y sin espacios sobrantes
   */
  public static renderSplitFrame(leftContentLines: string[]): void {
    const totalCols = process.stdout.columns || 120;
    const leftWidth = 38; // Ancho exacto del logo ASCII de Barhel
    const sep = pc.gray('│');

    const rightLines = this.buildRightPaneLines();
    const maxRows = Math.max(leftContentLines.length, rightLines.length);

    for (let r = 0; r < maxRows; r++) {
      const leftRaw = leftContentLines[r] || '';
      const rightRaw = rightLines[r] || '';

      const leftPadded = padRightVisual(leftRaw, leftWidth);
      console.log(`  ${leftPadded}  ${sep}  ${rightRaw}`);
    }

    const dividerWidth = Math.min(totalCols - 4, 94);
    console.log(`  ${pc.gray('─'.repeat(dividerWidth))}`);
    console.log(`  ${pc.dim('Type')} ${pc.cyan('/')} ${pc.dim('for command palette')} ${pc.dim('•')} ${pc.cyan('/workers')} ${pc.dim('for analysis')} ${pc.dim('•')} ${pc.cyan('Tab')} ${pc.dim('to complete')} ${pc.dim('•')} ${pc.cyan('/help')}`);
    console.log(`  ${pc.gray('─'.repeat(dividerWidth))}`);
  }
}
