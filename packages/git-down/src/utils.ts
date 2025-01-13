import type { Callback, GitDownOption, GitUrlInfo } from './types';
import { exec as execWithCallback } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { extname } from 'node:path';
import { promisify } from 'node:util';

export { existsSync } from 'node:fs';
export { rename as mv, writeFile } from 'node:fs/promises';
export { resolve } from 'node:path';
export { chdir, cwd } from 'node:process';
export { promisify };

export const exec = promisify(execWithCallback);

export function createOutput(path: string) {
  return mkdir(path, { recursive: true });
}

export function rmdir(path: string) {
  return rm(path, { recursive: true, force: true });
}

export function buildOption(option?: GitDownOption): Required<GitDownOption> {
  return {
    output: './git-down',
    branch: 'main',
    ...option,
  };
}

export function buildCallback(callback?: Callback) {
  return (error: Error | null) => {
    if (error) {
      if (!callback)
        throw error;
      callback(error);
    }
    if (callback) {
      callback(null);
    }
  };
}

export function parseGitUrl(url: string): GitUrlInfo {
  const pathname = url.replace(/(^https?:\/\/github\.com\/)|(^git@github\.com:)/, '/');
  const [, owner, project, , branch = '', ...filePaths] = pathname.split('/');

  const filePath = filePaths.join('/');
  const isFile = pathname.includes('blob') || Boolean(extname(filePath));

  return {
    href: url,
    owner,
    project: project.replace(/\.git$/, ''),
    isRepo: pathname.endsWith('.git') || (!pathname.includes('tree') && !pathname.includes('blob')),
    sourceType: isFile ? 'file' : 'dir',
    branch,
    pathname: filePath,
  };
}
