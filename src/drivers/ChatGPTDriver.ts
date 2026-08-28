import { BaseDriver } from './BaseDriver.js';
import { ProviderConfig, ProviderType } from '../types/providers.js';
import { logger } from '../utils/logger.js';

export const CHATGPT_CONFIG: ProviderConfig = {
  id: ProviderType.CHATGPT,
  displayName: 'ChatGPT (Worker)',
  url: 'https://chatgpt.com',
  sessionDirName: 'chatgpt',
  defaultTimeoutMs: 300000,
  selectors: {
    inputPrompt: [
      '#prompt-textarea',
      'div#prompt-textarea[contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="Message"]',
      'textarea',
    ],
    sendButton: [
      'button[data-testid="send-button"]',
      'button[data-testid="fruitjuice-send-button"]',
      'button[aria-label*="Send prompt"]',
      'button[aria-label*="Send message"]',
      'button:has(svg[viewBox="0 0 24 24"])',
    ],
    stopButton: [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop streaming"]',
      'button[aria-label*="Stop generating"]',
      'button.stop-button',
    ],
    responseContainer: [
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"]',
      'article[data-testid^="conversation-turn"] .markdown',
      'div.markdown',
    ],
    chatTurns: [
      'article[data-testid^="conversation-turn"]',
      'div[data-message-author-role="assistant"]',
    ],
  },
};

export class ChatGPTDriver extends BaseDriver {
  constructor(customConfig?: Partial<ProviderConfig>) {
    super({ ...CHATGPT_CONFIG, ...customConfig });
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
    if (!this.page) throw new Error('Driver ChatGPT no está inicializado.');

    await this.ensureChatPage();

    const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt);
    if (!inputSelector) {
      throw new Error('No se encontró el campo de entrada de ChatGPT. Inicia sesión con: dev-agent login chatgpt');
    }

    const inputLocator = this.page.locator(inputSelector).first();
    await inputLocator.click();

    // ChatGPT usa un contenteditable de ProseMirror
    await this.page.evaluate(
      ({ selector, text }) => {
        const el = document.querySelector(selector) as HTMLElement;
        if (el) {
          el.focus();
          if (el.tagName.toLowerCase() === 'textarea') {
            (el as HTMLTextAreaElement).value = text;
          } else {
            // ProseMirror contenteditable
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

    logger.startSpinner('ChatGPT (Worker) está procesando la subtarea...');
    await this.page.waitForTimeout(2500);
    await this.waitForCompletion();
    logger.stopSpinner();

    const responseText = await this.extractLatestResponse();
    if (!responseText) {
      throw new Error('No se pudo extraer la respuesta de ChatGPT.');
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
