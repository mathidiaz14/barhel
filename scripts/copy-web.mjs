import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const src = resolve(__dirname, '../src/web/public');
const dest = resolve(__dirname, '../dist/src/web/public');

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });

console.log('📦 Estáticos web copiados →', dest);
