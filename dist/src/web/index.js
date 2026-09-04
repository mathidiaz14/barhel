import path from 'node:path';
import { WebServer } from './WebServer.js';
/**
 * Entrypoint del servidor web de Barhel.
 */
export async function startWebServer(options = {}) {
    const workdir = options.workdir || process.cwd();
    const server = new WebServer({ port: options.port, workdir: path.resolve(workdir) });
    await server.start();
    return server;
}
//# sourceMappingURL=index.js.map