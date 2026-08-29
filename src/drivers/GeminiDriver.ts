import { BaseDriver, WebProviderError } from './BaseDriver.js';
import { ProviderConfig, ProviderType } from '../types/providers.js';

export const GEMINI_CONFIG: ProviderConfig = {
  id: ProviderType.GEMINI,
  displayName: 'Gemini (Worker)',
  url: 'https://gemini.google.com/app',
  sessionDirName: 'gemini',
  defaultTimeoutMs: 300000,
  selectors: {
    inputPrompt: [
      'rich-textarea .ql-editor',
      'div[contenteditable="true"]',
      'rich-textarea div[role="textbox"]',
      'textarea[placeholder*="Ask"]',
      'textarea',
    ],
    sendButton: [
      'button[aria-label*="Send message"]',
      'button[aria-label*="Enviar mensaje"]',
      'button.send-button',
      'button:has(mat-icon[data-mat-icon-name="send"])',
      'button[aria-label*="Send"]',
    ],
    stopButton: [
      'button[aria-label*="Stop response"]',
      'button[aria-label*="Detener respuesta"]',
      'button.stop-button',
      'mat-progress-spinner',
    ],
    responseContainer: [
      'message-content .model-response-text',
      'message-content',
      'div.model-response-text',
      'div.response-container',
      'div.markdown',
    ],
    chatTurns: [
      'conversation-turn',
      'div.conversation-turn',
      'message-content',
    ],
  },
};

export class GeminiDriver extends BaseDriver {
  constructor(customConfig?: Partial<ProviderConfig>) {
    super({ ...GEMINI_CONFIG, ...customConfig });
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
    if (!this.page) throw new Error('Driver Gemini no está inicializado.');

    await this.ensureChatPage();

    const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt, 10000);
    if (!inputSelector) {
      throw new Error('No se encontró el campo de entrada de Gemini. Inicia sesión con: barhel login gemini');
    }

    await this.dismissModals();

    // 1. Inyectar prompt con soporte para Quill rich-editor
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
    await this.waitForCompletion(onChunk);

    const responseText = await this.extractLatestResponse();
    if (!responseText) {
      const webErr = await this.detectWebErrors();
      if (webErr) {
        throw new WebProviderError(`Gemini error: ${webErr}`, webErr);
      }
      throw new Error('No se pudo extraer la respuesta de Gemini.');
    }

    return responseText;
  }

  private async waitForCompletion(onChunk?: (chunk: string) => void): Promise<void> {
    if (!this.page) return;

    const startTime = Date.now();
    const maxTimeout = this.config.defaultTimeoutMs;
    let stableCount = 0;
    let lastContent = '';
    let lastStreamLength = 0;

    while (Date.now() - startTime < maxTimeout) {
      const webErr = await this.detectWebErrors();
      if (webErr) {
        throw new WebProviderError(`Gemini reportó: ${webErr}`, webErr);
      }

      const streaming = await this.isStreaming();
      const currentContent = (await this.extractLatestResponse()).trim();

      if (onChunk && currentContent.length > lastStreamLength) {
        const delta = currentContent.slice(lastStreamLength);
        onChunk(delta);
        lastStreamLength = currentContent.length;
      }

      if (!streaming) {
        if (currentContent.length > 0 && currentContent === lastContent) {
          stableCount++;
          if (stableCount >= 3) {
            break;
          }
        } else {
          stableCount = 0;
        }
      } else {
        stableCount = 0;
      }

      lastContent = currentContent;
      await this.page.waitForTimeout(500);
    }
  }

  private async extractLatestResponse(): Promise<string> {
    if (!this.page) return '';

    try {
      const text = await this.page.evaluate(() => {
        const candidateSelectors = [
          'message-content .model-response-text',
          'message-content',
          'div.model-response-text',
          'div.response-container',
          'div.markdown',
        ];

        for (const sel of candidateSelectors) {
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length > 0) {
            const last = els[els.length - 1] as HTMLElement;
            const clone = last.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('button, mat-icon, [class*="action"], [class*="button"]').forEach((n) => n.remove());
            const t = clone.innerText?.trim() || clone.textContent?.trim() || '';
            if (t.length > 0) return t;
          }
        }
        return '';
      });

      return text ? text.trim() : '';
    } catch {
      return '';
    }
  }
}
