import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

export interface SavedPrompt {
  name: string;
  text: string;
  addedAt: string;
}

export class PromptLibrary {
  private static getLibraryFilePath(workdir: string): string {
    const barhelDir = path.join(workdir, '.barhel');
    if (!fs.existsSync(barhelDir)) {
      fs.mkdirSync(barhelDir, { recursive: true });
    }
    return path.join(barhelDir, 'prompts.json');
  }

  public static list(workdir: string): SavedPrompt[] {
    const libFile = this.getLibraryFilePath(workdir);
    if (!fs.existsSync(libFile)) {
      return [];
    }
    try {
      const content = fs.readFileSync(libFile, 'utf-8');
      return JSON.parse(content) as SavedPrompt[];
    } catch {
      return [];
    }
  }

  public static save(workdir: string, name: string, text: string): void {
    const entries = this.list(workdir);
    const existingIndex = entries.findIndex(e => e.name.toLowerCase() === name.toLowerCase());
    if (existingIndex >= 0) {
      entries[existingIndex].text = text;
      entries[existingIndex].addedAt = new Date().toISOString();
    } else {
      entries.push({ name, text, addedAt: new Date().toISOString() });
    }
    fs.writeFileSync(this.getLibraryFilePath(workdir), JSON.stringify(entries, null, 2), 'utf-8');
    logger.success(`Prompt "${name}" guardado exitosamente.`);
  }

  public static get(workdir: string, name: string): SavedPrompt | null {
    const entries = this.list(workdir);
    return entries.find(e => e.name.toLowerCase() === name.toLowerCase()) || null;
  }

  public static remove(workdir: string, name: string): boolean {
    const entries = this.list(workdir);
    const index = entries.findIndex(e => e.name.toLowerCase() === name.toLowerCase());
    if (index >= 0) {
      entries.splice(index, 1);
      fs.writeFileSync(this.getLibraryFilePath(workdir), JSON.stringify(entries, null, 2), 'utf-8');
      return true;
    }
    return false;
  }

  public static exportAll(workdir: string): string {
    const entries = this.list(workdir);
    return JSON.stringify(entries, null, 2);
  }
}
