export declare class RateLimiter {
    private static timestamps;
    private static readonly MAX_REQUESTS;
    private static readonly WINDOW_MS;
    static checkLimit(): boolean;
}
