#!/usr/bin/env node
import { render } from 'ink';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { App } from './App.js';

function findProjectRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 8; i++) {
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
    if (existsSync(resolve(dir, 'anime-cli')) && existsSync(resolve(dir, 'Anime'))) {
      return dir;
    }
  }
  return process.cwd();
}

const args = process.argv.slice(2);
const cmd = args[0]?.toLowerCase();

let initialMode: 'prepare' | 'hardsub' | 'export' | 'youtube' | undefined;
let initialPath: string | undefined;

if (
  cmd === 'prepare' ||
  cmd === 'hardsub' ||
  cmd === 'export' ||
  cmd === 'youtube'
) {
  initialMode = cmd;
  initialPath = args[1];
} else if (cmd === '--help' || cmd === '-h') {
  console.log(`
AIVietSubAnime CLI

Usage:
  anime-cli                          # Menu chọn chế độ
  anime-cli prepare [path]           # Quét + extract audio/sub
  anime-cli youtube [url]            # Tải video YouTube + sub → .ass
  anime-cli hardsub [anime-folder]   # Hardsub queue
  anime-cli export  [anime-folder]   # Copy *_vietsub.mp4 ra USB / điện thoại

Examples:
  anime-cli prepare "D:\\Raw\\Oi Tonbo"
  anime-cli youtube "https://www.youtube.com/watch?v=..."
  anime-cli hardsub "./Anime/Oi Tonbo 2nd Season"
  anime-cli export  "./Anime/Oi Tonbo 2nd Season"
`);
  process.exit(0);
}

const projectRoot = findProjectRoot();

render(<App initialMode={initialMode} initialPath={initialPath} projectRoot={projectRoot} />);
