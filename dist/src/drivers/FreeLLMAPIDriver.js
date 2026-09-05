import { BaseDriver } from './BaseDriver.js';
import { ProviderType } from '../types/providers.js';
import { ConfigManager } from '../utils/config.js';
import { logger } from '../utils/logger.js';
export const FREELLMAPI_CONFIG = {
    id: ProviderType.FREELLMAPI,
    displayName: 'FreeLLMAPI (Self-Hosted / Gateway OpenAI-Compatible)',
    url: 'http://localhost:3001',
    sessionDirName: 'freellmapi',
    defaultTimeoutMs: 180000,
    selectors: {
        inputPrompt: [],
        sendButton: [],
        stopButton: [],
        responseContainer: [],
        chatTurns: [],
    },
};
export const FREELLMAPI_RECOMMENDED_MODELS = [
    { id: 'auto', name: 'Auto-Routing / Failover Automático', desc: 'Ruta al mejor proveedor gratuito disponible' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Google AI Studio)', desc: 'Ultra rápido con amplia ventana de contexto' },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq / Cerebras)', desc: 'Gran conocimiento general a máxima velocidad' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B (Groq)', desc: 'Razonamiento lógico y código' },
    { id: 'qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B', desc: 'Especialista en desarrollo y refactor' },
    { id: 'mistral-large-latest', name: 'Mistral Large', desc: 'Modelo insignia de Mistral AI' },
];
export class FreeLLMAPIDriver extends BaseDriver {
    activeController = null;
    isStreamingActive = false;
    customBaseUrl;
    customApiKey;
    customModel;
    constructor(customConfig, options) {
        super({ ...FREELLMAPI_CONFIG, ...customConfig });
        this.customBaseUrl = options?.baseUrl;
        this.customApiKey = options?.apiKey;
        this.customModel = options?.model;
    }
    getBaseUrl() {
        const cfg = ConfigManager.loadConfig();
        const raw = this.customBaseUrl ||
            process.env.FREELLMAPI_BASE_URL ||
            cfg?.freellmapiBaseUrl ||
            'http://localhost:3001/v1';
        return raw.replace(/\/+$/, '');
    }
    getApiKey() {
        const cfg = ConfigManager.loadConfig();
        return (this.customApiKey ||
            process.env.FREELLMAPI_API_KEY ||
            cfg?.freellmapiApiKey ||
            'free');
    }
    getModel() {
        const cfg = ConfigManager.loadConfig();
        return (this.customModel ||
            process.env.FREELLMAPI_MODEL ||
            cfg?.freellmapiModel ||
            'auto');
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
        const baseUrl = this.getBaseUrl();
        const apiKey = this.getApiKey();
        const model = this.getModel();
        const endpoint = baseUrl.endsWith('/v1')
            ? `${baseUrl}/chat/completions`
            : `${baseUrl}/v1/chat/completions`;
        this.isStreamingActive = true;
        this.activeController = new AbortController();
        try {
            const headers = {
                'Content-Type': 'application/json',
            };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
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
                    // Usar errorText
                }
                throw new Error(`FreeLLMAPI (${endpoint}) HTTP ${response.status}: ${parsedMessage}`);
            }
            if (!response.body) {
                throw new Error(`FreeLLMAPI no devolvió cuerpo de respuesta en el stream (${endpoint}).`);
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
                        const content = delta?.content || delta?.reasoning || delta?.reasoning_content || '';
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
            logger.error('Error en llamada a FreeLLMAPI', err);
            throw err;
        }
        finally {
            this.isStreamingActive = false;
            this.activeController = null;
        }
    }
    async verifyHealth(testPing = false) {
        const baseUrl = this.getBaseUrl();
        const model = this.getModel();
        const start = performance.now();
        const endpoint = baseUrl.endsWith('/v1')
            ? `${baseUrl}/chat/completions`
            : `${baseUrl}/v1/chat/completions`;
        const report = {
            providerId: this.config.id,
            displayName: this.config.displayName,
            url: baseUrl,
            currentUrl: `${endpoint} (Modelo: ${model})`,
            authenticated: true,
            cloudflareBlocked: false,
            inputSelectorFound: true,
            sendButtonFound: true,
            responseContainerFound: true,
            latencyMs: 0,
        };
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
//# sourceMappingURL=FreeLLMAPIDriver.js.map