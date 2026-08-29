import ora from 'ora';
let activeSpinner = null;
export function startSpinner(text, color = 'cyan') {
    stopSpinner();
    activeSpinner = ora({
        text,
        color,
        spinner: 'dots',
    }).start();
    return activeSpinner;
}
export function stopSpinner() {
    if (activeSpinner && activeSpinner.isSpinning) {
        activeSpinner.stop();
        activeSpinner = null;
    }
}
export function updateSpinnerText(text) {
    if (activeSpinner && activeSpinner.isSpinning) {
        activeSpinner.text = text;
    }
}
export function isSpinnerActive() {
    return !!activeSpinner && activeSpinner.isSpinning;
}
//# sourceMappingURL=spinner.js.map