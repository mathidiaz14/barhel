import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptObject, decryptToObject, isEncryptionEnabled, isEncryptedPayload } from '../src/utils/crypto.js';

const ORIGINAL_SECRET = process.env.BARHEL_SECRET;

test.after(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.BARHEL_SECRET;
  } else {
    process.env.BARHEL_SECRET = ORIGINAL_SECRET;
  }
});

test('roundtrip cifrado/descifrado con BARHEL_SECRET', () => {
  process.env.BARHEL_SECRET = 'clave-de-prueba';
  const obj = { id: 'abc', turns: [{ prompt: 'hola \\n mundo' }], líder: 'deeépseek' };
  const payload = encryptObject(obj);
  assert.equal(isEncryptionEnabled(), true);
  assert.equal(isEncryptedPayload(payload), true);
  assert.ok(!payload.includes('abc'), 'no debe quedar el texto en claro');
  const back = decryptToObject<typeof obj>(payload);
  assert.deepEqual(back, obj);
});

test('descifrado falla con secret incorrecto', () => {
  process.env.BARHEL_SECRET = 'clave-correta';
  const payload = encryptObject({ secreto: 'top' });
  process.env.BARHEL_SECRET = 'clave-equivocada';
  const back = decryptToObject(payload);
  assert.equal(back, null);
});

test('encryptObject lanza si BARHEL_SECRET no está definido', () => {
  delete process.env.BARHEL_SECRET;
  assert.throws(() => encryptObject({ a: 1 }), /BARHEL_SECRET/);
});

test('descifrado de payload corrupto devuelve null', () => {
  process.env.BARHEL_SECRET = 'clave';
  assert.equal(decryptToObject('garbage.not.base64.really'), null);
  assert.equal(decryptToObject('a.b.c'), null);
});

test('isEncryptedPayload reconoce formato de tres partes base64', () => {
  assert.equal(isEncryptedPayload('SGVsbG8=.dGFn.ZGF0YQ=='), true);
  assert.equal(isEncryptedPayload('{"a":1}'), false);
});