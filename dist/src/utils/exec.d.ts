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
export declare function execAsync(command: string, options?: {
    cwd?: string;
    timeoutMs?: number;
    onChunk?: (chunk: string) => void;
}): Promise<ExecResult>;
