import { execa } from 'execa';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import type { HardsubCandidate, HardsubJob } from '../types.js';
import { ensureDir, isFile } from './fsx.js';

export type HardsubProgress = {
  /** 0..100 */
  percent: number;
  /** ETA (giây) hoặc null khi HandBrake chưa in. */
  etaSeconds: number | null;
  /** fps hiện tại hoặc null. */
  fps: number | null;
};

export type HardsubOptions = {
  handbrakeCliPath: string;
  job: HardsubJob;
  /** ICQ (Intelligent Constant Quality) cho QuickSync. Mặc định 18 theo spec. */
  quality?: number;
  /** Callback live progress parse từ HandBrakeCLI stdout/stderr. */
  onProgress?: (p: HardsubProgress) => void;
};

// Vd: "Encoding: task 1 of 1, 12.34 %"
// Hoặc: "Encoding: task 1 of 1, 12.34 % (50.00 fps, avg 60.00 fps, ETA 00h12m34s)"
const HB_PROGRESS_RE =
  /Encoding:[^,]*,\s*([\d.]+)\s*%(?:\s*\(\s*([\d.]+)\s*fps[^,]*,\s*avg\s*[\d.]+\s*fps,\s*ETA\s*(\d+)h(\d+)m(\d+)s\s*\))?/g;

/**
 * HandBrake CLI args theo cấu hình GUI user cung cấp:
 *  - Video: H.265 10-bit Intel QuickSync (`qsv_h265_10bit`)
 *  - Framerate: Same as source + VFR
 *  - Quality: ICQ 18
 *  - Encoder preset: quality (max right)
 *  - Audio: track 1, EAC3 passthru
 *  - Subtitle: track 1 (external ssa file), burn-in
 *  - Filters: all off (default)
 *
 * Nếu `onProgress` được cung cấp, parse các dòng "Encoding: ... NN.NN %"
 * (HandBrake xuất qua \r) để báo % + ETA + fps theo thời gian thực.
 */
export async function runHardsub(opts: HardsubOptions): Promise<void> {
  const { handbrakeCliPath, job, quality = 18, onProgress } = opts;
  ensureDir(dirname(job.outputPath));

  const sp = execa(handbrakeCliPath, [
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

  if (onProgress) {
    // HandBrake xen kẽ in 2 dạng dòng trong cùng 1 lần encode:
    //   "Encoding: task 1 of 1, 12.34 %"                                   ← thiếu fps/ETA
    //   "Encoding: task 1 of 1, 12.34 % (50.00 fps, avg ..., ETA 0h12m34s)" ← đầy đủ
    // Giữ giá trị fps/ETA gần nhất để dòng thiếu không reset UI về null
    // (gây hiệu ứng "giựt" — meta ẩn/hiện liên tục).
    let lastEta: number | null = null;
    let lastFps: number | null = null;
    const handleChunk = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      let last: HardsubProgress | null = null;
      let m: RegExpExecArray | null;
      HB_PROGRESS_RE.lastIndex = 0;
      while ((m = HB_PROGRESS_RE.exec(text)) !== null) {
        const percent = parseFloat(m[1]!);
        if (m[3] !== undefined && m[4] !== undefined && m[5] !== undefined) {
          lastEta =
            parseInt(m[3], 10) * 3600 +
            parseInt(m[4], 10) * 60 +
            parseInt(m[5], 10);
        }
        if (m[2] !== undefined) lastFps = parseFloat(m[2]);
        last = { percent, etaSeconds: lastEta, fps: lastFps };
      }
      if (last) onProgress(last);
    };
    sp.stdout?.on('data', handleChunk);
    sp.stderr?.on('data', handleChunk);
  }

  await sp;
  onProgress?.({ percent: 100, etaSeconds: 0, fps: null });
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
