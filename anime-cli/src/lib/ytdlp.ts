import { execa } from 'execa';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

import { extractAudio } from './extract.js';
import { ensureDir, copyFileSafe } from './fsx.js';
import { resolvedTools } from './tools.js';

export type YtFormat = {
  formatId: string;
  ext: string;
  /** "video" = video-only, "audio" = audio-only, "av" = combined */
  kind: 'video' | 'audio' | 'av';
  width: number | null;
  height: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  abr: number | null;
  tbr: number | null;
  language: string | null;
  filesize: number | null;
  formatNote: string | null;
};

export type YtSubtitle = {
  langCode: string;
  langName: string;
  /** true nếu là auto-generated caption (CC tự động). */
  automatic: boolean;
};

export type YoutubeProbe = {
  id: string;
  title: string;
  uploader: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  isLive: boolean;
  isPlaylist: boolean;
  formats: YtFormat[];
  subtitles: YtSubtitle[];
};

const SAFE_FOLDER_RE = /[\\/:*?"<>|]/g;

export function sanitizeFolderName(raw: string): string {
  return raw
    .replace(SAFE_FOLDER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function pickKind(vcodec: unknown, acodec: unknown): YtFormat['kind'] | null {
  const v = typeof vcodec === 'string' && vcodec !== 'none' ? vcodec : null;
  const a = typeof acodec === 'string' && acodec !== 'none' ? acodec : null;
  if (v && a) return 'av';
  if (v) return 'video';
  if (a) return 'audio';
  return null;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function probeYoutube(url: string): Promise<YoutubeProbe> {
  if (!resolvedTools.ytdlp) {
    throw new Error('yt-dlp chưa được resolve. Đặt yt-dlp.exe trong Tools/.');
  }
  const { stdout } = await execa(
    resolvedTools.ytdlp,
    ['-j', '--no-warnings', '--no-playlist', url],
    { reject: true, timeout: 60_000 }
  );

  const firstLine = stdout.split(/\r?\n/).find((l) => l.trim().startsWith('{'));
  if (!firstLine) throw new Error('yt-dlp không trả về JSON metadata.');

  const data = JSON.parse(firstLine) as Record<string, unknown>;

  const rawFormats = Array.isArray(data['formats']) ? (data['formats'] as unknown[]) : [];
  const formats: YtFormat[] = [];
  for (const raw of rawFormats) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as Record<string, unknown>;
    const ext = asStr(f['ext']);
    const protocol = asStr(f['protocol']);
    if (!ext || ext === 'mhtml' || protocol === 'mhtml') continue;
    const kind = pickKind(f['vcodec'], f['acodec']);
    if (!kind) continue;
    formats.push({
      formatId: String(f['format_id'] ?? ''),
      ext,
      kind,
      width: asNum(f['width']),
      height: asNum(f['height']),
      fps: asNum(f['fps']),
      vcodec: asStr(f['vcodec']),
      acodec: asStr(f['acodec']),
      abr: asNum(f['abr']),
      tbr: asNum(f['tbr']),
      language: asStr(f['language']),
      filesize: asNum(f['filesize']) ?? asNum(f['filesize_approx']),
      formatNote: asStr(f['format_note']),
    });
  }

  const subtitles: YtSubtitle[] = [];
  const seen = new Set<string>();
  const subSrc = data['subtitles'];
  if (subSrc && typeof subSrc === 'object') {
    for (const code of Object.keys(subSrc)) {
      seen.add(code);
      subtitles.push({ langCode: code, langName: prettyLang(code), automatic: false });
    }
  }
  const autoSrc = data['automatic_captions'];
  if (autoSrc && typeof autoSrc === 'object') {
    for (const code of Object.keys(autoSrc)) {
      if (seen.has(code)) continue;
      subtitles.push({ langCode: code, langName: prettyLang(code), automatic: true });
    }
  }

  return {
    id: String(data['id'] ?? ''),
    title: String(data['title'] ?? 'untitled'),
    uploader: asStr(data['uploader']) ?? asStr(data['channel']),
    durationSeconds: asNum(data['duration']),
    thumbnail: asStr(data['thumbnail']),
    isLive: data['is_live'] === true,
    isPlaylist: typeof data['playlist'] === 'string' || data['_type'] === 'playlist',
    formats,
    subtitles,
  };
}

function prettyLang(code: string): string {
  const base = code.split('-')[0] ?? code;
  const dict: Record<string, string> = {
    en: 'English',
    vi: 'Tiếng Việt',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    pt: 'Portuguese',
    ru: 'Russian',
    th: 'Thai',
    id: 'Indonesian',
    ar: 'Arabic',
  };
  const name = dict[base] ?? code.toUpperCase();
  return code.includes('-') ? `${name} (${code})` : name;
}

export function pickVideoFormats(probe: YoutubeProbe): YtFormat[] {
  const seenHeight = new Map<number, YtFormat>();
  for (const f of probe.formats) {
    if (f.kind !== 'video') continue;
    if (!f.height) continue;
    const cur = seenHeight.get(f.height);
    const curBr = cur?.tbr ?? cur?.filesize ?? 0;
    const nextBr = f.tbr ?? f.filesize ?? 0;
    if (!cur || nextBr > curBr) seenHeight.set(f.height, f);
  }
  return [...seenHeight.values()].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

export function pickAudioFormats(probe: YoutubeProbe): YtFormat[] {
  return probe.formats
    .filter((f) => f.kind === 'audio')
    .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));
}

export function suggestVideo(formats: YtFormat[]): YtFormat | null {
  const target = [1080, 720, 1440, 2160, 480];
  for (const h of target) {
    const hit = formats.find((f) => f.height === h);
    if (hit) return hit;
  }
  return formats[0] ?? null;
}

export function suggestAudio(formats: YtFormat[]): YtFormat | null {
  const m4a = formats.find((f) => f.ext === 'm4a' && (f.abr ?? 0) >= 100);
  if (m4a) return m4a;
  return formats[0] ?? null;
}

export type DownloadProgress = {
  stage: 'video' | 'audio' | 'merge' | 'subs' | 'done';
  /** 0..100 (giai đoạn hiện tại). */
  percent: number;
  /** Tốc độ raw, vd "5.12MiB/s". */
  speed: string | null;
  /** ETA raw, vd "00:14". */
  eta: string | null;
};

export type DownloadOptions = {
  url: string;
  outputDir: string;
  /** Tên file đầu ra (không có extension). yt-dlp tự append .ext. */
  baseName: string;
  videoFormatId?: string;
  audioFormatId?: string;
  /** Danh sách lang code (vd ["en","vi"]). Empty = không tải sub. */
  subLangs: string[];
  /** Tải cả auto-caption khi lang được chọn không có manual sub. */
  includeAutoSubs: boolean;
  onProgress?: (p: DownloadProgress) => void;
};

// "[download]  12.3% of  100.00MiB at  5.12MiB/s ETA 00:14"
// "[download] 100% of   12.34MiB in 00:02"
const PROGRESS_RE =
  /\[download\]\s+([\d.]+)%(?:\s+of\s+~?\s*[\d.]+\w+)?(?:\s+at\s+(\S+))?(?:\s+ETA\s+(\S+))?/gi;
const VIDEO_DEST_RE = /\[download\] Destination:\s*(.+\.(?:f\d+|video)\.\w+|.+\.\w+)/i;
const AUDIO_DEST_RE = /\[download\] Destination:\s*(.+\.(?:f\d+|audio)\.\w+|.+\.\w+)/i;

export async function downloadYoutube(opts: DownloadOptions): Promise<void> {
  if (!resolvedTools.ytdlp) {
    throw new Error('yt-dlp chưa được resolve.');
  }
  ensureDir(opts.outputDir);

  const formatParts: string[] = [];
  if (opts.videoFormatId && opts.audioFormatId) {
    formatParts.push(`${opts.videoFormatId}+${opts.audioFormatId}`);
  } else if (opts.videoFormatId) {
    formatParts.push(opts.videoFormatId);
  } else if (opts.audioFormatId) {
    formatParts.push(opts.audioFormatId);
  } else {
    formatParts.push('bestvideo+bestaudio/best');
  }

  const args: string[] = [
    '--no-warnings',
    '--no-playlist',
    '--no-mtime',
    '-f', formatParts.join('/'),
    '--merge-output-format', 'mp4',
    '-o', join(opts.outputDir, `${opts.baseName}.%(ext)s`),
    '--newline',
    '--progress',
  ];

  if (opts.subLangs.length > 0) {
    args.push('--write-subs');
    if (opts.includeAutoSubs) args.push('--write-auto-subs');
    args.push('--sub-langs', opts.subLangs.join(','));
    args.push('--convert-subs', 'ass');
    args.push('--sub-format', 'best');
  }

  if (resolvedTools.ffmpeg && resolvedTools.ffmpeg !== 'ffmpeg') {
    args.push('--ffmpeg-location', resolvedTools.ffmpeg);
  }

  args.push(opts.url);

  const sp = execa(resolvedTools.ytdlp, args, { reject: true });

  let stage: DownloadProgress['stage'] = 'video';
  let downloadIdx = 0;
  const hasVideo = !!opts.videoFormatId;
  const hasAudio = !!opts.audioFormatId;

  // yt-dlp xen kẽ in nhiều dạng dòng trong cùng 1 download:
  //   "[download]  12.3% of  100.00MiB at  5.12MiB/s ETA 00:14"  ← đầy đủ
  //   "[download] 100% of   12.34MiB in 00:02"                    ← thiếu speed/ETA
  //   "[download]   0.0% of  100.00MiB"                           ← thiếu cả 2
  // Giữ speed/ETA gần nhất trong stage hiện tại để dòng thiếu không reset UI về null
  // (gây flicker meta ẩn/hiện). Reset khi qua stage mới.
  let lastSpeed: string | null = null;
  let lastEta: string | null = null;
  const enterStage = (s: DownloadProgress['stage']) => {
    stage = s;
    lastSpeed = null;
    lastEta = null;
  };

  const handleChunk = (chunk: Buffer | string) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    const lines = text.split(/\r|\n/);

    for (const line of lines) {
      if (!line) continue;

      if (/^\[download\] Destination:/i.test(line)) {
        if (downloadIdx === 0) enterStage(hasVideo ? 'video' : hasAudio ? 'audio' : 'subs');
        else if (downloadIdx === 1) enterStage(hasAudio ? 'audio' : 'subs');
        else enterStage('subs');
        downloadIdx++;
        continue;
      }
      if (/\[Merger\]|\[ffmpeg\] Merging/i.test(line)) {
        enterStage('merge');
        opts.onProgress?.({ stage, percent: 0, speed: null, eta: null });
        continue;
      }
      if (/^\[(EmbedSubtitle|ffmpeg)\] Converting|^\[info\] Writing video subtitles/i.test(line)) {
        enterStage('subs');
        continue;
      }

      PROGRESS_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      let last: { p: number; s: string | null; e: string | null } | null = null;
      while ((m = PROGRESS_RE.exec(line)) !== null) {
        last = { p: parseFloat(m[1]!), s: m[2] ?? null, e: m[3] ?? null };
      }
      if (last) {
        if (last.s !== null) lastSpeed = last.s;
        if (last.e !== null) lastEta = last.e;
        opts.onProgress?.({
          stage,
          percent: Math.max(0, Math.min(100, last.p)),
          speed: lastSpeed,
          eta: lastEta,
        });
      }
    }
  };
  sp.stdout?.on('data', handleChunk);
  sp.stderr?.on('data', handleChunk);

  await sp;
  opts.onProgress?.({ stage: 'done', percent: 100, speed: null, eta: null });
}

/**
 * Sau khi download xong, tìm sub file đã convert sang .ass và copy thành vietsub.ass.
 * yt-dlp đặt tên dạng "<baseName>.<lang>.ass" — nếu user chọn nhiều lang, ưu tiên 'vi' rồi 'en'.
 */
export function pickAndCopyVietsubAss(
  outputDir: string,
  baseName: string,
  preferredLangs: string[]
): { source: string; vietsub: string } | null {
  const entries = readdirSync(outputDir).filter(
    (f) => f.startsWith(baseName + '.') && f.toLowerCase().endsWith('.ass')
  );
  if (entries.length === 0) return null;

  const order = [...preferredLangs, 'vi', 'en'];
  for (const lang of order) {
    const hit = entries.find((f) => f.includes(`.${lang}.`) || f.includes(`.${lang}-`));
    if (hit) {
      const src = join(outputDir, hit);
      const dst = join(outputDir, 'vietsub.ass');
      copyFileSafe(src, dst);
      return { source: src, vietsub: dst };
    }
  }
  const first = entries[0]!;
  const src = join(outputDir, first);
  const dst = join(outputDir, 'vietsub.ass');
  copyFileSafe(src, dst);
  return { source: src, vietsub: dst };
}

/**
 * Tạo bản sao .ass.txt cho mỗi file <baseName>.<lang>.ass — để dán vào AI dịch
 * mà không sợ ăn nhầm format ASS. Trả về danh sách file backup đã tạo.
 */
export function createAssTextBackups(outputDir: string, baseName: string): string[] {
  if (!existsSync(outputDir)) return [];
  const created: string[] = [];
  for (const f of readdirSync(outputDir)) {
    if (!f.startsWith(baseName + '.')) continue;
    if (!f.toLowerCase().endsWith('.ass')) continue;
    if (f.toLowerCase() === 'vietsub.ass') continue;
    const src = join(outputDir, f);
    const dst = `${src}.txt`;
    copyFileSafe(src, dst);
    created.push(dst);
  }
  return created;
}

/**
 * Sau download, scan outputDir tìm file media chính (video hoặc audio) khớp baseName.
 * Lọc bỏ file sub (.ass) và file part còn dở. Ưu tiên video, fallback audio.
 */
export function findDownloadedMedia(outputDir: string, baseName: string): string | null {
  if (!existsSync(outputDir)) return null;
  const videoExts = ['.mp4', '.mkv', '.webm', '.m4v', '.mov'];
  const audioExts = ['.m4a', '.opus', '.mp3', '.aac', '.ogg'];
  const all = readdirSync(outputDir).filter((f) => {
    if (!f.startsWith(baseName)) return false;
    if (f.endsWith('.part')) return false;
    if (f.toLowerCase().endsWith('.ass')) return false;
    if (f.toLowerCase().endsWith('.ass.txt')) return false;
    return true;
  });
  for (const exts of [videoExts, audioExts]) {
    const hit = all.find((f) => exts.includes(extname(f).toLowerCase()));
    if (hit) return join(outputDir, hit);
  }
  return null;
}

/** @deprecated Dùng `findDownloadedMedia`. */
export function findDownloadedVideo(outputDir: string, baseName: string): string | null {
  return findDownloadedMedia(outputDir, baseName);
}

/**
 * Tách audio thuần (mp3) từ file media đã tải. Giữ đồng bộ output với Prepare —
 * folder Ep luôn có `<baseName>.mp3` để pipeline dịch dùng làm reference.
 *
 * Nếu input đã là audio-only (m4a/opus), vẫn re-encode sang mp3 bằng ffmpeg.
 */
export async function extractMp3FromMedia(
  mediaPath: string,
  outputDir: string,
  baseName: string,
  durationSeconds: number | null,
  onProgress?: (pct: number) => void
): Promise<string> {
  ensureDir(outputDir);
  const mp3 = join(outputDir, `${baseName}.mp3`);
  await extractAudio(mediaPath, mp3, {
    durationSeconds: durationSeconds ?? null,
    onProgress,
  });
  return mp3;
}
