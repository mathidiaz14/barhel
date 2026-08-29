import test from 'node:test';
import assert from 'node:assert/strict';
import { ResponseParser } from '../src/engine/ResponseParser.js';

test('parsea un bloque JSON en markdown', () => {
  const raw = '```json\n{"thought":"ok","action":{"type":"run_command","command":"ls"}}\n```';
  const res = ResponseParser.parse(raw);
  assert.equal(res.success, true);
  assert.equal(res.data?.action.type, 'run_command');
  assert.equal(res.data?.thought, 'ok');
});

test('parsea JSON crudo con rutas Windows sin escapar', () => {
  const raw =
    '{"thought": "lee el archivo", "action": {"type": "read_file", "path": "src\\\\engine\\\\ToolEngine.ts"}}';
  const res = ResponseParser.parse(raw);
  assert.equal(res.success, true);
  assert.equal(res.data?.action.type, 'read_file');
  assert.equal(res.data?.action.path, 'src\\engine\\ToolEngine.ts');
});

test('rechaza respuestas vacías', () => {
  const res = ResponseParser.parse('');
  assert.equal(res.success, false);
  assert.ok(res.correctionPrompt, 'debe ofrecer prompt de autocorrección');
});

test('valida acciones desconocidas', () => {
  const raw = '{"thought":"x","action":{"type":"hack"}}';
  const res = ResponseParser.parse(raw);
  assert.equal(res.success, false);
  assert.match(res.error ?? '', /no reconocido/);
});

test('repara comas finales sin corromper escapes legitimos (\\n)', () => {
  const raw = '{"thought":"a\\nb","action":{"type":"finish","summary":"listo",},}';
  const res = ResponseParser.parse(raw);
  assert.equal(res.success, true);
  assert.equal(res.data?.thought, 'a\nb');
  assert.equal(res.data?.action.summary, 'listo');
});

test('no corrompe secuencias \\uXXXX en el camino de reparación', () => {
  const raw = '{"thought":"x\\u0041\\u0042","action":{"type":"finish","summary":"s",},}';
  const res = ResponseParser.parse(raw);
  assert.equal(res.success, true);
  assert.equal(res.data?.thought, 'xAB');
});

test('repara rutas Windows con backslashes dentro de JSON malformado', () => {
  const raw =
    '{"thought":"lee","action":{"type":"read_file","path":"src\\\\engine\\\\ToolEngine.ts",},}';
  const res = ResponseParser.parse(raw);
  assert.equal(res.success, true);
  assert.equal(res.data?.action.path, 'src\\engine\\ToolEngine.ts');
});

test('valida grep obliga a pattern', () => {
  const ok = ResponseParser.parse('{"thought":"x","action":{"type":"grep","pattern":"TODO"}}');
  assert.equal(ok.success, true);
  const bad = ResponseParser.parse('{"thought":"x","action":{"type":"grep","path":"src"}}');
  assert.equal(bad.success, false);
  assert.match(bad.error ?? '', /pattern/i);
});

test('valida glob obliga a pattern', () => {
  const ok = ResponseParser.parse('{"thought":"x","action":{"type":"glob","pattern":"**/*.ts"}}');
  assert.equal(ok.success, true);
  const bad = ResponseParser.parse('{"thought":"x","action":{"type":"glob"}}');
  assert.equal(bad.success, false);
});

test('valida check sin campos requeridos', () => {
  const res = ResponseParser.parse('{"thought":"x","action":{"type":"check"}}');
  assert.equal(res.success, true);
});

test('valida delegate_batch con tasks array', () => {
  const ok = ResponseParser.parse(
    '{"thought":"x","action":{"type":"delegate_batch","tasks":[{"agent":"chatgpt","prompt":"busca"},{"agent":"gemini","prompt":"analiza"}]}}'
  );
  assert.equal(ok.success, true);
  assert.equal(ok.data?.action.tasks?.length, 2);

  const empty = ResponseParser.parse('{"thought":"x","action":{"type":"delegate_batch","tasks":[]}}');
  assert.equal(empty.success, false);
  assert.match(empty.error ?? '', /tasks/i);

  const noAgent = ResponseParser.parse('{"thought":"x","action":{"type":"delegate_batch","tasks":[{"prompt":"sin agent"}]}}');
  assert.equal(noAgent.success, false);
  assert.match(noAgent.error ?? '', /agent/i);
});