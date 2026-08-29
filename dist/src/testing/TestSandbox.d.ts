export interface EvalResult {
    success: boolean;
    output: string;
    error?: string;
    exitCode?: number;
    durationMs: number;
}
export declare class TestSandbox {
    private workdir;
    private scratchDir;
    constructor(workdir?: string);
    /**
     * Ejecuta un fragmento de código de prueba en un sandbox aislado
     */
    evalCode(code: string, language?: string): Promise<EvalResult>;
    /**
     * Ejecuta el runner de pruebas del proyecto (Vitest, Jest, PyTest, Node Test Runner, PHPUnit)
     */
    runProjectTests(targetFile?: string): Promise<EvalResult>;
}
