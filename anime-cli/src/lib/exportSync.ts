import { createReadStream, createWriteStream, readdirSync, statSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { ExportCandidate } from '../types.js';

export type DestClassification =
  | { ok: true; kind: 'fs'; abs: string }
  | { ok: true; kind: 'mtp'; shellPath: string }
  | { ok: false; reason: string };

/**
 * Phân loại path đích thành `fs` (filesystem thật — copy bằng stream),
 * `mtp` (Windows shell namespace — copy bằng PowerShell Shell.Application),
 * hoặc invalid.
 *
 * MTP indicators: bất kỳ tiền tố nào "This PC\\", "Máy tính này\\", "Computer\\",
 * hoặc đoạn nào chứa "Internal storage" / "Bộ nhớ trong" → đó là shell namespace
 * Windows Explorer dùng để mount Android qua USB. Node.js không ghi được trực tiếp,
 * phải qua Shell COM (xem `mtpCopy.ts`).
 */
export function classifyDestPath(raw: string): DestClassification {
  const p = raw.trim();
  if (!p) return { ok: false, reason: 'Path rỗng.' };

  const isMtp =
    /^This PC[\\/]/i.test(p) ||
    /^Máy tính này[\\/]/i.test(p) ||
    /^Computer[\\/]/i.test(p) ||
    /^My Computer[\\/]/i.test(p) ||
    /Internal (shared )?storage/i.test(p) ||
    /Bộ nhớ trong/i.test(p);

  if (isMtp) {
    const segs = p.split(/[\\/]/).filter(Boolean);
    if (segs.length < 3) {
      return {
        ok: false,
        reason:
          'Path MTP cần đủ format "This PC\\<tên máy>\\<folder>\\...". Vd:\n' +
          '  "This PC\\OPPO Reno4\\Bộ nhớ trong dùng chung\\Download"',
      };
    }
    if (process.platform !== 'win32') {
      return {
        ok: false,
        reason: 'MTP shell path chỉ chạy được trên Windows (qua PowerShell Shell.Application).',
      };
    }
    return { ok: true, kind: 'mtp', shellPath: p };
  }

  if (process.platform === 'win32') {
    const isDriveLetter = /^[A-Za-z]:[\\/]/.test(p);
    const isUNC = /^\\\\/.test(p);
    if (!isDriveLetter && !isUNC) {
      return {
        ok: false,
        reason:
          'Path phải là một trong:\n' +
          '  · Drive letter:  D:\\Anime  /  E:\\Download\n' +
          '  · UNC share:     \\\\server\\share\n' +
          '  · MTP shell:     This PC\\<tên máy>\\<folder>\\...',
      };
    }
  } else if (!isAbsolute(p)) {
    return { ok: false, reason: 'Path phải absolute.' };
  }
  return { ok: true, kind: 'fs', abs: p };
}

/** @deprecated dùng `classifyDestPath` để phân biệt fs vs mtp. */
export function validateDestPath(
  raw: string
): { ok: true; abs: string } | { ok: false; reason: string } {
  const c = classifyDestPath(raw);
  if (!c.ok) return c;
  if (c.kind === 'fs') return { ok: true, abs: c.abs };
  return { ok: true, abs: c.shellPath };
}

export type ExportProgress = {
  /** Byte đã copy. */
  bytesCopied: number;
  /** Tổng byte cần copy. */
  totalBytes: number;
  /** Bytes/giây ước lượng từ vận tốc gần đây. */
  bytesPerSecond: number;
};

export type CopyOptions = {
  src: string;
  dest: string;
  onProgress?: (p: ExportProgress) => void;
  /** Khoảng emit progress callback (ms). Mặc định 100ms. */
  throttleMs?: number;
};

/**
 * Stream copy với throttled progress callback.
 *
 * Dùng pipeline để đảm bảo:
 *  - Backpressure đúng (USB chậm không khiến RAM phình).
 *  - Cả 2 stream được đóng kể cả lỗi giữa chừng.
 *  - Lỗi propagate qua await.
 */
export async function copyFileWithProgress(opts: CopyOptions): Promise<void> {
  const { src, dest, onProgress, throttleMs = 100 } = opts;
  await mkdir(dirname(dest), { recursive: true });

  const totalBytes = statSync(src).size;
  const read = createReadStream(src, { highWaterMark: 1024 * 1024 }); // 1 MiB chunk
  const write = createWriteStream(dest);

  let bytesCopied = 0;
  const startTime = performance.now();
  let lastEmit = 0;

  if (onProgress) {
    read.on('data', (chunk) => {
      bytesCopied += chunk.length;
      const now = performance.now();
      if (bytesCopied < totalBytes && now - lastEmit < throttleMs) return;
      lastEmit = now;
      const elapsedSec = Math.max(0.001, (now - startTime) / 1000);
      onProgress({
        bytesCopied,
        totalBytes,
        bytesPerSecond: bytesCopied / elapsedSec,
      });
    });
  }

  try {
    await pipeline(read, write);
  } catch (e) {
    // Best-effort: xoá file đích lỡ tạo dở khi copy fail (vd USB rút giữa chừng).
    try {
      await unlink(dest);
    } catch {}
    throw e;
  }
  onProgress?.({
    bytesCopied: totalBytes,
    totalBytes,
    bytesPerSecond: bytesCopied / Math.max(0.001, (performance.now() - startTime) / 1000),
  });
}

/**
 * Quét các Ep* subfolder trong anime folder, tìm tất cả file `*_vietsub.mp4`.
 *
 * Trả về:
 *  - candidates: list ep có vietsub.mp4 sẵn sàng để copy.
 *  - skipped: ep bị bỏ qua kèm lý do (vd không có file vietsub.mp4).
 */
export function scanExportCandidates(animeFolder: string): {
  candidates: ExportCandidate[];
  skipped: { epName: string; reason: string }[];
} {
  const candidates: ExportCandidate[] = [];
  const skipped: { epName: string; reason: string }[] = [];

  let entries: string[];
  try {
    entries = readdirSync(animeFolder);
  } catch {
    return { candidates, skipped };
  }

  for (const entry of entries.sort()) {
    const full = join(animeFolder, entry);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!/^Ep\d+$/i.test(entry)) continue;

    let inner: string[];
    try {
      inner = readdirSync(full);
    } catch {
      skipped.push({ epName: entry, reason: 'Không đọc được folder' });
      continue;
    }
    const mp4 = inner.find((f) => /_vietsub\.mp4$/i.test(f));
    if (!mp4) {
      skipped.push({ epName: entry, reason: 'Chưa có *_vietsub.mp4 (chạy hardsub trước)' });
      continue;
    }
    const vietsubPath = join(full, mp4);
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(vietsubPath).size;
    } catch {
      skipped.push({ epName: entry, reason: 'File vietsub.mp4 không truy cập được' });
      continue;
    }
    candidates.push({
      epFolder: full,
      epName: entry,
      vietsubPath,
      fileName: basename(vietsubPath),
      sizeBytes,
    });
  }

  return { candidates, skipped };
}
