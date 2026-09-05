import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
export class PromptLibrary {
    static getLibraryFilePath(workdir) {
        const barhelDir = path.join(workdir, '.barhel');
        if (!fs.existsSync(barhelDir)) {
            fs.mkdirSync(barhelDir, { recursive: true });
        }
        return path.join(barhelDir, 'prompts.json');
    }
    static list(workdir) {
        const libFile = this.getLibraryFilePath(workdir);
        if (!fs.existsSync(libFile)) {
            return [];
        }
        try {
            const content = fs.readFileSync(libFile, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return [];
        }
    }
    static save(workdir, name, text) {
        const entries = this.list(workdir);
        const existingIndex = entries.findIndex(e => e.name.toLowerCase() === name.toLowerCase());
        if (existingIndex >= 0) {
            entries[existingIndex].text = text;
            entries[existingIndex].addedAt = new Date().toISOString();
        }
        else {
            entries.push({ name, text, addedAt: new Date().toISOString() });
        }
        fs.writeFileSync(this.getLibraryFilePath(workdir), JSON.stringify(entries, null, 2), 'utf-8');
        logger.success(`Prompt "${name}" guardado exitosamente.`);
    }
    static get(workdir, name) {
        const entries = this.list(workdir);
        return entries.find(e => e.name.toLowerCase() === name.toLowerCase()) || null;
    }
    static remove(workdir, name) {
        const entries = this.list(workdir);
        const index = entries.findIndex(e => e.name.toLowerCase() === name.toLowerCase());
        if (index >= 0) {
            entries.splice(index, 1);
            fs.writeFileSync(this.getLibraryFilePath(workdir), JSON.stringify(entries, null, 2), 'utf-8');
            return true;
        }
        return false;
    }
    static exportAll(workdir) {
        const entries = this.list(workdir);
        return JSON.stringify(entries, null, 2);
    }
}
//# sourceMappingURL=PromptLibrary.js.map