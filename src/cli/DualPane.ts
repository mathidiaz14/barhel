import pc from 'picocolors';
import path from 'node:path';
import { TodoItem } from '../types/actions.js';
import { getGitBranch } from '../utils/git.js';
import { getBarhelVersion } from '../utils/version.js';
import { ProgressSupervisor } from '../engine/ProgressSupervisor.js';
import { DriverFactory } from '../drivers/DriverFactory.js';
import { ChatSession, TurnRecord } from '../utils/history.js';

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
        id: id.toLowerCase(),
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
   * 1. Renderiza el Header superior con el Logo ASCII y atajos
   */
  public static renderLogoHeader(dividerWidth = 84): void {
    const cy = pc.cyan;
    console.log();
    console.log(cy('      ____             __          __     '));
    console.log(cy('     / __ )____ ______/ /_  ___   / /     '));
    console.log(cy('    / __  / __ `/ ___/ __ \\/ _ \\ / /      '));
    console.log(cy('   / /_/ / /_/ / /  / / / /  __// /       '));
    console.log(cy('  /_____/\\__,_/_/  /_/ /_/\\___//_/        '));
    console.log(pc.bold(pc.white('  Autonomous Multi-Model Coding Agent     ')));
    console.log(`  ${pc.gray('─'.repeat(dividerWidth))}`);
    console.log(
      `  ${pc.dim('Type')} ${pc.cyan('/')} ${pc.dim('for command palette')} ${pc.dim('•')} ${pc.cyan('/workers')} ${pc.dim('for analysis')} ${pc.dim('•')} ${pc.cyan('Tab')} ${pc.dim('to complete')} ${pc.dim('•')} ${pc.cyan('/help')}`
    );
    console.log(`  ${pc.gray('─'.repeat(dividerWidth))}`);
    console.log();
  }

  /**
   * 2. Renderiza la Caja de Datos de la Sesión y Workspace
   */
  public static renderSessionDataBox(boxWidth = 84): void {
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

    const workerNames = this.state.workers.length > 0
      ? this.state.workers.map((wrk) => wrk.name || wrk.id).join(', ')
      : 'ninguno';

    console.log(`  ${gr('┌─')} ${pc.bold('SESIÓN & WORKSPACE')} ${gr('─'.repeat(Math.max(4, boxWidth - 23)))}`);
    console.log(`  ${gr('│')}  ${g('Session   :')} ${w(this.state.title)} ${g(`(${idBadge})`)}`);
    console.log(`  ${gr('│')}  ${g('Workspace :')} ${w(dirBase)} ${g(`(${this.state.workdir}${branchTag})`)}`);
    console.log(`  ${gr('│')}  ${g('Leader    :')} ${cy(this.state.leaderName)} ${g(`(${this.state.leaderStatus})`)}`);
    console.log(`  ${gr('│')}  ${g('Workers   :')} ${pc.yellow(workerNames)}`);
    console.log(`  ${gr('│')}  ${g('Mode      :')} ${modeBadge} ${g('(/auto to toggle)')}`);
    console.log(`  ${gr('│')}  ${g('Version   :')} ${w(`Barhel ${version}`)}`);
    console.log(`  ${gr('└─')}${gr('─'.repeat(boxWidth - 4))}`);
    console.log();
  }

  /**
   * 3. Renderiza el Estado de los Subagentes (Workers)
   */
  public static renderSubagentsBox(boxWidth = 84): void {
    const supervisorSnapshot = ProgressSupervisor.getSnapshot();
    const gr = pc.gray;
    const w = pc.white;
    const g = pc.dim;

    console.log(`  ${gr('┌─')} ${pc.bold('ESTADO DE SUBAGENTES (WORKERS)')} ${gr('─'.repeat(Math.max(4, boxWidth - 34)))}`);

    if (this.state.workers.length === 0) {
      console.log(`  ${gr('│')}  ${g('Sin workers secundarios configurados')}`);
    } else {
      for (const wrk of this.state.workers) {
        const agInfo = supervisorSnapshot.agents[wrk.id.toLowerCase()];
        let icon = pc.dim('[●]');
        let statusText = pc.dim('💤 En espera (Listo)');

        if (agInfo) {
          if (agInfo.status === 'thinking' || agInfo.status === 'executing') {
            icon = pc.yellow('[⚡]');
            statusText = pc.cyan(`🔄 Trabajando (${agInfo.percentage}%)`);
          } else if (agInfo.status === 'completed') {
            icon = pc.green('[✓]');
            statusText = pc.green('✓ Tarea completada');
          } else if (agInfo.status === 'failed') {
            icon = pc.red('[✖]');
            statusText = pc.red('✖ No disponible');
          }
        }

        const nameLabel = w(wrk.name.padEnd(20));
        console.log(`  ${gr('│')}  ${icon} ${nameLabel} : ${statusText}`);
      }
    }

    console.log(`  ${gr('└─')}${gr('─'.repeat(boxWidth - 4))}`);
    console.log();
  }

  /**
   * 4. Renderiza la Lista de Tareas (TODO) si existe
   */
  public static renderTodosBox(boxWidth = 84): void {
    const todos = this.state.todos;
    if (!todos || todos.length === 0) return;

    const gr = pc.gray;
    const w = pc.white;
    const g = pc.dim;

    const completedCount = todos.filter(
      (t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done'
    ).length;
    const pct = Math.round((completedCount / todos.length) * 100);
    const barLen = 14;
    const filled = Math.round((pct / 100) * barLen);
    const empty = barLen - filled;
    const progressBar = `[${pc.green('█'.repeat(filled))}${pc.dim('░'.repeat(empty))}] ${pct}% (${completedCount}/${todos.length} completadas)`;

    console.log(`  ${gr('┌─')} ${pc.bold('PLAN DE TAREAS (TODOS)')} ${gr('─'.repeat(Math.max(4, boxWidth - 27)))}`);
    console.log(`  ${gr('│')}  ${pc.bold('Progreso:')} ${progressBar}`);
    console.log(`  ${gr('│')}`);

    todos.forEach((item, idx) => {
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
      console.log(`  ${gr('│')}  ${statusIcon} ${idx + 1}. ${w(item.task)}${agentTag}`);
    });

    console.log(`  ${gr('└─')}${gr('─'.repeat(boxWidth - 4))}`);
    console.log();
  }

  /**
   * 5. Renderiza el Historial de la Sesión Anterior con Fecha y Hora exacta
   */
  public static renderSessionHistory(session: ChatSession, boxWidth = 84): void {
    if (!session.turns || session.turns.length === 0) return;

    const workdir = session.workdir || process.cwd();
    const cleanPath = (rawPath: string): string => {
      if (!rawPath) return '';
      try {
        const normRaw = rawPath.replace(/\\/g, '/');
        const normWd = workdir.replace(/\\/g, '/');
        if (normRaw.toLowerCase().startsWith(normWd.toLowerCase())) {
          return normRaw.slice(normWd.length).replace(/^\/+/, '') || '.';
        }
        return path.relative(workdir, rawPath).replace(/\\/g, '/') || rawPath;
      } catch {
        return rawPath;
      }
    };

    const cleanCommand = (cmd: string): string => {
      if (!cmd) return '';
      return cmd.replace(/^cd\s+["']?[^&"']+["']?\s*&&\s*/i, '').trim();
    };

    const formatDateTime = (isoString?: string): string => {
      if (!isoString) return '';
      try {
        const d = new Date(isoString);
        const pad = (n: number) => String(n).padStart(2, '0');
        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1);
        const year = d.getFullYear();
        const hours = pad(d.getHours());
        const mins = pad(d.getMinutes());
        const secs = pad(d.getSeconds());
        return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
      } catch {
        return isoString;
      }
    };

    const gr = pc.gray;
    const turnCount = session.turns.length;

    console.log(`  ${pc.bold(pc.cyan('📜 Historial de la Sesión'))} ${pc.white(`"${session.title}"`)} ${pc.dim(`(#${session.id.slice(0, 8)} • ${turnCount} turno${turnCount > 1 ? 's' : ''})`)}`);
    console.log(`  ${gr('─'.repeat(boxWidth))}`);

    session.turns.forEach((turn: TurnRecord, idx: number) => {
      const dtStr = formatDateTime(turn.timestamp);
      const turnHeader = `Turno ${idx + 1}${dtStr ? ` (${dtStr})` : ''}`;
      
      console.log(`\n  ${pc.bold(pc.blue('┌─'))} ${pc.bold(pc.white(turnHeader))} ${gr('─'.repeat(Math.max(4, boxWidth - turnHeader.length - 6)))}`);
      
      // Prompt del usuario
      console.log(`  ${pc.blue('│')}  ${pc.bold(pc.cyan('👤 user ❯'))} ${pc.white(pc.bold(turn.prompt))}`);

      // Razonamiento
      if (turn.thought && turn.thought.trim()) {
        console.log(`  ${pc.blue('│')}`);
        console.log(`  ${pc.blue('│')}  ${pc.yellow('💭 Razonamiento:')}`);
        const thoughtLines = turn.thought.trim().split('\n').filter(Boolean);
        const preview = thoughtLines.slice(0, 4);
        for (const line of preview) {
          console.log(`  ${pc.blue('│')}     ${pc.dim(line)}`);
        }
        if (thoughtLines.length > 4) {
          console.log(`  ${pc.blue('│')}     ${pc.gray(`... (+${thoughtLines.length - 4} líneas más)`)}`);
        }
      }

      // Acciones ejecutadas
      if (turn.actions && turn.actions.length > 0) {
        console.log(`  ${pc.blue('│')}`);
        console.log(`  ${pc.blue('│')}  ${pc.magenta('⚡ Acciones ejecutadas:')}`);
        for (const act of turn.actions) {
          switch (act.type) {
            case 'read_file':
              console.log(`  ${pc.blue('│')}     ${pc.dim('•')} ${pc.dim('Read')} ${pc.cyan(cleanPath(String(act.details?.path || '')))}`);
              break;
            case 'write_file':
              console.log(`  ${pc.blue('│')}     ${pc.green('•')} ${pc.green('Write')} ${pc.white(cleanPath(String(act.details?.path || '')))}`);
              break;
            case 'list_directory':
            case 'glob':
              console.log(`  ${pc.blue('│')}     ${pc.yellow('•')} ${pc.yellow('Glob')} ${pc.dim(`"${act.details?.path || act.details?.pattern || '.'}"`)}`);
              break;
            case 'run_command':
              console.log(`  ${pc.blue('│')}     ${pc.white('•')} ${pc.bold(pc.white('$'))} ${pc.white(cleanCommand(String(act.details?.command || '')))}`);
              break;
            case 'eval_code':
              console.log(`  ${pc.blue('│')}     ${pc.cyan('•')} ${pc.cyan('Test Sandbox')} ${pc.dim('(eval_code)')}`);
              break;
            case 'auto_test':
              console.log(`  ${pc.blue('│')}     ${pc.green('•')} ${pc.green('Test Runner')} ${pc.dim('(auto_test)')}`);
              break;
            case 'codegraph':
              console.log(`  ${pc.blue('│')}     ${pc.cyan('•')} ${pc.cyan('CodeGraph')} ${pc.dim(String(act.details?.symbol || act.details?.query || 'AST'))}`);
              break;
            case 'delegate_task':
              console.log(`  ${pc.blue('│')}     ${pc.magenta('•')} ${pc.magenta(`Delegó a ${String(act.details?.agent || '').toUpperCase()}`)}`);
              break;
            case 'finish':
              break;
            default:
              console.log(`  ${pc.blue('│')}     ${pc.dim('•')} ${pc.white(act.type)}`);
              break;
          }
        }
      }

      // Resumen final
      if (turn.summary && turn.summary.trim()) {
        console.log(`  ${pc.blue('│')}`);
        console.log(`  ${pc.blue('│')}  ${pc.green('✓ Resumen:')}`);
        const summaryLines = turn.summary.trim().split('\n').filter(Boolean);
        for (const sLine of summaryLines) {
          console.log(`  ${pc.blue('│')}     ${pc.white(sLine)}`);
        }
      }

      console.log(`  ${pc.blue('└─')}${gr('─'.repeat(boxWidth - 4))}`);
    });

    console.log();
    console.log(`  ${gr('─'.repeat(boxWidth))}`);
    console.log();
  }

  /**
   * Renderiza el dashboard completo secuencial:
   * 1. Logo superior
   * 2. Datos de la sesión
   * 3. Estado de subagentes
   * 4. TODO si existe
   * 5. Historial previo si existe con fecha y hora
   */
  public static renderFullScreen(session?: ChatSession): void {
    console.clear();
    const totalCols = process.stdout.columns || 110;
    const boxWidth = Math.min(totalCols - 4, 88);

    // 1. Logo
    this.renderLogoHeader(boxWidth);

    // 2. Datos de sesión
    this.renderSessionDataBox(boxWidth);

    // 3. Estado de subagentes
    this.renderSubagentsBox(boxWidth);

    // 4. TODO si existe
    if (this.state.todos && this.state.todos.length > 0) {
      this.renderTodosBox(boxWidth);
    } else if (session?.todos && session.todos.length > 0) {
      this.state.todos = session.todos;
      this.renderTodosBox(boxWidth);
    }

    // 5. Historial con fecha y hora si existe
    if (session && session.turns && session.turns.length > 0) {
      this.renderSessionHistory(session, boxWidth);
    }
  }
}
