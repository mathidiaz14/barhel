import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Lee la versión desde package.json buscando hacia arriba desde el archivo
 * compilado (dist/) o desde el fuente (src/bin para tsx).
 */
export function getBarhelVersion() {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, 'package.json');
        try {
            if (fs.existsSync(candidate)) {
                const pkg = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
                if (pkg.version)
                    return String(pkg.version);
            }
        }
        catch {
            // Continuar buscando
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return '0.0.0';
}
//# sourceMappingURL=version.js.map