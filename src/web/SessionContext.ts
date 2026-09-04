import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de sesión activa basado en AsyncLocalStorage.
 *
 * Permite que módulos globales (TUI, logger) sepan a qué sesión pertenecen
 * los eventos que emiten, incluso cuando varias sesiones corren en paralelo,
 * porque el contexto se propaga automáticamente a través de la cadena async.
 */
class SessionContextImpl {
  private storage = new AsyncLocalStorage<string>();

  public run<T>(sessionId: string, fn: () => T | Promise<T>): T | Promise<T> {
    return this.storage.run(sessionId, () => fn());
  }

  public getCurrent(): string | undefined {
    return this.storage.getStore();
  }
}

export const SessionContext = new SessionContextImpl();
