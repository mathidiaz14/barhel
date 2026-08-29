import pc from 'picocolors';
/** A small command launcher that owns its terminal state only while visible. */
export class CommandPalette {
    commands;
    promptPrefix;
    onClose;
    onExecute;
    filteredCommands = [];
    selectedIndex = 0;
    inputBuffer = '';
    isOpen = false;
    isFinishing = false;
    stdinListener = null;
    resolveOpen = null;
    constructor(options) {
        this.commands = options.commands;
        this.promptPrefix = options.promptPrefix;
        this.onClose = options.onClose;
        this.onExecute = options.onExecute;
    }
    open(initialInput = '') {
        if (this.isOpen)
            return Promise.resolve();
        this.isOpen = true;
        this.inputBuffer = initialInput;
        this.selectedIndex = 0;
        this.filterCommands();
        this.stdinListener = (key) => this.handleKey(key);
        process.stdin.on('data', this.stdinListener);
        this.render();
        return new Promise((resolve) => {
            this.resolveOpen = resolve;
        });
    }
    handleKey(key) {
        if (this.isFinishing)
            return;
        const char = key.toString();
        if (char === '\x1b' || char === '\u0003') {
            this.finish();
            return;
        }
        if (char === '\r' || char === '\n') {
            void this.executeSelected();
            return;
        }
        if (key.equals(Buffer.from([0x1b, 0x5b, 0x41]))) {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.render();
            return;
        }
        if (key.equals(Buffer.from([0x1b, 0x5b, 0x42]))) {
            this.selectedIndex = Math.min(Math.max(0, this.filteredCommands.length - 1), this.selectedIndex + 1);
            this.render();
            return;
        }
        if (char === '\x7f' || char === '\b') {
            if (this.inputBuffer.length > 1) {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                this.selectedIndex = 0;
                this.filterCommands();
                this.render();
            }
            else {
                this.finish();
            }
            return;
        }
        if (char === '\t' && this.filteredCommands.length > 0) {
            this.inputBuffer = `${this.filteredCommands[this.selectedIndex].name} `;
            this.selectedIndex = 0;
            this.filterCommands();
            this.render();
            return;
        }
        if (char >= ' ' && char <= '~') {
            this.inputBuffer += char;
            this.selectedIndex = 0;
            this.filterCommands();
            this.render();
        }
    }
    filterCommands() {
        const commandText = this.inputBuffer.slice(1);
        const query = commandText.split(/\s+/, 1)[0].toLowerCase();
        this.filteredCommands = !query
            ? [...this.commands]
            : this.commands.filter((cmd) => cmd.name.toLowerCase().includes(query) ||
                cmd.description.toLowerCase().includes(query) ||
                cmd.aliases?.some((alias) => alias.toLowerCase().includes(query)));
    }
    async executeSelected() {
        this.isFinishing = true;
        const [command, ...args] = this.inputBuffer.trim().split(/\s+/);
        const selected = this.filteredCommands[this.selectedIndex];
        const selectedMatchesTypedCommand = selected && (!command ||
            command === '/' ||
            selected.name.startsWith(command) ||
            selected.aliases?.some((alias) => alias.startsWith(command)));
        this.restoreTerminal();
        try {
            if (selectedMatchesTypedCommand) {
                await selected.action(args.join(' '));
            }
            else if (command.startsWith('/')) {
                await this.onExecute(command.toLowerCase(), args.join(' '));
            }
        }
        finally {
            this.complete();
        }
    }
    render() {
        if (!this.isOpen)
            return;
        const width = 66;
        const visibleCount = 9;
        const start = Math.max(0, Math.min(this.selectedIndex - Math.floor(visibleCount / 2), this.filteredCommands.length - visibleCount));
        const visible = this.filteredCommands.slice(start, start + visibleCount);
        const query = this.inputBuffer || '/';
        process.stdout.write('\x1b[2J\x1b[H');
        process.stdout.write(`\n  ${pc.cyan('╭' + '─'.repeat(width) + '╮')}\n`);
        process.stdout.write(`  ${pc.cyan('│')}  ${pc.bold(pc.white('✦ Command palette'))}  ${pc.dim('Busca, completa y ejecuta acciones')} ${' '.repeat(12)}${pc.cyan('│')}\n`);
        process.stdout.write(`  ${pc.cyan('├' + '─'.repeat(width) + '┤')}\n`);
        process.stdout.write(`  ${pc.cyan('│')}  ${pc.green('›')} ${pc.bold(pc.white(query))}${' '.repeat(Math.max(1, width - query.length - 4))}${pc.cyan('│')}\n`);
        process.stdout.write(`  ${pc.cyan('├' + '─'.repeat(width) + '┤')}\n`);
        if (visible.length === 0) {
            process.stdout.write(`  ${pc.cyan('│')}  ${pc.dim('No hay comandos que coincidan. Presiona Esc para volver.')} ${' '.repeat(10)}${pc.cyan('│')}\n`);
        }
        else {
            for (let offset = 0; offset < visibleCount; offset++) {
                const cmd = visible[offset];
                if (!cmd) {
                    process.stdout.write(`  ${pc.cyan('│')}${' '.repeat(width)}${pc.cyan('│')}\n`);
                    continue;
                }
                const index = start + offset;
                const active = index === this.selectedIndex;
                const marker = active ? pc.bgCyan(pc.black(' › ')) : '   ';
                const name = active ? pc.bold(pc.white(cmd.name.padEnd(16))) : pc.cyan(cmd.name.padEnd(16));
                const aliases = cmd.aliases?.length ? pc.dim(`  ${cmd.aliases.join(' · ')}`) : '';
                process.stdout.write(`  ${pc.cyan('│')}${marker} ${name} ${pc.dim(cmd.description)}${aliases}\n`);
            }
        }
        const count = `${this.filteredCommands.length}/${this.commands.length}`;
        process.stdout.write(`  ${pc.cyan('├' + '─'.repeat(width) + '┤')}\n`);
        process.stdout.write(`  ${pc.cyan('│')}  ${pc.dim('↑↓ navegar   Enter ejecutar   Tab completar   Esc cerrar')} ${pc.dim(count.padStart(8))}  ${pc.cyan('│')}\n`);
        process.stdout.write(`  ${pc.cyan('╰' + '─'.repeat(width) + '╯')}\n`);
        process.stdout.write(`\n  ${pc.dim(this.promptPrefix)}${pc.dim('Elige un comando o sigue escribiendo…')}\n`);
    }
    finish() {
        if (this.isFinishing)
            return;
        this.isFinishing = true;
        this.restoreTerminal();
        this.complete();
    }
    restoreTerminal() {
        if (this.stdinListener) {
            process.stdin.off('data', this.stdinListener);
            this.stdinListener = null;
        }
        // The main REPL owns raw mode. Changing it here breaks input in some
        // Windows terminals after the palette closes, so the palette only owns
        // its listener and its rendered surface.
        process.stdout.write('\x1b[2J\x1b[H');
    }
    complete() {
        this.isOpen = false;
        this.isFinishing = false;
        this.onClose();
        const resolve = this.resolveOpen;
        this.resolveOpen = null;
        resolve?.();
    }
    isActive() {
        return this.isOpen;
    }
}
//# sourceMappingURL=commandPalette.js.map