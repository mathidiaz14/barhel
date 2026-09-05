import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';
export class FileWatcher {
    watcher = null;
    isWatching = false;
    watchDir = '';
    debounceMap = new Map();
    // Extensiones relevantes para evitar ruidos
    allowedExtensions = new Set(['.ts', '.js', '.py', '.json', '.go', '.rs', '.java', '.php']);
    start(workdir, onEvent) {
        if (this.isWatching)
            return;
        this.watchDir = workdir;
        try {
            // Usamos el watcher nativo recursivo (soportado en OS X y Windows, linux requiere polling pero por simplicidad usamos fs.watch)
            this.watcher = fs.watch(workdir, { recursive: true }, (eventType, filename) => {
                if (!filename)
                    return;
                // Ignorar cambios en git, node_modules, .barhel, etc.
                if (filename.includes('.git') || filename.includes('node_modules') || filename.includes('.barhel')) {
                    return;
                }
                const ext = path.extname(filename).toLowerCase();
                if (!this.allowedExtensions.has(ext)) {
                    return;
                }
                // Debounce para evitar triggers múltiples
                if (this.debounceMap.has(filename)) {
                    clearTimeout(this.debounceMap.get(filename));
                }
                const timer = setTimeout(() => {
                    this.debounceMap.delete(filename);
                    // Por simplicidad reportamos 'changed', en un watcher más avanzado revisaríamos si el archivo existe
                    onEvent('changed', filename);
                }, 800);
                this.debounceMap.set(filename, timer);
            });
            this.isWatching = true;
            logger.success('File Watcher activado: observando cambios de código.');
        }
        catch (err) {
            logger.error(`No se pudo iniciar fs.watch en ${workdir}`, err);
        }
    }
    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        this.isWatching = false;
        for (const timer of this.debounceMap.values()) {
            clearTimeout(timer);
        }
        this.debounceMap.clear();
        logger.info('File Watcher detenido.');
    }
    get isRunning() {
        return this.isWatching;
    }
}
//# sourceMappingURL=FileWatcher.js.map