export declare class ContextManager {
    private static getContextFile;
    static addFile(workdir: string, relPath: string): boolean;
    static removeFile(workdir: string, relPath: string): boolean;
    static list(workdir: string): string[];
    static getContextString(workdir: string): string;
}
