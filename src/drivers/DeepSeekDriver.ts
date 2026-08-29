import { BaseDriver } from './BaseDriver.js';
import { ProviderConfig, ProviderType } from '../types/providers.js';

export const DEEPSEEK_CONFIG: ProviderConfig = {
  id: ProviderType.DEEPSEEK,
  displayName: 'DeepSeek Chat (Leader)',
  url: 'https://chat.deepseek.com',
  sessionDirName: 'deepseek',
  defaultTimeoutMs: 300000, // 5 minutos
  selectors: {
    inputPrompt: [
      '#chat-input',
      'textarea[id="chat-input"]',
      'textarea[placeholder*="DeepSeek"]',
      'textarea[placeholder*="Pregúnt"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      'textarea.ds-input',
      'div[class*="chat-input"] textarea',
      'div[class*="input"] textarea',
      'textarea',
      'div[contenteditable="true"]',
      '[contenteditable="true"]',
    ],
    sendButton: [
      'div[role="button"][aria-label*="Send"]',
      'div[role="button"][aria-label*="Enviar"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Enviar"]',
      'div[class*="send-button"]',
      'div[class*="send-btn"]',
      'div.ds-icon-button:has(svg)',
      'div.ds-icon-button',
      'div[role="button"]:has(svg)',
      'button[type="submit"]',
      'button:has(svg)',
    ],
    stopButton: [
      'div[role="button"][aria-label*="Stop"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="Detener"]',
      'div[class*="stop"]',
      '.ds-loading-icon',
      'svg.ds-stop-icon',
      'div.ds-icon-button:has(rect)',
      'button:has(rect)',
      'button:has(svg.ds-stop-icon)',
      'div:has(svg.ds-stop-icon)',
    ],
    responseContainer: [
      '.ds-markdown',
      '.ds-markdown-html',
      'div[class*="ds-markdown"]',
      'div.ds-message-item:not(:has(.ds-message-user))',
      'div.ds-message-item',
      'div.chat-message:not(.chat-message-user)',
      'div[class*="message-assistant"]',
      'div[class*="message-content"]',
      'div.markdown-body',
      'div.markdown',
    ],
    chatTurns: [
      'div.ds-message-item',
      'div[class*="chat-message"]',
      'div[class*="message-content"]',
    ],
  },
};

export class DeepSeekDriver extends BaseDriver {
  constructor(customConfig?: Partial<ProviderConfig>) {
    super({ ...DEEPSEEK_CONFIG, ...customConfig });
  }

  public async isStreaming(): Promise<boolean> {
    if (!this.page) return false;
    for (const stopSel of this.config.selectors.stopButton) {
      try {
        const stopEl = this.page.locator(stopSel).first();
        if (await stopEl.isVisible({ timeout: 250 })) {
          return true;
        }
      } catch {
        // Ignorar
      }
    }
    return false;
  }

  public async sendMessage(prompt: string): Promise<string> {
    if (!this.page) throw new Error('Driver DeepSeek no está inicializado.');

    await this.ensureChatPage();

    // 1. Localizar input con polling de hasta 10s para SPA hydration
    const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt, 10000);
    if (!inputSelector) {
      throw new Error(
        'No se encontró el campo de entrada de DeepSeek. Si no has iniciado sesión, ejecuta primero: barhel login deepseek'
      );
    }

    const inputLocator = this.page.locator(inputSelector).first();
    await inputLocator.click();

    // Contar bloques de respuesta previos antes de enviar el nuevo turno
    const previousTurnCount = await this.countResponses();

    // Rellenar prompt de forma nativa e invocar setter de React
    try {
      await inputLocator.fill(prompt);
    } catch {
      // Fallback evaluate
    }

    await this.page.evaluate(
      ({ sel, text }) => {
        const el = document.querySelector(sel) as HTMLTextAreaElement;
        if (el) {
          el.focus();
          const proto = Object.getPrototypeOf(el);
          const setter =
            Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(el, text);
          } else {
            el.value = text;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      { sel: inputSelector, text: prompt }
    );

    await this.page.waitForTimeout(300);

    // 2. Disparar envío: click en el botón de enviar, con Enter como fallback
    await inputLocator.focus();
    await this.page.waitForTimeout(200);

    let sent = false;
    const sendSelector = await this.findFirstVisibleSelector(this.config.selectors.sendButton);
    if (sendSelector) {
      try {
        const sendBtn = this.page.locator(sendSelector).first();
        if (await sendBtn.isEnabled({ timeout: 800 })) {
          await sendBtn.click({ timeout: 400, force: true });
          sent = true;
        }
      } catch {
        // Fallback a Enter
      }
    }

    if (!sent) {
      await inputLocator.press('Enter');
    }

    // 3. Esperar generación y streaming del NUEVO turno
    await this.waitForCompletion(previousTurnCount);

    // 4. Extraer el texto de la última respuesta
    const responseText = await this.extractLatestResponse();
    if (!responseText) {
      throw new Error('No se pudo extraer la respuesta de DeepSeek.');
    }

    return responseText;
  }

  private async countResponses(): Promise<number> {
    if (!this.page) return 0;
    try {
      return await this.page.evaluate(() => {
        const sel = '.ds-markdown, .ds-markdown-html, div[class*="ds-markdown"], div.ds-message-item:not(:has(.ds-message-user))';
        return document.querySelectorAll(sel).length;
      });
    } catch {
      return 0;
    }
  }

  private async waitForCompletion(previousCount = 0): Promise<void> {
    if (!this.page) return;

    const startTime = Date.now();
    const maxTimeout = this.config.defaultTimeoutMs;
    let stableCount = 0;
    let lastContent = '';
    let hasStarted = false;

    // Esperar mínimo inicial para que la red procese el envío
    await this.page.waitForTimeout(1500);

    while (Date.now() - startTime < maxTimeout) {
      const streaming = await this.isStreaming();
      const currentCount = await this.countResponses();
      const currentContent = (await this.extractLatestResponse()).trim();

      // Detectar si el nuevo turno ha comenzado a generarse
      if (streaming || currentCount > previousCount || (currentContent.length > 0 && currentContent !== lastContent && hasStarted)) {
        hasStarted = true;
      }

      if (hasStarted) {
        if (!streaming) {
          if (currentContent.length > 0 && currentContent === lastContent) {
            stableCount++;
            if (stableCount >= 3) {
              // Estabilizado (3 ticks de 600ms = 1.8s sin cambios y sin botón de stop)
              break;
            }
          } else {
            stableCount = 0;
          }
        } else {
          stableCount = 0;
        }
      }

      lastContent = currentContent;
      await this.page.waitForTimeout(600);
    }
  }

  private async extractLatestResponse(): Promise<string> {
    if (!this.page) return '';

    try {
      const text = await this.page.evaluate(() => {
        // 1. Probar selectores de bloques de respuesta de DeepSeek
        const candidateSelectors = [
          '.ds-markdown',
          '.ds-markdown-html',
          'div[class*="ds-markdown"]',
          'div.ds-message-item:not(:has(.ds-message-user))',
          'div[class*="message-assistant"]',
          'div[class*="chat-message"]:not([class*="user"])',
          'div[class*="message-content"]',
          'div.markdown-body',
          'div.markdown',
        ];

        for (const sel of candidateSelectors) {
          const els = Array.from(document.querySelectorAll(sel));
          if (els.length > 0) {
            const last = els[els.length - 1] as HTMLElement;
            // Clonar para no alterar el DOM original
            const clone = last.cloneNode(true) as HTMLElement;
            
            // Eliminar botones de feedback, copiar, etc.
            clone.querySelectorAll('button, svg, [class*="action"], [class*="button"]').forEach((n) => n.remove());

            const t = clone.innerText?.trim() || clone.textContent?.trim() || '';
            if (t.length > 0) return t;
          }
        }

        // 2. Fallback: buscar los turnos de conversación y tomar el último del asistente
        const allMessages = Array.from(
          document.querySelectorAll('div[class*="message"], div[class*="chat"], article')
        );
        for (let i = allMessages.length - 1; i >= 0; i--) {
          const el = allMessages[i] as HTMLElement;
          const cls = el.className || '';
          if (typeof cls === 'string' && (cls.includes('user') || cls.includes('input') || cls.includes('prompt'))) {
            continue;
          }
          const clone = el.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('button, svg').forEach((n) => n.remove());
          const t = clone.innerText?.trim() || '';
          if (t.length > 5 && !t.startsWith('barhel') && !t.includes('ERES BARHEL')) {
            return t;
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
