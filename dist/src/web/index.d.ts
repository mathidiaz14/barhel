import { WebServer } from './WebServer.js';
/**
 * Entrypoint del servidor web de Barhel.
 */
export declare function startWebServer(options?: {
    port?: number;
    workdir?: string;
}): Promise<WebServer>;
