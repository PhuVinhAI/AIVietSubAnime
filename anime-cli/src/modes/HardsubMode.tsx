import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { useEffect, useState } from 'react';

import { PathInput } from '../components/PathInput.js';
import { StatusList, type StatusItem } from '../components/StatusList.js';
import { StepHeader } from '../components/StepHeader.js';
import { ToolStatus } from '../components/ToolStatus.js';
import { runHardsub, scanHardsubJobs } from '../lib/handbrake.js';
import { checkAllTools, type ToolCheck } from '../lib/tools.js';
import type { HardsubJob } from '../types.js';

type Step =
  | { kind: 'tools' }
  | { kind: 'path' }
  | { kind: 'scanning'; path: string }
  | {
      kind: 'confirm';
      animeFolder: string;
      ready: HardsubJob[];
      skipped: { epFolder: string; reason: string }[];
    }
  | {
      kind: 'processing';
      jobs: HardsubJob[];
      statuses: StatusItem[];
      current: number;
    }
  | { kind: 'done'; statuses: StatusItem[] };

type Props = {
  initialPath?: string;
};

export function HardsubMode({ initialPath }: Props) {
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
      if (!t.handbrake.ok) {
        setError(
          `Không tìm thấy HandBrakeCLI. ${t.handbrake.error ?? ''}\nTải tại https://handbrake.fr/downloads2.php và giải nén vào <project>/Tools/`
        );
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
      if (!existsSync(abs) || !statSync(abs).isDirectory()) {
        setError(`Folder không tồn tại: ${abs}`);
        setStep({ kind: 'path' });
        return;
      }
      const { ready, skipped } = scanHardsubJobs(abs);
      setStep({ kind: 'confirm', animeFolder: abs, ready, skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: 'path' });
    }
  }, [step]);

  useEffect(() => {
    if (step.kind !== 'processing') return;
    if (!tools?.handbrake.ok || !tools.handbrake.path) return;
    let cancelled = false;
    const handbrakePath = tools.handbrake.path;
    const run = async () => {
      const statuses = [...step.statuses];
      for (let i = 0; i < step.jobs.length; i++) {
        if (cancelled) return;
        const job = step.jobs[i];
        if (!job) continue;
        statuses[i] = {
          ...statuses[i]!,
          status: 'running',
          detail: 'Đang encode... (10-40 phút)',
        };
        setStep((s) =>
          s.kind === 'processing' ? { ...s, statuses: [...statuses], current: i } : s
        );

        try {
          await runHardsub({ handbrakeCliPath: handbrakePath, job });
          statuses[i] = {
            ...statuses[i]!,
            status: 'done',
            detail: `→ ${basename(job.outputPath)}`,
          };
        } catch (e) {
          statuses[i] = {
            ...statuses[i]!,
            status: 'error',
            detail: e instanceof Error ? e.message : String(e),
          };
        }
        setStep((s) =>
          s.kind === 'processing' ? { ...s, statuses: [...statuses], current: i } : s
        );
      }
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
              label="Nhập folder anime:"
              hint="Vd. C:\Users\you\Anime\Oi Tonbo 2nd Season"
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
      <ToolStatus
        ffmpeg={tools.ffmpeg}
        mkvextract={tools.mkvextract}
        handbrake={tools.handbrake}
        showHandbrake
      />

      {step.kind === 'path' && (
        <Box flexDirection="column">
          <StepHeader step={1} total={3} title="Folder anime cần hardsub" />
          <PathInput
            label="Path:"
            hint="Folder anime có các Ep01/Ep02/... bên trong"
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

      {step.kind === 'confirm' && (
        <Box flexDirection="column">
          <StepHeader step={2} total={3} title="Hàng đợi hardsub" />
          <Box flexDirection="column" marginBottom={1}>
            <Text>
              <Text color="cyan">Folder: </Text>
              {step.animeFolder}
            </Text>
            <Text>
              <Text color="green">Sẵn sàng: </Text>
              {step.ready.length} ep
            </Text>
            {step.skipped.length > 0 && (
              <Text>
                <Text color="yellow">Bỏ qua: </Text>
                {step.skipped.length} ep
              </Text>
            )}
            <Box flexDirection="column" marginTop={1}>
              {step.ready.map((j, i) => (
                <Text key={i} color="green">
                  {'  ✓ '}
                  {basename(j.epFolder)}
                </Text>
              ))}
              {step.skipped.map((s, i) => (
                <Text key={i} color="yellow">
                  {'  ⊘ '}
                  {s.epFolder} — {s.reason}
                </Text>
              ))}
            </Box>
          </Box>

          {step.ready.length === 0 ? (
            <Text color="red">Không có ep nào sẵn sàng. Thoát.</Text>
          ) : (
            <SelectInput
              items={[
                { label: `Bắt đầu encode ${step.ready.length} ep (serial)`, value: 'go' },
                { label: 'Huỷ', value: 'cancel' },
              ]}
              onSelect={(it) => {
                if (it.value === 'cancel') {
                  process.exit(0);
                  return;
                }
                const statuses: StatusItem[] = step.ready.map((j) => ({
                  label: basename(j.epFolder),
                  status: 'pending',
                }));
                setStep({
                  kind: 'processing',
                  jobs: step.ready,
                  statuses,
                  current: 0,
                });
              }}
            />
          )}
        </Box>
      )}

      {step.kind === 'processing' && (
        <Box flexDirection="column">
          <StepHeader
            step={3}
            total={3}
            title={`Hardsub ${step.current + 1}/${step.jobs.length}`}
          />
          <StatusList items={step.statuses} />
        </Box>
      )}

      {step.kind === 'done' && (
        <Box flexDirection="column">
          <StepHeader step={3} total={3} title="HARDSUB HOÀN THÀNH" />
          <StatusList items={step.statuses} />
          <Box marginTop={1}>
            <Text color="green" bold>
              ✓ {step.statuses.filter((s) => s.status === 'done').length}/
              {step.statuses.length} ep đã hardsub
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
