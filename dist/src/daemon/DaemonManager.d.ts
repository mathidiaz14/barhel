export interface DaemonStatus {
    running: boolean;
    pid?: number;
    uptime?: number;
    logPath: string;
}
export declare class DaemonManager {
    private static getPidFile;
    private static getLogFile;
    static getStatus(): DaemonStatus;
    static startDaemon(workdir?: string): DaemonStatus;
    static stopDaemon(): boolean;
}
