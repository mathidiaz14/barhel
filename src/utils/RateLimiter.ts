export class RateLimiter {
  private static timestamps: number[] = [];
  private static readonly MAX_REQUESTS = 30; // Max requests
  private static readonly WINDOW_MS = 60000; // per minute

  public static checkLimit(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.WINDOW_MS);
    if (this.timestamps.length >= this.MAX_REQUESTS) {
      return false; // Rate limit exceeded
    }
    this.timestamps.push(now);
    return true;
  }
}
