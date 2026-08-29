export interface WorkerAnalysisRecord {
  id: string;
  workerName: string;
  subtaskPrompt: string;
  fullResponse: string;
  timestamp: string;
  durationMs?: number;
}

export class WorkerStore {
  private static records: WorkerAnalysisRecord[] = [];

  public static addRecord(record: Omit<WorkerAnalysisRecord, 'id' | 'timestamp'>): WorkerAnalysisRecord {
    const newRecord: WorkerAnalysisRecord = {
      ...record,
      id: (this.records.length + 1).toString(),
      timestamp: new Date().toISOString(),
    };
    this.records.push(newRecord);
    return newRecord;
  }

  public static getRecords(): WorkerAnalysisRecord[] {
    return [...this.records];
  }

  public static getRecord(id: string): WorkerAnalysisRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  public static clear(): void {
    this.records = [];
  }
}
