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

  public static startThinking(modelName = 'Líder', customText?: string): void {
    this.stopThinking();

    this.thinkingStartTime = Date.now();
    const baseText = customText || `${modelName} pensando`;

    startSpinner(`${pc.cyan('⏺')} ${pc.dim(baseText)} ${pc.cyan('(0.0s)')}`, 'cyan');

    this.timerInterval = setInterval(() => {
      if (isSpinnerActive()) {
        const elapsedSec = ((Date.now() - this.thinkingStartTime) / 1000).toFixed(1);
        updateSpinnerText(`${pc.cyan('⏺')} ${pc.dim(baseText)} ${pc.cyan(`(${elapsedSec}s)`)}`);
      }
    }, 100);
  }

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

  public static renderThought(thought: string, durationMs?: number): void {
    this.stopThinking();

    const timeStr = durationMs !== undefined ? `${durationMs}ms` : '0ms';
    console.log(`${pc.green(pc.bold('⏺ Thought:'))} ${pc.green(timeStr)}`);

    if (this.showFullThinking) {
      const lines = thought.trim().split('\n');
      console.log(pc.gray('┌─') + pc.dim(' [Extended reasoning]'));
      for (const line of lines) {
        console.log(`${pc.gray('│')} ${pc.italic(pc.dim(line))}`);
      }
      console.log(pc.gray('└' + '─'.repeat(50)));
    }
  }

  public static renderAction(type: string, details: Record<string, unknown>): void {
    this.stopThinking();

    switch (type) {
      case 'read_file':
        console.log(`${pc.dim('⏺')} ${pc.white('Read')} ${pc.cyan(String(details.path || ''))}`);
        break;

      case 'write_file':
        const len = typeof details.content === 'string' ? details.content.length : 0;
        console.log(`${pc.green('⏺')} ${pc.white('Write')} ${pc.cyan(String(details.path || ''))} ${pc.dim(`(${len} bytes)`)}`);
        break;

      case 'list_directory':
        console.log(`${pc.yellow('⏺')} ${pc.white('Glob')} ${pc.cyan(`"${details.path || '.'}/**/*"`)}`);
        break;

      case 'run_command':
        console.log(`\n${pc.bold(pc.white('$'))} ${pc.white(String(details.command || ''))}`);
        break;

      case 'delegate_task':
        const agent = String(details.agent || 'worker').toUpperCase();
        const promptPreview = String(details.prompt || '').substring(0, 60);
        console.log(`${pc.magenta('⏺')} ${pc.magenta(pc.bold(`Task [${agent}]`))} ${pc.dim(`"${promptPreview}..."`)}`);
        break;

      case 'delegate_batch':
        const taskCount = Array.isArray(details.tasks) ? details.tasks.length : 0;
        const agents = Array.isArray(details.tasks)
          ? details.tasks.map((t) => (typeof t === 'object' && t ? String((t as { agent?: string }).agent || '?') : '?').toUpperCase()).join(', ')
          : '';
        console.log(`${pc.magenta('⏺')} ${pc.magenta(pc.bold(`Batch [${agents || taskCount + ' tareas'}]`))} ${pc.dim(`(${taskCount} workers en paralelo)`)}`);
        break;

      case 'grep':
        console.log(`${pc.blue('⏺')} ${pc.white('Search')} ${pc.cyan(String(details.pattern || ''))} ${pc.dim(`en ${details.path || '.'}`)}`);
        break;

      case 'glob':
        console.log(`${pc.blue('⏺')} ${pc.white('Glob')} ${pc.cyan(`"${details.pattern || ''}"`)} ${pc.dim(`en ${details.path || '.'}`)}`);
        break;

      case 'check':
        console.log(`${pc.cyan('⏺')} ${pc.white('Check')} ${pc.dim('(typecheck/lint/build del proyecto)')}`);
        break;

      case 'finish':
        console.log(`\n${pc.green('✓')} ${pc.green(pc.bold('Completed:'))} ${pc.white(String(details.summary || ''))}\n`);
        break;

      default:
        console.log(`${pc.dim('⏺')} ${pc.white(type)} ${pc.dim(JSON.stringify(details))}`);
        break;
    }
  }

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

    console.log(`${brand.color(pc.bold('⏺ Agent:'))} ${brand.color(brand.label)} ${pc.dim(`[#${record.id}]`)} ${pc.green(durationText)}`);
    console.log(`${pc.dim('  Task:')} ${pc.italic(subtaskPrompt)}`);

    const preview = response.trim().split('\n').slice(0, 8);
    console.log(brand.border('  ┌' + '─'.repeat(60)));
    for (const line of preview) {
      console.log(`  ${brand.border('│')} ${pc.dim(line)}`);
    }
    if (response.trim().split('\n').length > 8) {
      console.log(`  ${brand.border('│')} ${pc.cyan(pc.italic(`... (Full analysis in /workers #${record.id})`))}`);
    }
    console.log(brand.border('  └' + '─'.repeat(60)) + '\n');
  }

  public static async promptWorkerInspection(): Promise<void> {
    const records = WorkerStore.getRecords();

    if (records.length === 0) {
      console.log(pc.yellow('\n⚠ No agent analysis recorded in this session.\n'));
      return;
    }

    console.log(pc.cyan('\n🔍 Agent Analysis Inspector:'));

    const choices = records.map((r) => {
      const brand = this.getWorkerBrand(r.workerName);
      const promptPreview = r.subtaskPrompt.length > 50 ? r.subtaskPrompt.substring(0, 47) + '...' : r.subtaskPrompt;
      const timeStr = r.timestamp.substring(11, 19);

      return {
        name: `${brand.color(pc.bold(`[#${r.id}] ${brand.label}`))} - ${pc.dim(promptPreview)} ${pc.gray(`(${timeStr})`)}`,
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
      console.log('\n' + brand.border('═'.repeat(70)));
      console.log(`${brand.color(pc.bold(`📋 FULL ANALYSIS: ${brand.label.toUpperCase()} (#${record.id})`))}`);
      console.log(`${pc.dim('Task:')} ${pc.cyan(record.subtaskPrompt)}`);
      console.log(brand.border('─'.repeat(70)));
      console.log(record.fullResponse.trim());
      console.log(brand.border('═'.repeat(70)) + '\n');
    }
  }

  public static renderBanner(
    workdir: string = process.cwd(),
    autonomous = false,
    leaderName = 'DeepSeek',
    workersStr = 'ChatGPT, Gemini',
    sessionTitle?: string,
    sessionId?: string
  ): void {
    const dirName = path.basename(workdir) || workdir;
    const modeBadge = autonomous 
      ? pc.bgGreen(pc.black(' AUTO ')) 
      : pc.bgYellow(pc.black(' SAFE '));
    const sessionName = sessionTitle || 'Session';
    const idBadge = sessionId ? `#${sessionId.slice(0, 8)}` : '#new';

    const dim = pc.dim;
    const white = pc.white;
    const cyan = pc.cyan;
    const gray = pc.gray;
    const bold = pc.bold;

    const version = getBarhelVersion();
    const barhelLogo = `${bold(white('barhel'))} ${dim(`v${version}`)}`;

    console.log();
    console.log(`  ${gray('┌' + '─'.repeat(60))}`);
    console.log(`  ${gray('│')}  ${barhelLogo}  ${dim(`(${idBadge})`)}`);
    console.log(`  ${gray('├' + '─'.repeat(60))}`);
    console.log(`  ${gray('│')}  ${dim('Dir:')}  ${white(dirName)}  ${dim(workdir)}`);
    console.log(`  ${gray('│')}  ${dim('Model:')}  ${cyan(bold(leaderName))}`);
    if (workersStr) {
      console.log(`  ${gray('│')}  ${dim('Agents:')}  ${pc.yellow(workersStr)}`);
    }
    console.log(`  ${gray('│')}  ${dim('Mode:')}  ${modeBadge}`);
    console.log(`  ${gray('└' + '─'.repeat(60))}`);
    console.log();
    console.log(`  ${dim('Tip:')}  ${cyan('/')} for commands  ${dim('•')}  ${cyan('Ctrl+C')} to exit`);
    console.log();
  }

  public static getPromptPrefix(leaderName = 'barhel'): string {
    return `${pc.green('>')} ${pc.dim(leaderName)} ${pc.gray('›')} `;
  }

  public static renderWelcome(): void {
    console.log();
    console.log(`  ${pc.bold(pc.white('Welcome to barhel'))}`);
    console.log(`  ${pc.dim('Your AI coding assistant')}`);
    console.log();
  }

  private static getWorkerBrand(workerName: string): { label: string; color: (s: string) => string; border: (s: string) => string } {
    const key = workerName.toLowerCase();
    if (key.includes('claude')) {
      return { label: 'Claude', color: pc.magenta, border: pc.magenta };
    }
    if (key.includes('chatgpt') || key.includes('openai')) {
      return { label: 'ChatGPT', color: pc.green, border: pc.green };
    }
    if (key.includes('gemini') || key.includes('google')) {
      return { label: 'Gemini', color: pc.blue, border: pc.blue };
    }
    if (key.includes('qwen')) {
      return { label: 'Qwen', color: pc.cyan, border: pc.cyan };
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