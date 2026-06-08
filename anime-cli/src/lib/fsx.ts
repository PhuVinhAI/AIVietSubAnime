import { copyFileSync, mkdirSync, renameSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function moveFile(src: string, dest: string): void {
  ensureDir(dirname(dest));
  if (src === dest) return;
  renameSync(src, dest);
}

export function copyFileSafe(src: string, dest: string): void {
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
}

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
