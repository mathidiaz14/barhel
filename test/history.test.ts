import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'barhel-history-'));
process.env.BARHEL_HISTORY_DIR = tmpDir;

const { HistoryManager } = await import('../src/utils/history.js');
const { isEncryptionEnabled } = await import('../src/utils/crypto.js');

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.BARHEL_HISTORY_DIR;
  delete process.env.BARHEL_SECRET;
});

test('crea, lee, lista y exporta sesiones', () => {
  const session = HistoryManager.createSession({
    workdir: 'C:\\proyecto',
    leader: 'deepseek',
    workers: ['chatgpt', 'gemini'],
    title: 'Implementar login',
    chatUrl: 'https://chat.deepseek.com/a/xxx',
  });

  session.turns = [
    { prompt: 'Haz X', actionType: 'write_file', summary: 'Creé archivo a.ts', timestamp: new Date().toISOString() },
    { prompt: 'Verifica', actionType: 'run_command', summary: 'Test OK', timestamp: new Date().toISOString() },
  ];
  session.summary = 'Resumen de memoria previo';
  session.lastSummarizedTurnIndex = 2;
  HistoryManager.saveSession(session);

  const loaded = HistoryManager.getSession(session.id);
  assert.ok(loaded);
  assert.equal(loaded.title, 'Implementar login');
  assert.equal(loaded.turns.length, 2);
  assert.equal(loaded.summary, 'Resumen de memoria previo');

  const all = HistoryManager.listSessions();
  assert.ok(all.some((s) => s.id === session.id));

  const md = HistoryManager.sessionToMarkdown(session);
  assert.match(md, /# Sesión Barhel: Implementar login/);
  assert.match(md, /## Resumen de memoria/);
  assert.match(md, /### Turno 1/);
});

test('con BARHEL_SECRET guarda cifrado y elimina el .json en claro', () => {
  process.env.BARHEL_SECRET = 'secret-para-test-de-historia';
  const session = HistoryManager.createSession({ leader: 'gemini', workers: [] });
  HistoryManager.saveSession(session);

  const encPath = path.join(tmpDir, `${session.id}.json.enc`);
  const plainPath = path.join(tmpDir, `${session.id}.json`);
  assert.ok(fs.existsSync(encPath), 'debe existir archivo .enc');
  assert.ok(!fs.existsSync(plainPath), 'no debe quedar archivo en claro');
  assert.match(fs.readFileSync(encPath, 'utf-8'), /\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/, 'formato cifrado');

  const loaded = HistoryManager.getSession(session.id);
  assert.ok(loaded);

  assert.equal(HistoryManager.hasEncryptedSessions(), true);

  process.env.BARHEL_SECRET = 'otro-secret-distinto';
  const withoutKey = HistoryManager.getSession(session.id);
  assert.equal(withoutKey, null, 'no debe poder leerse con la clave equivocada');
});