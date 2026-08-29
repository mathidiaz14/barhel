export interface CodeSymbol {
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method';
    file: string;
    line: number;
    params?: string[];
    doc?: string;
    calls?: string[];
}
export interface FileNode {
    path: string;
    hash: string;
    size: number;
    imports: string[];
    exports: string[];
    symbols: CodeSymbol[];
}
export interface CodeGraphData {
    version: number;
    workdir: string;
    updatedAt: string;
    files: Record<string, FileNode>;
    symbols: Record<string, CodeSymbol[]>;
    callGraph: Record<string, string[]>;
    callerGraph: Record<string, string[]>;
}
export declare class CodeGraphEngine {
    private workdir;
    private cachePath;
    private graph;
    private isLoaded;
    private static readonly IGNORED_DIRS;
    private static readonly SUPPORTED_EXTENSIONS;
    constructor(workdir?: string);
    /**
     * Carga el grafo desde disco o realiza un escaneo completo inicial
     */
    ensureLoaded(forceRescan?: boolean): Promise<CodeGraphData>;
    /**
     * Escanea todo el repositorio e indexa símbolos y dependencias
     */
    scan(): Promise<CodeGraphData>;
    /**
     * Parsea un archivo individual extrayendo símbolos, imports, exports y llamadas
     */
    private parseFile;
    /**
     * Extrae llamadas a funciones potenciales dentro de un bloque de código
     */
    private extractCalls;
    /**
     * Busca archivos recursivamente respetando exclusiones
     */
    private collectSourceFiles;
    private saveCache;
    /**
     * CONSULTAS DE GRAFO
     */
    /**
     * Busca cualquier símbolo por nombre exacto o parcial
     */
    search(query: string): CodeSymbol[];
    /**
     * Obtiene la lista de quién llama a este símbolo (Callers)
     */
    getCallers(symbolName: string): string[];
    /**
     * Obtiene la lista de qué símbolos son llamados por este símbolo (Callees)
     */
    getCallees(symbolName: string): string[];
    /**
     * Resumen ejecutivo del mapa de arquitectura del repositorio
     */
    getHierarchy(): string;
    /**
     * Información completa de un símbolo para el agente
     */
    inspectSymbol(symbolName: string): string;
}
