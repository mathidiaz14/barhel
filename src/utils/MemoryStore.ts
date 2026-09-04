import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

export interface MemoryEntry {
  fact: string;
  addedAt: string;
}

export class MemoryStore {
  private static getMemoryFilePath(workdir: string): string {
    const barhelDir = path.join(workdir, '.barhel');
    if (!fs.existsSync(barhelDir)) {
      fs.mkdirSync(barhelDir, { recursive: true });
    }
    return path.join(barhelDir, 'memory.json');
  }

  public static list(workdir: string): MemoryEntry[] {
    const memoryFile = this.getMemoryFilePath(workdir);
    if (!fs.existsSync(memoryFile)) {
      return [];
    }
    try {
      const content = fs.readFileSync(memoryFile, 'utf-8');
      return JSON.parse(content) as MemoryEntry[];
    } catch {
      return [];
    }
  }

  public static add(workdir: string, fact: string): void {
    const entries = this.list(workdir);
    entries.push({ fact, addedAt: new Date().toISOString() });
    fs.writeFileSync(this.getMemoryFilePath(workdir), JSON.stringify(entries, null, 2), 'utf-8');
    logger.success(`Hecho agregado a la memoria persistente del proyecto.`);
  }

  public static remove(workdir: string, index: number): boolean {
    const entries = this.list(workdir);
    if (index >= 0 && index < entries.length) {
      entries.splice(index, 1);
      fs.writeFileSync(this.getMemoryFilePath(workdir), JSON.stringify(entries, null, 2), 'utf-8');
      return true;
    }
    return false;
  }

  public static clear(workdir: string): void {
    const memoryFile = this.getMemoryFilePath(workdir);
    if (fs.existsSync(memoryFile)) {
      fs.unlinkSync(memoryFile);
    }
  }

  public static getContextBlock(workdir: string): string {
    const entries = this.list(workdir);
    if (entries.length === 0) return '';
    const lines = entries.map((e, idx) => `${idx + 1}. ${e.fact}`);
    return `\n🧠 MEMORIA SEMÁNTICA PERSISTENTE DEL PROYECTO:\n${lines.join('\n')}\n`;
  }
}
