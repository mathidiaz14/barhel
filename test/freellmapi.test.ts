import test from 'node:test';
import assert from 'node:assert/strict';
import { DriverFactory } from '../src/drivers/DriverFactory.js';
import { FreeLLMAPIDriver, FREELLMAPI_RECOMMENDED_MODELS } from '../src/drivers/FreeLLMAPIDriver.js';
import { ProviderType } from '../src/types/providers.js';

test('DriverFactory: registra y crea el driver de FreeLLMAPI correctamente', () => {
  const driver = DriverFactory.createDriver(ProviderType.FREELLMAPI);
  assert.ok(driver instanceof FreeLLMAPIDriver);
  assert.strictEqual(driver.providerId, ProviderType.FREELLMAPI);
});

test('FreeLLMAPIDriver: lista de modelos recomendados disponibles', () => {
  assert.ok(FREELLMAPI_RECOMMENDED_MODELS.length >= 4);
  const ids = FREELLMAPI_RECOMMENDED_MODELS.map((m) => m.id);
  assert.ok(ids.includes('auto'));
  assert.ok(ids.includes('gemini-2.0-flash'));
  assert.ok(ids.includes('llama-3.3-70b-versatile'));
});

test('FreeLLMAPIDriver: verifyHealth reporta endpoint configurado', async () => {
  const driver = new FreeLLMAPIDriver(undefined, { baseUrl: 'http://localhost:3001/v1', model: 'auto' });
  const health = await driver.verifyHealth(false);
  assert.strictEqual(health.providerId, ProviderType.FREELLMAPI);
  assert.strictEqual(health.authenticated, true);
  assert.strictEqual(health.cloudflareBlocked, false);
  assert.ok(health.currentUrl?.includes('http://localhost:3001/v1/chat/completions'));
});
