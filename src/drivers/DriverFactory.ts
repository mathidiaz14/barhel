import { BaseDriver } from './BaseDriver.js';
import { DeepSeekDriver, DEEPSEEK_CONFIG } from './DeepSeekDriver.js';
import { ClaudeDriver, CLAUDE_CONFIG } from './ClaudeDriver.js';
import { ChatGPTDriver, CHATGPT_CONFIG } from './ChatGPTDriver.js';
import { GeminiDriver, GEMINI_CONFIG } from './GeminiDriver.js';
import { QwenDriver, QWEN_CONFIG } from './QwenDriver.js';
import { MistralDriver, MISTRAL_CONFIG } from './MistralDriver.js';
import { PerplexityDriver, PERPLEXITY_CONFIG } from './PerplexityDriver.js';
import { ProviderConfig, ProviderType } from '../types/providers.js';

export interface ProviderMeta {
  id: ProviderType;
  name: string;
  url: string;
  description: string;
  config: ProviderConfig;
  createDriver: () => BaseDriver;
}

export const AVAILABLE_PROVIDERS: Record<string, ProviderMeta> = {
  [ProviderType.DEEPSEEK]: {
    id: ProviderType.DEEPSEEK,
    name: 'DeepSeek Chat (V3 / R1)',
    url: 'https://chat.deepseek.com',
    description: 'Excelente para razonamiento lógico complejo, matemáticas y código.',
    config: DEEPSEEK_CONFIG,
    createDriver: () => new DeepSeekDriver(),
  },
  [ProviderType.CLAUDE]: {
    id: ProviderType.CLAUDE,
    name: 'Claude (Sonnet 3.5 / 3.7)',
    url: 'https://claude.ai',
    description: 'Líder en arquitectura de software, refactorización y comprensión profunda.',
    config: CLAUDE_CONFIG,
    createDriver: () => new ClaudeDriver(),
  },
  [ProviderType.CHATGPT]: {
    id: ProviderType.CHATGPT,
    name: 'ChatGPT (GPT-4o / o1)',
    url: 'https://chatgpt.com',
    description: 'Gran conocimiento general, depuración y soporte multitarea.',
    config: CHATGPT_CONFIG,
    createDriver: () => new ChatGPTDriver(),
  },
  [ProviderType.GEMINI]: {
    id: ProviderType.GEMINI,
    name: 'Gemini (Flash 2.0 / Pro)',
    url: 'https://gemini.google.com',
    description: 'Gran velocidad y enorme ventana de contexto para código extenso.',
    config: GEMINI_CONFIG,
    createDriver: () => new GeminiDriver(),
  },
  [ProviderType.QWEN]: {
    id: ProviderType.QWEN,
    name: 'Qwen Chat (Qwen 2.5 Coder)',
    url: 'https://chat.qwen.ai',
    description: 'Especialista en código y algoritmos open-weight de Alibaba.',
    config: QWEN_CONFIG,
    createDriver: () => new QwenDriver(),
  },
  [ProviderType.MISTRAL]: {
    id: ProviderType.MISTRAL,
    name: 'Mistral Le Chat (Codestral)',
    url: 'https://chat.mistral.ai',
    description: 'Especializado en generación precisa y síntesis técnica.',
    config: MISTRAL_CONFIG,
    createDriver: () => new MistralDriver(),
  },
  [ProviderType.PERPLEXITY]: {
    id: ProviderType.PERPLEXITY,
    name: 'Perplexity AI',
    url: 'https://www.perplexity.ai',
    description: 'Ideal para investigación web, búsqueda de docs y librerías actualizadas.',
    config: PERPLEXITY_CONFIG,
    createDriver: () => new PerplexityDriver(),
  },
};

export class DriverFactory {
  public static createDriver(providerId?: string): BaseDriver {
    const raw = providerId || ProviderType.DEEPSEEK;
    const normalized = String(raw).toLowerCase().trim();
    const meta = AVAILABLE_PROVIDERS[normalized] || AVAILABLE_PROVIDERS[ProviderType.DEEPSEEK];
    if (!meta) {
      const valid = Object.keys(AVAILABLE_PROVIDERS).join(', ');
      throw new Error(`Proveedor desconocido: "${providerId}". Disponibles: ${valid}`);
    }
    return meta.createDriver();
  }

  public static getMeta(providerId?: string): ProviderMeta | undefined {
    if (!providerId) return AVAILABLE_PROVIDERS[ProviderType.DEEPSEEK];
    return AVAILABLE_PROVIDERS[String(providerId).toLowerCase().trim()];
  }

  public static getAllProviders(): ProviderMeta[] {
    return Object.values(AVAILABLE_PROVIDERS);
  }
}
