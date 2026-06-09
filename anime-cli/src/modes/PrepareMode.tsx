import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { useEffect, useState } from 'react';

import { MultiSelect } from '../components/MultiSelect.js';
import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { ToolStatus } from '../components/ToolStatus.js';
import { detectAnimeName } from '../lib/episode.js';
import { prepareEpisode } from '../lib/extract.js';
import { moveFile } from '../lib/fsx.js';
import { renderBar } from '../lib/progress.js';
import { probeVideo } from '../lib/probe.js';
import { checkAllTools, type ToolCheck } from '../lib/tools.js';
import { groupBySignature, suggestTrack } from '../lib/trackGroup.js';
import { useStepNav } from '../lib/useStepNav.js';
import type { TrackGroup, VideoProbe } from '../types.js';

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

function formatPrepareDetail(audioPct: number, subPct: number): string {
  const avg = (audioPct + subPct) / 2;
  return `${renderBar(avg, 14)} ${avg.toFixed(0)}%  ·  audio ${audioPct.toFixed(0)}% · sub ${subPct.toFixed(0)}%`;
}

type Choices = Record<string, number>; // signature → trackId

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
  | {
      kind: 'select-mode';
      allJobs: PrepareJob[];
      animeName: string;
      outputDir: string;
    }
  | {
      kind: 'pick-eps';
      allJobs: PrepareJob[];
      animeName: string;
      outputDir: string;
    }
  | {
      kind: 'confirm';
      jobs: PrepareJob[];
      animeName: string;
      outputDir: string;
    }
  | { kind: 'processing'; jobs: PrepareJob[]; statuses: StatusItem[]; current: number }
  | { kind: 'done'; statuses: StatusItem[] };

type Nav = {
  go: (next: Step) => void;
  back: () => boolean;
};

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

    // Prepare: ffmpeg mp3 + mkvextract đều nhẹ → spawn TẤT CẢ song song.
    // (HardsubMode đối lập — x264 ăn 100% CPU/process nên giữ serial.)
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
          detail: formatPrepareDetail(0, 0),
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
              // Throttle per-job: tránh re-render quá thường xuyên khi nhiều job song song
              const now = performance.now();
              if (audioPct < 100 && subPct < 100 && now - (lastFlush[i] ?? 0) < 250) return;
              lastFlush[i] = now;
              statuses[i] = {
                ...statuses[i]!,
                status: 'running',
                detail: formatPrepareDetail(audioPct, subPct),
              };
              flush();
            },
          });
          statuses[i] = {
            ...statuses[i]!,
            status: 'done',
            detail: `→ ${job.epFolder}`,
          };
        } catch (e) {
          statuses[i] = {
            ...statuses[i]!,
            status: 'error',
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
      const timer = setTimeout(() => exit(), 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step.kind, exit]);

  if (!tools) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Đang kiểm tra tools...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">[LỖI] {error}</Text>
        {step.kind === 'path' && (
          <Box marginTop={1}>
            <PathInput
              label="Nhập lại path:"
              hint="Folder chứa .mkv (hoặc 1 file .mkv bất kỳ)"
              onSubmit={(path) => {
                setError(null);
                go({ kind: 'scanning', path });
              }}
            />
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <ToolStatus ffmpeg={tools.ffmpeg} mkvextract={tools.mkvextract} showHandbrake={false} />

      {step.kind === 'path' && (
        <Box flexDirection="column">
          <StepHeader step={1} total={5} title="Trỏ tới folder chứa raw .mkv" />
          <PathInput
            label="Nhập path:"
            hint="Folder chứa .mkv, hoặc 1 file .mkv bất kỳ trong folder đó"
            onSubmit={(path) => go({ kind: 'scanning', path })}
          />
        </Box>
      )}

      {step.kind === 'scanning' && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Đang quét: {step.path}</Text>
        </Box>
      )}

      {step.kind === 'anime-name' && (
        <Box flexDirection="column">
          <StepHeader step={2} total={5} title={`Tìm thấy ${step.mkvs.length} file .mkv`} />
          <Box marginBottom={1} flexDirection="column">
            {step.mkvs.slice(0, 5).map((m, i) => (
              <Text key={i} color="gray">
                {'  · '}
                {basename(m)}
              </Text>
            ))}
            {step.mkvs.length > 5 && (
              <Text color="gray">
                {'  · '} (+{step.mkvs.length - 5} file nữa…)
              </Text>
            )}
          </Box>
          <PathInput
            label="Tên anime:"
            hint={`Auto-detect: "${step.suggested}". Enter để chấp nhận, hoặc gõ tên khác.`}
            defaultValue={step.suggested}
            onSubmit={(name) => {
              const animeName = (name || step.suggested).trim();
              go({
                kind: 'probing',
                mkvs: step.mkvs,
                animeName,
                rootDir: step.rootDir,
                done: 0,
              });
            }}
          />
        </Box>
      )}

      {step.kind === 'probing' && (
        <Box flexDirection="column">
          <StepHeader step={3} total={5} title="Phân tích track sub" />
          <Box>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text>
              {' '}
              {step.done}/{step.mkvs.length} file đã probe
            </Text>
          </Box>
        </Box>
      )}

      {step.kind === 'pick-track' && (
        <PickTrackUI step={step} nav={{ go, back }} projectRoot={projectRoot} />
      )}

      {step.kind === 'select-mode' && <SelectModeUI step={step} nav={{ go, back }} />}

      {step.kind === 'pick-eps' && <PickEpsUI step={step} nav={{ go, back }} />}

      {step.kind === 'confirm' && <ConfirmUI step={step} nav={{ go, back }} />}

      {step.kind === 'processing' && (
        <Box flexDirection="column">
          <StepHeader
            step={5}
            total={5}
            title={`Song song toàn bộ · ${step.current}/${step.jobs.length} hoàn thành`}
          />
          <StatusList items={step.statuses} />
        </Box>
      )}

      {step.kind === 'done' && (
        <Box flexDirection="column">
          <StepHeader step={5} total={5} title="HOÀN THÀNH" />
          <StatusList items={step.statuses} />
          <Box marginTop={1}>
            <Text color="green" bold>
              ✓ Đã xử lý {step.statuses.filter((s) => s.status === 'done').length}/
              {step.statuses.length} file
            </Text>
          </Box>
        </Box>
      )}

      {isBackEnabled && (
        <Box marginTop={1}>
          <Text color="gray">[Esc] quay lại bước trước</Text>
        </Box>
      )}
    </Box>
  );
}

function PickTrackUI({
  step,
  nav,
  projectRoot,
}: {
  step: Extract<Step, { kind: 'pick-track' }>;
  nav: Nav;
  projectRoot: string;
}) {
  const group = step.groups[step.groupIdx]!;
  const isMulti = step.groups.length > 1;

  const items = group.subTracks.map((t) => ({
    label: `Track ${t.id} — ${t.langName} (${t.codec})${t.isDefault ? ' [mặc định]' : ''}`,
    value: t.id,
  }));

  return (
    <Box flexDirection="column">
      <StepHeader
        step={4}
        total={5}
        title={
          isMulti
            ? `Chọn track cho Nhóm ${step.groupIdx + 1}/${step.groups.length}`
            : 'Chọn track sub để tách'
        }
      />
      {isMulti && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="yellow">
            ⚠ Có {step.groups.length} nhóm khác nhau về cấu trúc track sub.
          </Text>
          <Text color="gray">Nhóm này gồm {group.videos.length} file:</Text>
          {group.videos.slice(0, 3).map((v, i) => (
            <Text key={i} color="gray">
              {'    · '}
              {v.fileName}
            </Text>
          ))}
          {group.videos.length > 3 && (
            <Text color="gray">
              {'    · '} (+{group.videos.length - 3} nữa)
            </Text>
          )}
        </Box>
      )}
      <SelectInput
        items={items}
        initialIndex={Math.max(
          0,
          group.subTracks.findIndex((t) => t.id === step.choices[group.signature])
        )}
        onSelect={(item) => {
          const nextChoices: Choices = { ...step.choices, [group.signature]: item.value };
          const nextIdx = step.groupIdx + 1;
          if (nextIdx < step.groups.length) {
            nav.go({ ...step, choices: nextChoices, groupIdx: nextIdx });
          } else {
            const outputDir = join(projectRoot, 'Anime', step.animeName);
            const allJobs: PrepareJob[] = step.probes.map((p) => {
              const ep = p.episodeNumber ?? '00';
              const epFolder = join(outputDir, `Ep${ep}`);
              const trackId =
                nextChoices[p.signature] ?? p.subTracks[0]?.id ?? 0;
              return {
                probe: p,
                epFolder,
                epName: `Ep${ep}`,
                trackId,
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
}: {
  step: Extract<Step, { kind: 'select-mode' }>;
  nav: Nav;
}) {
  const newJobs = step.allJobs.filter((j) => !j.hasOutput);
  const existingJobs = step.allJobs.filter((j) => j.hasOutput);

  const choices: { label: string; value: string }[] = [];
  if (newJobs.length > 0 && existingJobs.length > 0) {
    choices.push({
      label: `Xử lý tất cả (${newJobs.length} mới + ${existingJobs.length} ghi đè)`,
      value: 'all',
    });
    choices.push({
      label: `Chỉ xử lý mới (${newJobs.length} file)`,
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
      <StepHeader step={4} total={5} title="Phát hiện file đã xử lý trước đó" />
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyan">Anime: </Text>
        <Text>{step.animeName}</Text>
        <Text color="cyan">Output: </Text>
        <Text>{step.outputDir}</Text>
        <Box flexDirection="column" marginTop={1}>
          {step.allJobs.map((j, i) => (
            <Box key={i}>
              <Text color={j.hasOutput ? 'yellow' : 'green'}>
                {j.hasOutput ? '  ⚠ ' : '  ✓ '}
                {j.epName}
              </Text>
              <Text color="gray">
                {' — '}
                {j.hasOutput ? 'đã có .mp3/.ass cũ' : 'mới'}
                {' · '}
                {basename(j.probe.fileName)}
              </Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text>
            Tổng: {step.allJobs.length} ep ({newJobs.length} mới, {existingJobs.length}{' '}
            đã xử lý trước)
          </Text>
        </Box>
      </Box>
      <SelectInput
        items={choices}
        onSelect={(it) => {
          if (it.value === 'cancel') {
            process.exit(0);
            return;
          }
          if (it.value === 'pick') {
            nav.go({
              kind: 'pick-eps',
              allJobs: step.allJobs,
              animeName: step.animeName,
              outputDir: step.outputDir,
            });
            return;
          }
          const jobs = it.value === 'only-new' ? newJobs : step.allJobs;
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
}: {
  step: Extract<Step, { kind: 'pick-eps' }>;
  nav: Nav;
}) {
  const items = step.allJobs.map((j) => ({
    label: `${j.epName} — ${j.probe.fileName}`,
    value: j.epFolder,
    preselected: !j.hasOutput,
    tag: j.hasOutput
      ? { text: 'ghi đè', color: 'yellow' }
      : { text: 'mới', color: 'green' },
  }));

  return (
    <Box flexDirection="column">
      <StepHeader step={4} total={5} title="Pick ep để xử lý" />
      <Box marginBottom={1}>
        <Text color="gray">
          Mặc định tick các ep mới. Tick thêm ⚠ "ghi đè" nếu muốn re-extract.
        </Text>
      </Box>
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
}: {
  step: Extract<Step, { kind: 'confirm' }>;
  nav: Nav;
}) {
  const overwriteCount = step.jobs.filter((j) => j.hasOutput).length;
  const items = [
    { label: 'Bắt đầu xử lý', value: 'go' },
    { label: 'Huỷ', value: 'cancel' },
  ];

  return (
    <Box flexDirection="column">
      <StepHeader step={4} total={5} title="Xác nhận" />
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text color="cyan">Anime: </Text>
          {step.animeName}
        </Text>
        <Text>
          <Text color="cyan">Tổng file sẽ xử lý: </Text>
          {step.jobs.length}
          {overwriteCount > 0 && (
            <Text color="yellow"> ({overwriteCount} ghi đè)</Text>
          )}
        </Text>
        <Text>
          <Text color="cyan">Output: </Text>
          {step.outputDir}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {step.jobs.map((j, i) => (
            <Text key={i} color={j.hasOutput ? 'yellow' : 'gray'}>
              {`  · ${j.epName} → Track ${j.trackId}${j.hasOutput ? ' (ghi đè)' : ''}`}
            </Text>
          ))}
        </Box>
      </Box>
      <SelectInput
        items={items}
        onSelect={(it) => {
          if (it.value === 'cancel') {
            process.exit(0);
            return;
          }
          const statuses: StatusItem[] = step.jobs.map((j) => ({
            label: `${j.epName} — ${j.probe.fileName}`,
            status: 'pending',
          }));
          nav.go({ kind: 'processing', jobs: step.jobs, statuses, current: 0 });
        }}
      />
    </Box>
  );
}
