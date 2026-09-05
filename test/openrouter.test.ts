import test from 'node:test';
import assert from 'node:assert/strict';
import { DriverFactory } from '../src/drivers/DriverFactory.js';
import { OpenRouterDriver, OPENROUTER_FREE_MODELS } from '../src/drivers/OpenRouterDriver.js';
import { ProviderType } from '../src/types/providers.js';

test('DriverFactory: registra y crea el driver de OpenRouter correctamente', () => {
  const driver = DriverFactory.createDriver(ProviderType.OPENROUTER);
  assert.ok(driver instanceof OpenRouterDriver);
  assert.strictEqual(driver.providerId, ProviderType.OPENROUTER);
});

test('OpenRouterDriver: lista de modelos gratuitos disponibles', () => {
  assert.ok(OPENROUTER_FREE_MODELS.length >= 5);
  const ids = OPENROUTER_FREE_MODELS.map((m) => m.id);
  assert.ok(ids.includes('deepseek/deepseek-r1:free'));
  assert.ok(ids.includes('meta-llama/llama-3.3-70b-instruct:free'));
  assert.ok(ids.includes('qwen/qwen-2.5-coder-32b-instruct:free'));
  assert.ok(ids.includes('google/gemini-2.0-flash-exp:free'));
});

test('OpenRouterDriver: verifyHealth reporta falta de API key cuando está vacía', async () => {
  const driver = new OpenRouterDriver(undefined, { apiKey: '' });
  const health = await driver.verifyHealth(false);
  assert.strictEqual(health.providerId, ProviderType.OPENROUTER);
  assert.strictEqual(health.authenticated, false);
  assert.ok(health.authReason?.includes('OPENROUTER_API_KEY'));
});

test('OpenRouterDriver: verifyHealth reporta autenticado si se provee API key', async () => {
  const driver = new OpenRouterDriver(undefined, { apiKey: 'sk-or-test-key', model: 'deepseek/deepseek-r1:free' });
  const health = await driver.verifyHealth(false);
  assert.strictEqual(health.authenticated, true);
  assert.strictEqual(health.cloudflareBlocked, false);
  assert.ok(health.currentUrl?.includes('deepseek/deepseek-r1:free'));
});
