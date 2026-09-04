import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';
import { gitStatus, gitDiff } from '../utils/git.js';

export class SnapshotManager {
  private static getSnapshotsDir(workdir: string): string {
    const dir = path.join(workdir, '.barhel', 'snapshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public static async takeSnapshot(workdir: string, sessionId: string): Promise<void> {
    try {
      // Tomamos snapshot solo de lo modificado en el working tree actualmente
      const status = await gitStatus(workdir);
      if (!status || status.includes('nothing to commit, working tree clean')) {
        return; // No hay nada sin commit, el rollback se puede hacer via git
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapName = `${sessionId}-${timestamp}`;
      const snapDir = path.join(this.getSnapshotsDir(workdir), snapName);

      // En lugar de copiar todo, guardamos un parche del diff actual
      const diff = await gitDiff(workdir);
      if (diff.trim()) {
        fs.mkdirSync(snapDir, { recursive: true });
        fs.writeFileSync(path.join(snapDir, 'changes.patch'), diff, 'utf-8');
      }

      // Cleanup: mantener solo los últimos 5
      const allSnaps = fs.readdirSync(this.getSnapshotsDir(workdir))
        .map(name => ({ name, time: fs.statSync(path.join(this.getSnapshotsDir(workdir), name)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (allSnaps.length > 5) {
        for (const snap of allSnaps.slice(5)) {
          fs.rmSync(path.join(this.getSnapshotsDir(workdir), snap.name), { recursive: true, force: true });
        }
      }
    } catch (err) {
      logger.warn(`No se pudo tomar snapshot automático: ${err}`);
    }
  }

  public static restoreSnapshot(workdir: string, sessionId: string): boolean {
    // Por simplicidad en esta fase, el rollback hace un 'git reset --hard' y 'git clean -fd'
    // ya que Barhel hace commits automaticos al terminar tareas si autoCommit está activo.
    // Esto revierte cualquier trabajo del turno actual que no haya sido commiteado.
    try {
      logger.info('Iniciando rollback del directorio de trabajo...');
      const { execSync } = require('child_process');
      execSync('git reset --hard', { cwd: workdir, stdio: 'ignore' });
      execSync('git clean -fd', { cwd: workdir, stdio: 'ignore' });
      logger.success('Rollback completado. El proyecto volvió al último commit.');
      return true;
    } catch (err) {
      logger.warn(`Fallo al hacer rollback: ${err}`);
      return false;
    }
  }
}
