export declare class WebServer {
    private server;
    private wss;
    private sessionManager;
    private activeLogins;
    private port;
    private workdir;
    constructor(options?: {
        port?: number;
        workdir?: string;
    });
    start(): Promise<void>;
    stop(): Promise<void>;
    private broadcast;
    private handleWs;
    private handleRequest;
    private handleStatic;
    private sendJson;
    private readBody;
    private handleApi;
    private handleLogin;
    private doLogin;
}
