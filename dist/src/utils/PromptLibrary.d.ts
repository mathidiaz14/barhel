export interface SavedPrompt {
    name: string;
    text: string;
    addedAt: string;
}
export declare class PromptLibrary {
    private static getLibraryFilePath;
    static list(workdir: string): SavedPrompt[];
    static save(workdir: string, name: string, text: string): void;
    static get(workdir: string, name: string): SavedPrompt | null;
    static remove(workdir: string, name: string): boolean;
    static exportAll(workdir: string): string;
}
