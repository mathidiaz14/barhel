export interface WorkerAnalysisRecord {
    id: string;
    workerName: string;
    subtaskPrompt: string;
    fullResponse: string;
    timestamp: string;
    durationMs?: number;
}
export declare class WorkerStore {
    private static records;
    static addRecord(record: Omit<WorkerAnalysisRecord, 'id' | 'timestamp'>): WorkerAnalysisRecord;
    static getRecords(): WorkerAnalysisRecord[];
    static getRecord(id: string): WorkerAnalysisRecord | undefined;
    static clear(): void;
}
