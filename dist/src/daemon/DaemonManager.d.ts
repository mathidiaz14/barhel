export interface DaemonStatus {
    running: boolean;
    pid?: number;
    uptime?: number;
    logPath: string;
}
export interface WebDaemonStatus {
    running: boolean;
    pid?: number;
    port?: number;
    logPath: string;
}
export declare class DaemonManager {
    private static getPidFile;
    private static getLogFile;
    private static getWebPidFile;
    private static getWebLogFile;
    static getStatus(): DaemonStatus;
    static startDaemon(workdir?: string): DaemonStatus;
    static stopDaemon(): boolean;
    static getWebStatus(): WebDaemonStatus;
    static startWebDaemon(port?: number, workdir?: string): WebDaemonStatus;
    static stopWebDaemon(): boolean;
}
