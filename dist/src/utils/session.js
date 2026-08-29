import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { ProviderType } from '../types/providers.js';
const SESSIONS_BASE_DIR = path.join(os.homedir(), '.dev-agent-sessions');
export function getSessionBasePath() {
    if (!fs.existsSync(SESSIONS_BASE_DIR)) {
        fs.mkdirSync(SESSIONS_BASE_DIR, { recursive: true });
    }
    return SESSIONS_BASE_DIR;
}
export function getProviderSessionPath(provider) {
    const base = getSessionBasePath();
    const providerPath = path.join(base, provider.toLowerCase());
    if (!fs.existsSync(providerPath)) {
        fs.mkdirSync(providerPath, { recursive: true });
    }
    return providerPath;
}
export function listSessionsStatus() {
    const providers = Object.values(ProviderType);
    const result = {};
    for (const provider of providers) {
        const pPath = getProviderSessionPath(provider);
        let count = 0;
        try {
            if (fs.existsSync(pPath)) {
                count = fs.readdirSync(pPath).length;
            }
        }
        catch {
            count = 0;
        }
        result[provider] = {
            path: pPath,
            exists: count > 0,
            fileCount: count,
        };
    }
    return result;
}
//# sourceMappingURL=session.js.map