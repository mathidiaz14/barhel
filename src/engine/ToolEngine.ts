import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import readline from 'node:readline';
import pc from 'picocolors';
import { ActionPayload, ToolResult } from '../types/actions.js';
import { logger } from '../utils/logger.js';

export class ToolEngine {
  private workdir: string;
  private autonomous: boolean;

  private readonly IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.dev-agent-sessions',
    '.vscode',
    '.idea',
    'coverage',
  ]);

  constructor(workdir: string = process.cwd(), autonomous = false) {
    this.workdir = path.resolve(workdir);
    this.autonomous = autonomous;
  }

  public getWorkdir(): string {
    return this.workdir;
  }

  public setAutonomous(autonomous: boolean): void {
    this.autonomous = autonomous;
  }

  /**
   * Ejecuta una acción ReAct solicitada por el modelo
   */
  public async execute(action: ActionPayload): Promise<ToolResult> {
    try {
      switch (action.type) {
        case 'read_file':
          return await this.readFile(action.path!);

        case 'write_file':
          return await this.writeFileWithConfirmation(action.path!, action.content ?? '');

        case 'run_command':
          return await this.runCommandWithConfirmation(action.command!);

        case 'list_directory':
          return await this.listDirectory(action.path || '.');

        case 'finish':
          return {
            success: true,
            output: `Tarea finalizada con éxito. Resumen:\n${action.summary}`,
            isFinish: true,
          };

        case 'delegate_task':
          // El orquestador maneja la delegación a través de los drivers
          return {
            success: true,
            output: 'Delegación en curso...',
          };

        default:
          return {
            success: false,
            error: `Acción desconocida: ${(action as { type: string }).type}`,
            output: '',
          };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: errorMsg,
        output: `Error al ejecutar ${action.type}: ${errorMsg}`,
      };
    }
  }

  /**
   * Lee el contenido de un archivo en texto plano UTF-8
   */
  private async readFile(relPath: string): Promise<ToolResult> {
    const fullPath = this.resolveSafePath(relPath);
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `El archivo no existe: ${relPath}`,
        output: `Error: El archivo "${relPath}" no fue encontrado en el workspace.`,
      };
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      return {
        success: false,
        error: `La ruta es un directorio, no un archivo: ${relPath}`,
        output: `Error: "${relPath}" es un directorio. Usa list_directory para explorar.`,
      };
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    return {
      success: true,
      output: content,
    };
  }

  /**
   * Escribe un archivo solicitando confirmación si no está en modo autónomo
   */
  private async writeFileWithConfirmation(relPath: string, content: string): Promise<ToolResult> {
    const fullPath = this.resolveSafePath(relPath);

    if (!this.autonomous) {
      const exists = fs.existsSync(fullPath);
      const promptText = exists
        ? `¿Sobrescribir archivo [${pc.yellow(relPath)}] (${content.length} caracteres)?`
        : `¿Crear nuevo archivo [${pc.green(relPath)}] (${content.length} caracteres)?`;

      const allowed = await this.requestUserConfirmation(promptText);
      if (!allowed) {
        return {
          success: false,
          output: `El usuario rechazó la escritura del archivo: ${relPath}`,
          error: 'Operación cancelada por el usuario.',
        };
      }
    }

    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf-8');

    return {
      success: true,
      output: `Archivo "${relPath}" escrito correctamente (${content.length} bytes).`,
    };
  }

  /**
   * Ejecuta un comando en terminal solicitando confirmación si no está en modo autónomo
   */
  private async runCommandWithConfirmation(command: string): Promise<ToolResult> {
    if (!this.autonomous) {
      const promptText = `¿Ejecutar comando en terminal [${pc.cyan(command)}]?`;
      const allowed = await this.requestUserConfirmation(promptText);
      if (!allowed) {
        return {
          success: false,
          output: `El usuario canceló la ejecución del comando: "${command}".`,
          error: 'Comando rechazado por el usuario.',
        };
      }
    }

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: this.workdir,
          timeout: 120000, // 2 minutos máximo por comando
          maxBuffer: 1024 * 1024 * 5, // 5MB
        },
        (error, stdout, stderr) => {
          const stdoutStr = stdout ? stdout.trim() : '';
          const stderrStr = stderr ? stderr.trim() : '';
          let combinedOutput = '';

          if (stdoutStr) combinedOutput += `[STDOUT]\n${stdoutStr}\n`;
          if (stderrStr) combinedOutput += `[STDERR]\n${stderrStr}\n`;

          if (error) {
            combinedOutput += `[EXIT CODE: ${error.code ?? 1}] ${error.message}`;
            resolve({
              success: false,
              output: combinedOutput.trim(),
              error: error.message,
            });
          } else {
            resolve({
              success: true,
              output: combinedOutput.trim() || '(Comando ejecutado con salida vacía)',
            });
          }
        }
      );
    });
  }

  /**
   * Lista archivos del directorio excluyendo carpetas pesadas
   */
  private async listDirectory(relPath: string): Promise<ToolResult> {
    const fullPath = this.resolveSafePath(relPath);
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `Directorio no encontrado: ${relPath}`,
        output: `Error: Directorio "${relPath}" no existe.`,
      };
    }

    const files = this.scanDirRecursive(fullPath, 0, 3);
    return {
      success: true,
      output: `Contenido de "${relPath}":\n${files.join('\n') || '(Directorio vacío)'}`,
    };
  }

  private scanDirRecursive(dir: string, depth: number, maxDepth: number): string[] {
    if (depth > maxDepth) return [];
    const results: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (this.IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }

        const relativeToWorkdir = path.relative(this.workdir, path.join(dir, entry.name));
        const indent = '  '.repeat(depth);

        if (entry.isDirectory()) {
          results.push(`${indent}📁 ${relativeToWorkdir}/`);
          results.push(...this.scanDirRecursive(path.join(dir, entry.name), depth + 1, maxDepth));
        } else {
          results.push(`${indent}📄 ${relativeToWorkdir}`);
        }
      }
    } catch (err) {
      results.push(`[Error al leer directorio: ${err}]`);
    }

    return results;
  }

  /**
   * Pregunta interactiva en terminal [y/N]
   */
  private async requestUserConfirmation(question: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(`${question} ${pc.bold('[y/N]')}: `, (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes' || normalized === 's' || normalized === 'si');
      });
    });
  }

  private resolveSafePath(targetPath: string): string {
    return path.resolve(this.workdir, targetPath);
  }
}
