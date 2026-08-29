import pc from 'picocolors';
import { startSpinner as startSharedSpinner, stopSpinner as stopSharedSpinner } from './spinner.js';
class Logger {
    info(message, prefix = 'INFO') {
        this.stopSpinner();
        console.log(`${pc.cyan(pc.bold(`[${prefix}]`))} ${message}`);
    }
    success(message) {
        this.stopSpinner();
        console.log(`${pc.green(pc.bold('✓'))} ${message}`);
    }
    warn(message) {
        this.stopSpinner();
        console.log(`${pc.yellow(pc.bold('⚠'))} ${message}`);
    }
    error(message, error) {
        this.stopSpinner();
        console.log(`${pc.red(pc.bold('✖'))} ${message}`);
        if (error) {
            if (error instanceof Error) {
                console.error(pc.red(error.stack || error.message));
            }
            else {
                console.error(pc.red(String(error)));
            }
        }
    }
    printHelp() {
        const dim = pc.dim;
        const cyan = pc.cyan;
        const yellow = pc.yellow;
        const bold = pc.bold;
        const white = pc.white;
        console.log();
        console.log(`  ${bold(white('Commands'))}`);
        console.log();
        console.log(`  ${bold(yellow('/help'))}              ${dim('Show this help')}`);
        console.log(`  ${bold(yellow('/workers'))}           ${dim('View agent analysis')}`);
        console.log(`  ${bold(yellow('/think'))}             ${dim('Toggle reasoning display')}`);
        console.log(`  ${bold(yellow('/resume'))}            ${dim('Resume previous session')}`);
        console.log(`  ${bold(yellow('/new [title]'))}       ${dim('Start new session')}`);
        console.log(`  ${bold(yellow('/title <text>'))}      ${dim('Rename current session')}`);
        console.log(`  ${bold(yellow('/sessions'))}          ${dim('List saved sessions')}`);
        console.log(`  ${bold(yellow('/config'))}            ${dim('Configure models')}`);
        console.log(`  ${bold(yellow('/leader <id>'))}       ${dim('Switch leader model manually')}`);
        console.log(`  ${bold(yellow('/auto'))}              ${dim('Toggle autonomous mode')}`);
        console.log(`  ${bold(yellow('/plan'))}              ${dim('Toggle PLAN ONLY mode (no real changes)')}`);
        console.log(`  ${bold(yellow('/commit [msg]'))}      ${dim('Git commit workspace changes')}`);
        console.log(`  ${bold(yellow('/review'))}            ${dim('Show git status + diff')}`);
        console.log(`  ${bold(yellow('/explain <topic>'))}   ${dim('Ask leader to explain code (no edits)')}`);
        console.log(`  ${bold(yellow('/fix [error]'))}       ${dim('Run "check" and fix type/lint errors')}`);
        console.log(`  ${bold(yellow('/summarize'))}         ${dim('Generate session memory summary')}`);
        console.log(`  ${bold(yellow('/export [json|md]'))}  ${dim('Export current session')}`);
        console.log(`  ${bold(yellow('/backup [file]'))}     ${dim('Export all browser sessions and history')}`);
        console.log(`  ${bold(yellow('/restore <file>'))}    ${dim('Import browser sessions and history')}`);
        console.log(`  ${bold(yellow('/login [name]'))}      ${dim('Login to provider')}`);
        console.log(`  ${bold(yellow('/clear'))}             ${dim('Clear screen')}`);
        console.log(`  ${bold(yellow('/exit'))}              ${dim('Exit barhel')}`);
        console.log();
        console.log(`  ${dim('Type any text to send to the agent')}`);
        console.log();
    }
    startSpinner(text) {
        return startSharedSpinner(text);
    }
    stopSpinner() {
        stopSharedSpinner();
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map