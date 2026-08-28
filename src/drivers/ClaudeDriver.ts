import { BaseDriver } from './BaseDriver.js';
import { ProviderConfig, ProviderType } from '../types/providers.js';
import { logger } from '../utils/logger.js';

export const CLAUDE_CONFIG: ProviderConfig = {
  id: ProviderType.CLAUDE,
  displayName: 'Claude (Anthropic)',
  url: 'https://claude.ai/new',
  sessionDirName: 'claude',
  defaultTimeoutMs: 300000,
  selectors: {
    inputPrompt: [
      'div[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"]',
      'p[data-placeholder]',
      'div.ProseMirror',
      'textarea',
    ],
    sendButton: [
      'button[aria-label*="Send Message"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Enviar"]',
      'button:has(svg.lucide-arrow-up)',
      'button:has(svg)',
    ],
    stopButton: [
      'button[aria-label*="Stop response"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="Detener"]',
      'button:has(svg.lucide-square)',
      'div.loading-indicator',
    ],
    responseContainer: [
      'div.font-claude-message',
      'div[data-is-streaming]',
      'div.standard-markdown',
      'div[class*="font-claude"]',
      'div.markdown',
    ],
    chatTurns: [
      'div[data-test-render-count]',
      'div.font-claude-message',
      'div[class*="font-claude"]',
    ],
  },
};

export class ClaudeDriver extends BaseDriver {
  constructor(customConfig?: Partial<ProviderConfig>) {
    super({ ...CLAUDE_CONFIG, ...customConfig });
  }

  public async isStreaming(): Promise<boolean> {
    if (!this.page) return false;
    for (const stopSel of this.config.selectors.stopButton) {
      try {
        const stopEl = this.page.locator(stopSel).first();
        if (await stopEl.isVisible({ timeout: 400 })) {
          return true;
        }
      } catch {
        // Ignorar
      }
    }
    return false;
  }

  public async sendMessage(prompt: string): Promise<string> {
    if (!this.page) throw new Error('Driver Claude no está inicializado.');

    await this.ensureChatPage();

    const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt);
    if (!inputSelector) {
      throw new Error(
        'No se encontró el campo de entrada de Claude. Inicia sesión con: barhel login claude'
      );
    }

    const inputLocator = this.page.locator(inputSelector).first();
    await inputLocator.click();

    // Contar respuestas previas
    const previousResponsesCount = await this.page
      .locator(this.config.selectors.responseContainer[0])
      .count();

    // Pegar / escribir prompt
    try {
      await this.page.evaluate(
        ({ sel, text }) => {
          const el = document.querySelector(sel);
          if (el) {
            el.innerHTML = `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        { sel: inputSelector, text: prompt }
      );
    } catch {
      await inputLocator.fill(prompt);
    }

    await this.page.waitForTimeout(400);

    const sendSelector = await this.findFirstVisibleSelector(this.config.selectors.sendButton);
    if (sendSelector) {
      const sendBtn = this.page.locator(sendSelector).first();
      if (await sendBtn.isEnabled({ timeout: 1500 })) {
        await sendBtn.click();
      } else {
        await inputLocator.press('Enter');
      }
    } else {
      await inputLocator.press('Enter');
    }

    logger.info('Esperando respuesta de Claude Web...');
    await this.page.waitForTimeout(2000);

    // Esperar a que el streaming termine
    let streaming = true;
    let pollInterval = 1000;
    let elapsed = 0;
    const maxWait = this.config.defaultTimeoutMs;

    while (streaming && elapsed < maxWait) {
      await this.page.waitForTimeout(pollInterval);
      elapsed += pollInterval;
      streaming = await this.isStreaming();
    }

    // Esperar estabilización del DOM
    await this.page.waitForTimeout(1500);

    const responseSel =
      (await this.findFirstVisibleSelector(this.config.selectors.responseContainer)) ||
      this.config.selectors.responseContainer[0];

    const currentResponses = this.page.locator(responseSel);
    const count = await currentResponses.count();

    if (count === 0) {
      throw new Error('Claude no generó ningún bloque de respuesta visible.');
    }

    const lastResponse = currentResponses.nth(count - 1);
    const textContent = (await lastResponse.innerText()) || '';
    return textContent.trim();
  }
}
