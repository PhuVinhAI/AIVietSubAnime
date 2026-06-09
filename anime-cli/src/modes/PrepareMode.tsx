import { Alert, ProgressBar, Select, Spinner as UiSpinner } from '@inkjs/ui';
import { Box, Text, useApp, useInput } from 'ink';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { useEffect, useState } from 'react';

import { Brand } from '../components/Brand.js';
import { HintBar } from '../components/HintBar.js';
import { KeyValue } from '../components/KeyValue.js';
import { MultiSelect } from '../components/MultiSelect.js';
import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { ToolStatus } from '../components/ToolStatus.js';
import { detectAnimeName } from '../lib/episode.js';
import { prepareEpisode } from '../lib/extract.js';
import { moveFile } from '../lib/fsx.js';
import { probeVideo } from '../lib/probe.js';
import { palette, sym } from '../lib/theme.js';
import { checkAllTools, type ToolCheck } from '../lib/tools.js';
import { groupBySignature, suggestTrack } from '../lib/trackGroup.js';
import { useStepNav } from '../lib/useStepNav.js';
import type { TrackGroup, VideoProbe } from '../types.js';

const TOTAL_STEPS = 5;

function hasExistingOutput(epFolder: string): boolean {
  if (!existsSync(epFolder)) return false;
  try {
    const entries = readdirSync(epFolder);
    return entries.some(
      (f) =>
        f.toLowerCase().endsWith('.mp3') ||
        f.toLowerCase().endsWith('.ass') ||
        f.toLowerCase().endsWith('.ass.txt')
    );
  } catch {
    return false;
  }
}

type Choices = Record<string, number>;

type Step =
  | { kind: 'tools' }
  | { kind: 'path' }
  | { kind: 'scanning'; path: string }
  | { kind: 'anime-name'; mkvs: string[]; suggested: string; rootDir: string }
  | { kind: 'probing'; mkvs: string[]; animeName: string; rootDir: string; done: number }
  | {
      kind: 'pick-track';
      probes: VideoProbe[];
      groups: TrackGroup[];
      animeName: string;
      rootDir: string;
      choices: Choices;
      groupIdx: number;
    }
  | { kind: 'select-mode'; allJobs: PrepareJob[]; animeName: string; outputDir: string }
  | { kind: 'pick-eps'; allJobs: PrepareJob[]; animeName: string; outputDir: string }
  | { kind: 'confirm'; jobs: PrepareJob[]; animeName: string; outputDir: string }
  | { kind: 'processing'; jobs: PrepareJob[]; statuses: StatusItem[]; current: number }
  | { kind: 'done'; statuses: StatusItem[] };

type Nav = { go: (next: Step) => void; back: () => boolean };

type PrepareJob = {
  probe: VideoProbe;
  epFolder: string;
  epName: string;
  trackId: number;
  hasOutput: boolean;
};

type Props = {
  initialPath?: string;
  projectRoot: string;
};

const STEP_NUMBER: Partial<Record<Step['kind'], number>> = {
  path: 1,
  scanning: 1,
  'anime-name': 2,
  probing: 3,
  'pick-track': 4,
  'select-mode': 4,
  'pick-eps': 4,
  confirm: 4,
  processing: 5,
  done: 5,
};

function metaForPrepare(audioPct: number, subPct: number): string {
  return `audio ${audioPct.toFixed(0)}%  ${sym.bullet}  sub ${subPct.toFixed(0)}%`;
}

export function PrepareMode({ initialPath, projectRoot }: Props) {
  const { exit } = useApp();
  const [tools, setTools] = useState<{
    ffmpeg: ToolCheck;
    mkvextract: ToolCheck;
    handbrake: ToolCheck;
  } | null>(null);
  const nav = useStepNav<Step>({ kind: 'tools' });
  const { step, setStep, go, back, canBack } = nav;
  const [error, setError] = useState<string | null>(null);

  const isBackEnabled =
    !error &&
    canBack &&
    step.kind !== 'tools' &&
    step.kind !== 'scanning' &&
    step.kind !== 'probing' &&
    step.kind !== 'processing' &&
    step.kind !== 'done' &&
    step.kind !== 'pick-eps';
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
      setTools(t);
      if (!t.ffmpeg.ok || !t.mkvextract.ok) {
        setError('Thiếu ffmpeg hoặc mkvextract trong PATH. Cài và thử lại.');
        return;
      }
      if (initialPath) {
        setStep({ kind: 'scanning', path: initialPath });
      } else {
        setStep({ kind: 'path' });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, initialPath]);

  useEffect(() => {
    if (step.kind !== 'scanning') return;
    try {
      const abs = resolve(step.path);
      if (!existsSync(abs)) {
        setError(`Path không tồn tại: ${abs}`);
        setStep({ kind: 'path' });
        return;
      }
      const stat = statSync(abs);
      let rootDir: string;
      let mkvs: string[];
      if (stat.isDirectory()) {
        rootDir = abs;
        mkvs = readdirSync(abs)
          .filter((f) => f.toLowerCase().endsWith('.mkv'))
          .map((f) => join(abs, f))
          .sort();
      } else {
        rootDir = join(abs, '..');
        mkvs = readdirSync(rootDir)
          .filter((f) => f.toLowerCase().endsWith('.mkv'))
          .map((f) => join(rootDir, f))
          .sort();
      }
      if (mkvs.length === 0) {
        setError(`Không tìm thấy file .mkv trong: ${rootDir}`);
        setStep({ kind: 'path' });
        return;
      }
      const suggested = detectAnimeName(mkvs.map((p) => basename(p))) ?? basename(rootDir);
      setStep({ kind: 'anime-name', mkvs, suggested, rootDir });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: 'path' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step.kind !== 'probing') return;
    let cancelled = false;
    const run = async () => {
      const probes: VideoProbe[] = [];
      for (let i = 0; i < step.mkvs.length; i++) {
        if (cancelled) return;
        const mkv = step.mkvs[i];
        if (!mkv) continue;
        const probe = await probeVideo(mkv);
        probes.push(probe);
        setStep((s) => (s.kind === 'probing' ? { ...s, done: i + 1 } : s));
      }
      if (cancelled) return;
      const groups = groupBySignature(probes);
      const choices: Choices = {};
      for (const g of groups) {
        const sugg = suggestTrack(g);
        if (sugg !== null) choices[g.signature] = sugg;
      }
      setStep({
        kind: 'pick-track',
        probes,
        groups,
        animeName: step.animeName,
        rootDir: step.rootDir,
        choices,
        groupIdx: 0,
      });
    };
    run().catch((e) => setError(e instanceof Error ? e.message : String(e)));
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
      let doneCount = 0;
      const lastFlush = new Array<number>(step.jobs.length).fill(0);

      const flush = () => {
        setStep((s) =>
          s.kind === 'processing'
            ? { ...s, statuses: [...statuses], current: doneCount }
            : s
        );
      };

      const processOne = async (job: PrepareJob, i: number) => {
        if (cancelled) return;
        statuses[i] = {
          ...statuses[i]!,
          status: 'running',
          progress: 0,
          meta: metaForPrepare(0, 0),
        };
        flush();

        try {
          const newMkv = join(job.epFolder, job.probe.fileName);
          if (job.probe.filePath !== newMkv) {
            moveFile(job.probe.filePath, newMkv);
          }
          await prepareEpisode({
            mkvPath: newMkv,
            epFolder: job.epFolder,
            baseName: job.probe.baseName,
            trackId: job.trackId,
            durationSeconds: job.probe.durationSeconds,
            onProgress: (audioPct, subPct) => {
              const now = performance.now();
              if (audioPct < 100 && subPct < 100 && now - (lastFlush[i] ?? 0) < 200) return;
              lastFlush[i] = now;
              const avg = (audioPct + subPct) / 2;
              statuses[i] = {
                ...statuses[i]!,
                status: 'running',
                progress: avg,
                meta: metaForPrepare(audioPct, subPct),
              };
              flush();
            },
          });
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

      await Promise.all(step.jobs.map((job, i) => processOne(job, i)));

      if (cancelled) return;
      setStep({ kind: 'done', statuses });
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  useEffect(() => {
    if (step.kind === 'done') {
      const timer = setTimeout(() => exit(), 2000);
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
        <Brand subtitle="Prepare mode" compact />
        <Box marginBottom={1}>
          <Alert variant="error" title="Đã xảy ra lỗi">
            {error}
          </Alert>
        </Box>
        {step.kind === 'path' && (
          <PathInput
            label="Nhập lại path"
            hint="Folder chứa .mkv (hoặc 1 file .mkv bất kỳ)"
            onSubmit={(path) => {
              setError(null);
              go({ kind: 'scanning', path });
            }}
          />
        )}
      </Box>
    );
  }

  const stepNumber = STEP_NUMBER[step.kind] ?? 1;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Brand subtitle="Prepare mode" compact />
      <ToolStatus
        ffmpeg={tools.ffmpeg}
        mkvextract={tools.mkvextract}
        showHandbrake={false}
      />

      {step.kind === 'path' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Trỏ tới folder chứa raw .mkv"
            subtitle="Folder bất kỳ trên ổ đĩa, hoặc 1 file .mkv bất kỳ trong folder đó."
          />
          <PathInput
            label="Path"
            hint="Vd. D:\Raw\Oi Tonbo"
            onSubmit={(path) => go({ kind: 'scanning', path })}
          />
        </Box>
      )}

      {step.kind === 'scanning' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Đang quét folder"
            subtitle={step.path}
          />
          <UiSpinner label=" Đang đọc danh sách file..." />
        </Box>
      )}

      {step.kind === 'anime-name' && (
        <AnimeNameUI step={step} nav={{ go, back }} stepNumber={stepNumber} />
      )}

      {step.kind === 'probing' && (
        <Box flexDirection="column">
          <StepHeader
            step={stepNumber}
            total={TOTAL_STEPS}
            title="Phân tích track sub"
            subtitle="ffmpeg probe từng file để phát hiện track audio/subtitle."
          />
          <Box paddingLeft={1} flexDirection="column">
            <Box width={36}>
              <ProgressBar value={(step.done / step.mkvs.length) * 100} />
            </Box>
            <Box marginTop={0}>
              <Text color={palette.accent} bold>
                {`${step.done}/${step.mkvs.length}`}
              </Text>
              <Text color={palette.muted}>{` file đã probe`}</Text>
            </Box>
          </Box>
        </Box>
      )}

      {step.kind === 'pick-track' && (
        <PickTrackUI
          step={step}
          nav={{ go, back }}
          projectRoot={projectRoot}
          stepNumber={stepNumber}
        />
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
            title={`Xử lý song song  ${sym.bullet}  ${step.current}/${step.jobs.length} hoàn thành`}
            subtitle="ffmpeg + mkvextract chạy đồng thời mỗi file."
          />
          <StatusList items={step.statuses} />
        </Box>
      )}

      {step.kind === 'done' && (
        <Box flexDirection="column">
          <StepHeader step={TOTAL_STEPS} total={TOTAL_STEPS} title="Prepare hoàn thành" />
          <StatusList items={step.statuses} />
          <Box marginTop={1}>
            <Alert variant="success" title="Tất cả file đã sẵn sàng">
              {`${step.statuses.filter((s) => s.status === 'done').length}/${step.statuses.length} ep đã extract audio + sub. CLI sẽ thoát sau 2 giây.`}
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
  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title={`Tìm thấy ${step.mkvs.length} file .mkv`}
        subtitle="Đặt tên anime — folder Anime/<tên> sẽ được tạo trong project."
      />
      <Box marginBottom={1} flexDirection="column">
        {step.mkvs.slice(0, 5).map((m, i) => (
          <Text key={i} color={palette.muted}>
            {`  ${sym.triangleRight} ${basename(m)}`}
          </Text>
        ))}
        {step.mkvs.length > 5 && (
          <Text color={palette.muted}>
            {`  ${sym.ellipsis} +${step.mkvs.length - 5} file nữa…`}
          </Text>
        )}
      </Box>
      <PathInput
        label="Tên anime"
        hint={`Auto-detect: "${step.suggested}". Enter để chấp nhận, hoặc gõ tên khác.`}
        defaultValue={step.suggested}
        onSubmit={(name) => {
          const animeName = (name || step.suggested).trim();
          nav.go({
            kind: 'probing',
            mkvs: step.mkvs,
            animeName,
            rootDir: step.rootDir,
            done: 0,
          });
        }}
      />
    </Box>
  );
}

function PickTrackUI({
  step,
  nav,
  projectRoot,
  stepNumber,
}: {
  step: Extract<Step, { kind: 'pick-track' }>;
  nav: Nav;
  projectRoot: string;
  stepNumber: number;
}) {
  const group = step.groups[step.groupIdx]!;
  const isMulti = step.groups.length > 1;

  const items = group.subTracks.map((t) => ({
    label: `Track ${t.id}  ${sym.bullet}  ${t.langName} (${t.codec})${
      t.isDefault ? '  [mặc định]' : ''
    }`,
    value: String(t.id),
  }));

  const suggested = step.choices[group.signature];
  const defaultValue =
    suggested !== undefined ? String(suggested) : String(group.subTracks[0]?.id ?? '');

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title={
          isMulti
            ? `Chọn track cho Nhóm ${step.groupIdx + 1}/${step.groups.length}`
            : 'Chọn track sub để tách'
        }
        subtitle={
          isMulti
            ? `Có ${step.groups.length} nhóm khác nhau về cấu trúc track sub.`
            : undefined
        }
      />
      {isMulti && (
        <Box marginBottom={1} flexDirection="column">
          <Text color={palette.muted}>{`Nhóm này gồm ${group.videos.length} file:`}</Text>
          {group.videos.slice(0, 3).map((v, i) => (
            <Text key={i} color={palette.muted}>
              {`    ${sym.triangleRight} ${v.fileName}`}
            </Text>
          ))}
          {group.videos.length > 3 && (
            <Text color={palette.muted}>
              {`    ${sym.ellipsis} +${group.videos.length - 3} nữa`}
            </Text>
          )}
        </Box>
      )}
      <Select
        options={items}
        defaultValue={defaultValue}
        onChange={(value) => {
          const trackId = parseInt(value, 10);
          const nextChoices: Choices = { ...step.choices, [group.signature]: trackId };
          const nextIdx = step.groupIdx + 1;
          if (nextIdx < step.groups.length) {
            nav.go({ ...step, choices: nextChoices, groupIdx: nextIdx });
          } else {
            const outputDir = join(projectRoot, 'Anime', step.animeName);
            const allJobs: PrepareJob[] = step.probes.map((p) => {
              const ep = p.episodeNumber ?? '00';
              const epFolder = join(outputDir, `Ep${ep}`);
              const tid = nextChoices[p.signature] ?? p.subTracks[0]?.id ?? 0;
              return {
                probe: p,
                epFolder,
                epName: `Ep${ep}`,
                trackId: tid,
                hasOutput: hasExistingOutput(epFolder),
              };
            });
            const hasAnyExisting = allJobs.some((j) => j.hasOutput);
            if (hasAnyExisting) {
              nav.go({
                kind: 'select-mode',
                allJobs,
                animeName: step.animeName,
                outputDir,
              });
            } else {
              nav.go({
                kind: 'confirm',
                jobs: allJobs,
                animeName: step.animeName,
                outputDir,
              });
            }
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
      label: `Xử lý tất cả  (${newJobs.length} mới + ${existingJobs.length} ghi đè)`,
      value: 'all',
    });
    choices.push({
      label: `Chỉ xử lý mới  (${newJobs.length} file)`,
      value: 'only-new',
    });
  } else if (newJobs.length > 0) {
    choices.push({ label: `Xử lý tất cả ${newJobs.length} file`, value: 'all' });
  } else if (existingJobs.length > 0) {
    choices.push({
      label: `Ghi đè tất cả ${existingJobs.length} file`,
      value: 'all',
    });
  }
  choices.push({ label: 'Pick chọn riêng (multiselect)', value: 'pick' });
  choices.push({ label: 'Huỷ', value: 'cancel' });

  return (
    <Box flexDirection="column">
      <StepHeader
        step={stepNumber}
        total={TOTAL_STEPS}
        title="Phát hiện file đã xử lý trước đó"
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
                {`  ${sym.bullet} ${j.hasOutput ? 'đã có .mp3/.ass cũ' : 'mới'}  ${sym.bullet} ${basename(j.probe.fileName)}`}
              </Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color={palette.muted}>
            {`Tổng: ${step.allJobs.length} ep  ${sym.bullet}  ${newJobs.length} mới  ${sym.bullet}  ${existingJobs.length} đã xử lý trước`}
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
              allJobs: step.allJobs,
              animeName: step.animeName,
              outputDir: step.outputDir,
            });
            return;
          }
          const jobs = value === 'only-new' ? newJobs : step.allJobs;
          nav.go({
            kind: 'confirm',
            jobs,
            animeName: step.animeName,
            outputDir: step.outputDir,
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
    label: `${j.epName}  ${sym.bullet}  ${j.probe.fileName}`,
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
        title="Pick ep để xử lý"
        subtitle="Mặc định tick các ep mới. Tick thêm ⚠ ghi đè nếu muốn re-extract."
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
            jobs,
            animeName: step.animeName,
            outputDir: step.outputDir,
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

  return (
    <Box flexDirection="column">
      <StepHeader step={stepNumber} total={TOTAL_STEPS} title="Xác nhận pipeline" />
      <Box flexDirection="column" marginBottom={1}>
        <KeyValue
          rows={[
            { key: 'Anime', value: step.animeName, color: palette.text, highlight: true },
            {
              key: 'Số file',
              value:
                overwriteCount > 0
                  ? `${step.jobs.length}  (${overwriteCount} ghi đè)`
                  : String(step.jobs.length),
              color: palette.accent,
              highlight: true,
            },
            { key: 'Output', value: step.outputDir, color: palette.muted },
          ]}
        />
        <Box flexDirection="column" marginTop={1}>
          {step.jobs.map((j, i) => (
            <Text key={i} color={j.hasOutput ? palette.warn : palette.muted}>
              {`  ${sym.triangleRight} ${j.epName}  ${sym.arrowRight}  Track ${j.trackId}${
                j.hasOutput ? '  (ghi đè)' : ''
              }`}
            </Text>
          ))}
        </Box>
      </Box>
      <Select
        options={[
          { label: 'Bắt đầu xử lý', value: 'go' },
          { label: 'Huỷ', value: 'cancel' },
        ]}
        onChange={(value) => {
          if (value === 'cancel') {
            process.exit(0);
            return;
          }
          const statuses: StatusItem[] = step.jobs.map((j) => ({
            label: `${j.epName}  ${sym.bullet}  ${j.probe.fileName}`,
            status: 'pending',
          }));
          nav.go({ kind: 'processing', jobs: step.jobs, statuses, current: 0 });
        }}
      />
    </Box>
  );
}
