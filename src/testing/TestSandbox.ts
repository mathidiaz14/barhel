import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execAsync } from '../utils/exec.js';

export interface EvalResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  durationMs: number;
}

export class TestSandbox {
  private workdir: string;
  private scratchDir: string;

  constructor(workdir: string = process.cwd()) {
    this.workdir = path.resolve(workdir);
    this.scratchDir = path.join(this.workdir, '.barhel', 'scratch');
    if (!fs.existsSync(this.scratchDir)) {
      try {
        fs.mkdirSync(this.scratchDir, { recursive: true });
      } catch {
        // Silencioso
      }
    }
  }

  /**
   * Ejecuta un fragmento de código de prueba en un sandbox aislado
   */
  public async evalCode(code: string, language: string = 'typescript'): Promise<EvalResult> {
    const lang = language.toLowerCase().trim();
    const id = crypto.randomBytes(4).toString('hex');
    const start = performance.now();

    let ext = '.ts';
    let runnerCmd = `npx tsx`;

    if (lang === 'javascript' || lang === 'js') {
      ext = '.mjs';
      runnerCmd = `node`;
    } else if (lang === 'python' || lang === 'py') {
      ext = '.py';
      runnerCmd = process.platform === 'win32' ? 'python' : 'python3';
    } else if (lang === 'php') {
      ext = '.php';
      runnerCmd = 'php';
    } else if (lang === 'bash' || lang === 'sh') {
      ext = '.sh';
      runnerCmd = 'bash';
    }

    const testFilePath = path.join(this.scratchDir, `test_run_${id}${ext}`);

    try {
      fs.writeFileSync(testFilePath, code, 'utf-8');

      const fullCommand = `${runnerCmd} "${testFilePath}"`;
      const result = await execAsync(fullCommand, {
        cwd: this.workdir,
        timeoutMs: 30000,
      });

      const durationMs = Math.round(performance.now() - start);

      return {
        success: result.ok,
        output: result.combined || (result.ok ? '(Prueba ejecutada sin errores y sin salida)' : '(Sin salida)'),
        error: result.ok ? undefined : result.raw,
        exitCode: result.code,
        durationMs,
      };
    } finally {
      // Limpiar archivo temporal tras la prueba
      try {
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      } catch {}
    }
  }

  /**
   * Ejecuta el runner de pruebas del proyecto (Vitest, Jest, PyTest, Node Test Runner, PHPUnit)
   */
  public async runProjectTests(targetFile?: string): Promise<EvalResult> {
    const start = performance.now();
    let command = '';

    const pkgPath = path.join(this.workdir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        if (targetFile) {
          if (scripts.test && scripts.test.includes('vitest')) {
            command = `npx vitest run "${targetFile}"`;
          } else if (scripts.test && scripts.test.includes('jest')) {
            command = `npx jest "${targetFile}"`;
          } else {
            command = `node --import tsx --test "${targetFile}"`;
          }
        } else if (scripts.test) {
          command = `npm test`;
        }
      } catch {}
    }

    if (!command) {
      if (fs.existsSync(path.join(this.workdir, 'pytest.ini')) || fs.existsSync(path.join(this.workdir, 'tests'))) {
        command = targetFile ? `pytest "${targetFile}"` : `pytest`;
      } else if (fs.existsSync(path.join(this.workdir, 'phpunit.xml'))) {
        command = targetFile ? `./vendor/bin/phpunit "${targetFile}"` : `./vendor/bin/phpunit`;
      } else {
        command = targetFile ? `node --test "${targetFile}"` : `npm test`;
      }
    }

    const result = await execAsync(command, {
      cwd: this.workdir,
      timeoutMs: 60000,
    });

    const durationMs = Math.round(performance.now() - start);

    return {
      success: result.ok,
      output: result.combined || (result.ok ? '(Pruebas pasaron con éxito)' : '(Fallaron las pruebas)'),
      error: result.ok ? undefined : result.raw,
      exitCode: result.code,
      durationMs,
    };
  }
}
