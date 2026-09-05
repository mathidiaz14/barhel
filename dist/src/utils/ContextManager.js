import fs from 'node:fs';
import path from 'node:path';
export class ContextManager {
    static getContextFile(workdir) {
        const dir = path.join(workdir, '.barhel');
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        return path.join(dir, 'context.json');
    }
    static addFile(workdir, relPath) {
        try {
            const files = this.list(workdir);
            if (!files.includes(relPath)) {
                files.push(relPath);
                fs.writeFileSync(this.getContextFile(workdir), JSON.stringify(files, null, 2));
            }
            return true;
        }
        catch {
            return false;
        }
    }
    static removeFile(workdir, relPath) {
        try {
            const files = this.list(workdir);
            const filtered = files.filter(f => f !== relPath);
            fs.writeFileSync(this.getContextFile(workdir), JSON.stringify(filtered, null, 2));
            return true;
        }
        catch {
            return false;
        }
    }
    static list(workdir) {
        try {
            const p = this.getContextFile(workdir);
            if (!fs.existsSync(p))
                return [];
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
            return Array.isArray(data) ? data : [];
        }
        catch {
            return [];
        }
    }
    static getContextString(workdir) {
        const files = this.list(workdir);
        if (files.length === 0)
            return '';
        let ctx = '--- CONTEXTO FIJO ADJUNTO ---\n';
        for (const file of files) {
            try {
                const full = path.join(workdir, file);
                if (fs.existsSync(full)) {
                    const content = fs.readFileSync(full, 'utf-8');
                    ctx += `\nArchivo: ${file}\n${content}\n`;
                }
            }
            catch (err) {
                ctx += `\nArchivo: ${file} (No se pudo leer)\n`;
            }
        }
        return ctx + '\n-----------------------------';
    }
}
//# sourceMappingURL=ContextManager.js.map