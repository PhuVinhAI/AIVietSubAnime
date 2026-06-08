import { execa } from 'execa';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ToolCheck = {
  ok: boolean;
  path?: string;
  error?: string;
};

async function checkOnPath(cmd: string): Promise<ToolCheck> {
  try {
    const args = cmd === 'mkvextract' ? ['--version'] : ['-version'];
    const result = await execa(cmd, args, { reject: false });
    if (result.exitCode === 0 || result.exitCode === 1) {
      return { ok: true, path: cmd };
    }
    return { ok: false, error: `exit code ${result.exitCode}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function checkFfmpeg(): Promise<ToolCheck> {
  return checkOnPath('ffmpeg');
}

export async function checkMkvextract(): Promise<ToolCheck> {
  return checkOnPath('mkvextract');
}

// Find HandBrakeCLI.exe under <project-root>/Tools/HandBrakeCLI-{ver}-win-{arch}/
// Project root is detected by walking up from the CLI script.
export function findHandBrakeCLI(): ToolCheck {
  const here = dirname(fileURLToPath(import.meta.url));
  // walk up max 5 levels to find a folder containing "Tools"
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
        return { ok: false, error: `HandBrakeCLI.exe không có trong ${join(toolsDir, hbDir)}` };
      }
      return { ok: false, error: `Không tìm thấy folder HandBrakeCLI-*-win-* trong ${toolsDir}` };
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
  return { ffmpeg, mkvextract, handbrake };
}
