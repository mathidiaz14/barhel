import { BaseDriver } from './BaseDriver.js';
import { ProviderConfig, ProviderType } from '../types/providers.js';

export const QWEN_CONFIG: ProviderConfig = {
  id: ProviderType.QWEN,
  displayName: 'Qwen Chat (Alibaba)',
  url: 'https://chat.qwen.ai',
  sessionDirName: 'qwen',
  defaultTimeoutMs: 300000,
  selectors: {
    inputPrompt: [
      '#chat-input',
      'textarea[placeholder*="Qwen"]',
      'textarea[placeholder*="Ask"]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    sendButton: [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button:has(svg)',
      'div.send-button',
    ],
    stopButton: [
      'button[aria-label*="Stop"]',
      'button:has(.anticon-pause)',
      'button:has(svg.stop-icon)',
    ],
    responseContainer: [
      'div.qwen-markdown',
      'div.markdown-body',
      'div[class*="message-assistant"]',
      'div[class*="message-content"]',
      'div.markdown',
    ],
    chatTurns: [
      'div[class*="chat-message"]',
      'div[class*="message-item"]',
      'div.markdown-body',
    ],
  },
};

export class QwenDriver extends BaseDriver {
  constructor(customConfig?: Partial<ProviderConfig>) {
    super({ ...QWEN_CONFIG, ...customConfig });
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
    if (!this.page) throw new Error('Driver Qwen no está inicializado.');

    await this.ensureChatPage();

    const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt);
    if (!inputSelector) {
      throw new Error(
        'No se encontró el campo de entrada de Qwen. Inicia sesión con: barhel login qwen'
      );
    }

    const inputLocator = this.page.locator(inputSelector).first();
    await inputLocator.click();

    try {
      await inputLocator.fill(prompt);
    } catch {
      await this.page.evaluate(
        ({ sel, text }) => {
          const el = document.querySelector(sel) as HTMLTextAreaElement;
          if (el) {
            el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        { sel: inputSelector, text: prompt }
      );
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

    await this.page.waitForTimeout(2000);

    let streaming = true;
    let pollInterval = 1000;
    let elapsed = 0;
    const maxWait = this.config.defaultTimeoutMs;

    while (streaming && elapsed < maxWait) {
      await this.page.waitForTimeout(pollInterval);
      elapsed += pollInterval;
      streaming = await this.isStreaming();
    }

    await this.page.waitForTimeout(1500);

    const responseSel =
      (await this.findFirstVisibleSelector(this.config.selectors.responseContainer)) ||
      this.config.selectors.responseContainer[0];

    const currentResponses = this.page.locator(responseSel);
    const count = await currentResponses.count();

    if (count === 0) {
      throw new Error('Qwen no generó ningún bloque de respuesta visible.');
    }

    const lastResponse = currentResponses.nth(count - 1);
    const textContent = (await lastResponse.innerText()) || '';
    return textContent.trim();
  }
}
