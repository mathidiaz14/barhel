export class RateLimiter {
    static timestamps = [];
    static MAX_REQUESTS = 30; // Max requests
    static WINDOW_MS = 60000; // per minute
    static checkLimit() {
        const now = Date.now();
        this.timestamps = this.timestamps.filter(t => now - t < this.WINDOW_MS);
        if (this.timestamps.length >= this.MAX_REQUESTS) {
            return false; // Rate limit exceeded
        }
        this.timestamps.push(now);
        return true;
    }
}
//# sourceMappingURL=RateLimiter.js.map