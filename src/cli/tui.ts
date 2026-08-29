import pc from 'picocolors';
import path from 'node:path';
import { select } from '@inquirer/prompts';
import { createTwoFilesPatch } from 'diff';
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
   * Actualiza el progreso de streaming en vivo con el número de caracteres recibidos
   */
  public static updateThinkingChunk(charCount: number, modelName = 'Líder'): void {
    if (isSpinnerActive() && this.thinkingStartTime > 0) {
      const elapsedSec = ((Date.now() - this.thinkingStartTime) / 1000).toFixed(1);
      updateSpinnerText(`${pc.yellow('✻')} ${pc.dim(`${modelName} generando`)} ${pc.yellow(`(${elapsedSec}s • ${charCount} chars)`)}`);
    }
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
   * Renderiza el bloque de pensamiento (+ Thought: 159ms y explicación de lo que está haciendo)
   */
  public static renderThought(thought: string, durationMs?: number): void {
    this.stopThinking();

    const timeStr = durationMs !== undefined ? `${durationMs}ms` : '0ms';
    console.log(`${pc.yellow('+ Thought:')} ${pc.dim(timeStr)}`);

    if (thought && thought.trim()) {
      const lines = thought.trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const displayLines = this.showFullThinking ? lines : lines.slice(0, 3);
      for (const line of displayLines) {
        console.log(`  ${pc.dim(line)}`);
      }
      if (!this.showFullThinking && lines.length > 3) {
        console.log(`  ${pc.gray(`... (${lines.length - 3} líneas más de análisis)`)}`);
      }
      console.log();
    }
  }

  /**
   * Muestra de forma compacta y coloreada exactamente qué código se va a modificar y por cuál
   */
  public static renderDiff(relPath: string, oldContent: string | null, newContent: string): void {
    if (oldContent === null) {
      const lineCount = newContent.split('\n').length;
      console.log(`  ${pc.green('→')} ${pc.white('Crear nuevo archivo:')} ${pc.cyan(relPath)} ${pc.dim(`(${lineCount} líneas)`)}`);
      return;
    }

    const patch = createTwoFilesPatch('a/' + relPath, 'b/' + relPath, oldContent, newContent, 'antes', 'después');
    const lines = patch.split('\n');
    const changes = lines.filter((l) => /^[\+\-]/.test(l) && !l.startsWith('+++') && !l.startsWith('---'));

    if (changes.length === 0) {
      console.log(`  ${pc.dim('→')} ${pc.white('Sin cambios en')} ${pc.cyan(relPath)}`);
      return;
    }

    const added = changes.filter((l) => l.startsWith('+')).length;
    const removed = changes.filter((l) => l.startsWith('-')).length;

    console.log(`  ${pc.green('→')} ${pc.white('Modificando')} ${pc.cyan(relPath)} ${pc.dim(`(+${added} / -${removed} líneas)`)}`);
    console.log(pc.gray('  ┌─ Diff de cambios ──────────────────────────────────────────────────'));
    const preview = changes.slice(0, 30);
    for (const line of preview) {
      if (line.startsWith('+')) {
        console.log(`  ${pc.gray('│')} ${pc.green(line)}`);
      } else if (line.startsWith('-')) {
        console.log(`  ${pc.gray('│')} ${pc.red(line)}`);
      }
    }
    if (changes.length > 30) {
      console.log(`  ${pc.gray('│')} ${pc.dim(`... (${changes.length - 30} líneas más modificadas)`)}`);
    }
    console.log(pc.gray('  └────────────────────────────────────────────────────────────────────\n'));
  }

  /**
   * Renderiza el panel de lista de tareas (Todo Checklist) con estados y agentes asignados
   */
  public static renderTodoList(todos: Array<{ task: string; status: string; assignedTo?: string }>): void {
    if (!todos || todos.length === 0) return;

    const completedCount = todos.filter((t) => (t.status || '').toLowerCase() === 'completed' || (t.status || '').toLowerCase() === 'done').length;
    const progressStr = `(${completedCount}/${todos.length} completadas)`;

    console.log(`  ${pc.bold('Plan de tareas')} ${pc.dim(progressStr)}`);
    console.log(pc.gray('  ┌────────────────────────────────────────────────────────────────────'));
    todos.forEach((item, idx) => {
      const num = `${idx + 1}.`;
      let statusIcon = pc.dim('[ ]');
      let taskText = pc.white(item.task);

      const status = (item.status || 'pending').toLowerCase();
      if (status === 'completed' || status === 'done') {
        statusIcon = pc.green('[✓]');
        taskText = pc.dim(pc.strikethrough ? pc.strikethrough(item.task) : item.task);
      } else if (status === 'in_progress' || status === 'active' || status === 'running') {
        statusIcon = pc.yellow('[▶]');
        taskText = pc.yellow(pc.bold(item.task));
      } else if (status === 'failed' || status === 'error') {
        statusIcon = pc.red('[✖]');
        taskText = pc.red(item.task);
      }

      const assigned = item.assignedTo ? pc.magenta(` [${item.assignedTo.toUpperCase()}]`) : '';
      console.log(`  ${pc.gray('│')}  ${statusIcon} ${pc.dim(num)} ${taskText}${assigned}`);
    });
    console.log(pc.gray('  └────────────────────────────────────────────────────────────────────\n'));
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
   * Renderiza el resultado de herramientas de forma sobria (resumiendo lecturas sin volcar el código entero)
   */
  public static renderToolResult(toolType: string, success: boolean, output: string): void {
    this.stopThinking();

    const cleanOutput = output.trim();
    if (!cleanOutput) return;

    switch (toolType) {
      case 'read_file': {
        const lines = cleanOutput.split('\n').length;
        const bytes = Buffer.byteLength(cleanOutput, 'utf-8');
        console.log(`  ${pc.dim('└')} ${pc.cyan(`Leído con éxito`)} ${pc.dim(`(${lines} líneas, ${bytes} bytes)`)}\n`);
        break;
      }

      case 'list_directory':
      case 'glob': {
        const count = cleanOutput.split('\n').filter(Boolean).length;
        console.log(`  ${pc.dim('└')} ${pc.cyan(`${count} archivos encontrados`)}\n`);
        break;
      }

      case 'grep': {
        const count = cleanOutput.split('\n').filter(Boolean).length;
        console.log(`  ${pc.dim('└')} ${pc.cyan(`${count} coincidencias encontradas`)}\n`);
        break;
      }

      case 'write_file': {
        console.log(`  ${success ? pc.green('✓') : pc.red('✖')} ${pc.white(cleanOutput.split('\n')[0])}\n`);
        break;
      }

      case 'check': {
        console.log(`  ${success ? pc.green('✓') : pc.red('✖')} ${pc.white(cleanOutput.slice(0, 300))}\n`);
        break;
      }

      case 'run_command': {
        const lines = cleanOutput.split('\n');
        const previewLines = lines.slice(0, 20);
        console.log(pc.gray('  ┌─ Salida de comando ────────────────────────────────────────────────'));
        for (const line of previewLines) {
          console.log(`  ${pc.gray('│')} ${line}`);
        }
        if (lines.length > 20) {
          console.log(`  ${pc.gray('│')} ${pc.dim(`... (${lines.length - 20} líneas más)`)}`);
        }
        console.log(pc.gray('  └────────────────────────────────────────────────────────────────────\n'));
        break;
      }

      default: {
        if (!success) {
          console.log(`  ${pc.red('✖')} ${pc.dim(cleanOutput)}\n`);
        }
        break;
      }
    }
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