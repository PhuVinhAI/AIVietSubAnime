import { Alert, ProgressBar, Select, Spinner as UiSpinner } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { useEffect, useState } from 'react';

import { Brand } from '../components/Brand.js';
import { HintBar } from '../components/HintBar.js';
import { KeyValue } from '../components/KeyValue.js';
import { MultiSelect } from '../components/MultiSelect.js';
import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { ToolStatus } from '../components/ToolStatus.js';
import { ensureDir } from '../lib/fsx.js';
import { palette, sym } from '../lib/theme.js';
import { checkAllTools, type ToolCheck } from '../lib/tools.js';
import { useStepNav } from '../lib/useStepNav.js';
import {
  createAssTextBackups,
  downloadYoutube,
  extractMp3FromMedia,
  findDownloadedMedia,
  isPlaylistUrl,
  pickAndCopyVietsubAss,
  pickAudioFormats,
  pickVideoFormats,
  probeYoutube,
  probeYoutubePlaylist,
  sanitizeFolderName,
  suggestAudio,
  suggestVideo,
  type PlaylistEntry,
  type YoutubeProbe,
  type YtFormat,
} from '../lib/ytdlp.js';

const TOTAL_STEPS = 8;

type EpisodeJob = {
  index: number;
  epName: string;
  url: string;
  title: string;
  probe: YoutubeProbe;
  epFolder: string;
  /** Đã có file output từ lần trước (mp4 / mp3 / vietsub.ass). */
  hasOutput: boolean;
};

type Step =
  | { kind: 'tools' }
  | { kind: 'url' }
  | { kind: 'discovering'; url: string }
  | {
      kind: 'anime-name';
      url: string;
      entries: PlaylistEntry[];
      suggested: string;
      isSingle: boolean;
    }
  | {
      kind: 'probing-eps';
      url: string;
      animeName: string;
      entries: PlaylistEntry[];
      done: number;
      probes: YoutubeProbe[];
      skipped: { entry: PlaylistEntry; reason: string }[];
    }
  | {
      kind: 'pick-video';
      animeName: string;
      probes: YoutubeProbe[];
      entries: PlaylistEntry[];
      skippedCount: number;
    }
  | {
      kind: 'pick-audio';
      animeName: string;
      probes: YoutubeProbe[];
      entries: PlaylistEntry[];
      videoFormat: YtFormat | null;
    }
  | {
      kind: 'pick-subs';
      animeName: string;
      probes: YoutubeProbe[];
      entries: PlaylistEntry[];
      videoFormat: YtFormat | null;
      audioFormat: YtFormat | null;
    }
  | {
      kind: 'select-mode';
      animeName: string;
      outputDir: string;
      allJobs: EpisodeJob[];
      videoFormat: YtFormat | null;
      audioFormat: YtFormat | null;
      subLangs: string[];
      includeAuto: boolean;
    }
  | {
      kind: 'pick-eps';
      animeName: string;
      outputDir: string;
      allJobs: EpisodeJob[];
      videoFormat: YtFormat | null;
      audioFormat: YtFormat | null;
      subLangs: string[];
      includeAuto: boolean;
    }
  | {
      kind: 'confirm';
      animeName: string;
      outputDir: string;
      jobs: EpisodeJob[];
      videoFormat: YtFormat | null;
      audioFormat: YtFormat | null;
      subLangs: string[];
      includeAuto: boolean;
    }
  | {
      kind: 'processing';
      animeName: string;
      outputDir: string;
      jobs: EpisodeJob[];
      videoFormat: YtFormat | null;
      audioFormat: YtFormat | null;
      subLangs: string[];
      includeAuto: boolean;
      statuses: StatusItem[];
      perEpProgress: PerEpProgress[];
      current: number;
    }
  | { kind: 'done'; outputDir: string; statuses: StatusItem[] };

type PerEpProgress = {
  /** Stage hiện tại: download / mp3 / sub. */
  stage: string;
  speed: string | null;
  eta: string | null;
};

type Nav = { go: (next: Step) => void; back: () => boolean };

type Props = {
  initialUrl?: string;
  projectRoot: string;
};

const STEP_NUMBER: Partial<Record<Step['kind'], number>> = {
  url: 1,
  discovering: 1,
  'anime-name': 2,
  'probing-eps': 3,
  'pick-video': 4,
  'pick-audio': 5,
  'pick-subs': 6,
  'select-mode': 7,
  'pick-eps': 7,
  confirm: 7,
  processing: 8,
  done: 8,
};

function humanSize(n: number | null): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}

function humanDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function stripCodec(c: string): string {
  return c.split('.')[0] ?? c;
}

function formatLabel(f: YtFormat, sizeSuffix = ''): string {
  const parts: string[] = [];
  if (f.kind === 'video' || f.kind === 'av') {
    parts.push(f.height ? `${f.height}p` : 'video');
    if (f.fps && f.fps > 30) parts.push(`${Math.round(f.fps)}fps`);
  }
  parts.push(f.ext);
  if (f.kind === 'video' && f.vcodec) parts.push(stripCodec(f.vcodec));
  if (f.kind === 'audio') {
    if (f.abr) parts.push(`${Math.round(f.abr)}kbps`);
    if (f.acodec) parts.push(stripCodec(f.acodec));
  }
  parts.push(`${humanSize(f.filesize)}${sizeSuffix}`);
  return parts.join('  ' + sym.bullet + '  ');
}

function epHasOutput(epFolder: string): boolean {
  if (!existsSync(epFolder)) return false;
  try {
    const entries = readdirSync(epFolder);
    return entries.some((f) => {
      const lf = f.toLowerCase();
      return lf.endsWith('.mp4') || lf.endsWith('.mp3') || lf.endsWith('.ass');
    });
  } catch {
    return false;
  }
}

/**
 * Gộp format khả dụng theo height — chỉ giữ height có ở MỌI probe.
 * `filesize` được thay bằng TỔNG/TRUNG BÌNH của tất cả probe ở cùng height
 * (probe[0] làm representative cho ext/codec/fps; size lấy đại diện = trung bình).
 */
function commonVideoFormats(probes: YoutubeProbe[]): YtFormat[] {
  if (probes.length === 0) return [];
  const perProbeByHeight = probes.map((p) => {
    const map = new Map<number, YtFormat>();
    for (const f of pickVideoFormats(p)) if (f.height) map.set(f.height, f);
    return map;
  });
  const firstHeights = [...perProbeByHeight[0]!.keys()];
  const common = firstHeights.filter((h) => perProbeByHeight.every((m) => m.has(h)));

  return common
    .map((h) => {
      const all = perProbeByHeight.map((m) => m.get(h)!);
      const sizes = all.map((f) => f.filesize).filter((n): n is number => !!n);
      const avgSize =
        sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : null;
      const head = all[0]!;
      return { ...head, filesize: avgSize };
    })
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

function commonAudioFormats(probes: YoutubeProbe[]): YtFormat[] {
  if (probes.length === 0) return [];
  // Group theo (ext + acodec) để khớp track audio giữa các probe.
  const key = (f: YtFormat) => `${f.ext}|${f.acodec ?? ''}|${Math.round(f.abr ?? 0)}`;
  const groups = new Map<string, YtFormat[]>();
  for (const p of probes) {
    for (const f of pickAudioFormats(p)) {
      const k = key(f);
      const arr = groups.get(k) ?? [];
      arr.push(f);
      groups.set(k, arr);
    }
  }
  const out: YtFormat[] = [];
  for (const [, arr] of groups) {
    if (arr.length < probes.length) continue;
    const sizes = arr.map((f) => f.filesize).filter((n): n is number => !!n);
    const avgSize =
      sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : null;
    out.push({ ...arr[0]!, filesize: avgSize });
  }
  return out.sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));
}

function commonSubLangs(probes: YoutubeProbe[]): { code: string; name: string; automatic: boolean }[] {
  if (probes.length === 0) return [];
  // Manual subs phải có ở MỌI probe để hiển thị là "manual".
  // Auto-caption thì lấy union (YouTube cung cấp auto cho hầu hết langs).
  const manualSets = probes.map((p) => new Set(p.subtitles.filter((s) => !s.automatic).map((s) => s.langCode)));
  const firstManual = manualSets[0] ?? new Set<string>();
  const commonManual = [...firstManual].filter((c) => manualSets.every((s) => s.has(c)));
  const nameMap = new Map<string, string>();
  for (const p of probes) for (const s of p.subtitles) nameMap.set(s.langCode, s.langName);

  const out: { code: string; name: string; automatic: boolean }[] = [];
  for (const c of commonManual) out.push({ code: c, name: nameMap.get(c) ?? c, automatic: false });

  const autoUnion = new Set<string>();
  for (const p of probes) for (const s of p.subtitles) if (s.automatic) autoUnion.add(s.langCode);
  for (const c of autoUnion) if (!commonManual.includes(c)) {
    out.push({ code: c, name: nameMap.get(c) ?? c, automatic: true });
  }
  return out;
}

function findFormatByHeight(probe: YoutubeProbe, height: number | null): YtFormat | null {
  if (!height) return null;
  const list = pickVideoFormats(probe);
  return list.find((f) => f.height === height) ?? list[0] ?? null;
}

function findAudioByExtAbr(probe: YoutubeProbe, ref: YtFormat | null): YtFormat | null {
  if (!ref) return null;
  const list = pickAudioFormats(probe);
  return (
    list.find((f) => f.ext === ref.ext && Math.abs((f.abr ?? 0) - (ref.abr ?? 0)) < 10) ??
    list[0] ??
    null
  );
}

export function YoutubeMode({ initialUrl, projectRoot }: Props) {
  const { exit } = useApp();
  const [tools, setTools] = useState<{ ffmpeg: ToolCheck; ytdlp: ToolCheck } | null>(null);
  const nav = useStepNav<Step>({ kind: 'tools' });
  const { step, setStep, go, back, canBack } = nav;
  const [error, setError] = useState<string | null>(null);

  const isBackEnabled =
    !error &&
    canBack &&
    step.kind !== 'tools' &&
    step.kind !== 'discovering' &&
    step.kind !== 'probing-eps' &&
    step.kind !== 'processing' &&
    step.kind !== 'done';

  useInput(
    (_input, key) => {
      if (key.escape) back();
    },
    { isActive: isBackEnabled }
  );

  useEffect(() => {
    if (step.kind !== 'tools') return;
    let cancelled = false;
    checkAllTools().then((t) => {
      if (cancelled) return;
      setTools({ ffmpeg: t.ffmpeg, ytdlp: t.ytdlp });
      if (!t.ytdlp.ok) {
        setError('Thiếu yt-dlp.exe trong Tools/. Tải về và đặt vào Tools/yt-dlp.exe.');
        return;
      }
      if (!t.ffmpeg.ok) {
        setError('Thiếu ffmpeg trong PATH. yt-dlp cần ffmpeg để merge audio + video.');
        return;
      }
      if (initialUrl) setStep({ kind: 'discovering', url: initialUrl });
      else setStep({ kind: 'url' });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, initialUrl]);

  useEffect(() => {
    if (step.kind !== 'discovering') return;
    let cancelled = false;
    const run = async () => {
      try {
        if (isPlaylistUrl(step.url)) {
          const pl = await probeYoutubePlaylist(step.url);
          if (cancelled) return;
          if (pl.entries.length === 0) {
            setError('Playlist rỗng hoặc không truy cập được.');
            return;
          }
          setStep({
            kind: 'anime-name',
            url: step.url,
            entries: pl.entries,
            suggested: sanitizeFolderName(pl.title) || pl.playlistId,
            isSingle: false,
          });
        } else {
          // Single video → giả lập playlist 1 phần tử.
          const single = await probeYoutube(step.url);
          if (cancelled) return;
          if (single.isLive) {
            setError('Đây là livestream — chế độ này không hỗ trợ live.');
            return;
          }
          setStep({
            kind: 'anime-name',
            url: step.url,
            entries: [
              {
                id: single.id,
                title: single.title,
                index: 1,
                url: step.url,
              },
            ],
            suggested: sanitizeFolderName(single.title) || single.id,
            isSingle: true,
          });
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  useEffect(() => {
    if (step.kind !== 'probing-eps') return;
    let cancelled = false;
    const run = async () => {
      const probes: YoutubeProbe[] = [];
      const okEntries: PlaylistEntry[] = [];
      const skipped: { entry: PlaylistEntry; reason: string }[] = [];
      for (let i = 0; i < step.entries.length; i++) {
        if (cancelled) return;
        const ent = step.entries[i]!;
        try {
          const p = await probeYoutube(ent.url);
          probes.push(p);
          okEntries.push(ent);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const reason = /Private video/i.test(msg)
            ? 'Video private'
            : /unavailable|removed|deleted/i.test(msg)
              ? 'Video unavailable / đã gỡ'
              : /members-only|members only/i.test(msg)
                ? 'Members-only'
                : /age|sign in/i.test(msg)
                  ? 'Yêu cầu đăng nhập (age-gated)'
                  : msg.split('\n').find((l) => /ERROR/i.test(l))?.replace(/^\s*ERROR:\s*/i, '') ?? 'Lỗi không xác định';
          skipped.push({ entry: ent, reason });
        }
        setStep((s) =>
          s.kind === 'probing-eps'
            ? { ...s, done: i + 1, probes: [...probes], skipped: [...skipped] }
            : s
        );
      }
      if (cancelled) return;
      if (probes.length === 0) {
        setError(
          `Toàn bộ ${step.entries.length} video đều không probe được. Xem skipped list để biết lý do.`
        );
        return;
      }
      setStep({
        kind: 'pick-video',
        animeName: step.animeName,
        probes,
        entries: okEntries,
        skippedCount: skipped.length,
      });
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  useEffect(() => {
    if (step.kind !== 'processing') return;
    let cancelled = false;

    const run = async () => {
      const statuses = [...step.statuses];
      const perEp = [...step.perEpProgress];
      let doneCount = 0;
      const lastFlush = new Array<number>(step.jobs.length).fill(0);

      const flush = () => {
        setStep((s) =>
          s.kind === 'processing'
            ? { ...s, statuses: [...statuses], perEpProgress: [...perEp], current: doneCount }
            : s
        );
      };

      const processOne = async (job: EpisodeJob, i: number) => {
        if (cancelled) return;
        statuses[i] = {
          ...statuses[i]!,
          status: 'running',
          progress: 0,
          meta: 'khởi động yt-dlp',
        };
        flush();

        const baseName = sanitizeFolderName(job.title) || job.probe.id;
        const v = step.videoFormat ? findFormatByHeight(job.probe, step.videoFormat.height) : null;
        const a = step.audioFormat ? findAudioByExtAbr(job.probe, step.audioFormat) : null;

        try {
          ensureDir(job.epFolder);
          await downloadYoutube({
            url: job.url,
            outputDir: job.epFolder,
            baseName,
            videoFormatId: v?.formatId,
            audioFormatId: a?.formatId,
            subLangs: step.subLangs,
            includeAutoSubs: step.includeAuto,
            onProgress: (p) => {
              const now = performance.now();
              if (p.percent < 100 && now - (lastFlush[i] ?? 0) < 200) return;
              lastFlush[i] = now;
              perEp[i] = {
                stage: p.stage,
                speed: p.speed,
                eta: p.eta,
              };
              const speed = p.speed ? `  ${sym.bullet}  ${p.speed}` : '';
              const eta = p.eta ? `  ${sym.bullet}  ETA ${p.eta}` : '';
              statuses[i] = {
                ...statuses[i]!,
                status: 'running',
                progress: p.percent,
                meta: `[${p.stage.toUpperCase()}]${speed}${eta}`,
              };
              flush();
            },
          });
          if (cancelled) return;

          const media = findDownloadedMedia(job.epFolder, baseName);
          if (media) {
            perEp[i] = { stage: 'mp3', speed: null, eta: null };
            statuses[i] = {
              ...statuses[i]!,
              status: 'running',
              progress: 0,
              meta: '[MP3] tách audio thuần bằng ffmpeg',
            };
            flush();
            await extractMp3FromMedia(media, job.epFolder, baseName, job.probe.durationSeconds, (pct) => {
              const now = performance.now();
              if (pct < 100 && now - (lastFlush[i] ?? 0) < 200) return;
              lastFlush[i] = now;
              statuses[i] = {
                ...statuses[i]!,
                status: 'running',
                progress: pct,
                meta: '[MP3] tách audio thuần',
              };
              flush();
            });
          }

          if (step.subLangs.length > 0) {
            pickAndCopyVietsubAss(job.epFolder, baseName, step.subLangs);
            createAssTextBackups(job.epFolder, baseName);
          }

          statuses[i] = {
            ...statuses[i]!,
            status: 'done',
            progress: undefined,
            meta: undefined,
            detail: `${sym.arrowRight} ${job.epFolder}`,
          };
        } catch (e) {
          statuses[i] = {
            ...statuses[i]!,
            status: 'error',
            progress: undefined,
            meta: undefined,
            detail: e instanceof Error ? e.message : String(e),
          };
        }
        doneCount++;
        flush();
      };

      // Tải tuần tự để không nghẽn băng thông và parsing yt-dlp progress giữ ổn định.
      for (let i = 0; i < step.jobs.length; i++) {
        if (cancelled) return;
        await processOne(step.jobs[i]!, i);
      }

      if (cancelled) return;
      setStep({ kind: 'done', outputDir: step.outputDir, statuses });
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  useEffect(() => {
    if (step.kind === 'done') {
      const timer = setTimeout(() => exit(), 2500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step.kind, exit]);

  if (!tools) {
    return (
      <Box paddingX={1} paddingY={1}>
        <UiSpinner label=" Đang kiểm tra tools..." />
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Brand subtitle="YouTube mode" compact />
        <Box marginBottom={1}>
          <Alert variant="error" title="Đã xảy ra lỗi">
            {error}
          </Alert>
        </Box>
        {step.kind === 'url' && (
          <PathInput
            label="Nhập lại link"
            hint="Link YouTube hợp lệ (watch / playlist / youtu.be / shorts)"
            onSubmit={(url) => {
              setError(null);
              go({ kind: 'discovering', url });
            }}
          />
        )}
      </Box>
    );
  }

  const stepNumber = STEP_NUMBER[step.kind] ?? 1;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Brand subtitle="YouTube mode" compact />
      <ToolStatus
        ytdlp={tools.ytdlp}
        ffmpeg={tools.ffmpeg}
        showFfmpeg
        showMkvextract={false}
        showYtdlp
      />

      {step.kind === 'url' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Dán link YouTube"
            subtitle="Một video hoặc một playlist. Có ?list=... = playlist."
          />
          <PathInput
            label="URL"
            hint="Vd. https://www.youtube.com/watch?v=...  hoặc  /playlist?list=..."
            onSubmit={(url) => go({ kind: 'discovering', url: url.trim() })}
          />
        </Box>
      )}

      {step.kind === 'discovering' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Đang phân tích URL"
            subtitle={step.url}
          />
          <UiSpinner label=" yt-dlp đang detect single-video / playlist..." />
        </Box>
      )}

      {step.kind === 'anime-name' && (
        <AnimeNameUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'probing-eps' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Phân tích từng video"
            subtitle="yt-dlp lấy formats + subs cho mỗi ep. Video private / unavailable sẽ tự skip."
          />
          <Box paddingLeft={1} flexDirection="column">
            <Box width={36}>
              <ProgressBar value={(step.done / step.entries.length) * 100} />
            </Box>
            <Box marginTop={0}>
              <Text color={palette.accent} bold>
                {`${step.done}/${step.entries.length}`}
              </Text>
              <Text color={palette.muted}>{` video đã probe`}</Text>
              {step.skipped.length > 0 && (
                <Text color={palette.warn}>
                  {`  ${sym.bullet}  ${step.skipped.length} skip`}
                </Text>
              )}
            </Box>
            {step.skipped.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                {step.skipped.slice(-3).map((s, i) => (
                  <Text key={i} color={palette.warn}>
                    {`  ${sym.warning} Ep${String(s.entry.index).padStart(2, '0')}: ${s.reason}`}
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {step.kind === 'pick-video' && (
        <PickVideoUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'pick-audio' && (
        <PickAudioUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'pick-subs' && (
        <PickSubsUI step={step} nav={{ go, back }} projectRoot={projectRoot} stepNumber={stepNumber} />
      )}

      {step.kind === 'select-mode' && (
        <SelectModeUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'pick-eps' && (
        <PickEpsUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'confirm' && (
        <ConfirmUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'processing' && (
        <Box flexDirection="column">
          <StepHeader
            step={TOTAL_STEPS}
            total={TOTAL_STEPS}
            title={`Tải tuần tự  ${sym.bullet}  ${step.current}/${step.jobs.length} hoàn thành`}
            subtitle="yt-dlp + ffmpeg cho từng ep. Stage hiện trong meta."
          />
          <StatusList items={step.statuses} />
        </Box>
      )}

      {step.kind === 'done' && (
        <Box flexDirection="column">
          <StepHeader step={TOTAL_STEPS} total={TOTAL_STEPS} title="Tải xong" />
          <StatusList items={step.statuses} />
          <Box marginTop={1}>
            <Alert variant="success" title="Hoàn thành">
              {`Folder: ${step.outputDir}. CLI sẽ thoát sau 2.5 giây.`}
            </Alert>
          </Box>
        </Box>
      )}

      {isBackEnabled && (
        <HintBar
          hints={[
            { key: '↑↓', label: 'điều hướng' },
            { key: 'Enter', label: 'chọn' },
            { key: 'Esc', label: 'quay lại' },
          ]}
        />
      )}
    </Box>
  );
}

function AnimeNameUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'anime-name' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const showCount = step.isSingle ? 1 : step.entries.length;

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title={
          step.isSingle
            ? 'Đặt tên cho video'
            : `Playlist gồm ${showCount} video`
        }
        subtitle="Folder Anime/<tên>/Ep01, Ep02... sẽ được tạo trong project."
      />
      <Box marginBottom={1} flexDirection="column">
        {step.entries.slice(0, 5).map((e, i) => (
          <Text key={i} color={palette.muted}>
            {`  ${sym.triangleRight} Ep${String(e.index).padStart(2, '0')}  ${sym.bullet}  ${e.title}`}
          </Text>
        ))}
        {step.entries.length > 5 && (
          <Text color={palette.muted}>
            {`  ${sym.ellipsis} +${step.entries.length - 5} video nữa…`}
          </Text>
        )}
      </Box>
      <PathInput
        label="Tên anime / series"
        hint={`Auto-detect: "${step.suggested}". Enter để chấp nhận, hoặc gõ tên khác.`}
        defaultValue={step.suggested}
        onSubmit={(name) => {
          const animeName = (sanitizeFolderName(name) || step.suggested).trim();
          nav.go({
            kind: 'probing-eps',
            url: step.url,
            animeName,
            entries: step.entries,
            done: 0,
            probes: [],
            skipped: [],
          });
        }}
      />
    </Box>
  );
}

function PickVideoUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'pick-video' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const videos = commonVideoFormats(step.probes);
  const suggested = suggestVideo(videos);

  const ordered =
    suggested && videos.length > 1
      ? [suggested, ...videos.filter((f) => f.formatId !== suggested.formatId)]
      : videos;

  const sizeSuffix = step.probes.length > 1 ? '/ep' : '';
  const options = [
    ...ordered.map((f) => ({
      label: `${formatLabel(f, sizeSuffix)}${f.formatId === suggested?.formatId ? '  [đề xuất]' : ''}`,
      value: String(f.height ?? f.formatId),
    })),
    { label: 'Chỉ tải audio (skip video)', value: '__audio_only__' },
  ];

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Chọn độ phân giải video"
        subtitle={
          step.probes.length > 1
            ? `${videos.length} mức chất lượng có ở MỌI ${step.probes.length} video. Size hiển thị là trung bình mỗi ep.`
            : `${videos.length} mức chất lượng khả dụng.`
        }
      />
      {step.skippedCount > 0 && (
        <Box marginBottom={1}>
          <Alert variant="warning" title={`Đã skip ${step.skippedCount} video`}>
            {`${step.probes.length} video probe thành công sẽ được tải tiếp. Các video private / unavailable / members-only bị loại khỏi danh sách.`}
          </Alert>
        </Box>
      )}
      <Select
        options={options}
        onChange={(value) => {
          if (value === '__audio_only__') {
            nav.go({
              kind: 'pick-audio',
              animeName: step.animeName,
              probes: step.probes,
              entries: step.entries,
              videoFormat: null,
            });
            return;
          }
          const height = parseInt(value, 10);
          const chosen = videos.find((f) => f.height === height) ?? null;
          nav.go({
            kind: 'pick-audio',
            animeName: step.animeName,
            probes: step.probes,
            entries: step.entries,
            videoFormat: chosen,
          });
        }}
      />
    </Box>
  );
}

function PickAudioUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'pick-audio' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const audios = commonAudioFormats(step.probes);
  const suggested = suggestAudio(audios);

  const ordered =
    suggested && audios.length > 1
      ? [suggested, ...audios.filter((f) => f.formatId !== suggested.formatId)]
      : audios;

  const sizeSuffix = step.probes.length > 1 ? '/ep' : '';
  const options = [
    ...ordered.map((f) => ({
      label: `${formatLabel(f, sizeSuffix)}${f.formatId === suggested?.formatId ? '  [đề xuất]' : ''}`,
      value: f.formatId,
    })),
    ...(step.videoFormat
      ? [{ label: 'Để yt-dlp tự chọn (best audio match)', value: '__auto__' }]
      : []),
  ];

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Chọn track audio"
        subtitle={
          step.videoFormat
            ? `${audios.length} track audio khả dụng để ghép vào video ${step.videoFormat.height}p.`
            : `${audios.length} track audio (audio-only download).`
        }
      />
      <Select
        options={
          options.length > 0
            ? options
            : [{ label: 'Không có audio (chỉ video)', value: '__none__' }]
        }
        onChange={(value) => {
          let chosen: YtFormat | null = null;
          if (value !== '__auto__' && value !== '__none__') {
            chosen = audios.find((f) => f.formatId === value) ?? null;
          }
          nav.go({
            kind: 'pick-subs',
            animeName: step.animeName,
            probes: step.probes,
            entries: step.entries,
            videoFormat: step.videoFormat,
            audioFormat: chosen,
          });
        }}
      />
    </Box>
  );
}

function PickSubsUI({
  step,
  nav,
  projectRoot,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'pick-subs' }>;
  nav: Nav;
  projectRoot: string;
  stepNumber: number;
}) {
  const langs = commonSubLangs(step.probes);
  const manual = langs.filter((l) => !l.automatic);
  const auto = langs.filter((l) => l.automatic);
  const noSubs = langs.length === 0;

  const buildJobs = (subLangs: string[], includeAuto: boolean) => {
    const outputDir = join(projectRoot, 'Anime', step.animeName);
    const jobs: EpisodeJob[] = step.probes.map((probe, i) => {
      const ent = step.entries[i]!;
      const epName = `Ep${String(ent.index).padStart(2, '0')}`;
      const epFolder = join(outputDir, epName);
      return {
        index: ent.index,
        epName,
        url: ent.url,
        title: probe.title,
        probe,
        epFolder,
        hasOutput: epHasOutput(epFolder),
      };
    });
    return { outputDir, jobs, subLangs, includeAuto };
  };

  useEffect(() => {
    if (!noSubs) return;
    const { outputDir, jobs, subLangs, includeAuto } = buildJobs([], false);
    const next = jobs.some((j) => j.hasOutput) ? 'select-mode' : 'confirm';
    if (next === 'select-mode') {
      nav.go({
        kind: 'select-mode',
        animeName: step.animeName,
        outputDir,
        allJobs: jobs,
        videoFormat: step.videoFormat,
        audioFormat: step.audioFormat,
        subLangs,
        includeAuto,
      });
    } else {
      nav.go({
        kind: 'confirm',
        animeName: step.animeName,
        outputDir,
        jobs,
        videoFormat: step.videoFormat,
        audioFormat: step.audioFormat,
        subLangs,
        includeAuto,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noSubs]);

  if (noSubs) {
    return (
      <Box flexDirection="column">
        <StepHeader
          step={stepNumber}
          total={TOTAL_STEPS}
          title="Không có sub khả dụng"
          subtitle="Bỏ qua bước chọn sub, tiếp tục."
        />
        <UiSpinner label=" Đang chuyển sang xác nhận..." />
      </Box>
    );
  }

  const enLike = (code: string) =>
    /^en($|[-_])/i.test(code) || /^vi($|[-_])/i.test(code);

  const items = [
    ...manual.map((s) => ({
      label: s.name,
      value: `m:${s.code}`,
      preselected: enLike(s.code),
      tag: { text: 'manual', color: palette.success },
    })),
    ...auto.map((s) => ({
      label: s.name,
      value: `a:${s.code}`,
      preselected: false,
      tag: { text: 'auto', color: palette.warn },
    })),
  ];

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Chọn phụ đề để tải"
        subtitle="Áp dụng cho mọi ep. yt-dlp tải → convert .ass → copy vietsub.ass + backup .ass.txt."
      />
      <Box marginBottom={1}>
        <Text color={palette.muted}>
          {`${manual.length} manual  ${sym.bullet}  ${auto.length} auto-caption  ${sym.bullet}  mặc định tick en + vi`}
        </Text>
      </Box>
      <MultiSelect
        items={items}
        onCancel={() => nav.back()}
        onSubmit={(values) => {
          const subLangs: string[] = [];
          let includeAuto = false;
          for (const v of values) {
            const [prefix, code] = v.split(':');
            if (!code) continue;
            subLangs.push(code);
            if (prefix === 'a') includeAuto = true;
          }
          const { outputDir, jobs } = buildJobs(subLangs, includeAuto);
          const hasAnyExisting = jobs.some((j) => j.hasOutput);
          if (hasAnyExisting) {
            nav.go({
              kind: 'select-mode',
              animeName: step.animeName,
              outputDir,
              allJobs: jobs,
              videoFormat: step.videoFormat,
              audioFormat: step.audioFormat,
              subLangs,
              includeAuto,
            });
          } else {
            nav.go({
              kind: 'confirm',
              animeName: step.animeName,
              outputDir,
              jobs,
              videoFormat: step.videoFormat,
              audioFormat: step.audioFormat,
              subLangs,
              includeAuto,
            });
          }
        }}
      />
    </Box>
  );
}

function SelectModeUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'select-mode' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const newJobs = step.allJobs.filter((j) => !j.hasOutput);
  const existingJobs = step.allJobs.filter((j) => j.hasOutput);

  const choices: { label: string; value: string }[] = [];
  if (newJobs.length > 0 && existingJobs.length > 0) {
    choices.push({
      label: `Tải tất cả  (${newJobs.length} mới + ${existingJobs.length} ghi đè)`,
      value: 'all',
    });
    choices.push({ label: `Chỉ tải mới  (${newJobs.length} ep)`, value: 'only-new' });
  } else if (newJobs.length > 0) {
    choices.push({ label: `Tải tất cả ${newJobs.length} ep`, value: 'all' });
  } else if (existingJobs.length > 0) {
    choices.push({ label: `Ghi đè tất cả ${existingJobs.length} ep`, value: 'all' });
  }
  choices.push({ label: 'Pick chọn riêng (multiselect)', value: 'pick' });
  choices.push({ label: 'Huỷ', value: 'cancel' });

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Phát hiện ep đã tải trước đó"
      />
      <Box flexDirection="column" marginBottom={1}>
        <KeyValue
          rows={[
            { key: 'Anime', value: step.animeName, color: palette.text, highlight: true },
            { key: 'Output', value: step.outputDir, color: palette.muted },
          ]}
        />
        <Box flexDirection="column" marginTop={1}>
          {step.allJobs.map((j, i) => (
            <Box key={i}>
              <Text color={j.hasOutput ? palette.warn : palette.success}>
                {`  ${j.hasOutput ? sym.warning : sym.tick} `}
              </Text>
              <Text color={j.hasOutput ? palette.warn : palette.text}>{j.epName}</Text>
              <Text color={palette.muted}>
                {`  ${sym.bullet} ${j.hasOutput ? 'đã có output cũ' : 'mới'}  ${sym.bullet} ${j.title}`}
              </Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color={palette.muted}>
            {`Tổng: ${step.allJobs.length} ep  ${sym.bullet}  ${newJobs.length} mới  ${sym.bullet}  ${existingJobs.length} đã tải trước`}
          </Text>
        </Box>
      </Box>
      <Select
        options={choices}
        onChange={(value) => {
          if (value === 'cancel') {
            process.exit(0);
            return;
          }
          if (value === 'pick') {
            nav.go({
              kind: 'pick-eps',
              animeName: step.animeName,
              outputDir: step.outputDir,
              allJobs: step.allJobs,
              videoFormat: step.videoFormat,
              audioFormat: step.audioFormat,
              subLangs: step.subLangs,
              includeAuto: step.includeAuto,
            });
            return;
          }
          const jobs = value === 'only-new' ? newJobs : step.allJobs;
          nav.go({
            kind: 'confirm',
            animeName: step.animeName,
            outputDir: step.outputDir,
            jobs,
            videoFormat: step.videoFormat,
            audioFormat: step.audioFormat,
            subLangs: step.subLangs,
            includeAuto: step.includeAuto,
          });
        }}
      />
    </Box>
  );
}

function PickEpsUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'pick-eps' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const items = step.allJobs.map((j) => ({
    label: `${j.epName}  ${sym.bullet}  ${j.title}`,
    value: j.epFolder,
    preselected: !j.hasOutput,
    tag: j.hasOutput
      ? { text: 'ghi đè', color: palette.warn }
      : { text: 'mới', color: palette.success },
  }));

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Pick ep để tải"
        subtitle="Mặc định tick các ep mới. Tick thêm ⚠ ghi đè nếu muốn re-download."
      />
      <MultiSelect
        items={items}
        onCancel={() => nav.back()}
        onSubmit={(folders) => {
          const jobs = step.allJobs.filter((j) => folders.includes(j.epFolder));
          if (jobs.length === 0) {
            process.exit(0);
            return;
          }
          nav.go({
            kind: 'confirm',
            animeName: step.animeName,
            outputDir: step.outputDir,
            jobs,
            videoFormat: step.videoFormat,
            audioFormat: step.audioFormat,
            subLangs: step.subLangs,
            includeAuto: step.includeAuto,
          });
        }}
      />
    </Box>
  );
}

function ConfirmUI({
  step,
  nav,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'confirm' }>;
  nav: Nav;
  stepNumber: number;
}) {
  const overwriteCount = step.jobs.filter((j) => j.hasOutput).length;
  const perEpBytes =
    (step.videoFormat?.filesize ?? 0) + (step.audioFormat?.filesize ?? 0);
  const totalBytes = perEpBytes * step.jobs.length;

  const rows = [
    { key: 'Anime', value: step.animeName, color: palette.text, highlight: true },
    {
      key: 'Số ep',
      value:
        overwriteCount > 0
          ? `${step.jobs.length}  (${overwriteCount} ghi đè)`
          : String(step.jobs.length),
      color: palette.accent,
      highlight: true,
    },
    { key: 'Output', value: step.outputDir, color: palette.muted },
    {
      key: 'Video',
      value: step.videoFormat
        ? `${formatLabel(step.videoFormat)}`
        : 'skip',
      color: step.videoFormat ? palette.accent : palette.muted,
    },
    {
      key: 'Audio',
      value: step.audioFormat
        ? `${formatLabel(step.audioFormat)}`
        : step.videoFormat
          ? 'auto'
          : 'skip',
      color: step.audioFormat ? palette.accent : palette.muted,
    },
    {
      key: 'Sub',
      value:
        step.subLangs.length > 0
          ? `${step.subLangs.join(', ')}${step.includeAuto ? '  (+ auto-caption)' : ''}`
          : 'skip',
      color: step.subLangs.length > 0 ? palette.accent : palette.muted,
    },
    { key: 'Ước tính', value: `~${humanSize(totalBytes)} (mỗi ep ~${humanSize(perEpBytes)})`, color: palette.muted },
  ];

  return (
    <Box flexDirection="column">
      <StepHeader step={stepNumber} total={TOTAL_STEPS} title="Xác nhận pipeline" />
      <Box flexDirection="column" marginBottom={1}>
        <KeyValue rows={rows} />
        <Box flexDirection="column" marginTop={1}>
          {step.jobs.slice(0, 8).map((j, i) => (
            <Text key={i} color={j.hasOutput ? palette.warn : palette.muted}>
              {`  ${sym.triangleRight} ${j.epName}  ${sym.arrowRight}  ${j.title}${
                j.hasOutput ? '  (ghi đè)' : ''
              }`}
            </Text>
          ))}
          {step.jobs.length > 8 && (
            <Text color={palette.muted}>
              {`  ${sym.ellipsis} +${step.jobs.length - 8} ep nữa…`}
            </Text>
          )}
        </Box>
      </Box>
      <Select
        options={[
          { label: 'Bắt đầu tải', value: 'go' },
          { label: 'Huỷ', value: 'cancel' },
        ]}
        onChange={(value) => {
          if (value === 'cancel') {
            process.exit(0);
            return;
          }
          ensureDir(step.outputDir);
          const statuses: StatusItem[] = step.jobs.map((j) => ({
            label: `${j.epName}  ${sym.bullet}  ${j.title}`,
            status: 'pending',
          }));
          const perEpProgress: PerEpProgress[] = step.jobs.map(() => ({
            stage: 'pending',
            speed: null,
            eta: null,
          }));
          nav.go({
            kind: 'processing',
            animeName: step.animeName,
            outputDir: step.outputDir,
            jobs: step.jobs,
            videoFormat: step.videoFormat,
            audioFormat: step.audioFormat,
            subLangs: step.subLangs,
            includeAuto: step.includeAuto,
            statuses,
            perEpProgress,
            current: 0,
          });
        }}
      />

      {step.videoFormat && step.videoFormat.height && step.videoFormat.height >= 1440 && (
        <Box marginTop={1}>
          <Alert variant="warning" title="Lưu ý chất lượng cao">
            {`File ${step.videoFormat.height}p có thể nặng (≈${humanSize(step.videoFormat.filesize)}/ep). Đảm bảo ổ đĩa đủ dung lượng.`}
          </Alert>
        </Box>
      )}
    </Box>
  );
}
