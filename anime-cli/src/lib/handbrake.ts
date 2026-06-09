import { execa } from 'execa';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import type { HardsubJob } from '../types.js';
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
 * Scan an anime folder for Ep* subfolders that have both .mkv and vietsub.ass.
 * Returns ready-to-run hardsub jobs.
 */
export function scanHardsubJobs(animeFolder: string): {
  ready: HardsubJob[];
  skipped: { epFolder: string; reason: string }[];
} {
  const ready: HardsubJob[] = [];
  const skipped: { epFolder: string; reason: string }[] = [];

  let entries: string[];
  try {
    entries = readdirSync(animeFolder);
  } catch {
    return { ready, skipped };
  }

  for (const entry of entries.sort()) {
    const full = join(animeFolder, entry);
    if (!statSync(full).isDirectory()) continue;
    if (!/^Ep\d+$/i.test(entry)) continue;

    const inner = readdirSync(full);
    const mkv = inner.find((f) => f.toLowerCase().endsWith('.mkv'));
    const ass = inner.find((f) => f.toLowerCase() === 'vietsub.ass');

    if (!mkv) {
      skipped.push({ epFolder: entry, reason: 'Không có file .mkv' });
      continue;
    }
    if (!ass) {
      skipped.push({ epFolder: entry, reason: 'Không có vietsub.ass' });
      continue;
    }

    const mkvPath = join(full, mkv);
    const assPath = join(full, ass);
    const outName = `${basename(mkv, extname(mkv))}_vietsub.mp4`;
    const outputPath = join(full, outName);

    if (isFile(outputPath)) {
      skipped.push({ epFolder: entry, reason: `Đã có ${outName}` });
      continue;
    }

    ready.push({ epFolder: full, mkvPath, assPath, outputPath });
  }

  return { ready, skipped };
}

export function checkHandBrakeCliExists(path: string): boolean {
  return existsSync(path);
}
