import { Ora } from 'ora';
declare class Logger {
    info(message: string, prefix?: string): void;
    success(message: string): void;
    warn(message: string): void;
    error(message: string, error?: unknown): void;
    printHelp(): void;
    startSpinner(text: string): Ora;
    stopSpinner(): void;
}
export declare const logger: Logger;
export {};
