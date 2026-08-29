import { promisify } from 'node:util';
import { exec } from 'node:child_process';
const execP = promisify(exec);
/**
 * Ejecuta un comando capturando STDOUT/STDERR combinados sin lanzar excepción al fallar.
 */
export async function execAsync(command, options = {}) {
    const { cwd, timeoutMs = 120000, maxBuffer = 1024 * 1024 * 10 } = options;
    try {
        const { stdout, stderr } = await execP(command, { cwd, timeout: timeoutMs, maxBuffer });
        const stdoutStr = stdout ? stdout.trim() : '';
        const stderrStr = stderr ? stderr.trim() : '';
        let combined = '';
        if (stdoutStr)
            combined += `[STDOUT]\n${stdoutStr}\n`;
        if (stderrStr)
            combined += `[STDERR]\n${stderrStr}\n`;
        return { combined: combined.trim(), ok: true };
    }
    catch (err) {
        const e = err;
        const stdoutStr = e.stdout ? String(e.stdout).trim() : '';
        const stderrStr = e.stderr ? String(e.stderr).trim() : '';
        let combined = '';
        if (stdoutStr)
            combined += `[STDOUT]\n${stdoutStr}\n`;
        if (stderrStr)
            combined += `[STDERR]\n${stderrStr}\n`;
        combined += `[EXIT CODE: ${e.code ?? 1}] ${e.message ?? ''}`;
        return { combined: combined.trim(), ok: false, raw: e.message };
    }
}
//# sourceMappingURL=exec.js.map