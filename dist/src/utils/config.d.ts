export interface CommandPoliciesConfig {
    deny?: string[];
    allow?: string[];
}
export interface BarhelConfig {
    leader: string;
    workers: string[];
    autonomousDefault?: boolean;
    maxIterations?: number;
    commandPolicies?: CommandPoliciesConfig;
    fallbackOrder?: string[];
    autoSummarize?: boolean;
    autoCommit?: boolean;
    checkCommands?: string[];
    telegramToken?: string;
    telegramChatId?: string;
    allowedChatIds?: number[];
}
export declare class ConfigManager {
    private static ensureDir;
    static loadConfig(): BarhelConfig | null;
    static saveConfig(config: BarhelConfig): void;
    /**
     * Muestra un menú interactivo en terminal para que el usuario escoja
     * su modelo Principal (Líder) y los modelos de soporte (Workers).
     */
    static promptConfig(currentConfig?: BarhelConfig | null): Promise<BarhelConfig>;
    /**
     * Obtiene la configuración existente o solicita al usuario configurarla si no existe
     */
    static getOrPromptConfig(forcePrompt?: boolean): Promise<BarhelConfig>;
}
