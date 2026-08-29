export interface ExecResult {
    combined: string;
    ok: boolean;
    raw?: string;
}
/**
 * Ejecuta un comando capturando STDOUT/STDERR combinados sin lanzar excepción al fallar.
 */
export declare function execAsync(command: string, options?: {
    cwd?: string;
    timeoutMs?: number;
    maxBuffer?: number;
}): Promise<ExecResult>;
