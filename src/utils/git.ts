import path from 'node:path';
import fs from 'node:fs';
import { execAsync } from './exec.js';

export interface GitResult {
  success: boolean;
  stdout: string;
  error?: string;
}

export function getGitBranch(cwd: string): string {
  try {
    const headPath = path.join(cwd, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, 'utf-8').trim();
      const match = head.match(/ref: refs\/heads\/(.+)/);
      if (match) return match[1];
      return head.slice(0, 7);
    }
  } catch {
    // Ignorar
  }
  return '';
}

async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    return { success: false, stdout: '', error: 'No es un repositorio git.' };
  }
  const shellCmd = args
    .map((a) => (/^[a-zA-Z0-9_./-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`))
    .join(' ');
  const res = await execAsync(`git ${shellCmd}`, { cwd });
  if (res.ok) {
    return { success: true, stdout: res.combined };
  }
  return { success: false, stdout: res.combined, error: res.raw };
}

export async function gitStatus(cwd: string): Promise<string> {
  const res = await runGit(cwd, ['status', '--short']);
  if (!res.success) return '';
  return res.stdout || '(working tree limpio)';
}

export async function gitDiff(cwd: string): Promise<string> {
  const res = await runGit(cwd, ['--no-pager', 'diff', 'HEAD']);
  if (!res.success) return `[git] ${res.error}`;
  return res.stdout || '(sin cambios respecto a HEAD)';
}

export async function gitCommit(cwd: string, message: string): Promise<string> {
  const addRes = await runGit(cwd, ['add', '-A']);
  if (!addRes.success) return `[git add] ${addRes.error}`;

  const commitRes = await runGit(cwd, ['commit', '--no-verify', '-m', message]);
  if (!commitRes.success) {
    if (commitRes.stdout.includes('nothing to commit')) return '(nada que commitear)';
    return `[git commit] ${commitRes.error || commitRes.stdout}`;
  }
  return commitRes.stdout || '(committed)';
}