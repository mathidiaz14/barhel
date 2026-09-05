export type WatchEvent = 'changed' | 'created' | 'deleted';
export type WatchCallback = (event: WatchEvent, filepath: string) => void;
export declare class FileWatcher {
    private watcher;
    private isWatching;
    private watchDir;
    private debounceMap;
    private allowedExtensions;
    start(workdir: string, onEvent: WatchCallback): void;
    stop(): void;
    get isRunning(): boolean;
}
