import { ActionPayload, ToolResult } from '../types/actions.js';
export interface CommandPolicy {
    deny: string[];
    allow: string[];
}
export declare class ToolEngine {
    private workdir;
    private autonomous;
    private planOnly;
    private policies;
    private readonly IGNORED_DIRS;
    private workdirReal;
    constructor(workdir?: string, autonomous?: boolean, policies?: Partial<CommandPolicy>);
    getWorkdir(): string;
    setAutonomous(autonomous: boolean): void;
    setPlanOnly(planOnly: boolean): void;
    isPlanOnly(): boolean;
    /**
     * Ejecuta una acción ReAct solicitada por el modelo
     */
    execute(action: ActionPayload): Promise<ToolResult>;
    /**
     * Lee el contenido de un archivo en texto plano UTF-8
     */
    private readFile;
    /**
     * Escribe un archivo solicitando confirmación si no está en modo autónomo
     */
    private writeFileWithConfirmation;
    /**
     * Genera un preview de diff unificado old→new para mostrar en la confirmación de sobrescritura
     */
    private createDiffPreview;
    /**
     * Ejecuta un comando en terminal solicitando confirmación si no está en modo autónomo.
     * Orden de seguridad: DENYLIST (bloqueo siempre) → ALLOWLIST (sin confirmación) → confirmación.
     */
    private runCommandWithConfirmation;
    private matchesPolicy;
    /**
     * Lista archivos del directorio excluyendo carpetas pesadas
     */
    private listDirectory;
    private scanDirRecursive;
    /**
     * Busca coincidencias de un patrón regex en el contenido de archivos dentro del workspace
     */
    private grep;
    /**
     * Lista archivos/entradas que coinciden con un patrón glob dentro del workspace
     */
    private glob;
    /**
     * Ejecuta el primer script del proyecto en prioridad typecheck → lint → build
     */
    private check;
    /**
     * Pregunta interactiva en terminal [y/N]
     */
    private requestUserConfirmation;
    private resolveSafePath;
    private resolveRealPath;
    /**
     * Verifica que una ruta resuelta quede dentro del workspace, incluso a través
     * de symlinks/junctions. Lanza un error si intenta escapar.
     */
    private assertInsideWorkdir;
}
