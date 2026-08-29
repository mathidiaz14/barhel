import { spawn } from 'node:child_process';

export interface ExecResult {
  combined: string;
  ok: boolean;
  raw?: string;
  code?: number;
}

/**
 * Ejecuta un comando en terminal con streaming de salida en tiempo real.
 * Si se pasa onChunk, se emiten los fragmentos de STDOUT/STDERR a medida que ocurren.
 */
export function execAsync(
  command: string,
  options: {
    cwd?: string;
    timeoutMs?: number;
    onChunk?: (chunk: string) => void;
  } = {}
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const { cwd = process.cwd(), timeoutMs = 180000, onChunk } = options;

    let combined = '';
    let killed = false;

    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {}
    }, timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      combined += text;
      if (onChunk) onChunk(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      combined += text;
      if (onChunk) onChunk(text);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        combined: combined.trim(),
        ok: false,
        raw: err.message,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const isOk = code === 0 && !killed;
      resolve({
        combined: combined.trim(),
        ok: isOk,
        code: code ?? (killed ? 124 : 0),
        raw: !isOk ? (killed ? 'Tiempo de espera excedido (Timeout)' : `Código de salida: ${code}`) : undefined,
      });
    });
  });
}