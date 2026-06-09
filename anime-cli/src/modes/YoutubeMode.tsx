import { Alert, Select, Spinner as UiSpinner } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
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
  pickAndCopyVietsubAss,
  pickAudioFormats,
  pickVideoFormats,
  probeYoutube,
  sanitizeFolderName,
  suggestAudio,
  suggestVideo,
  type YoutubeProbe,
  type YtFormat,
} from '../lib/ytdlp.js';

const TOTAL_STEPS = 6;

type Step =
  | { kind: 'tools' }
  | { kind: 'url' }
  | { kind: 'probing'; url: string }
  | { kind: 'name'; url: string; probe: YoutubeProbe; suggested: string }
  | {
      kind: 'pick-video';
      url: string;
      probe: YoutubeProbe;
      folderName: string;
    }
  | {
      kind: 'pick-audio';
      url: string;
      probe: YoutubeProbe;
      folderName: string;
      videoFormat: YtFormat | null;
    }
  | {
      kind: 'pick-subs';
      url: string;
      probe: YoutubeProbe;
      folderName: string;
      videoFormat: YtFormat | null;
      audioFormat: YtFormat | null;
    }
  | {
      kind: 'confirm';
      url: string;
      probe: YoutubeProbe;
      folderName: string;
      outputDir: string;
      videoFormat: YtFormat | null;
      audioFormat: YtFormat | null;
      subLangs: string[];
      includeAuto: boolean;
    }
  | {
      kind: 'downloading';
      url: string;
      probe: YoutubeProbe;
      folderName: string;
      outputDir: string;
      videoFormat: YtFormat | null;
      audioFormat: YtFormat | null;
      subLangs: string[];
      includeAuto: boolean;
      statuses: StatusItem[];
    }
  | { kind: 'done'; outputDir: string; statuses: StatusItem[] };

type Nav = { go: (next: Step) => void; back: () => boolean };

type Props = {
  initialUrl?: string;
  projectRoot: string;
};

const STEP_NUMBER: Partial<Record<Step['kind'], number>> = {
  url: 1,
  probing: 1,
  name: 2,
  'pick-video': 3,
  'pick-audio': 4,
  'pick-subs': 5,
  confirm: 5,
  downloading: 6,
  done: 6,
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

function formatLabel(f: YtFormat): string {
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
  parts.push(humanSize(f.filesize));
  return parts.join('  ' + sym.bullet + '  ');
}

function stripCodec(c: string): string {
  return c.split('.')[0] ?? c;
}

export function YoutubeMode({ initialUrl, projectRoot }: Props) {
  const { exit } = useApp();
  const [tools, setTools] = useState<{
    ffmpeg: ToolCheck;
    ytdlp: ToolCheck;
  } | null>(null);
  const nav = useStepNav<Step>({ kind: 'tools' });
  const { step, setStep, go, back, canBack } = nav;
  const [error, setError] = useState<string | null>(null);

  const isBackEnabled =
    !error &&
    canBack &&
    step.kind !== 'tools' &&
    step.kind !== 'probing' &&
    step.kind !== 'downloading' &&
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
      if (initialUrl) {
        setStep({ kind: 'probing', url: initialUrl });
      } else {
        setStep({ kind: 'url' });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, initialUrl]);

  useEffect(() => {
    if (step.kind !== 'probing') return;
    let cancelled = false;
    probeYoutube(step.url)
      .then((probe) => {
        if (cancelled) return;
        if (probe.isLive) {
          setError('Đây là livestream — chế độ này không hỗ trợ live.');
          return;
        }
        const suggested = sanitizeFolderName(probe.title);
        setStep({ kind: 'name', url: step.url, probe, suggested });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  useEffect(() => {
    if (step.kind !== 'downloading') return;
    let cancelled = false;

    const run = async () => {
      const statuses = [...step.statuses];
      const flush = () => {
        setStep((s) => (s.kind === 'downloading' ? { ...s, statuses: [...statuses] } : s));
      };

      const baseName = sanitizeFolderName(step.probe.title) || step.probe.id;
      const idx = {
        download: 0,
        mp3: -1,
        vietsub: -1,
        backup: -1,
      };
      let cursor = 1;
      const hasAudio = !!step.audioFormat || !!step.videoFormat;
      if (hasAudio) idx.mp3 = cursor++;
      if (step.subLangs.length > 0) {
        idx.vietsub = cursor++;
        idx.backup = cursor++;
      }

      statuses[idx.download] = {
        ...statuses[idx.download]!,
        status: 'running',
        progress: 0,
        meta: 'đang khởi động yt-dlp',
      };
      flush();

      try {
        await downloadYoutube({
          url: step.url,
          outputDir: step.outputDir,
          baseName,
          videoFormatId: step.videoFormat?.formatId,
          audioFormatId: step.audioFormat?.formatId,
          subLangs: step.subLangs,
          includeAutoSubs: step.includeAuto,
          onProgress: (p) => {
            if (cancelled) return;
            const stageLabel: Record<typeof p.stage, string> = {
              video: 'Đang tải video track',
              audio: 'Đang tải audio track',
              merge: 'Đang merge bằng ffmpeg',
              subs: 'Đang tải sub track',
              done: 'Hoàn tất',
            };
            const speed = p.speed ? `  ${sym.bullet}  ${p.speed}` : '';
            const eta = p.eta ? `  ${sym.bullet}  ETA ${p.eta}` : '';
            statuses[idx.download] = {
              ...statuses[idx.download]!,
              status: 'running',
              progress: p.percent,
              label: `[${p.stage.toUpperCase()}]  ${stageLabel[p.stage]}`,
              meta: `${speed}${eta}`.trim(),
            };
            flush();
          },
        });
        if (cancelled) return;

        const mediaPath = findDownloadedMedia(step.outputDir, baseName);
        statuses[idx.download] = {
          ...statuses[idx.download]!,
          status: 'done',
          progress: undefined,
          label: 'Tải video + audio + merge',
          meta: undefined,
          detail: mediaPath ? `${sym.arrowRight} ${mediaPath}` : undefined,
        };
        flush();

        if (idx.mp3 >= 0 && mediaPath) {
          statuses[idx.mp3] = {
            ...statuses[idx.mp3]!,
            status: 'running',
            progress: 0,
            meta: 'ffmpeg -vn -c:a libmp3lame',
          };
          flush();
          try {
            const mp3 = await extractMp3FromMedia(
              mediaPath,
              step.outputDir,
              baseName,
              step.probe.durationSeconds,
              (pct) => {
                if (cancelled) return;
                statuses[idx.mp3] = {
                  ...statuses[idx.mp3]!,
                  status: 'running',
                  progress: pct,
                  meta: 'ffmpeg -vn -c:a libmp3lame',
                };
                flush();
              }
            );
            statuses[idx.mp3] = {
              ...statuses[idx.mp3]!,
              status: 'done',
              progress: undefined,
              meta: undefined,
              detail: `${sym.arrowRight} ${mp3}`,
            };
          } catch (e) {
            statuses[idx.mp3] = {
              ...statuses[idx.mp3]!,
              status: 'error',
              progress: undefined,
              meta: undefined,
              detail: e instanceof Error ? e.message : String(e),
            };
          }
          flush();
        }

        if (idx.vietsub >= 0) {
          statuses[idx.vietsub] = {
            ...statuses[idx.vietsub]!,
            status: 'running',
            meta: 'tìm và copy sang vietsub.ass',
          };
          flush();
          const out = pickAndCopyVietsubAss(step.outputDir, baseName, step.subLangs);
          statuses[idx.vietsub] = {
            ...statuses[idx.vietsub]!,
            status: out ? 'done' : 'skip',
            meta: undefined,
            detail: out
              ? `${sym.arrowRight} ${out.vietsub}`
              : 'Không tìm thấy .ass — sub có thể không khả dụng cho video này',
          };
          flush();

          statuses[idx.backup] = {
            ...statuses[idx.backup]!,
            status: 'running',
            meta: 'tạo .ass.txt để dán vào AI',
          };
          flush();
          const backups = createAssTextBackups(step.outputDir, baseName);
          statuses[idx.backup] = {
            ...statuses[idx.backup]!,
            status: backups.length > 0 ? 'done' : 'skip',
            meta: undefined,
            detail:
              backups.length > 0
                ? `${sym.arrowRight} ${backups.length} file .ass.txt`
                : 'Không có .ass để backup',
          };
          flush();
        }
      } catch (e) {
        statuses[idx.download] = {
          ...statuses[idx.download]!,
          status: 'error',
          progress: undefined,
          meta: undefined,
          detail: e instanceof Error ? e.message : String(e),
        };
        flush();
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
            hint="Link YouTube hợp lệ (watch / youtu.be / shorts)"
            onSubmit={(url) => {
              setError(null);
              go({ kind: 'probing', url });
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
            subtitle="Một link video duy nhất. Playlist sẽ bị giới hạn ở video đầu."
          />
          <PathInput
            label="URL"
            hint="Vd. https://www.youtube.com/watch?v=..."
            onSubmit={(url) => go({ kind: 'probing', url: url.trim() })}
          />
        </Box>
      )}

      {step.kind === 'probing' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Đang phân tích video"
            subtitle={step.url}
          />
          <UiSpinner label=" yt-dlp đang lấy metadata + danh sách format..." />
        </Box>
      )}

      {step.kind === 'name' && (
        <NameUI step={step} nav={{ go, back }} projectRoot={projectRoot} stepNumber={stepNumber} />
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

      {step.kind === 'confirm' && (
        <ConfirmUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'downloading' && (
        <Box flexDirection="column">
          <StepHeader
            step={TOTAL_STEPS}
            total={TOTAL_STEPS}
            title="Đang tải xuống"
            subtitle="yt-dlp + ffmpeg đang chạy. Video → audio → merge → sub → ass."
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

function NameUI({
  step,
  nav,
  projectRoot,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'name' }>;
  nav: Nav;
  projectRoot: string;
  stepNumber: number;
}) {
  const subCount = step.probe.subtitles.filter((s) => !s.automatic).length;
  const autoCount = step.probe.subtitles.filter((s) => s.automatic).length;
  const videoCount = step.probe.formats.filter((f) => f.kind === 'video').length;
  const audioCount = step.probe.formats.filter((f) => f.kind === 'audio').length;

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Đặt tên thư mục"
        subtitle={`Folder Anime/<tên> sẽ được tạo trong ${projectRoot}.`}
      />
      <Box flexDirection="column" marginBottom={1}>
        <KeyValue
          rows={[
            { key: 'Tiêu đề', value: step.probe.title, color: palette.text, highlight: true },
            { key: 'Kênh', value: step.probe.uploader ?? '—', color: palette.muted },
            {
              key: 'Thời lượng',
              value: humanDuration(step.probe.durationSeconds),
              color: palette.accent,
            },
            {
              key: 'Track có sẵn',
              value: `${videoCount} video  ${sym.bullet}  ${audioCount} audio  ${sym.bullet}  ${subCount} sub${
                autoCount > 0 ? ` (+${autoCount} auto)` : ''
              }`,
              color: palette.muted,
            },
          ]}
        />
      </Box>
      <PathInput
        label="Tên thư mục"
        hint={`Auto-detect: "${step.suggested}". Enter để chấp nhận, hoặc gõ tên khác.`}
        defaultValue={step.suggested}
        onSubmit={(name) => {
          const cleaned = sanitizeFolderName(name) || step.suggested || step.probe.id;
          nav.go({
            kind: 'pick-video',
            url: step.url,
            probe: step.probe,
            folderName: cleaned,
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
  const videos = pickVideoFormats(step.probe);
  const suggested = suggestVideo(videos);

  const ordered =
    suggested && videos.length > 1
      ? [suggested, ...videos.filter((f) => f.formatId !== suggested.formatId)]
      : videos;

  const options = [
    ...ordered.map((f) => ({
      label: `${formatLabel(f)}${f.formatId === suggested?.formatId ? '  [đề xuất]' : ''}`,
      value: f.formatId,
    })),
    { label: 'Chỉ tải audio (skip video)', value: '__audio_only__' },
  ];

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Chọn độ phân giải video"
        subtitle={`${videos.length} mức chất lượng khả dụng. yt-dlp sẽ merge với track audio chọn ở bước sau.`}
      />
      <Select
        options={options}
        onChange={(value) => {
          if (value === '__audio_only__') {
            nav.go({
              kind: 'pick-audio',
              url: step.url,
              probe: step.probe,
              folderName: step.folderName,
              videoFormat: null,
            });
            return;
          }
          const chosen = videos.find((f) => f.formatId === value) ?? null;
          nav.go({
            kind: 'pick-audio',
            url: step.url,
            probe: step.probe,
            folderName: step.folderName,
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
  const audios = pickAudioFormats(step.probe);
  const suggested = suggestAudio(audios);

  const ordered =
    suggested && audios.length > 1
      ? [suggested, ...audios.filter((f) => f.formatId !== suggested.formatId)]
      : audios;

  const options = [
    ...ordered.map((f) => ({
      label: `${formatLabel(f)}${f.formatId === suggested?.formatId ? '  [đề xuất]' : ''}`,
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
            : `${audios.length} track audio khả dụng (audio-only download).`
        }
      />
      <Select
        options={options.length > 0 ? options : [{ label: 'Không có audio (chỉ video)', value: '__none__' }]}
        onChange={(value) => {
          let chosen: YtFormat | null = null;
          if (value !== '__auto__' && value !== '__none__') {
            chosen = audios.find((f) => f.formatId === value) ?? null;
          }
          nav.go({
            kind: 'pick-subs',
            url: step.url,
            probe: step.probe,
            folderName: step.folderName,
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
  const manual = step.probe.subtitles.filter((s) => !s.automatic);
  const auto = step.probe.subtitles.filter((s) => s.automatic);
  const noSubs = manual.length === 0 && auto.length === 0;

  useEffect(() => {
    if (!noSubs) return;
    const outputDir = join(projectRoot, 'Anime', step.folderName);
    nav.go({
      kind: 'confirm',
      url: step.url,
      probe: step.probe,
      folderName: step.folderName,
      outputDir,
      videoFormat: step.videoFormat,
      audioFormat: step.audioFormat,
      subLangs: [],
      includeAuto: false,
    });
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
      label: `${s.langName}`,
      value: `m:${s.langCode}`,
      preselected: enLike(s.langCode),
      tag: { text: 'manual', color: palette.success },
    })),
    ...auto.map((s) => ({
      label: `${s.langName}`,
      value: `a:${s.langCode}`,
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
        subtitle="yt-dlp sẽ tải các sub được chọn, convert sang .ass và copy thành vietsub.ass."
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
          const outputDir = join(projectRoot, 'Anime', step.folderName);
          nav.go({
            kind: 'confirm',
            url: step.url,
            probe: step.probe,
            folderName: step.folderName,
            outputDir,
            videoFormat: step.videoFormat,
            audioFormat: step.audioFormat,
            subLangs,
            includeAuto,
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
  const totalBytes =
    (step.videoFormat?.filesize ?? 0) + (step.audioFormat?.filesize ?? 0);

  const rows = [
    { key: 'Anime', value: step.folderName, color: palette.text, highlight: true },
    { key: 'Tiêu đề', value: step.probe.title, color: palette.muted },
    { key: 'Output', value: step.outputDir, color: palette.muted },
    {
      key: 'Video',
      value: step.videoFormat
        ? `${formatLabel(step.videoFormat)}  (id ${step.videoFormat.formatId})`
        : 'skip',
      color: step.videoFormat ? palette.accent : palette.muted,
    },
    {
      key: 'Audio',
      value: step.audioFormat
        ? `${formatLabel(step.audioFormat)}  (id ${step.audioFormat.formatId})`
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
    {
      key: 'Ước tính',
      value: humanSize(totalBytes),
      color: palette.muted,
    },
  ];

  return (
    <Box flexDirection="column">
      <StepHeader step={stepNumber} total={TOTAL_STEPS} title="Xác nhận tải xuống" />
      <Box flexDirection="column" marginBottom={1}>
        <KeyValue rows={rows} />
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
          const hasAudio = !!step.audioFormat || !!step.videoFormat;
          const statuses: StatusItem[] = [
            { label: 'Tải video + audio + merge', status: 'pending' },
          ];
          if (hasAudio) {
            statuses.push({ label: 'Tách audio thuần (.mp3)', status: 'pending' });
          }
          if (step.subLangs.length > 0) {
            statuses.push({ label: 'Copy sub → vietsub.ass', status: 'pending' });
            statuses.push({ label: 'Backup .ass.txt cho AI dịch', status: 'pending' });
          }
          nav.go({
            kind: 'downloading',
            url: step.url,
            probe: step.probe,
            folderName: step.folderName,
            outputDir: step.outputDir,
            videoFormat: step.videoFormat,
            audioFormat: step.audioFormat,
            subLangs: step.subLangs,
            includeAuto: step.includeAuto,
            statuses,
          });
        }}
      />

      {step.videoFormat && step.videoFormat.height && step.videoFormat.height >= 1440 && (
        <Box marginTop={1}>
          <Alert variant="warning" title="Lưu ý chất lượng cao">
            {`File ${step.videoFormat.height}p có thể nặng (≈${humanSize(step.videoFormat.filesize)}). Đảm bảo ổ đĩa đủ dung lượng.`}
          </Alert>
        </Box>
      )}
    </Box>
  );
}
