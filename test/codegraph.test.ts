import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodeGraphEngine } from '../src/codegraph/CodeGraphEngine.js';

test('CodeGraphEngine: escanea e indexa clases, funciones y llamadas en TypeScript', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'barhel-codegraph-test-'));
  try {
    const sampleCode = `
import { helper } from './utils';

export interface UserConfig {
  name: string;
}

export class UserManager {
  public async getUser(id: string) {
    helper();
    return id;
  }
}

export function calculateTotal(price: number, tax: number) {
  return price + tax;
}
`;

    fs.writeFileSync(path.join(tempDir, 'sample.ts'), sampleCode, 'utf-8');

    const engine = new CodeGraphEngine(tempDir);
    const data = await engine.scan();

    assert.ok(data.files['sample.ts']);
    assert.ok(data.symbols['UserManager']);
    assert.ok(data.symbols['calculateTotal']);
    assert.ok(data.symbols['UserConfig']);

    // Búsqueda de símbolos
    const results = engine.search('User');
    assert.ok(results.length >= 2);

    // Jerarquía de arquitectura
    const hierarchy = engine.getHierarchy();
    assert.ok(hierarchy.includes('sample.ts'));
    assert.ok(hierarchy.includes('UserManager'));
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test('CodeGraphEngine: registra y resuelve llamadas entre funciones (Callers & Callees)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'barhel-codegraph-test-'));
  try {
    const code = `
function stepOne() {
  return 1;
}

function stepTwo() {
  stepOne();
  return 2;
}
`;
    fs.writeFileSync(path.join(tempDir, 'steps.ts'), code, 'utf-8');

    const engine = new CodeGraphEngine(tempDir);
    await engine.scan();

    const callersOfOne = engine.getCallers('stepOne');
    assert.ok(callersOfOne.includes('stepTwo'));

    const calleesOfTwo = engine.getCallees('stepTwo');
    assert.ok(calleesOfTwo.includes('stepOne'));
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});
