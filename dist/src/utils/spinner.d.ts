import { Ora } from 'ora';
/**
 * Spinner compartido por Logger y TUI para garantizar que solo exista un
 * spinner activo a la vez (evita salida de terminal corrupta).
 */
export type SpinnerColor = 'cyan' | 'yellow';
export declare function startSpinner(text: string, color?: SpinnerColor): Ora;
export declare function stopSpinner(): void;
export declare function updateSpinnerText(text: string): void;
export declare function isSpinnerActive(): boolean;
