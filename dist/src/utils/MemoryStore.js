import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
export class MemoryStore {
    static getMemoryFilePath(workdir) {
        const barhelDir = path.join(workdir, '.barhel');
        if (!fs.existsSync(barhelDir)) {
            fs.mkdirSync(barhelDir, { recursive: true });
        }
        return path.join(barhelDir, 'memory.json');
    }
    static list(workdir) {
        const memoryFile = this.getMemoryFilePath(workdir);
        if (!fs.existsSync(memoryFile)) {
            return [];
        }
        try {
            const content = fs.readFileSync(memoryFile, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return [];
        }
    }
    static add(workdir, fact) {
        const entries = this.list(workdir);
        entries.push({ fact, addedAt: new Date().toISOString() });
        fs.writeFileSync(this.getMemoryFilePath(workdir), JSON.stringify(entries, null, 2), 'utf-8');
        logger.success(`Hecho agregado a la memoria persistente del proyecto.`);
    }
    static remove(workdir, index) {
        const entries = this.list(workdir);
        if (index >= 0 && index < entries.length) {
            entries.splice(index, 1);
            fs.writeFileSync(this.getMemoryFilePath(workdir), JSON.stringify(entries, null, 2), 'utf-8');
            return true;
        }
        return false;
    }
    static clear(workdir) {
        const memoryFile = this.getMemoryFilePath(workdir);
        if (fs.existsSync(memoryFile)) {
            fs.unlinkSync(memoryFile);
        }
    }
    static getContextBlock(workdir) {
        const entries = this.list(workdir);
        if (entries.length === 0)
            return '';
        const lines = entries.map((e, idx) => `${idx + 1}. ${e.fact}`);
        return `\n🧠 MEMORIA SEMÁNTICA PERSISTENTE DEL PROYECTO:\n${lines.join('\n')}\n`;
    }
}
//# sourceMappingURL=MemoryStore.js.map