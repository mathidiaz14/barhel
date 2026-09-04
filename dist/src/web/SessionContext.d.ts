/**
 * Contexto de sesión activa basado en AsyncLocalStorage.
 *
 * Permite que módulos globales (TUI, logger) sepan a qué sesión pertenecen
 * los eventos que emiten, incluso cuando varias sesiones corren en paralelo,
 * porque el contexto se propaga automáticamente a través de la cadena async.
 */
declare class SessionContextImpl {
    private storage;
    run<T>(sessionId: string, fn: () => T | Promise<T>): T | Promise<T>;
    getCurrent(): string | undefined;
}
export declare const SessionContext: SessionContextImpl;
export {};
