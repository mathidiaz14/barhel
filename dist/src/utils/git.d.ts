export interface GitResult {
    success: boolean;
    stdout: string;
    error?: string;
}
export declare function getGitBranch(cwd: string): string;
export declare function gitStatus(cwd: string): Promise<string>;
export declare function gitDiff(cwd: string): Promise<string>;
export declare function gitCommit(cwd: string, message: string): Promise<string>;
