import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getSessionBasePath } from '../utils/session.js';
import { logger } from '../utils/logger.js';
export class DaemonManager {
    static getPidFile() {
        return path.join(getSessionBasePath(), 'daemon.pid');
    }
    static getLogFile() {
        return path.join(getSessionBasePath(), 'daemon.log');
    }
    static getStatus() {
        const pidFile = this.getPidFile();
        const logPath = this.getLogFile();
        if (!fs.existsSync(pidFile)) {
            return { running: false, logPath };
        }
        try {
            const pidStr = fs.readFileSync(pidFile, 'utf-8').trim();
            const pid = parseInt(pidStr, 10);
            if (isNaN(pid)) {
                return { running: false, logPath };
            }
            // Verificar si el proceso sigue vivo
            process.kill(pid, 0);
            return { running: true, pid, logPath };
        }
        catch {
            // Proceso no existe, limpiar archivo huérfano
            try {
                fs.unlinkSync(pidFile);
            }
            catch { }
            return { running: false, logPath };
        }
    }
    static startDaemon(workdir = process.cwd()) {
        const current = this.getStatus();
        if (current.running) {
            logger.warn(`El daemon de Barhel ya está corriendo (PID: ${current.pid}).`);
            return current;
        }
        const logPath = this.getLogFile();
        const logFd = fs.openSync(logPath, 'a');
        // Ubicación del script entrypoint
        const runScript = path.resolve(__dirname, '../../bin/run.js');
        const child = spawn(process.execPath, [runScript, 'telegram', '-w', workdir], {
            detached: true,
            stdio: ['ignore', logFd, logFd],
            cwd: workdir,
            windowsHide: true,
        });
        child.unref();
        if (child.pid) {
            fs.writeFileSync(this.getPidFile(), String(child.pid), 'utf-8');
            logger.success(`Daemon iniciado en segundo plano (PID: ${child.pid}).`);
            logger.info(`Logs en vivo: ${logPath}`);
            return { running: true, pid: child.pid, logPath };
        }
        throw new Error('No se pudo obtener el PID del proceso daemon.');
    }
    static stopDaemon() {
        const current = this.getStatus();
        if (!current.running || !current.pid) {
            logger.info('No hay ningún daemon de Barhel en ejecución.');
            return false;
        }
        try {
            process.kill(current.pid, 'SIGTERM');
            const pidFile = this.getPidFile();
            if (fs.existsSync(pidFile)) {
                fs.unlinkSync(pidFile);
            }
            logger.success(`Daemon detenido correctamente (PID: ${current.pid}).`);
            return true;
        }
        catch (err) {
            logger.error(`Error al detener el daemon: ${err?.message || err}`);
            return false;
        }
    }
}
//# sourceMappingURL=DaemonManager.js.map