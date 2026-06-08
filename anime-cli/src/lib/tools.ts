import { execa } from 'execa';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ToolCheck = {
  ok: boolean;
  path?: string;
  error?: string;
};

const KNOWN_LOCATIONS: Record<string, string[]> = {
  ffmpeg: [
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
  ],
  mkvextract: [
    'C:\\Program Files\\MKVToolNix\\mkvextract.exe',
    'C:\\Program Files (x86)\\MKVToolNix\\mkvextract.exe',
  ],
};

/**
 * Resolved tool paths. Populated by checkAllTools().
 * Used by probe.ts and extract.ts when spawning processes.
 */
export const resolvedTools = {
  ffmpeg: 'ffmpeg',
  mkvextract: 'mkvextract',
  handbrake: '',
};

async function whereCmd(name: string): Promise<string | null> {
  try {
    const result = await execa('where', [name], { reject: false, timeout: 5000 });
    if (result.exitCode === 0 && result.stdout.trim()) {
      const first = result.stdout.split(/\r?\n/)[0]?.trim();
      if (first && existsSync(first)) return first;
    }
  } catch {}
  return null;
}

async function probeBinary(path: string, versionFlag: string): Promise<boolean> {
  try {
    const result = await execa(path, [versionFlag], { reject: false, timeout: 5000 });
    return result.exitCode === 0 && !result.stderr.toLowerCase().includes('not recognized');
  } catch {
    return false;
  }
}

async function findToolFlexible(
  binName: string,
  versionFlag: string,
  fallbackKey: string
): Promise<ToolCheck> {
  // 1. Try `where <name>`
  const onPath = await whereCmd(`${binName}.exe`);
  if (onPath && (await probeBinary(onPath, versionFlag))) {
    return { ok: true, path: onPath };
  }

  // 2. Try plain command (works if simple alias / batch wrapper)
  if (await probeBinary(binName, versionFlag)) {
    return { ok: true, path: binName };
  }

  // 3. Known install locations
  for (const loc of KNOWN_LOCATIONS[fallbackKey] ?? []) {
    if (existsSync(loc) && (await probeBinary(loc, versionFlag))) {
      return { ok: true, path: loc };
    }
  }

  return {
    ok: false,
    error: `Không tìm thấy ${binName}.exe trong PATH hoặc các vị trí cài đặt mặc định`,
  };
}

export async function checkFfmpeg(): Promise<ToolCheck> {
  return findToolFlexible('ffmpeg', '-version', 'ffmpeg');
}

export async function checkMkvextract(): Promise<ToolCheck> {
  return findToolFlexible('mkvextract', '--version', 'mkvextract');
}

// Find HandBrakeCLI.exe under <project-root>/Tools/HandBrakeCLI-{ver}-win-{arch}/
// Project root is detected by walking up from the CLI script.
export function findHandBrakeCLI(): ToolCheck {
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 8; i++) {
    const toolsDir = join(dir, 'Tools');
    if (existsSync(toolsDir) && statSync(toolsDir).isDirectory()) {
      const entries = readdirSync(toolsDir);
      const hbDir = entries.find(
        (e) => e.startsWith('HandBrakeCLI-') && statSync(join(toolsDir, e)).isDirectory()
      );
      if (hbDir) {
        const exe = join(toolsDir, hbDir, 'HandBrakeCLI.exe');
        if (existsSync(exe)) return { ok: true, path: exe };
        return {
          ok: false,
          error: `HandBrakeCLI.exe không có trong ${join(toolsDir, hbDir)}`,
        };
      }
      return {
        ok: false,
        error: `Không tìm thấy folder HandBrakeCLI-*-win-* trong ${toolsDir}`,
      };
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return { ok: false, error: 'Không tìm thấy folder Tools/ ngược lên từ vị trí script' };
}

export async function checkAllTools(): Promise<{
  ffmpeg: ToolCheck;
  mkvextract: ToolCheck;
  handbrake: ToolCheck;
}> {
  const [ffmpeg, mkvextract] = await Promise.all([checkFfmpeg(), checkMkvextract()]);
  const handbrake = findHandBrakeCLI();

  if (ffmpeg.ok && ffmpeg.path) resolvedTools.ffmpeg = ffmpeg.path;
  if (mkvextract.ok && mkvextract.path) resolvedTools.mkvextract = mkvextract.path;
  if (handbrake.ok && handbrake.path) resolvedTools.handbrake = handbrake.path;

  return { ffmpeg, mkvextract, handbrake };
}
