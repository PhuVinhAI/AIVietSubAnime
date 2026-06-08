import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { useEffect, useState } from 'react';

import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { ToolStatus } from '../components/ToolStatus.js';
import { detectAnimeName } from '../lib/episode.js';
import { prepareEpisode } from '../lib/extract.js';
import { moveFile } from '../lib/fsx.js';
import { probeVideo } from '../lib/probe.js';
import { checkAllTools, type ToolCheck } from '../lib/tools.js';
import { groupBySignature, suggestTrack } from '../lib/trackGroup.js';
import type { TrackGroup, VideoProbe } from '../types.js';

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
      kind: 'confirm';
      probes: VideoProbe[];
      groups: TrackGroup[];
      animeName: string;
      outputDir: string;
      choices: Choices;
    }
  | { kind: 'processing'; jobs: PrepareJob[]; statuses: StatusItem[]; current: number }
  | { kind: 'done'; statuses: StatusItem[] };

type PrepareJob = {
  probe: VideoProbe;
  epFolder: string;
  trackId: number;
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
  const [step, setStep] = useState<Step>({ kind: 'tools' });
  const [error, setError] = useState<string | null>(null);

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

      const flush = () => {
        setStep((s) =>
          s.kind === 'processing'
            ? { ...s, statuses: [...statuses], current: doneCount }
            : s
        );
      };

      const processOne = async (job: PrepareJob, i: number) => {
        if (cancelled) return;
        statuses[i] = { ...statuses[i]!, status: 'running' };
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
                setStep({ kind: 'scanning', path });
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
            onSubmit={(path) => setStep({ kind: 'scanning', path })}
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
              setStep({
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
        <PickTrackUI step={step} setStep={setStep} projectRoot={projectRoot} />
      )}

      {step.kind === 'confirm' && <ConfirmUI step={step} setStep={setStep} />}

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
    </Box>
  );
}

function PickTrackUI({
  step,
  setStep,
  projectRoot,
}: {
  step: Extract<Step, { kind: 'pick-track' }>;
  setStep: (s: Step) => void;
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
            setStep({ ...step, choices: nextChoices, groupIdx: nextIdx });
          } else {
            const outputDir = join(projectRoot, 'Anime', step.animeName);
            setStep({
              kind: 'confirm',
              probes: step.probes,
              groups: step.groups,
              animeName: step.animeName,
              outputDir,
              choices: nextChoices,
            });
          }
        }}
      />
    </Box>
  );
}

function ConfirmUI({
  step,
  setStep,
}: {
  step: Extract<Step, { kind: 'confirm' }>;
  setStep: (s: Step) => void;
}) {
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
          <Text color="cyan">Tổng file: </Text>
          {step.probes.length}
        </Text>
        <Text>
          <Text color="cyan">Output: </Text>
          {step.outputDir}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {step.groups.map((g, i) => {
            const trackId = step.choices[g.signature];
            const track = g.subTracks.find((t) => t.id === trackId);
            return (
              <Text key={i} color="gray">
                {`  Nhóm ${i + 1}: ${g.videos.length} file → Track ${trackId} (${
                  track?.langName ?? '?'
                })`}
              </Text>
            );
          })}
        </Box>
      </Box>
      <SelectInput
        items={items}
        onSelect={(it) => {
          if (it.value === 'cancel') {
            process.exit(0);
            return;
          }
          const jobs: PrepareJob[] = step.probes.map((p) => {
            const ep = p.episodeNumber ?? '00';
            const epFolder = join(step.outputDir, `Ep${ep}`);
            const trackId =
              step.choices[p.signature] ?? p.subTracks[0]?.id ?? 0;
            return { probe: p, epFolder, trackId };
          });
          const statuses: StatusItem[] = jobs.map((j) => ({
            label: `Ep${j.probe.episodeNumber ?? '??'} — ${j.probe.fileName}`,
            status: 'pending',
          }));
          setStep({ kind: 'processing', jobs, statuses, current: 0 });
        }}
      />
    </Box>
  );
}
