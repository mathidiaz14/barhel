import { BaseDriver } from './BaseDriver.js';
import { ProviderType } from '../types/providers.js';
import { ConfigManager } from '../utils/config.js';
import { logger } from '../utils/logger.js';
export const OPENROUTER_CONFIG = {
    id: ProviderType.OPENROUTER,
    displayName: 'OpenRouter AI (Modelos Gratuitos / API)',
    url: 'https://openrouter.ai',
    sessionDirName: 'openrouter',
    defaultTimeoutMs: 180000,
    selectors: {
        inputPrompt: [],
        sendButton: [],
        stopButton: [],
        responseContainer: [],
        chatTurns: [],
    },
};
export const OPENROUTER_FREE_MODELS = [
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', desc: 'Razonamiento lógico avanzado y CoT' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', desc: 'Gran conocimiento general y código' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', desc: 'Especialista en desarrollo y refactorización' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free)', desc: 'Ultra rápido con amplia ventana de contexto' },
    { id: 'google/gemini-2.0-pro-exp-02-05:free', name: 'Gemini 2.0 Pro Exp (Free)', desc: 'Modelo insignia de Google para problemas complejos' },
    { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', desc: 'Síntesis precisa y alta velocidad' },
    { id: 'deepseek/deepseek-chat:free', name: 'DeepSeek V3 Chat (Free)', desc: 'DeepSeek V3 estándar para chat y código' },
];
export class OpenRouterDriver extends BaseDriver {
    activeController = null;
    isStreamingActive = false;
    customApiKey;
    customModel;
    constructor(customConfig, options) {
        super({ ...OPENROUTER_CONFIG, ...customConfig });
        this.customApiKey = options?.apiKey;
        this.customModel = options?.model;
    }
    getApiKey() {
        const cfg = ConfigManager.loadConfig();
        return (this.customApiKey ||
            process.env.OPENROUTER_API_KEY ||
            cfg?.openrouterApiKey ||
            '');
    }
    getModel() {
        const cfg = ConfigManager.loadConfig();
        return (this.customModel ||
            process.env.OPENROUTER_MODEL ||
            cfg?.openrouterModel ||
            'deepseek/deepseek-r1:free');
    }
    async init(headless = true, initialChatUrl) {
        this.isInitialized = true;
    }
    async isStreaming() {
        return this.isStreamingActive;
    }
    async stopGeneration() {
        if (this.activeController) {
            this.activeController.abort();
            this.activeController = null;
            this.isStreamingActive = false;
            return true;
        }
        return false;
    }
    async close() {
        await this.stopGeneration();
        this.isInitialized = false;
    }
    async sendMessage(prompt, onChunk) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('Falta la API Key de OpenRouter. Configúrala en la sección Configuración de la web o con la variable de entorno OPENROUTER_API_KEY. Obtén una gratis en https://openrouter.ai/keys');
        }
        const model = this.getModel();
        this.isStreamingActive = true;
        this.activeController = new AbortController();
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/mathidiaz14/barhel',
                    'X-Title': 'Barhel AI Agent',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    stream: true,
                }),
                signal: this.activeController.signal,
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                let parsedMessage = errorText;
                try {
                    const parsed = JSON.parse(errorText);
                    parsedMessage = parsed.error?.message || parsed.message || errorText;
                }
                catch {
                    // Mantener errorText
                }
                throw new Error(`OpenRouter HTTP ${response.status}: ${parsedMessage}`);
            }
            if (!response.body) {
                throw new Error('OpenRouter no devolvió cuerpo de respuesta en el stream.');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullText = '';
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:'))
                        continue;
                    const dataStr = trimmed.replace(/^data:\s*/, '');
                    if (dataStr === '[DONE]')
                        break;
                    try {
                        const data = JSON.parse(dataStr);
                        const delta = data.choices?.[0]?.delta;
                        const content = delta?.content || delta?.reasoning || '';
                        if (content) {
                            fullText += content;
                            if (onChunk)
                                onChunk(fullText);
                        }
                    }
                    catch {
                        // Ignorar líneas no JSON
                    }
                }
            }
            return fullText;
        }
        catch (err) {
            if (err.name === 'AbortError') {
                return 'Turno interrumpido por el usuario.';
            }
            logger.error('Error en llamada a OpenRouter API', err);
            throw err;
        }
        finally {
            this.isStreamingActive = false;
            this.activeController = null;
        }
    }
    async verifyHealth(testPing = false) {
        const apiKey = this.getApiKey();
        const model = this.getModel();
        const start = performance.now();
        const report = {
            providerId: this.config.id,
            displayName: this.config.displayName,
            url: this.config.url,
            currentUrl: `https://openrouter.ai (Modelo: ${model})`,
            authenticated: Boolean(apiKey),
            authReason: apiKey ? undefined : 'Falta OPENROUTER_API_KEY en configuración',
            cloudflareBlocked: false,
            inputSelectorFound: true,
            sendButtonFound: true,
            responseContainerFound: true,
            latencyMs: 0,
        };
        if (!apiKey) {
            report.error = 'No se ha configurado la API Key de OpenRouter.';
            return report;
        }
        if (testPing) {
            try {
                const pingResp = await this.sendMessage('Responde estrictamente "OK" para prueba de diagnóstico.');
                report.pingDurationMs = Math.round(performance.now() - start);
                report.pingSuccess = pingResp.trim().length > 0;
                report.pingResponse = pingResp.slice(0, 100);
            }
            catch (err) {
                report.pingSuccess = false;
                report.pingDurationMs = Math.round(performance.now() - start);
                report.error = err?.message || String(err);
            }
        }
        report.latencyMs = Math.round(performance.now() - start);
        return report;
    }
}
//# sourceMappingURL=OpenRouterDriver.js.map