import ora, { Ora } from 'ora';

let activeSpinner: Ora | null = null;

/**
 * Spinner compartido por Logger y TUI para garantizar que solo exista un
 * spinner activo a la vez (evita salida de terminal corrupta).
 */
export type SpinnerColor = 'cyan' | 'yellow';

export function startSpinner(text: string, color: SpinnerColor = 'cyan'): Ora {
  stopSpinner();
  activeSpinner = ora({
    text,
    color,
    spinner: 'dots',
  }).start();
  return activeSpinner;
}

export function stopSpinner(): void {
  if (activeSpinner && activeSpinner.isSpinning) {
    activeSpinner.stop();
    activeSpinner = null;
  }
}

export function updateSpinnerText(text: string): void {
  if (activeSpinner && activeSpinner.isSpinning) {
    activeSpinner.text = text;
  }
}

export function isSpinnerActive(): boolean {
  return !!activeSpinner && activeSpinner.isSpinning;
}