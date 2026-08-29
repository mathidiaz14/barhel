import { BaseDriver, WebProviderError } from './BaseDriver.js';
import { ProviderType } from '../types/providers.js';
export const CLAUDE_CONFIG = {
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
    constructor(customConfig) {
        super({ ...CLAUDE_CONFIG, ...customConfig });
    }
    async isStreaming() {
        if (!this.page)
            return false;
        for (const stopSel of this.config.selectors.stopButton) {
            try {
                const stopEl = this.page.locator(stopSel).first();
                if (await stopEl.isVisible({ timeout: 300 })) {
                    return true;
                }
            }
            catch {
                // Ignorar
            }
        }
        return false;
    }
    async sendMessage(prompt, onChunk) {
        if (!this.page)
            throw new Error('Driver Claude no está inicializado.');
        await this.ensureChatPage();
        const inputSelector = await this.findFirstVisibleSelector(this.config.selectors.inputPrompt, 10000);
        if (!inputSelector) {
            throw new Error('No se encontró el campo de entrada de Claude. Inicia sesión con: barhel login claude');
        }
        await this.dismissModals();
        const inputLocator = this.page.locator(inputSelector).first();
        // 1. Inyectar prompt con soporte para ProseMirror rico
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
            }
            catch {
                // Fallback
            }
        }
        if (!sent) {
            await inputLocator.focus().catch(() => { });
            await inputLocator.press('Enter').catch(() => { });
        }
        await this.page.waitForTimeout(1500);
        // 3. Esperar a que el streaming termine con streaming deltas
        let streaming = true;
        let elapsed = 0;
        const maxWait = this.config.defaultTimeoutMs;
        let lastStreamLength = 0;
        while (streaming && elapsed < maxWait) {
            const webErr = await this.detectWebErrors();
            if (webErr) {
                throw new WebProviderError(`Claude reportó: ${webErr}`, webErr);
            }
            const responseSel = (await this.findFirstVisibleSelector(this.config.selectors.responseContainer, 800)) ||
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
        const responseSel = (await this.findFirstVisibleSelector(this.config.selectors.responseContainer, 2000)) ||
            this.config.selectors.responseContainer[0];
        const currentResponses = this.page.locator(responseSel);
        const count = await currentResponses.count();
        if (count === 0) {
            const webErr = await this.detectWebErrors();
            if (webErr) {
                throw new WebProviderError(`Claude error: ${webErr}`, webErr);
            }
            throw new Error('Claude no generó ningún bloque de respuesta visible.');
        }
        const lastResponse = currentResponses.nth(count - 1);
        const textContent = (await lastResponse.innerText()) || '';
        return textContent.trim();
    }
}
//# sourceMappingURL=ClaudeDriver.js.map