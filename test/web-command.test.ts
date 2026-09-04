import test from 'node:test';
import assert from 'node:assert/strict';
import { WebServer } from '../src/web/WebServer.js';
import { DaemonManager } from '../src/daemon/DaemonManager.js';

test('WebServer: inicializa con puerto por defecto o personalizado', () => {
  const serverDefault = new WebServer();
  assert.equal(serverDefault.getPort(), 7898);

  const serverCustom = new WebServer({ port: 9999 });
  assert.equal(serverCustom.getPort(), 9999);
});

test('DaemonManager: consulta el estado del servidor web daemon', () => {
  const status = DaemonManager.getWebStatus();
  assert.equal(typeof status.running, 'boolean');
  assert.ok(typeof status.logPath === 'string');
});
