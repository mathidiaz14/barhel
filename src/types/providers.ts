export enum ProviderType {
  DEEPSEEK = 'deepseek',
  CLAUDE = 'claude',
  CHATGPT = 'chatgpt',
  GEMINI = 'gemini',
  QWEN = 'qwen',
  MISTRAL = 'mistral',
  PERPLEXITY = 'perplexity',
  OPENROUTER = 'openrouter',
}

export interface ProviderSelectors {
  inputPrompt: string[];
  sendButton: string[];
  stopButton: string[];
  responseContainer: string[];
  chatTurns: string[];
  streamingIndicator?: string[];
  loginIndicator?: string[];
}

export interface ProviderConfig {
  id: ProviderType;
  displayName: string;
  url: string;
  sessionDirName: string;
  selectors: ProviderSelectors;
  defaultTimeoutMs: number;
}
