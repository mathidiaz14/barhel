import { BaseDriver } from './BaseDriver.js';
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
    if (!this.page) throw new Error('Driver Gemini no está inicializado.');

    await this.ensureChatPage();

    const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt);
    if (!inputSelector) {
      throw new Error('No se encontró el campo de entrada de Gemini. Inicia sesión con: dev-agent login gemini');
    }

    const inputLocator = this.page.locator(inputSelector).first();
    await inputLocator.click();

    // Gemini Quill rich-editor
    await this.page.evaluate(
      ({ selector, text }) => {
        const el = document.querySelector(selector) as HTMLElement;
        if (el) {
          el.focus();
          if (el.tagName.toLowerCase() === 'textarea') {
            (el as HTMLTextAreaElement).value = text;
          } else {
            el.innerHTML = `<p>${text.replace(/\n/g, '<br>')}</p>`;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      { selector: inputSelector, text: prompt }
    );

    await this.page.waitForTimeout(300);
    await inputLocator.press('Space');
    await inputLocator.press('Backspace');
    await this.page.waitForTimeout(200);

    let sent = false;
    const sendSelector = await this.findFirstVisibleSelector(this.config.selectors.sendButton);
    if (sendSelector) {
      try {
        const sendBtn = this.page.locator(sendSelector).first();
        if (await sendBtn.isEnabled({ timeout: 1000 })) {
          await sendBtn.click();
          sent = true;
        }
      } catch {
        // Fallback
      }
    }

    if (!sent) {
      await inputLocator.press('Enter');
    }

    await this.page.waitForTimeout(2500);
    await this.waitForCompletion();

    const responseText = await this.extractLatestResponse();
    if (!responseText) {
      throw new Error('No se pudo extraer la respuesta de Gemini.');
    }

    return responseText;
  }

  private async waitForCompletion(): Promise<void> {
    if (!this.page) return;

    const startTime = Date.now();
    const maxTimeout = this.config.defaultTimeoutMs;
    let stableCount = 0;
    let lastContent = '';

    while (Date.now() - startTime < maxTimeout) {
      const streaming = await this.isStreaming();
      const currentContent = (await this.extractLatestResponse()).trim();

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
      await this.page.waitForTimeout(1000);
    }
  }

  private async extractLatestResponse(): Promise<string> {
    if (!this.page) return '';

    for (const sel of this.config.selectors.responseContainer) {
      try {
        const count = await this.page.locator(sel).count();
        if (count > 0) {
          const lastEl = this.page.locator(sel).nth(count - 1);
          const text = await lastEl.innerText();
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        }
      } catch {
        // Probar siguiente
      }
    }

    return '';
  }
}
