import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TestSandbox } from '../src/testing/TestSandbox.js';

test('TestSandbox: evalúa código TypeScript en sandbox aislado exitosamente', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'barhel-sandbox-test-'));
  try {
    const sandbox = new TestSandbox(tempDir);

    const testSnippet = `
function add(a: number, b: number): number {
  return a + b;
}

if (add(2, 3) !== 5) {
  throw new Error('Suma incorrecta');
}
console.log('Todos los assertions pasaron');
`;

    const result = await sandbox.evalCode(testSnippet, 'typescript');
    assert.equal(result.success, true);
    assert.ok(result.output.includes('Todos los assertions pasaron'));
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test('TestSandbox: captura errores y excepciones en código con assertion fallido', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'barhel-sandbox-test-'));
  try {
    const sandbox = new TestSandbox(tempDir);

    const failingSnippet = `
throw new Error('Assertion fallido: el resultado esperado no coincide');
`;

    const result = await sandbox.evalCode(failingSnippet, 'typescript');
    assert.equal(result.success, false);
    assert.ok(result.output.includes('Assertion fallido'));
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});
