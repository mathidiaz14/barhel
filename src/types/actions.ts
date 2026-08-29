export type ActionType =
  | 'read_file'
  | 'write_file'
  | 'run_command'
  | 'list_directory'
  | 'delegate_task'
  | 'finish';

import { ProviderType } from './providers.js';

export type WorkerAgentType = ProviderType | string;

export interface ActionPayload {
  type: ActionType;
  path?: string;
  content?: string;
  command?: string;
  agent?: WorkerAgentType;
  prompt?: string;
  summary?: string;
}

export interface AgentResponse {
  thought: string;
  action: ActionPayload;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  isFinish?: boolean;
}

export interface CLIOptions {
  autonomous?: boolean;
  leader?: ProviderType | string;
  workers?: (ProviderType | string)[];
  workdir?: string;
  headless?: boolean;
  maxIterations?: number;
  timeout?: number;
  sessionId?: string;
  resume?: boolean;
  isNewSession?: boolean;
}
