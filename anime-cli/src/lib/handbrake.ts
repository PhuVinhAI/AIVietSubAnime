import { execa } from 'execa';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import type { HardsubCandidate, HardsubJob } from '../types.js';
import { ensureDir, isFile } from './fsx.js';

export type HardsubOptions = {
  handbrakeCliPath: string;
  job: HardsubJob;
  /** ICQ (Intelligent Constant Quality) cho QuickSync. Mặc định 18 theo spec. */
  quality?: number;
};

/**
 * HandBrake CLI args theo cấu hình GUI user cung cấp:
 *  - Video: H.265 10-bit Intel QuickSync (`qsv_h265_10bit`)
 *  - Framerate: Same as source + VFR
 *  - Quality: ICQ 18
 *  - Encoder preset: quality (max right)
 *  - Audio: track 1, EAC3 passthru
 *  - Subtitle: track 1 (external ssa file), burn-in
 *  - Filters: all off (default)
 */
export async function runHardsub(opts: HardsubOptions): Promise<void> {
  const { handbrakeCliPath, job, quality = 18 } = opts;
  ensureDir(dirname(job.outputPath));

  await execa(handbrakeCliPath, [
    '-i', job.mkvPath,
    '-o', job.outputPath,
    '--ssa-file', job.assPath,
    '-e', 'qsv_h265_10bit',
    '--vfr',
    '-q', String(quality),
    '--encoder-preset', 'quality',
    '-a', '1',
    '-E', 'eac3',
    '-s', '1',
    '--subtitle-burned=1',
  ]);
}

/**
 * Quét Ep* subfolders trong anime folder, trả về tất cả candidate kèm flag
 * hasOutput (đã encode trước) và missingAss (chưa có vietsub.ass).
 * Caller (UI) quyết định lọc / hỏi ghi đè.
 */
export function scanHardsubCandidates(animeFolder: string): {
  candidates: HardsubCandidate[];
  skipped: { epName: string; reason: string }[];
} {
  const candidates: HardsubCandidate[] = [];
  const skipped: { epName: string; reason: string }[] = [];

  let entries: string[];
  try {
    entries = readdirSync(animeFolder);
  } catch {
    return { candidates, skipped };
  }

  for (const entry of entries.sort()) {
    const full = join(animeFolder, entry);
    if (!statSync(full).isDirectory()) continue;
    if (!/^Ep\d+$/i.test(entry)) continue;

    const inner = readdirSync(full);
    const mkv = inner.find((f) => f.toLowerCase().endsWith('.mkv'));
    const ass = inner.find((f) => f.toLowerCase() === 'vietsub.ass');

    if (!mkv) {
      skipped.push({ epName: entry, reason: 'Không có file .mkv' });
      continue;
    }

    const mkvPath = join(full, mkv);
    const assPath = ass ? join(full, ass) : '';
    const outName = `${basename(mkv, extname(mkv))}_vietsub.mp4`;
    const outputPath = join(full, outName);

    candidates.push({
      epFolder: full,
      epName: entry,
      mkvPath,
      assPath,
      outputPath,
      hasOutput: isFile(outputPath),
      missingAss: !ass,
    });
  }

  return { candidates, skipped };
}

export function checkHandBrakeCliExists(path: string): boolean {
  return existsSync(path);
}
