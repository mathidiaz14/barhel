export interface SkillMeta {
    name: string;
    description: string;
    version?: string;
    author?: string;
    tags?: string[];
    homepage?: string;
    installedAt: string;
}
export interface SkillDefinition {
    meta: SkillMeta;
    instructions: string;
    filePath: string;
}
export declare class SkillManager {
    private static getSkillsDir;
    /**
     * Parsea un archivo o texto de SKILL.md extrayendo el YAML Frontmatter y las instrucciones
     */
    static parseSkillMarkdown(rawContent: string, defaultName?: string): SkillDefinition;
    /**
     * Instala una Skill descargándola directamente desde una URL (GitHub, Gist, web)
     */
    static installFromUrl(url: string, customName?: string): Promise<SkillDefinition>;
    /**
     * Lista todas las skills instaladas localmente
     */
    static listSkills(): SkillDefinition[];
    /**
     * Carga una skill específica por nombre
     */
    static getSkill(name: string): SkillDefinition | null;
    /**
     * Elimina una skill instalada
     */
    static uninstallSkill(name: string): boolean;
    /**
     * Genera el bloque de documentación de Skills disponibles para inyectar en el System Prompt
     */
    static buildSkillsSystemPrompt(): string;
}
