import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { ToolEngine } from '../src/engine/ToolEngine.js';
import { Orchestrator } from '../src/engine/Orchestrator.js';
import { SessionManager } from '../src/web/SessionManager.js';

test('ToolEngine: cambia workdir y actualiza la ruta resuelta', () => {
  const engine = new ToolEngine(process.cwd());
  const initial = engine.getWorkdir();

  const tmpDir = os.tmpdir();
  engine.setWorkdir(tmpDir);

  assert.equal(engine.getWorkdir(), path.resolve(tmpDir));
  assert.notEqual(engine.getWorkdir(), initial);
});

test('ToolEngine: rechaza directorio inexistente', () => {
  const engine = new ToolEngine(process.cwd());
  assert.throws(() => {
    engine.setWorkdir('/directorio/que/definitivamente/no/existe/12345');
  }, /no existe/);
});

test('SessionManager: cambia workdir para una sesión activa', async () => {
  const sm = new SessionManager();
  const res = await sm.createSession({ workdir: process.cwd() });
  assert.ok(res.sessionId);

  const tmpDir = os.tmpdir();
  const changeRes = sm.changeWorkdir(res.sessionId, tmpDir);

  assert.ok(changeRes.ok);
  assert.equal(changeRes.workdir, path.resolve(tmpDir));

  const orch = sm.getSession(res.sessionId);
  assert.equal(orch?.getWorkdir(), path.resolve(tmpDir));

  await sm.shutdownAll();
});
