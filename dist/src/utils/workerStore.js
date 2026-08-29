export class WorkerStore {
    static records = [];
    static addRecord(record) {
        const newRecord = {
            ...record,
            id: (this.records.length + 1).toString(),
            timestamp: new Date().toISOString(),
        };
        this.records.push(newRecord);
        return newRecord;
    }
    static getRecords() {
        return [...this.records];
    }
    static getRecord(id) {
        return this.records.find((r) => r.id === id);
    }
    static clear() {
        this.records = [];
    }
}
//# sourceMappingURL=workerStore.js.map