import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolEngine } from '../src/engine/ToolEngine.js';

function makeWorkdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'barhel-test-'));
}

test('crea archivos dentro del workspace respeando directorios anidados', async () => {
  const wd = makeWorkdir();
  try {
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'write_file', path: 'src/foo.ts', content: 'export {}' });
    assert.equal(res.success, true);
    assert.ok(fs.existsSync(path.join(wd, 'src', 'foo.ts')));
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('lee archivos válidos dentro del workspace', async () => {
  const wd = makeWorkdir();
  try {
    fs.writeFileSync(path.join(wd, 'app.txt'), 'hola');
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'read_file', path: 'app.txt' });
    assert.equal(res.success, true);
    assert.equal(res.output.trim(), 'hola');
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('bloquea path traversal en read_file', async () => {
  const wd = makeWorkdir();
  const outside = path.join(os.tmpdir(), 'barhel-outside.txt');
  fs.writeFileSync(outside, 'secreto');
  try {
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'read_file', path: '../barhel-outside.txt' });
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /workspace/i);
  } finally {
    fs.rmSync(outside, { force: true });
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('bloquea path traversal en write_file (ruta absoluta y ..)', async () => {
  const wd = makeWorkdir();
  const evilOutside = path.join(os.tmpdir(), 'barhel-evil.txt');
  try {
    const engine = new ToolEngine(wd, true);
    const rel = await engine.execute({ type: 'write_file', path: '..\\barhel-evil.txt', content: 'x' });
    assert.equal(rel.success, false);
    const abs = await engine.execute({ type: 'write_file', path: evilOutside, content: 'x' });
    assert.equal(abs.success, false);
    assert.ok(!fs.existsSync(evilOutside));
  } finally {
    fs.rmSync(evilOutside, { force: true });
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('bloquea escape via junction/symlink', async (t) => {
  const wd = makeWorkdir();
  const linkPath = path.join(wd, 'escape');
  try {
    try {
      fs.symlinkSync(os.tmpdir(), linkPath, 'junction');
    } catch {
      t.skip('No se pueden crear symlinks/junctions en este sistema');
      return;
    }
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'list_directory', path: 'escape' });
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /symlink|workspace/i);
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('grep encuentra coincidencias y respeta el workspace', async () => {
  const wd = makeWorkdir();
  try {
    fs.mkdirSync(path.join(wd, 'src'));
    fs.writeFileSync(path.join(wd, 'src', 'app.ts'), 'export const total = 42;\n// TODO comentario');
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'grep', pattern: 'TODO' });
    assert.equal(res.success, true);
    assert.match(res.output, /app\.ts:2/);
    const noMatch = await engine.execute({ type: 'grep', pattern: 'noexiste_xyz' });
    assert.equal(noMatch.success, true);
    assert.match(noMatch.output, /Sin coincidencias/);
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('grep con patrón inválido devuelve error controlado', async () => {
  const wd = makeWorkdir();
  try {
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'grep', pattern: '([a-z' });
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /Regex|regex/i);
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('glob lista archivos por patrón dentro del workspace', async () => {
  const wd = makeWorkdir();
  try {
    fs.mkdirSync(path.join(wd, 'src'));
    fs.writeFileSync(path.join(wd, 'src', 'a.ts'), '');
    fs.writeFileSync(path.join(wd, 'src', 'b.ts'), '');
    fs.writeFileSync(path.join(wd, 'src', 'c.js'), '');
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'glob', pattern: 'src/*.ts' });
    assert.equal(res.success, true);
    assert.match(res.output, /a\.ts/);
    assert.match(res.output, /b\.ts/);
    assert.ok(!res.output.includes('c.js'));
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('glob impide escapes fuera del workspace', async () => {
  const wd = makeWorkdir();
  try {
    fs.writeFileSync(path.join(wd, 'f.txt'), '');
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'glob', pattern: '../barhel-*' });
    assert.equal(res.success, true);
    assert.ok(!/\n\.\./.test(`\n${res.output}`), 'ninguna línea de resultados debe escapar con ".."');
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('check falla de forma controlada si no hay package.json', async () => {
  const wd = makeWorkdir();
  try {
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'check' });
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /package\.json/i);
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('planOnly simula write_file y run_command sin efectos reales', async () => {
  const wd = makeWorkdir();
  try {
    const engine = new ToolEngine(wd, true);
    engine.setPlanOnly(true);
    const write = await engine.execute({ type: 'write_file', path: 'a.txt', content: 'contenido' });
    assert.ok(write.output.startsWith('[PLAN]'));
    assert.ok(!fs.existsSync(path.join(wd, 'a.txt')));
    const run = await engine.execute({ type: 'run_command', command: 'npm version' });
    assert.ok(run.output.startsWith('[PLAN]'));
    engine.setPlanOnly(false);
    const real = await engine.execute({ type: 'write_file', path: 'b.txt', content: 'x' });
    assert.equal(real.success, true);
    assert.ok(fs.existsSync(path.join(wd, 'b.txt')));
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('denylist bloquea comandos peligrosos incluso en modo autónomo', async () => {
  const wd = makeWorkdir();
  try {
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'run_command', command: 'rm -rf src' });
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /denegado|política|bloqueado/i);
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('allowlist ejecuta sin confirmación en modo seguro', async () => {
  const wd = makeWorkdir();
  try {
    const engine = new ToolEngine(wd, false, { allow: ['^npm version$'] });
    const res = await engine.execute({ type: 'run_command', command: 'npm version' });
    assert.equal(res.success, true);
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});

test('overwrite con diff preview: contenido nuevo aplicado en modo autónomo', async () => {
  const wd = makeWorkdir();
  try {
    fs.writeFileSync(path.join(wd, 'a.txt'), 'linea vieja');
    const engine = new ToolEngine(wd, true);
    const res = await engine.execute({ type: 'write_file', path: 'a.txt', content: 'linea nueva' });
    assert.equal(res.success, true);
    assert.equal(fs.readFileSync(path.join(wd, 'a.txt'), 'utf-8'), 'linea nueva');
  } finally {
    fs.rmSync(wd, { recursive: true, force: true });
  }
});