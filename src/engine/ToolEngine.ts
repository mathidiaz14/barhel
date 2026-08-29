import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import fg from 'fast-glob';
import { createTwoFilesPatch } from 'diff';
import pc from 'picocolors';
import { ActionPayload, ToolResult } from '../types/actions.js';
import { logger } from '../utils/logger.js';
import { execAsync } from '../utils/exec.js';

export interface CommandPolicy {
  deny: string[];
  allow: string[];
}

const DEFAULT_DENY_PATTERNS: string[] = [
  'rm\\s+-(?:rf|r\\s+f|f\\s+r|fr)\\b',
  'mkfs(?:\\.\\w+)?\\b',
  '>\\s*/dev/(?:sd|nvm|hd)[a-z]',
  '\\b(?:shutdown|poweroff|halt|reboot)\\b',
  'curl\\b[^|]*\\|\\s*(?:ba|da)?sh\\b',
  'git\\s+push\\s+--force(?:\\b|$)',
  ':\\s*\\(\\s*\\)\\s*\\{',
];
export class ToolEngine {
  private workdir: string;
  private autonomous: boolean;
  private planOnly: boolean;
  private policies: CommandPolicy;

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

  private workdirReal: string;

  constructor(workdir: string = process.cwd(), autonomous = false, policies?: Partial<CommandPolicy>) {
    this.workdir = path.resolve(workdir);
    this.workdirReal = this.resolveRealPath(this.workdir);
    this.autonomous = autonomous;
    this.planOnly = false;
    this.policies = {
      deny: [...DEFAULT_DENY_PATTERNS, ...(policies?.deny ?? [])],
      allow: policies?.allow ?? [],
    };
  }

  public getWorkdir(): string {
    return this.workdir;
  }

  public setAutonomous(autonomous: boolean): void {
    this.autonomous = autonomous;
  }

  public setPlanOnly(planOnly: boolean): void {
    this.planOnly = planOnly;
  }

  public isPlanOnly(): boolean {
    return this.planOnly;
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

        case 'grep':
          return await this.grep(action.pattern!, action.path);

        case 'glob':
          return await this.glob(action.pattern!, action.path);

        case 'check':
          return await this.check();

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

        case 'delegate_batch':
          // El orquestador maneja la delegación paralela a través de los drivers
          return {
            success: true,
            output: 'Delegación paralela en curso...',
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

    if (this.planOnly) {
      const previewLines = content.split('\n').slice(0, 15).join('\n  ');
      const head = `[PLAN] Escribiría "${relPath}" (${content.length} chars).\n  --- previsualización ---\n  ${previewLines}\n  --- fin previsualización ---`;
      return {
        success: true,
        output: head,
      };
    }

    const exists = fs.existsSync(fullPath);
    const diffPreview = exists ? this.createDiffPreview(fullPath, content) : null;

    if (!this.autonomous) {
      const promptLines = [];
      if (exists) {
        promptLines.push(`¿Sobrescribir archivo [${pc.yellow(relPath)}] (${content.length} caracteres)?`);
      } else {
        promptLines.push(`¿Crear nuevo archivo [${pc.green(relPath)}] (${content.length} caracteres)?`);
      }
      if (diffPreview) {
        promptLines.push(diffPreview);
      }

      const allowed = await this.requestUserConfirmation(promptLines.join('\n'));
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
   * Genera un preview de diff unificado old→new para mostrar en la confirmación de sobrescritura
   */
  private createDiffPreview(relPath: string, newContent: string): string | null {
    try {
      const oldContent = fs.readFileSync(relPath, 'utf-8');
      const patch = createTwoFilesPatch('a/' + relPath, 'b/' + relPath, oldContent, newContent, 'anterior', 'nuevo');
      const lines = patch.split('\n');
      const preview = lines.filter((l) => /^[\+\-!]/.test(l) && !l.startsWith('+++') && !l.startsWith('---')).slice(0, 30);
      if (preview.length === 0) return `  (sin cambios detectados)`;
      const addCount = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
      const delCount = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
      return [`  ${pc.dim('Preview del diff (+' + addCount + '/-' + delCount + ' líneas):')}`, ...preview.map((l) => '  ' + (l.startsWith('+') ? pc.green(l) : l.startsWith('-') ? pc.red(l) : pc.dim(l)))].join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Ejecuta un comando en terminal solicitando confirmación si no está en modo autónomo.
   * Orden de seguridad: DENYLIST (bloqueo siempre) → ALLOWLIST (sin confirmación) → confirmación.
   */
  private async runCommandWithConfirmation(command: string): Promise<ToolResult> {
    if (this.planOnly) {
      return {
        success: true,
        output: `[PLAN] Ejecutaría: ${command}`,
      };
    }

    const deniedPattern = this.policies.deny.find((p) => this.matchesPolicy(command, p));
    if (deniedPattern) {
      logger.warn(`Comando bloqueado por política de seguridad: "${command}" (coincide con "${deniedPattern}")`);
      return {
        success: false,
        output: `Comando bloqueado por la política de seguridad de Barhel: "${command}"`,
        error: `Comando denegado por política (patrón "${deniedPattern}")`,
      };
    }

    const allowPattern = this.policies.allow.find((p) => this.matchesPolicy(command, p));
    const needsConfirm = !this.autonomous && !allowPattern;

    if (needsConfirm) {
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

    console.log(pc.gray(`  ┌─ Ejecutando: ${command} ──────────────────────────────────────`));
    let hasOutput = false;
    const result = await execAsync(command, {
      cwd: this.workdir,
      onChunk: (chunk) => {
        hasOutput = true;
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim().length > 0) {
            console.log(`  ${pc.gray('│')} ${pc.dim(line)}`);
          }
        }
      },
    });
    if (!hasOutput) {
      console.log(`  ${pc.gray('│')} ${pc.dim('(completado sin salida)')}`);
    }
    console.log(pc.gray(`  └───────────────────────────────────────────────────────────────\n`));

    return {
      success: result.ok,
      output: result.combined || (result.ok ? '(Comando ejecutado con salida vacía)' : '(Sin salida)'),
      error: result.ok ? undefined : result.raw,
    };
  }

  private matchesPolicy(command: string, pattern: string): boolean {
    try {
      return new RegExp(pattern).test(command);
    } catch {
      return command.toLowerCase().includes(pattern.toLowerCase());
    }
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
   * Busca coincidencias de un patrón regex en el contenido de archivos dentro del workspace
   */
  private async grep(patternStr: string, relPath?: string): Promise<ToolResult> {
    let regex: RegExp;
    try {
      regex = new RegExp(patternStr, 'i');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Patrón regex inválido para grep: ${msg}`,
        error: `Regex inválido: ${msg}`,
      };
    }

    const baseDir = relPath && relPath.trim() ? this.resolveSafePath(relPath) : this.workdir;
    if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
      return {
        success: false,
        output: `Directorio raíz inválido para grep: ${relPath || '.'}`,
        error: `Directorio no encontrado: ${relPath || '.'}`,
      };
    }

    const MAX_MATCHES = 200;
    const MAX_FILE_BYTES = 1024 * 1024;
    const results: string[] = [];

    try {
      const files = await fg('**/*', {
        cwd: baseDir,
        onlyFiles: true,
        dot: false,
        followSymbolicLinks: false,
        ignore: [...this.IGNORED_DIRS, '**/node_modules/**', '**/.git/**'],
        absolute: true,
      });

      for (const file of files.slice(0, 20000)) {
        if (results.length >= MAX_MATCHES) break;
        let stat: fs.Stats;
        try {
          stat = fs.statSync(file);
          if (stat.size > MAX_FILE_BYTES) continue;
        } catch {
          continue;
        }

        let content: string;
        try {
          content = fs.readFileSync(file, 'utf-8');
        } catch {
          continue;
        }
        if (content.includes('\u0000')) continue;

        const rel = path.relative(this.workdir, file);
        const contentLines = content.split('\n');
        for (let i = 0; i < contentLines.length && results.length < MAX_MATCHES; i++) {
          if (regex.test(contentLines[i])) {
            regex.lastIndex = 0;
            results.push(`${rel}:${i + 1}: ${contentLines[i].trim().slice(0, 300)}`);
          }
        }
      }
    } catch (err) {
      return {
        success: false,
        output: `Error al ejecutar grep: ${err}`,
        error: String(err),
      };
    }

    if (results.length === 0) {
      return {
        success: true,
        output: `Sin coincidencias para /${patternStr}/ en ${relPath || '.'}`,
      };
    }

    let output = `Coincidencias de /${patternStr}/ (${results.length}):\n` + results.join('\n');
    if (results.length >= MAX_MATCHES) output += '\n[Se alcanzó el límite de coincidencias]';
    return { success: true, output };
  }

  /**
   * Lista archivos/entradas que coinciden con un patrón glob dentro del workspace
   */
  private async glob(pattern: string, relPath?: string): Promise<ToolResult> {
    const baseDir = relPath && relPath.trim() ? this.resolveSafePath(relPath) : this.workdir;
    if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
      return {
        success: false,
        output: `Directorio raíz inválido para glob: ${relPath || '.'}`,
        error: `Directorio no encontrado: ${relPath || '.'}`,
      };
    }

    const MAX_ENTRIES = 200;
    try {
      const matches = await fg([pattern], {
        cwd: baseDir,
        onlyFiles: false,
        dot: false,
        followSymbolicLinks: false,
        ignore: [...this.IGNORED_DIRS, '**/node_modules/**', '**/.git/**'],
      });

      const safeMatches: string[] = [];
      for (const m of matches.slice(0, 5000)) {
        let candidate: string;
        try {
          candidate = path.resolve(baseDir, m);
          this.assertInsideWorkdir(candidate, m);
        } catch {
          continue;
        }
        const rel = path.relative(this.workdir, candidate).replace(/\\/g, '/');
        safeMatches.push(rel);
      }

      if (safeMatches.length === 0) {
        return {
          success: true,
          output: `Sin coincidencias para glob "${pattern}" en ${relPath || '.'}`,
        };
      }

      let output = `Coincidencias de glob "${pattern}" (${safeMatches.length}):\n` + safeMatches.slice(0, MAX_ENTRIES).join('\n');
      if (safeMatches.length > MAX_ENTRIES) output += '\n[Se alcanzó el límite de entradas]';
      return { success: true, output };
    } catch (err) {
      return {
        success: false,
        output: `Error al ejecutar glob "${pattern}": ${err}`,
        error: String(err),
      };
    }
  }

  /**
   * Ejecuta el primer script del proyecto en prioridad typecheck → lint → build
   */
  private async check(): Promise<ToolResult> {
    const pkgPath = path.join(this.workdir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return {
        success: false,
        output: 'No se encontró package.json en el workspace para ejecutar "check".',
        error: 'No existe package.json en el directorio de trabajo.',
      };
    }

    let scripts: Record<string, string>;
    try {
      scripts = (JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> }).scripts ?? {};
    } catch (err) {
      return {
        success: false,
        output: `package.json inválido: ${err}`,
        error: String(err),
      };
    }

    const ordered = ['typecheck', 'lint', 'build'];
    const script = ordered.find((s) => typeof scripts[s] === 'string' && scripts[s].trim().length > 0);
    if (!script) {
      return {
        success: false,
        output: 'No hay scripts "typecheck", "lint" ni "build" definidos en package.json.',
        error: 'Ninguno de los scripts esperados (typecheck/lint/build) existe.',
      };
    }

    const command = `npm run ${script} --no-audit --no-fund`;
    const result = await execAsync(command, { cwd: this.workdir });
    return {
      success: result.ok,
      output: `[check: ${script}] ${result.combined}`.trim(),
      error: result.ok ? undefined : result.raw,
    };
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
    const resolved = path.resolve(this.workdir, targetPath);
    this.assertInsideWorkdir(resolved, targetPath);
    return resolved;
  }

  private resolveRealPath(p: string): string {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  }

  /**
   * Verifica que una ruta resuelta quede dentro del workspace, incluso a través
   * de symlinks/junctions. Lanza un error si intenta escapar.
   */
  private assertInsideWorkdir(resolved: string, original: string): void {
    const relCheck = (base: string, target: string) => {
      const rel = path.relative(base, target);
      return rel.startsWith('..') || path.isAbsolute(rel);
    };

    if (relCheck(this.workdir, resolved)) {
      throw new Error(`Acceso fuera del workspace denegado: "${original || resolved}"`);
    }

    let real: string;
    try {
      real = fs.realpathSync(resolved);
    } catch {
      // La ruta aún no existe (ej: archivo a escribir); verificar el dirname real
      try {
        real = path.join(this.resolveRealPath(path.dirname(resolved)), path.basename(resolved));
      } catch {
        return;
      }
    }

    if (relCheck(this.workdirReal, real)) {
      throw new Error(`Ruta fuera del workspace vía symlink: "${original || resolved}"`);
    }
  }
}
