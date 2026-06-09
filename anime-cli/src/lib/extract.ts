import { execa } from 'execa';
import { join } from 'node:path';
import { copyFileSafe, ensureDir, isFile } from './fsx.js';
import { resolvedTools } from './tools.js';

export type ExtractOptions = {
  mkvPath: string;
  epFolder: string;
  baseName: string;
  trackId: number;
  /** Tổng thời lượng (giây). Bắt buộc nếu muốn % audio chính xác. */
  durationSeconds?: number | null;
  /**
   * Live progress callback. audioPct + subPct ∈ [0, 100].
   * Được gọi mỗi khi ffmpeg/mkvextract in dòng tiến độ mới.
   */
  onProgress?: (audioPct: number, subPct: number) => void;
};

// Vd: "size=    1024kB time=00:00:04.92 bitrate=..."
const FFMPEG_TIME_RE = /\btime=(\d+):(\d+):(\d+(?:\.\d+)?)/g;
// Vd: "Progress: 50%"
const MKVEXTRACT_RE = /Progress:\s*(\d+)\s*%/g;

function lastMatch(text: string, re: RegExp): RegExpExecArray | null {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) last = m;
  return last;
}

export async function extractAudio(
  mkvPath: string,
  mp3Path: string,
  opts: { durationSeconds?: number | null; onProgress?: (pct: number) => void } = {}
): Promise<void> {
  ensureDir(join(mp3Path, '..'));
  const sp = execa(resolvedTools.ffmpeg, [
    '-y',
    '-i', mkvPath,
    '-vn',
    '-c:a', 'libmp3lame',
    '-q:a', '2',
    mp3Path,
  ]);

  const dur = opts.durationSeconds ?? null;
  if (opts.onProgress && dur && dur > 0) {
    sp.stderr?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      const m = lastMatch(text, FFMPEG_TIME_RE);
      if (m && m[1] && m[2] && m[3]) {
        const t =
          parseInt(m[1], 10) * 3600 +
          parseInt(m[2], 10) * 60 +
          parseFloat(m[3]);
        opts.onProgress!(Math.min(100, (t / dur) * 100));
      }
    });
  }

  await sp;
  opts.onProgress?.(100);
}

export async function extractSub(
  mkvPath: string,
  trackId: number,
  outPath: string,
  opts: { onProgress?: (pct: number) => void } = {}
): Promise<void> {
  ensureDir(join(outPath, '..'));
  const sp = execa(resolvedTools.mkvextract, [
    'tracks',
    mkvPath,
    `${trackId}:${outPath}`,
  ]);

  if (opts.onProgress) {
    sp.stdout?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      const m = lastMatch(text, MKVEXTRACT_RE);
      if (m && m[1]) {
        opts.onProgress!(Math.min(100, parseInt(m[1], 10)));
      }
    });
  }

  await sp;
  opts.onProgress?.(100);
}

/**
 * Full per-episode prep: extract audio + sub, create backup .txt + vietsub.ass.
 *
 * Nếu cung cấp `onProgress` và `durationSeconds`, callback sẽ được gọi liên tục
 * với (audioPct, subPct) trong khi 2 process chạy song song.
 */
export async function prepareEpisode(opts: ExtractOptions): Promise<{
  mp3: string;
  ass: string;
  vietsub: string;
}> {
  const { epFolder, baseName, mkvPath, trackId, onProgress, durationSeconds } = opts;
  ensureDir(epFolder);

  const mp3 = join(epFolder, `${baseName}.mp3`);
  const ass = join(epFolder, `${baseName}_Track${trackId}.ass`);
  const vietsub = join(epFolder, 'vietsub.ass');

  let audioPct = 0;
  let subPct = 0;
  const fire = () => onProgress?.(audioPct, subPct);

  await Promise.all([
    extractAudio(mkvPath, mp3, {
      durationSeconds: durationSeconds ?? null,
      onProgress: onProgress
        ? (p) => {
            audioPct = p;
            fire();
          }
        : undefined,
    }),
    extractSub(mkvPath, trackId, ass, {
      onProgress: onProgress
        ? (p) => {
            subPct = p;
            fire();
          }
        : undefined,
    }),
  ]);

  if (isFile(ass)) {
    copyFileSafe(ass, `${ass}.txt`);
    copyFileSafe(ass, vietsub);
  }

  return { mp3, ass, vietsub };
}
