import { AsyncLocalStorage } from 'node:async_hooks';
/**
 * Contexto de sesión activa basado en AsyncLocalStorage.
 *
 * Permite que módulos globales (TUI, logger) sepan a qué sesión pertenecen
 * los eventos que emiten, incluso cuando varias sesiones corren en paralelo,
 * porque el contexto se propaga automáticamente a través de la cadena async.
 */
class SessionContextImpl {
    storage = new AsyncLocalStorage();
    run(sessionId, fn) {
        return this.storage.run(sessionId, () => fn());
    }
    getCurrent() {
        return this.storage.getStore();
    }
}
export const SessionContext = new SessionContextImpl();
//# sourceMappingURL=SessionContext.js.map