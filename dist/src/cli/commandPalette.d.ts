export interface CommandItem {
    name: string;
    description: string;
    aliases?: string[];
    action: (args?: string) => Promise<void> | void;
}
export interface CommandPaletteOptions {
    commands: CommandItem[];
    promptPrefix: string;
    onClose: () => void;
    onExecute: (command: string, args: string) => Promise<void>;
}
/** A small command launcher that owns its terminal state only while visible. */
export declare class CommandPalette {
    private readonly commands;
    private readonly promptPrefix;
    private readonly onClose;
    private readonly onExecute;
    private filteredCommands;
    private selectedIndex;
    private inputBuffer;
    private isOpen;
    private isFinishing;
    private stdinListener;
    private resolveOpen;
    constructor(options: CommandPaletteOptions);
    open(initialInput?: string): Promise<void>;
    private handleKey;
    private filterCommands;
    private executeSelected;
    private render;
    private finish;
    private restoreTerminal;
    private complete;
    isActive(): boolean;
}
