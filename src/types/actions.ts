import { ProviderType } from './providers.js';

export type WorkerAgentType = ProviderType | string;

export interface DelegateTask {
  agent: WorkerAgentType;
  prompt: string;
}

export type ActionType =
  | 'read_file'
  | 'write_file'
  | 'run_command'
  | 'list_directory'
  | 'grep'
  | 'glob'
  | 'check'
  | 'eval_code'
  | 'auto_test'
  | 'codegraph'
  | 'use_skill'
  | 'delegate_task'
  | 'delegate_batch'
  | 'finish';

export interface ActionPayload {
  type: ActionType;
  path?: string;
  content?: string;
  command?: string;
  pattern?: string;
  symbol?: string;
  query?: string;
  skill?: string;
  code?: string;
  language?: string;
  targetFile?: string;
  agent?: WorkerAgentType;
  prompt?: string;
  tasks?: DelegateTask[];
  summary?: string;
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TodoItem {
  task: string;
  status: TodoStatus;
  assignedTo?: WorkerAgentType;
}

export interface AgentResponse {
  thought: string;
  todos?: TodoItem[];
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
  planOnly?: boolean;
  watchNotify?: boolean;
}
