import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getSessionBasePath } from '../utils/session.js';
import { logger } from '../utils/logger.js';

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: number;
  logPath: string;
}

export interface WebDaemonStatus {
  running: boolean;
  pid?: number;
  port?: number;
  logPath: string;
}

export class DaemonManager {
  private static getPidFile(): string {
    return path.join(getSessionBasePath(), 'daemon.pid');
  }

  private static getLogFile(): string {
    return path.join(getSessionBasePath(), 'daemon.log');
  }

  private static getWebPidFile(): string {
    return path.join(getSessionBasePath(), 'web-server.json');
  }

  private static getWebLogFile(): string {
    return path.join(getSessionBasePath(), 'web-server.log');
  }

  public static getStatus(): DaemonStatus {
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
    } catch {
      // Proceso no existe, limpiar archivo huérfano
      try {
        fs.unlinkSync(pidFile);
      } catch {}
      return { running: false, logPath };
    }
  }

  public static startDaemon(workdir: string = process.cwd()): DaemonStatus {
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

  public static stopDaemon(): boolean {
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
    } catch (err: any) {
      logger.error(`Error al detener el daemon: ${err?.message || err}`);
      return false;
    }
  }

  public static getWebStatus(): WebDaemonStatus {
    const pidFile = this.getWebPidFile();
    const logPath = this.getWebLogFile();

    if (!fs.existsSync(pidFile)) {
      return { running: false, logPath };
    }

    try {
      const data = JSON.parse(fs.readFileSync(pidFile, 'utf-8'));
      const pid = parseInt(data.pid, 10);
      const port = parseInt(data.port, 10) || 7898;
      if (isNaN(pid)) {
        return { running: false, logPath };
      }

      process.kill(pid, 0);
      return { running: true, pid, port, logPath };
    } catch {
      try {
        fs.unlinkSync(pidFile);
      } catch {}
      return { running: false, logPath };
    }
  }

  public static startWebDaemon(port: number = 7898, workdir: string = process.cwd()): WebDaemonStatus {
    const current = this.getWebStatus();
    if (current.running) {
      logger.warn(`El servidor web de Barhel ya está corriendo en segundo plano (PID: ${current.pid}, Puerto: ${current.port}).`);
      return current;
    }

    const logPath = this.getWebLogFile();
    const logFd = fs.openSync(logPath, 'a');

    let execPath = process.execPath;
    let spawnArgs: string[] = [];

    const mainScript = process.argv[1] || path.resolve(__dirname, '../../bin/run.js');

    if (mainScript.endsWith('.ts')) {
      spawnArgs = ['--import', 'tsx', mainScript, 'web', 'serveInternal', '-p', String(port), '-w', workdir];
    } else {
      spawnArgs = [mainScript, 'web', 'serveInternal', '-p', String(port), '-w', workdir];
    }

    const child = spawn(execPath, spawnArgs, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: workdir,
      windowsHide: true,
    });

    child.unref();

    if (child.pid) {
      const pidData = { pid: child.pid, port, startedAt: new Date().toISOString() };
      fs.writeFileSync(this.getWebPidFile(), JSON.stringify(pidData, null, 2), 'utf-8');
      logger.success(`Servidor web iniciado en segundo plano (PID: ${child.pid}, Puerto: ${port}).`);
      logger.info(`Logs en vivo: ${logPath}`);
      return { running: true, pid: child.pid, port, logPath };
    }

    throw new Error('No se pudo obtener el PID del servidor web daemon.');
  }

  public static stopWebDaemon(): boolean {
    const current = this.getWebStatus();
    if (!current.running || !current.pid) {
      logger.info('No hay ningún servidor web de Barhel en ejecución en segundo plano.');
      return false;
    }

    try {
      process.kill(current.pid, 'SIGTERM');
      const pidFile = this.getWebPidFile();
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }
      logger.success(`Servidor web en segundo plano detenido correctamente (PID: ${current.pid}).`);
      return true;
    } catch (err: any) {
      logger.error(`Error al detener el servidor web: ${err?.message || err}`);
      return false;
    }
  }
}
