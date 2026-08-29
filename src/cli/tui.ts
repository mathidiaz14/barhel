import pc from 'picocolors';
import ora, { Ora } from 'ora';
import path from 'node:path';
import { select } from '@inquirer/prompts';
import { WorkerStore, WorkerAnalysisRecord } from '../utils/workerStore.js';

export class TUI {
  private static activeSpinner: Ora | null = null;
  private static thinkingStartTime = 0;
  private static timerInterval: NodeJS.Timeout | null = null;
  private static showFullThinking = false; // OpenCode style shows concise "+ Thought: 159ms" by default

  public static toggleThinkingDisplay(): boolean {
    this.showFullThinking = !this.showFullThinking;
    return this.showFullThinking;
  }

  public static isShowingFullThinking(): boolean {
    return this.showFullThinking;
  }

  /**
   * Inicia el spinner con temporizador de alta resolución en tiempo real estilo OpenCode
   */
  public static startThinking(modelName = 'Líder', customText?: string): void {
    this.stopThinking();

    this.thinkingStartTime = Date.now();
    const baseText = customText || `${modelName} pensando`;

    this.activeSpinner = ora({
      text: `${pc.yellow('✻')} ${pc.dim(baseText)} ${pc.yellow('(0.0s)')}`,
      color: 'yellow',
      spinner: 'dots',
    }).start();

    // Actualizar el contador en vivo
    this.timerInterval = setInterval(() => {
      if (this.activeSpinner && this.activeSpinner.isSpinning) {
        const elapsedSec = ((Date.now() - this.thinkingStartTime) / 1000).toFixed(1);
        this.activeSpinner.text = `${pc.yellow('✻')} ${pc.dim(baseText)} ${pc.yellow(`(${elapsedSec}s)`)}`;
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
   * Renderiza el bloque de pensamiento exactamente con la visual de OpenCode: "+ Thought: 159ms"
   */
  public static renderThought(thought: string, durationMs?: number): void {
    this.stopThinking();

    const timeStr = durationMs !== undefined ? `${durationMs}ms` : '0ms';
    console.log(`${pc.yellow(pc.bold('+ Thought:'))} ${pc.yellow(timeStr)}`);

    // Si el usuario activó la vista expandida con /think, mostrar el cuerpo completo
    if (this.showFullThinking) {
      const lines = thought.trim().split('\n');
      console.log(pc.gray('┌─') + pc.dim(' [Razonamiento extendido]'));
      for (const line of lines) {
        console.log(`${pc.gray('│')} ${pc.italic(pc.dim(line))}`);
      }
      console.log(pc.gray('└' + '─'.repeat(50)));
    }
  }

  /**
   * Renderiza la invocación de herramientas estilo OpenCode (→ Read, * Glob, $ Command)
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
        console.log(`${pc.magenta('🗲')} ${pc.magenta(pc.bold(`Delegate [${agent}]`))} ${pc.dim(`"${promptPreview}..."`)}`);
        break;

      case 'finish':
        console.log(`\n${pc.green('✔')} ${pc.green(pc.bold('Objetivo Completado:'))} ${pc.white(String(details.summary || ''))}\n`);
        break;

      default:
        console.log(`${pc.dim('→')} ${pc.white(type)} ${pc.dim(JSON.stringify(details))}`);
        break;
    }
  }

  /**
   * Renderiza el resultado de herramientas con caja estilo ventana de consola de OpenCode
   */
  public static renderToolResult(toolType: string, success: boolean, output: string): void {
    this.stopThinking();

    const cleanOutput = output.trim();
    if (!cleanOutput) return;

    const lines = cleanOutput.split('\n');
    const previewLines = lines.slice(0, 15);

    // Caja oscura minimalista estilo ventana terminal OpenCode
    console.log(pc.gray('┌' + '─'.repeat(70)));
    for (const line of previewLines) {
      console.log(`${pc.gray('│')} ${line}`);
    }
    if (lines.length > 15) {
      console.log(`${pc.gray('│')} ${pc.dim(`... (${lines.length - 15} líneas más. Usa /workers o revisa el log)`)}`);
    }
    console.log(pc.gray('└' + '─'.repeat(70)) + '\n');
  }

  /**
   * Renderiza la tarjeta de asistencia de un agente secundario (Worker) estilo OpenCode
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

    console.log(`${brand.color(pc.bold('🗲 Worker:'))} ${brand.color(brand.label)} ${pc.dim(`[#${record.id}]`)} ${pc.yellow(durationText)}`);
    console.log(`${pc.dim('  Subtarea:')} ${pc.italic(subtaskPrompt)}`);

    const preview = response.trim().split('\n').slice(0, 6);
    console.log(brand.border('  ┌' + '─'.repeat(60)));
    for (const line of preview) {
      console.log(`  ${brand.border('│')} ${pc.dim(line)}`);
    }
    if (response.trim().split('\n').length > 6) {
      console.log(`  ${brand.border('│')} ${pc.cyan(pc.italic(`... (Análisis completo en /workers #${record.id})`))}`);
    }
    console.log(brand.border('  └' + '─'.repeat(60)) + '\n');
  }

  /**
   * Modal interactivo para inspeccionar el análisis completo de los agentes
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
        description: `Prompt: "${r.subtaskPrompt}" | Tamaño: ${r.fullResponse.length} caracteres`,
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
      console.log('\n' + brand.border('═'.repeat(70)));
      console.log(`${brand.color(pc.bold(`📋 ANÁLISIS COMPLETO DE ${brand.label.toUpperCase()} (#${record.id})`))}`);
      console.log(`${pc.dim('Instrucción:')} ${pc.cyan(record.subtaskPrompt)}`);
      console.log(brand.border('─'.repeat(70)));
      console.log(record.fullResponse.trim());
      console.log(brand.border('═'.repeat(70)) + '\n');
    }
  }

  /**
   * Banner estilo ventana OpenCode (con barra de título, logo ASCII y panel de contexto)
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
    const sessionName = sessionTitle || 'Sesión de desarrollo';
    const idBadge = sessionId ? `#${sessionId}` : '#nueva';

    const b = pc.gray;
    const cy = pc.cyan;

    console.log(`
${b('╭─')} ${pc.red('●')} ${pc.yellow('●')} ${pc.green('●')} ${b('─'.repeat(8))} ${pc.bold(pc.white(`OC | ${sessionName}`))} ${b('─'.repeat(Math.max(2, 45 - sessionName.length)))} ${pc.dim('v1.0.0')} ${b('─╮')}
${b('│')}                                                                          ${b('│')}
${b('│')}     ${cy(pc.bold('____             __          __'))}                                   ${b('│')}
${b('│')}    ${cy(pc.bold('/ __ )____ ______/ /_  ___   / /'))}   ${pc.dim('Autonomous CLI Agent')}           ${b('│')}
${b('│')}   ${cy(pc.bold('/ __  / __ `/ ___/ __ \\/ _ \\ / / '))}  ${pc.dim('Powered by Web LLMs')}            ${b('│')}
${b('│')}  ${cy(pc.bold('/ /_/ / /_/ / /  / / / /  __// /  '))}                                 ${b('│')}
${b('│')} ${cy(pc.bold('/_____/\\__,_/_/  /_/ /_/\\___//_/   '))}  ${pc.magenta(pc.bold('OpenCode Engine'))}                 ${b('│')}
${b('│')}                                                                          ${b('│')}
${b('├' + '─'.repeat(74) + '┤')}
${b('│')} ${pc.dim('Contexto  :')} ${pc.bold(pc.white(sessionName))} ${pc.dim(`(${idBadge})`)}
${b('│')} ${pc.dim('Workspace :')} ${pc.white(workdir)} ${pc.dim(':main')}
${b('│')} ${pc.dim('Líder     :')} ${pc.bold(pc.cyan(leaderName))}
${b('│')} ${pc.dim('Workers   :')} ${pc.yellow(workersStr || 'Ninguno')} ${pc.dim('(usa /config)')}
${b('│')} ${pc.dim('Modo      :')} ${modeBadge} ${pc.dim('(usa /auto para alternar)')}
${b('├' + '─'.repeat(74) + '┤')}
${b('│')} ${pc.dim('Comandos  :')} ${pc.cyan('/workers')} ${pc.dim('análisis')} │ ${pc.cyan('/think')} ${pc.dim('toggle')} │ ${pc.cyan('/resume')} │ ${pc.cyan('/new')} │ ${pc.cyan('/help')}
${b('╰' + '─'.repeat(74) + '╯')}
`);
  }

  /**
   * Imprime la barra de prompt estilo OpenCode
   */
  public static getPromptPrefix(leaderName = 'Barhel'): string {
    return `${pc.blue('▌')} ${pc.bold(pc.white(leaderName))} ${pc.gray('❯')} `;
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
      return { label: 'Mistral', color: pc.yellow, border: pc.yellow };
    }
    if (key.includes('perplexity')) {
      return { label: 'Perplexity', color: pc.blue, border: pc.cyan };
    }
    return { label: workerName.toUpperCase(), color: pc.cyan, border: pc.gray };
  }
}
