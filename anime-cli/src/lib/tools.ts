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
  ytdlp: '',
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

// Find a binary under <project-root>/Tools/ (top-level or 1 dir deep).
// Walks up from the CLI script. Returns ToolCheck.
function findToolInProjectTools(
  binNames: string[],
  matchDir?: (entry: string) => boolean,
  innerFile?: string
): ToolCheck {
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 8; i++) {
    const toolsDir = join(dir, 'Tools');
    if (existsSync(toolsDir) && statSync(toolsDir).isDirectory()) {
      for (const name of binNames) {
        const direct = join(toolsDir, name);
        if (existsSync(direct)) return { ok: true, path: direct };
      }
      if (matchDir && innerFile) {
        const entries = readdirSync(toolsDir);
        const subDir = entries.find(
          (e) => matchDir(e) && statSync(join(toolsDir, e)).isDirectory()
        );
        if (subDir) {
          const exe = join(toolsDir, subDir, innerFile);
          if (existsSync(exe)) return { ok: true, path: exe };
          return { ok: false, error: `${innerFile} không có trong ${join(toolsDir, subDir)}` };
        }
      }
      return {
        ok: false,
        error: `Không tìm thấy ${binNames.join(' / ')} trong ${toolsDir}`,
      };
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return { ok: false, error: 'Không tìm thấy folder Tools/ ngược lên từ vị trí script' };
}

// Find HandBrakeCLI.exe under <project-root>/Tools/HandBrakeCLI-{ver}-win-{arch}/
// Project root is detected by walking up from the CLI script.
export function findHandBrakeCLI(): ToolCheck {
  return findToolInProjectTools(
    [],
    (e) => e.startsWith('HandBrakeCLI-'),
    'HandBrakeCLI.exe'
  );
}

export function findYtDlp(): ToolCheck {
  return findToolInProjectTools(['yt-dlp.exe', 'yt-dlp']);
}

export async function checkAllTools(): Promise<{
  ffmpeg: ToolCheck;
  mkvextract: ToolCheck;
  handbrake: ToolCheck;
  ytdlp: ToolCheck;
}> {
  const [ffmpeg, mkvextract] = await Promise.all([checkFfmpeg(), checkMkvextract()]);
  const handbrake = findHandBrakeCLI();
  const ytdlp = findYtDlp();

  if (ffmpeg.ok && ffmpeg.path) resolvedTools.ffmpeg = ffmpeg.path;
  if (mkvextract.ok && mkvextract.path) resolvedTools.mkvextract = mkvextract.path;
  if (handbrake.ok && handbrake.path) resolvedTools.handbrake = handbrake.path;
  if (ytdlp.ok && ytdlp.path) resolvedTools.ytdlp = ytdlp.path;

  return { ffmpeg, mkvextract, handbrake, ytdlp };
}
