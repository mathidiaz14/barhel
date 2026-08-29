import pc from 'picocolors';
import path from 'node:path';
import { select } from '@inquirer/prompts';
import { WorkerStore } from '../utils/workerStore.js';
import { startSpinner, stopSpinner, updateSpinnerText, isSpinnerActive } from '../utils/spinner.js';
import { getBarhelVersion } from '../utils/version.js';

export class TUI {
  private static thinkingStartTime = 0;
  private static timerInterval: NodeJS.Timeout | null = null;
  private static showFullThinking = false;

  public static toggleThinkingDisplay(): boolean {
    this.showFullThinking = !this.showFullThinking;
    return this.showFullThinking;
  }

  public static isShowingFullThinking(): boolean {
    return this.showFullThinking;
  }

  /**
   * Inicia el spinner de razonamiento en tiempo real
   */
  public static startThinking(modelName = 'Líder', customText?: string): void {
    this.stopThinking();

    this.thinkingStartTime = Date.now();
    const baseText = customText || `${modelName} pensando`;

    startSpinner(`${pc.yellow('✻')} ${pc.dim(baseText)} ${pc.yellow('(0.0s)')}`, 'yellow');

    this.timerInterval = setInterval(() => {
      if (isSpinnerActive()) {
        const elapsedSec = ((Date.now() - this.thinkingStartTime) / 1000).toFixed(1);
        updateSpinnerText(`${pc.yellow('✻')} ${pc.dim(baseText)} ${pc.yellow(`(${elapsedSec}s)`)}`);
      }
    }, 100);
  }

  /**
   * Detiene el spinner de pensamiento y retorna el tiempo transcurrido en ms
   */
  public static stopThinking(): number {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const elapsedMs = this.thinkingStartTime > 0 ? Date.now() - this.thinkingStartTime : 0;
    this.thinkingStartTime = 0;

    stopSpinner();

    return elapsedMs;
  }

  /**
   * Renderiza el bloque de pensamiento (+ Thought: 159ms)
   */
  public static renderThought(thought: string, durationMs?: number): void {
    this.stopThinking();

    const timeStr = durationMs !== undefined ? `${durationMs}ms` : '0ms';
    console.log(`${pc.yellow('+ Thought:')} ${pc.dim(timeStr)}`);

    if (this.showFullThinking) {
      const lines = thought.trim().split('\n');
      console.log(pc.gray('  [Extended reasoning]'));
      for (const line of lines) {
        console.log(`  ${pc.dim(line)}`);
      }
      console.log();
    }
  }

  /**
   * Renderiza la invocación de herramientas
   */
  public static renderAction(type: string, details: Record<string, unknown>): void {
    this.stopThinking();

    switch (type) {
      case 'read_file':
        console.log(`${pc.dim('→')} ${pc.white('Read')} ${pc.cyan(String(details.path || ''))}`);
        break;

      case 'write_file':
        const len = typeof details.content === 'string' ? details.content.length : 0;
        console.log(`${pc.green('→')} ${pc.white('Write')} ${pc.cyan(String(details.path || ''))} ${pc.dim(`(${len} bytes)`)}`);
        break;

      case 'list_directory':
        console.log(`${pc.yellow('*')} ${pc.white('Glob')} ${pc.cyan(`"${details.path || '.'}/**/*"`)}`);
        break;

      case 'run_command':
        console.log(`\n${pc.bold(pc.white('$'))} ${pc.white(String(details.command || ''))}`);
        break;

      case 'delegate_task':
        const agent = String(details.agent || 'worker').toUpperCase();
        const promptPreview = String(details.prompt || '').substring(0, 60);
        console.log(`${pc.magenta('→')} ${pc.magenta(`Delegate [${agent}]`)} ${pc.dim(`"${promptPreview}..."`)}`);
        break;

      case 'delegate_batch':
        const taskCount = Array.isArray(details.tasks) ? details.tasks.length : 0;
        const agents = Array.isArray(details.tasks)
          ? details.tasks.map((t) => (typeof t === 'object' && t ? String((t as { agent?: string }).agent || '?') : '?').toUpperCase()).join(', ')
          : '';
        console.log(`${pc.magenta('→')} ${pc.magenta(`Batch [${agents || taskCount + ' tasks'}]`)} ${pc.dim(`(${taskCount} workers)`)}`);
        break;

      case 'grep':
        console.log(`${pc.blue('→')} ${pc.white('Search')} ${pc.cyan(String(details.pattern || ''))} ${pc.dim(`in ${details.path || '.'}`)}`);
        break;

      case 'glob':
        console.log(`${pc.blue('→')} ${pc.white('Glob')} ${pc.cyan(`"${details.pattern || ''}"`)} ${pc.dim(`in ${details.path || '.'}`)}`);
        break;

      case 'check':
        console.log(`${pc.cyan('→')} ${pc.white('Check')} ${pc.dim('(typecheck/lint/build)')}`);
        break;

      case 'finish':
        console.log(`\n${pc.green('✓')} ${pc.green(pc.bold('Completed:'))} ${pc.white(String(details.summary || ''))}\n`);
        break;

      default:
        console.log(`${pc.dim('→')} ${pc.white(type)} ${pc.dim(JSON.stringify(details))}`);
        break;
    }
  }

  /**
   * Renderiza el resultado de herramientas con caja sobria y profesional
   */
  public static renderToolResult(toolType: string, success: boolean, output: string): void {
    this.stopThinking();

    const cleanOutput = output.trim();
    if (!cleanOutput) return;

    const lines = cleanOutput.split('\n');
    const previewLines = lines.slice(0, 20);

    console.log(pc.gray('┌' + '─'.repeat(70)));
    for (const line of previewLines) {
      console.log(`${pc.gray('│')} ${line}`);
    }
    if (lines.length > 20) {
      console.log(`${pc.gray('│')} ${pc.dim(`... (${lines.length - 20} more lines)`)}`);
    }
    console.log(pc.gray('└' + '─'.repeat(70)) + '\n');
  }

  /**
   * Renderiza la tarjeta de asistencia de un agente secundario
   */
  public static renderWorkerDelegation(
    workerName: string,
    subtaskPrompt: string,
    response: string,
    durationMs?: number
  ): void {
    this.stopThinking();

    const brand = this.getWorkerBrand(workerName);
    const durationText = durationMs ? `${durationMs}ms` : '';
    const record = WorkerStore.addRecord({
      workerName,
      subtaskPrompt,
      fullResponse: response,
      durationMs,
    });

    console.log(`${brand.color('→ Agent:')} ${brand.color(brand.label)} ${pc.dim(`[#${record.id}]`)} ${pc.green(durationText)}`);
    console.log(`${pc.dim('  Task:')} ${pc.italic(subtaskPrompt)}`);

    const preview = response.trim().split('\n').slice(0, 6);
    console.log(brand.border('  ┌' + '─'.repeat(60)));
    for (const line of preview) {
      console.log(`  ${brand.border('│')} ${pc.dim(line)}`);
    }
    if (response.trim().split('\n').length > 6) {
      console.log(`  ${brand.border('│')} ${pc.cyan(pc.italic(`... (Full analysis in /workers #${record.id})`))}`);
    }
    console.log(brand.border('  └' + '─'.repeat(60)) + '\n');
  }

  /**
   * Modal interactivo para inspeccionar el análisis completo de los agentes
   */
  public static async promptWorkerInspection(): Promise<void> {
    const records = WorkerStore.getRecords();

    if (records.length === 0) {
      console.log(pc.yellow('\nNo agent analysis recorded in this session.\n'));
      return;
    }

    console.log(pc.cyan('\nAgent Analysis Inspector:'));

    const choices = records.map((r) => {
      const brand = this.getWorkerBrand(r.workerName);
      const promptPreview = r.subtaskPrompt.length > 50 ? r.subtaskPrompt.substring(0, 47) + '...' : r.subtaskPrompt;
      const timeStr = r.timestamp.substring(11, 19);

      return {
        name: `${brand.color(`[#${r.id}] ${brand.label}`)} - ${pc.dim(promptPreview)} ${pc.gray(`(${timeStr})`)}`,
        value: r.id,
        description: `Task: "${r.subtaskPrompt}" | Size: ${r.fullResponse.length} chars`,
      };
    });

    choices.push({
      name: pc.gray('← Back to chat'),
      value: '__back__',
      description: 'Close inspector and return to command line',
    });

    const selectedId = await select({
      message: 'Select analysis to view:',
      choices,
    });

    if (selectedId === '__back__') return;

    const record = WorkerStore.getRecord(selectedId);
    if (record) {
      const brand = this.getWorkerBrand(record.workerName);
      console.log('\n' + brand.border('─'.repeat(70)));
      console.log(`${brand.color(pc.bold(`ANALYSIS: ${brand.label.toUpperCase()} (#${record.id})`))}`);
      console.log(`${pc.dim('Task:')} ${pc.cyan(record.subtaskPrompt)}`);
      console.log(brand.border('─'.repeat(70)));
      console.log(record.fullResponse.trim());
      console.log(brand.border('─'.repeat(70)) + '\n');
    }
  }

  /**
   * Pantalla principal de Barhel dividida en dos columnas:
   * Columna Izquierda: Logo ASCII sobrio y descripción
   * Columna Derecha: Panel de Información de Sesión y Contexto
   */
  public static renderBanner(
    workdir: string = process.cwd(),
    autonomous = false,
    leaderName = 'DeepSeek',
    workersStr = 'ChatGPT, Gemini',
    sessionTitle?: string,
    sessionId?: string
  ): void {
    const dirName = path.basename(workdir) || workdir;
    const modeBadge = autonomous ? pc.green('autonomous') : pc.yellow('safe');
    const sessionName = sessionTitle || 'Sesión de trabajo';
    const idBadge = sessionId ? `#${sessionId.slice(0, 8)}` : '#nueva';
    const version = getBarhelVersion();

    const cy = pc.cyan;
    const g = pc.dim;
    const w = pc.white;
    const sep = pc.gray('│');

    const leftCol = [
      cy('    ____             __          __'),
      cy('   / __ )____ ______/ /_  ___   / /'),
      cy('  / __  / __ `/ ___/ __ \\/ _ \\ / / '),
      cy(' / /_/ / /_/ / /  / / / /  __// /  '),
      cy('/_____/\\__,_/_/  /_/ /_/\\___//_/   '),
      g('Autonomous Multi-Model Coding Agent'),
    ];

    const rightCol = [
      `${g('Session   :')} ${w(sessionName)} ${g(`(${idBadge})`)}`,
      `${g('Workspace :')} ${w(dirName)} ${g(`(${workdir}:main)`)}`,
      `${g('Leader    :')} ${cy(leaderName)}`,
      `${g('Workers   :')} ${pc.yellow(workersStr || 'none')}`,
      `${g('Mode      :')} ${modeBadge} ${g('(/auto to toggle)')}`,
      `${g('Version   :')} ${w(`Barhel ${version}`)}`,
    ];

    console.log();
    const rows = Math.max(leftCol.length, rightCol.length);
    for (let i = 0; i < rows; i++) {
      const left = (leftCol[i] || '').padEnd(38);
      const right = rightCol[i] || '';
      console.log(`  ${left}  ${sep}  ${right}`);
    }

    console.log();
    console.log(`  ${pc.gray('─'.repeat(88))}`);
    console.log(`  ${g('Type')} ${cy('/')} ${g('for command palette')} ${g('•')} ${cy('/workers')} ${g('for analysis')} ${g('•')} ${cy('Tab')} ${g('to complete')} ${g('•')} ${cy('/help')}`);
    console.log(`  ${pc.gray('─'.repeat(88))}`);
    console.log();
  }

  /**
   * Renderiza el historial previo de turnos al reanudar una sesión
   */
  public static renderSessionHistory(session: { id: string; title: string; turns: Array<{ prompt: string; thought?: string; summary?: string; timestamp?: string; actions?: Array<{ type: string; details?: Record<string, unknown> }> }> }): void {
    if (!session.turns || session.turns.length === 0) return;

    console.log(`  ${pc.bold('Historial previo de la sesión')} ${pc.cyan(`"${session.title}"`)} ${pc.dim(`(#${session.id} • ${session.turns.length} turnos)`)}`);
    console.log(`  ${pc.gray('─'.repeat(88))}`);

    session.turns.forEach((turn, idx) => {
      const time = turn.timestamp ? turn.timestamp.substring(11, 16) : '';
      console.log(`\n  ${pc.bold(pc.white(`[Turno ${idx + 1}]`))} ${pc.dim(time)}`);
      console.log(`  ${pc.blue('user ❯')} ${pc.white(turn.prompt)}`);

      if (turn.thought) {
        const thoughtPrev = turn.thought.length > 120 ? turn.thought.substring(0, 117) + '...' : turn.thought;
        console.log(`  ${pc.yellow('+ Thought:')} ${pc.dim(thoughtPrev)}`);
      }

      if (turn.actions && turn.actions.length > 0) {
        for (const act of turn.actions) {
          switch (act.type) {
            case 'read_file':
              console.log(`  ${pc.dim('→')} ${pc.white('Read')} ${pc.cyan(String(act.details?.path || ''))}`);
              break;
            case 'write_file':
              console.log(`  ${pc.green('→')} ${pc.white('Write')} ${pc.cyan(String(act.details?.path || ''))}`);
              break;
            case 'list_directory':
            case 'glob':
              console.log(`  ${pc.yellow('*')} ${pc.white('Glob')} ${pc.cyan(`"${act.details?.path || act.details?.pattern || '.'}"`)}`);
              break;
            case 'run_command':
              console.log(`  ${pc.white('$')} ${pc.dim(String(act.details?.command || ''))}`);
              break;
            case 'delegate_task':
              console.log(`  ${pc.magenta('→')} ${pc.magenta(`Delegate [${String(act.details?.agent || '').toUpperCase()}]`)}`);
              break;
            case 'finish':
              break;
            default:
              console.log(`  ${pc.dim('→')} ${pc.white(act.type)}`);
              break;
          }
        }
      }

      if (turn.summary) {
        console.log(`  ${pc.green('✓')} ${pc.white(turn.summary)}`);
      }
    });

    console.log();
    console.log(`  ${pc.gray('─'.repeat(88))}`);
    console.log(`  ${pc.dim('Puedes continuar conversando y enviando instrucciones abajo:')}`);
    console.log(`  ${pc.gray('─'.repeat(88))}`);
    console.log();
  }

  public static getPromptPrefix(leaderName = 'barhel'): string {
    return `${pc.cyan(leaderName)} ${pc.gray('❯')} `;
  }

  private static getWorkerBrand(workerName: string): { label: string; color: (s: string) => string; border: (s: string) => string } {
    const key = workerName.toLowerCase();
    if (key.includes('claude')) {
      return { label: 'Claude', color: pc.magenta, border: pc.gray };
    }
    if (key.includes('chatgpt') || key.includes('openai')) {
      return { label: 'ChatGPT', color: pc.green, border: pc.gray };
    }
    if (key.includes('gemini') || key.includes('google')) {
      return { label: 'Gemini', color: pc.blue, border: pc.gray };
    }
    if (key.includes('qwen')) {
      return { label: 'Qwen', color: pc.cyan, border: pc.gray };
    }
    if (key.includes('mistral')) {
      return { label: 'Mistral', color: pc.yellow, border: pc.gray };
    }
    if (key.includes('perplexity')) {
      return { label: 'Perplexity', color: pc.blue, border: pc.gray };
    }
    return { label: workerName.toUpperCase(), color: pc.cyan, border: pc.gray };
  }
}