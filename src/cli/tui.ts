import pc from 'picocolors';
import ora, { Ora } from 'ora';
import path from 'node:path';
import { select } from '@inquirer/prompts';
import { WorkerStore, WorkerAnalysisRecord } from '../utils/workerStore.js';

export class TUI {
  private static activeSpinner: Ora | null = null;
  private static thinkingStartTime = 0;
  private static timerInterval: NodeJS.Timeout | null = null;
  private static showFullThinking = true;

  public static toggleThinkingDisplay(): boolean {
    this.showFullThinking = !this.showFullThinking;
    return this.showFullThinking;
  }

  public static isShowingFullThinking(): boolean {
    return this.showFullThinking;
  }

  /**
   * Inicia el spinner con temporizador de alta resolución en tiempo real estilo Claude Code
   */
  public static startThinking(modelName = 'Líder', customText?: string): void {
    this.stopThinking();

    this.thinkingStartTime = Date.now();
    const baseText = customText || `${modelName} está pensando`;

    this.activeSpinner = ora({
      text: `${pc.cyan(baseText)} ${pc.dim('(0.0s)')}`,
      color: 'cyan',
      spinner: 'dots',
    }).start();

    // Actualizar el contador de segundos en vivo cada 100ms
    this.timerInterval = setInterval(() => {
      if (this.activeSpinner && this.activeSpinner.isSpinning) {
        const elapsedSec = ((Date.now() - this.thinkingStartTime) / 1000).toFixed(1);
        this.activeSpinner.text = `${pc.cyan(baseText)} ${pc.dim(`(${elapsedSec}s)`)}`;
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

    if (this.activeSpinner && this.activeSpinner.isSpinning) {
      this.activeSpinner.stop();
      this.activeSpinner = null;
    }

    return elapsedMs;
  }

  /**
   * Renderiza el bloque de razonamiento estilo Claude Code con borde fino y temporizador
   */
  public static renderThought(thought: string, durationMs?: number): void {
    this.stopThinking();

    const timeStr = durationMs ? ` (tomó ${(durationMs / 1000).toFixed(1)}s)` : '';
    const cleanThought = thought.trim();

    if (!this.showFullThinking) {
      // Modo resumido
      const firstLine = cleanThought.split('\n')[0];
      const preview = firstLine.length > 90 ? firstLine.substring(0, 87) + '...' : firstLine;
      console.log(`\n${pc.dim('💭 [Razonamiento' + timeStr + ']:')} ${pc.italic(pc.gray(preview))}`);
      return;
    }

    console.log(`\n${pc.gray('┌─')} ${pc.magenta(pc.bold('💭 Razonamiento'))}${pc.dim(timeStr)} ${pc.gray('─'.repeat(45))}`);
    const lines = cleanThought.split('\n');
    for (const line of lines) {
      console.log(`${pc.gray('│')} ${pc.italic(pc.dim(line))}`);
    }
    console.log(`${pc.gray('└' + '─'.repeat(60))}\n`);
  }

  /**
   * Renderiza la invocación de una herramienta del sistema
   */
  public static renderAction(type: string, details: Record<string, unknown>): void {
    this.stopThinking();

    const icon = this.getActionIcon(type);
    console.log(`${pc.cyan(icon)} ${pc.bold(pc.yellow(type.toUpperCase()))}`);

    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null && key !== 'type') {
        const valStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        const preview = valStr.length > 180 ? valStr.substring(0, 177) + '...' : valStr;
        console.log(`  ${pc.gray('▪')} ${pc.dim(key)}: ${pc.cyan(preview)}`);
      }
    }
  }

  /**
   * Renderiza el resultado de la ejecución de una herramienta
   */
  public static renderToolResult(toolType: string, success: boolean, output: string): void {
    this.stopThinking();

    const badge = success ? pc.bgGreen(pc.black(' OK ')) : pc.bgRed(pc.black(' FAILED '));
    console.log(`${pc.gray('┌')} ${badge} ${pc.bold(toolType)}`);

    const lines = output.trim().split('\n');
    const previewLines = lines.slice(0, 12);
    for (const line of previewLines) {
      console.log(`${pc.gray('│')} ${pc.dim(line)}`);
    }
    if (lines.length > 12) {
      console.log(`${pc.gray('│')} ${pc.dim(`... (${lines.length - 12} líneas más)`)}`);
    }
    console.log(`${pc.gray('└' + '─'.repeat(50))}\n`);
  }

  /**
   * Renderiza la tarjeta de asistencia de un agente secundario (Worker) con sus colores de marca
   */
  public static renderWorkerDelegation(
    workerName: string,
    subtaskPrompt: string,
    response: string,
    durationMs?: number
  ): void {
    this.stopThinking();

    const brand = this.getWorkerBrand(workerName);
    const durationText = durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : '';
    const record = WorkerStore.addRecord({
      workerName,
      subtaskPrompt,
      fullResponse: response,
      durationMs,
    });

    console.log(`\n${brand.border('┌─')} ${brand.color(pc.bold(`🤖 ${brand.label} [Worker #${record.id}]`))}${pc.dim(durationText)} ${brand.border('─'.repeat(35))}`);
    console.log(`${brand.border('│')} ${pc.bold(pc.dim('Instrucción:'))} ${pc.italic(subtaskPrompt)}`);
    console.log(`${brand.border('├' + '─'.repeat(55))}`);

    const preview = response.trim().split('\n').slice(0, 8);
    for (const line of preview) {
      console.log(`${brand.border('│')} ${pc.dim(line)}`);
    }
    if (response.trim().split('\n').length > 8) {
      console.log(`${brand.border('│')} ${pc.cyan(pc.italic(`... (Análisis completo guardado. Usa /workers o /analysis #${record.id} para leerlo)`))}`);
    }
    console.log(`${brand.border('└' + '─'.repeat(55))}\n`);
  }

  /**
   * Modal interactivo para inspeccionar el análisis completo de los agentes de soporte
   */
  public static async promptWorkerInspection(): Promise<void> {
    const records = WorkerStore.getRecords();

    if (records.length === 0) {
      console.log(pc.yellow('\n⚠ No hay análisis de agentes registrados en esta sesión.\n'));
      return;
    }

    console.log(pc.cyan('\n🔍 Inspector de Análisis de Agentes Secundarios:'));

    const choices = records.map((r) => {
      const brand = this.getWorkerBrand(r.workerName);
      const promptPreview = r.subtaskPrompt.length > 50 ? r.subtaskPrompt.substring(0, 47) + '...' : r.subtaskPrompt;
      const timeStr = r.timestamp.substring(11, 19);

      return {
        name: `${brand.color(pc.bold(`[#${r.id}] ${brand.label}`))} - ${pc.dim(promptPreview)} ${pc.gray(`(${timeStr})`)}`,
        value: r.id,
        description: `Prompt: "${r.subtaskPrompt}" | Tamaño de respuesta: ${r.fullResponse.length} caracteres`,
      };
    });

    choices.push({
      name: pc.gray('← Volver al chat'),
      value: '__back__',
      description: 'Cierra el inspector y vuelve a la línea de comandos',
    });

    const selectedId = await select({
      message: 'Selecciona el análisis que deseas leer completo:',
      choices,
    });

    if (selectedId === '__back__') return;

    const record = WorkerStore.getRecord(selectedId);
    if (record) {
      const brand = this.getWorkerBrand(record.workerName);
      console.log('\n' + brand.border('═'.repeat(64)));
      console.log(`${brand.color(pc.bold(`📋 ANÁLISIS COMPLETO DE ${brand.label.toUpperCase()} (#${record.id})`))}`);
      console.log(`${pc.dim('Instrucción asignada:')} ${pc.cyan(record.subtaskPrompt)}`);
      console.log(brand.border('─'.repeat(64)));
      console.log(record.fullResponse.trim());
      console.log(brand.border('═'.repeat(64)) + '\n');
    }
  }

  /**
   * Banner principal estilo Claude Code
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
    const modeBadge = autonomous ? pc.bgGreen(pc.black(' AUTONOMOUS ')) : pc.bgYellow(pc.black(' SAFE MODE '));
    const sessionInfo = sessionId
      ? `${pc.bold(sessionTitle || 'Sesión activa')} ${pc.dim(`(#${sessionId})`)}`
      : 'Nueva sesión';

    console.log(`
${pc.magenta(pc.bold(' ▐█▀▀▀ █▀█ █▀█ █ █ █▀▀ █   '))}
${pc.magenta(pc.bold(' ▐█▀▀▀ █▀█ █▀▄ █▀█ ██▄ █▄▄ '))}
${pc.dim('  Autonomous CLI Coding Assistant (Claude Code & OpenCode Engine)')}

${pc.gray('📁 Workspace:')} ${pc.bold(dirName)} ${pc.dim(`(${workdir})`)}
${pc.gray('💬 Sesión:')}    ${pc.cyan(sessionInfo)}
${pc.gray('🛡️  Modo:')}      ${modeBadge} ${pc.dim('(usa /auto para alternar)')}
${pc.gray('👑 Líder:')}     ${pc.bold(pc.cyan(leaderName))}
${pc.gray('👥 Workers:')}   ${pc.yellow(workersStr || 'Ninguno')} ${pc.dim('(usa /config)')}
${pc.gray('💡 Atajos:')}    ${pc.cyan('/workers')} ${pc.dim('análisis |')} ${pc.cyan('/resume')} ${pc.dim('historial |')} ${pc.cyan('/new')} ${pc.dim('nueva sesión |')} ${pc.cyan('/help')}
${pc.gray('═'.repeat(64))}
`);
  }

  private static getActionIcon(type: string): string {
    switch (type) {
      case 'read_file':
        return '📖';
      case 'write_file':
        return '📝';
      case 'run_command':
        return '⚙️';
      case 'list_directory':
        return '📁';
      case 'delegate_task':
        return '🤝';
      case 'finish':
        return '🎉';
      default:
        return '⚡';
    }
  }

  private static getWorkerBrand(workerName: string): { label: string; color: (s: string) => string; border: (s: string) => string } {
    const key = workerName.toLowerCase();
    if (key.includes('claude')) {
      return { label: 'Claude (Anthropic)', color: pc.magenta, border: pc.magenta };
    }
    if (key.includes('chatgpt') || key.includes('openai')) {
      return { label: 'ChatGPT (OpenAI)', color: pc.green, border: pc.green };
    }
    if (key.includes('gemini') || key.includes('google')) {
      return { label: 'Gemini (Google)', color: pc.blue, border: pc.blue };
    }
    if (key.includes('qwen')) {
      return { label: 'Qwen (Alibaba)', color: pc.cyan, border: pc.cyan };
    }
    if (key.includes('mistral')) {
      return { label: 'Mistral Le Chat', color: pc.yellow, border: pc.yellow };
    }
    if (key.includes('perplexity')) {
      return { label: 'Perplexity AI', color: pc.blue, border: pc.cyan };
    }
    return { label: workerName.toUpperCase(), color: pc.cyan, border: pc.gray };
  }
}
