export declare class SnapshotManager {
    private static getSnapshotsDir;
    static takeSnapshot(workdir: string, sessionId: string): Promise<void>;
    static restoreSnapshot(workdir: string, sessionId: string): boolean;
}
