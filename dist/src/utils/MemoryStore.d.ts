export interface MemoryEntry {
    fact: string;
    addedAt: string;
}
export declare class MemoryStore {
    private static getMemoryFilePath;
    static list(workdir: string): MemoryEntry[];
    static add(workdir: string, fact: string): void;
    static remove(workdir: string, index: number): boolean;
    static clear(workdir: string): void;
    static getContextBlock(workdir: string): string;
}
