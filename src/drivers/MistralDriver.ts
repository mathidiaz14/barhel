import { BaseDriver, WebProviderError } from './BaseDriver.js';
import { ProviderConfig, ProviderType } from '../types/providers.js';

export const MISTRAL_CONFIG: ProviderConfig = {
  id: ProviderType.MISTRAL,
  displayName: 'Mistral Le Chat',
  url: 'https://chat.mistral.ai/chat',
  sessionDirName: 'mistral',
  defaultTimeoutMs: 300000,
  selectors: {
    inputPrompt: [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="message"]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    sendButton: [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button:has(svg.lucide-arrow-up)',
      'button:has(svg)',
    ],
    stopButton: [
      'button[aria-label*="Stop"]',
      'button:has(svg.lucide-square)',
      'button.stop-button',
    ],
    responseContainer: [
      'div[class*="prose"]',
      'div.markdown',
      'div[class*="message-assistant"]',
    ],
    chatTurns: [
      'div[class*="message"]',
      'div[class*="prose"]',
    ],
  },
};

export class MistralDriver extends BaseDriver {
  constructor(customConfig?: Partial<ProviderConfig>) {
    super({ ...MISTRAL_CONFIG, ...customConfig });
  }

  public async isStreaming(): Promise<boolean> {
    if (!this.page) return false;
    for (const stopSel of this.config.selectors.stopButton) {
      try {
        const stopEl = this.page.locator(stopSel).first();
        if (await stopEl.isVisible({ timeout: 300 })) {
          return true;
        }
      } catch {
        // Ignorar
      }
    }
    return false;
  }

  public async sendMessage(prompt: string, onChunk?: (chunk: string) => void): Promise<string> {
    if (!this.page) throw new Error('Driver Mistral no está inicializado.');

    await this.ensureChatPage();

    const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt, 10000);
    if (!inputSelector) {
      throw new Error(
        'No se encontró el campo de entrada de Mistral. Inicia sesión con: barhel login mistral'
      );
    }

    await this.dismissModals();

    // 1. Inyectar prompt
    await this.injectPrompt(inputSelector, prompt);

    await this.page.waitForTimeout(300);

    // 2. Disparar envío
    let sent = false;
    const sendSelector = await this.findFirstVisibleSelector(this.config.selectors.sendButton, 1500);
    if (sendSelector) {
      try {
        const sendBtn = this.page.locator(sendSelector).first();
        if (await sendBtn.isVisible({ timeout: 400 })) {
          await sendBtn.click({ force: true, timeout: 800 });
          sent = true;
        }
      } catch {
        // Fallback
      }
    }

    if (!sent) {
      const inputLocator = this.page.locator(inputSelector).first();
      await inputLocator.focus().catch(() => {});
      await inputLocator.press('Enter').catch(() => {});
    }

    await this.page.waitForTimeout(1500);

    // 3. Esperar streaming con streaming deltas
    let streaming = true;
    let elapsed = 0;
    const maxWait = this.config.defaultTimeoutMs;
    let lastStreamLength = 0;

    while (streaming && elapsed < maxWait) {
      const webErr = await this.detectWebErrors();
      if (webErr) {
        throw new WebProviderError(`Mistral reportó: ${webErr}`, webErr);
      }

      const responseSel =
        (await this.findFirstVisibleSelector(this.config.selectors.responseContainer, 800)) ||
        this.config.selectors.responseContainer[0];
      const currentResponses = this.page.locator(responseSel);
      const count = await currentResponses.count();

      if (count > 0 && onChunk) {
        const lastResponse = currentResponses.nth(count - 1);
        const text = (await lastResponse.innerText()) || '';
        if (text.length > lastStreamLength) {
          const delta = text.slice(lastStreamLength);
          onChunk(delta);
          lastStreamLength = text.length;
        }
      }

      await this.page.waitForTimeout(500);
      elapsed += 500;
      streaming = await this.isStreaming();
    }

    await this.page.waitForTimeout(1000);

    const responseSel =
      (await this.findFirstVisibleSelector(this.config.selectors.responseContainer, 2000)) ||
      this.config.selectors.responseContainer[0];

    const currentResponses = this.page.locator(responseSel);
    const count = await currentResponses.count();

    if (count === 0) {
      const webErr = await this.detectWebErrors();
      if (webErr) {
        throw new WebProviderError(`Mistral error: ${webErr}`, webErr);
      }
      throw new Error('Mistral no generó ningún bloque de respuesta visible.');
    }

    const lastResponse = currentResponses.nth(count - 1);
    const textContent = (await lastResponse.innerText()) || '';
    return textContent.trim();
  }
}
