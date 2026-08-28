import pc from 'picocolors';
import ora, { Ora } from 'ora';
import path from 'node:path';

class Logger {
  private activeSpinner: Ora | null = null;

  public info(message: string, prefix = 'INFO'): void {
    this.stopSpinner();
    console.log(`${pc.cyan(pc.bold(`[${prefix}]`))} ${message}`);
  }

  public success(message: string): void {
    this.stopSpinner();
    console.log(`${pc.green(pc.bold('✔ SUCCESS'))} ${message}`);
  }

  public warn(message: string): void {
    this.stopSpinner();
    console.log(`${pc.yellow(pc.bold('⚠ WARN'))} ${message}`);
  }

  public error(message: string, error?: unknown): void {
    this.stopSpinner();
    console.log(`${pc.red(pc.bold('✖ ERROR'))} ${message}`);
    if (error) {
      if (error instanceof Error) {
        console.error(pc.red(error.stack || error.message));
      } else {
        console.error(pc.red(String(error)));
      }
    }
  }

  public thought(thoughtText: string): void {
    this.stopSpinner();
    console.log(`\n${pc.magenta(pc.bold('🧠 [BARHEL / RAZONAMIENTO]'))}`);
    console.log(pc.italic(pc.dim(thoughtText.trim())));
    console.log(pc.gray('─'.repeat(60)));
  }

  public action(type: string, details: Record<string, unknown>): void {
    this.stopSpinner();
    console.log(`${pc.blue(pc.bold('⚡ [ACCIÓN]'))} ${pc.bold(pc.yellow(type.toUpperCase()))}`);
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null) {
        const valStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        console.log(`  ${pc.gray('▪')} ${pc.cyan(key)}: ${valStr.length > 200 ? valStr.substring(0, 197) + '...' : valStr}`);
      }
    }
    console.log(pc.gray('─'.repeat(60)));
  }

  public worker(workerName: string, message: string): void {
    this.stopSpinner();
    console.log(`${pc.magenta(pc.bold(`🤝 [WORKER: ${workerName.toUpperCase()}]`))} ${message}`);
  }

  public toolResult(toolType: string, success: boolean, output: string): void {
    this.stopSpinner();
    const status = success ? pc.green('✔ OK') : pc.red('✖ FAILED');
    console.log(`${pc.gray('┌')} ${pc.bold(`Resultado de ${toolType}`)} [${status}]`);
    
    const lines = output.trim().split('\n');
    const previewLines = lines.slice(0, 15);
    for (const line of previewLines) {
      console.log(`${pc.gray('│')} ${pc.dim(line)}`);
    }
    if (lines.length > 15) {
      console.log(`${pc.gray('│')} ${pc.dim(`... (${lines.length - 15} líneas más)`)}`);
    }
    console.log(`${pc.gray('└')}────────────────────────────────────────\n`);
  }

  public banner(
    workdir: string = process.cwd(),
    autonomous = false,
    leaderName = 'DeepSeek',
    workersStr = 'ChatGPT, Gemini'
  ): void {
    const dirName = path.basename(workdir) || workdir;
    const modeBadge = autonomous ? pc.bgGreen(pc.black(' AUTONOMOUS ')) : pc.bgYellow(pc.black(' SAFE MODE '));
    
    console.log(`
${pc.cyan(pc.bold('    ____             __          __'))}
${pc.cyan(pc.bold('   / __ )____ ______/ /_  ___   / /'))}
${pc.cyan(pc.bold('  / __  / __ `/ ___/ __ \\/ _ \\ / / '))}
${pc.cyan(pc.bold(' / /_/ / /_/ / /  / / / /  __// /  '))}
${pc.cyan(pc.bold('/_____/\\__,_/_/  /_/ /_/\\___//_/   '))}
${pc.dim('  Autonomous CLI Coding Assistant (Claude Code & OpenCode Style)')}

${pc.gray('📁 Workspace:')} ${pc.bold(dirName)} ${pc.dim(`(${workdir})`)}
${pc.gray('🛡️  Mode:')}      ${modeBadge} ${pc.dim('(usa /auto para cambiar)')}
${pc.gray('👑 Leader:')}    ${pc.bold(pc.cyan(leaderName))}
${pc.gray('👥 Workers:')}   ${pc.yellow(workersStr || 'Ninguno activo')} ${pc.dim('(usa /config o /models)')}
${pc.gray('💡 Ayuda:')}     ${pc.dim('Escribe tu prompt o usa')} ${pc.cyan('/help')} ${pc.dim('para comandos')}
${pc.gray('═'.repeat(64))}
`);
  }

  public printHelp(): void {
    console.log(`
${pc.bold(pc.cyan('Comandos disponibles en el Chat de Barhel:'))}

  ${pc.bold(pc.yellow('/help'))}               - Muestra esta lista de comandos de ayuda
  ${pc.bold(pc.yellow('/config'))} o ${pc.bold(pc.yellow('/models'))} - Cambia interactivamente el modelo Líder y los Workers
  ${pc.bold(pc.yellow('/auto'))}               - Alterna entre Modo Autónomo y Modo Seguro [y/N]
  ${pc.bold(pc.yellow('/login [name]'))}       - Inicia sesión web (deepseek, claude, chatgpt, gemini, qwen, mistral, perplexity o all)
  ${pc.bold(pc.yellow('/status'))}             - Muestra el estado de sesiones guardadas
  ${pc.bold(pc.yellow('/clear'))}              - Limpia la pantalla de la terminal
  ${pc.bold(pc.yellow('/exit'))} o ${pc.bold(pc.yellow('/quit'))}       - Cierra la sesión de Barhel

${pc.dim('Cualquier otro texto será enviado al Agente para razonar y ejecutar herramientas sobre el código.')}
`);
  }

  public startSpinner(text: string): Ora {
    this.stopSpinner();
    this.activeSpinner = ora({
      text: pc.cyan(text),
      color: 'cyan',
    }).start();
    return this.activeSpinner;
  }

  public stopSpinner(): void {
    if (this.activeSpinner && this.activeSpinner.isSpinning) {
      this.activeSpinner.stop();
      this.activeSpinner = null;
    }
  }
}

export const logger = new Logger();
